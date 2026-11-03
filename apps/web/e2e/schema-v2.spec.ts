import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Course } from "@mozes/content-schema";
import { USERS } from "./fixtures";

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEF8AAAAASUVORK5CYII=","base64");
const text=(id:string,value="בדיקת תוכנה בלבד")=>({id,type:"richText",body:[{kind:"paragraph",content:[{text:value,bold:true}]}]});
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
async function query<T extends QueryResultRow>(statement:string,values:unknown[]=[]):Promise<T[]> {
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString || !new URL(connectionString).pathname.endsWith("_test"))throw Error("An isolated *_test database is required");
  const pool=new Pool({connectionString});try{return (await pool.query<T>(statement,values)).rows;}finally{await pool.end();}
}
async function login(page:Page,credentials:{email:string;password:string}=USERS.admin){await page.goto("/login");await page.getByLabel("אימייל").fill(credentials.email);await page.getByLabel("סיסמה").fill(credentials.password);await page.getByRole("button",{name:"התחברות",exact:true}).click();await expect(page).toHaveURL(/\/(studio|learn)\/?$/);}
async function importFile(api:APIRequestContext,file:unknown){const response=await api.post("/api/studio/chapters/import",{data:{files:[{name:"schema-v2-test.json",text:JSON.stringify(file)}]}});expect(response.status()).toBe(200);return (await response.json()).results[0];}
async function upload(api:APIRequestContext,filename:string,mime:string,bytes:Buffer,replaceId?:string){
  const reserved=await api.post(replaceId ? `/api/studio/media/${replaceId}/versions` : "/api/studio/media",{data:{...(replaceId ? {action:"upload"} : {}),filename,mime,size:bytes.length}});expect(reserved.status()).toBe(replaceId ? 200 : 201);const r=await reserved.json();
  expect((await api.put(r.upload.url,{headers:r.upload.headers,data:bytes})).status()).toBe(200);
  const completed=await api.post(replaceId ? `/api/studio/media/${r.id}/versions` : `/api/studio/media/${r.id}/complete`,replaceId ? {data:{action:"complete",versionId:r.versionId}} : {});expect(completed.status()).toBe(200);const body=await completed.json();const state=(await query<{status:string}>("select status from asset where id=$1",[r.id]))[0]!;expect(state.status).toBe("ready");return body.asset as {id:string;versionId:string;url:string};
}
async function approveFixture(api:APIRequestContext,asset:{id:string;versionId:string}){
  const response=await api.patch(`/api/studio/media/${asset.id}/metadata`,{data:{expectedVersionId:asset.versionId,metadata:{source:"Synthetic automated software fixture only",licenseType:"test fixture",commercialUseAllowed:true,editingAllowed:true,altText:"תמונת בדיקת תוכנה"},review:"approved"}});expect(response.status()).toBe(200);return (await response.json()).versionId as string;
}
async function chapter(id:string){return (await query<{content:unknown;revision:number}>("select content,revision from chapter where id=$1",[id]))[0]!;}

test("v2 import rejects invented assets and modules, keeps placeholders, and never trusts medical stamps",async({page},info)=>{
  test.skip(info.project.name!=="desktop","shared server assertions run once");await login(page);
  const file={schema:"mozes-chapter",schemaVersion:2,title:`בדיקת יבוא V2 ${randomUUID().slice(0,8)}`,screens:[{id:"s",title:"מסך נבדק",template:"text",slots:{body:[{id:"image",type:"image",media:{assetId:"invented-not-in-library"},alt:"בדיקה"}]}}]};
  const before=(await query<{n:number}>("select count(*)::int as n from chapter"))[0]!.n;
  let result=await importFile(page.request,file);expect(result.ok).toBe(false);expect(result.message).toContain("מסך נבדק");expect(result.message).toContain("media");expect((await query<{n:number}>("select count(*)::int as n from chapter"))[0]!.n).toBe(before);
  result=await importFile(page.request,{...file,screens:[{...file.screens[0],slots:{body:[{id:"sim",type:"simulation",module:"aed",moduleVersion:1,config:{steps:["a","b","c"]},completion:{required:true}}]}}]});expect(result.ok).toBe(false);expect(result.message).toContain("מסך נבדק");
  result=await importFile(page.request,{...file,screens:[{...file.screens[0],medical:{relevant:true,reviewedBy:"untrusted-import",reviewedAt:"2026-01-01T00:00:00Z"},slots:{body:[{id:"image",type:"image",media:{placeholder:{requestId:"needed-image",description:"תמונה לבדיקת תוכנה"}},alt:"בדיקה"}]}}]});expect(result.ok).toBe(true);
  const id=result.chapters[0].id,validation=await (await page.request.get(`/api/studio/chapters/${id}/validation`)).json();expect(validation.issues.map((i:{code:string})=>i.code)).toEqual(expect.arrayContaining(["PLACEHOLDER","MEDICAL_REVIEW"]));
  expect((await page.request.post(`/api/studio/chapters/${id}/versions`,{data:{action:"publish",revision:1}})).status()).toBe(409);
  const image=await upload(page.request,"test.png","image/png",png),request=await (await page.request.get("/api/studio/media/requests")).json();expect(request.requests.some((r:{chapterId:string})=>r.chapterId===id)).toBe(true);
  const resolved=await page.request.post("/api/studio/media/requests",{data:{chapterId:id,requestId:"needed-image",assetId:image.id,revision:1}});expect(resolved.status()).toBe(200);expect((await chapter(id)).revision).toBe(2);
  const exported=await (await page.request.get(`/api/studio/chapters/${id}/export`)).json();expect(exported.schemaVersion).toBe(2);expect(JSON.stringify(exported)).toContain(image.id);expect(JSON.stringify(exported)).not.toContain('"placeholder"');
});

test("v2 publication pins private files, checks real reviews, rejects stale media, and rolls back only the draft",async({page,browser},info)=>{
  test.skip(info.project.name!=="desktop","one isolated publication scenario");test.setTimeout(120_000);await login(page);
  const token=randomUUID().slice(0,8),image=await upload(page.request,`fixture-${token}.png`,"image/png",png);
  const imported=await importFile(page.request,{schema:"mozes-chapter",schemaVersion:2,title:`גרסאות פרטיות ${token}`,screens:[{id:"medical",title:"בדיקת שער רפואי בלבד",template:"text",medical:{relevant:true,sources:[{title:"מקור בדיקת תוכנה בלבד",url:"https://example.invalid/software-test",date:"2026-01-01"}]},slots:{body:[{id:"image",type:"image",media:{assetId:image.id},alt:"תמונה לבדיקת תוכנה"},{id:"reveal",type:"reveal",mode:"sequential",requireAll:true,items:[{id:"one",title:"בדיקה ראשונה",content:{kind:"text",body:[]}},{id:"two",title:"בדיקה שנייה",content:{kind:"text",body:[]}}]}]}}]});expect(imported.ok,imported.message).toBe(true);const chapterId=imported.chapters[0].id;
  const created=await page.request.post("/api/studio/courses",{data:{title:`קורס גרסאות בדיקה ${token}`}});expect(created.status()).toBe(201);const courseId=(await created.json()).id;
  expect((await page.request.patch(`/api/studio/courses/${courseId}`,{data:{baseRevision:1,chapterIds:[chapterId]}})).status()).toBe(200);
  let publication=await page.request.post(`/api/studio/courses/${courseId}/publish`,{data:{medicalConfirmed:true}});expect(publication.status()).toBe(422);expect((await publication.json()).problems.length).toBeGreaterThan(0);
  const firstAssetVersion=await approveFixture(page.request,image);
  let validation=await (await page.request.get(`/api/studio/chapters/${chapterId}/validation`)).json();const stored=await chapter(chapterId),doc=Course.parse(stored.content),screenId=doc.units[0]!.screens[0]!.id;
  expect((await page.request.post(`/api/studio/chapters/${chapterId}/reviews`,{data:{screenId,revision:stored.revision,status:"approved",note:"Synthetic software gate test only",mediaFingerprint:validation.mediaFingerprint}})).status()).toBe(200);
  publication=await page.request.post(`/api/studio/courses/${courseId}/publish`,{data:{medicalConfirmed:false}});expect(publication.status()).toBe(200);expect((await publication.json()).versionNo).toBe(1);
  const createUser=async(label:string)=>{const credentials={email:`${label}-${token}@schema-v2.test`,password:"V2-test-password-123"};const response=await page.request.post("/api/studio/users",{data:{name:`בדיקת ${label}`,roles:[],...credentials}});expect(response.status()).toBe(201);return {...credentials,id:(await response.json()).id as string};};
  const learner=await createUser("learner"),other=await createUser("other"),grant=async(userId:string)=>expect((await page.request.post("/api/studio/access",{data:{courseIds:[courseId],userIds:[userId],validFrom:"2020-01-01",validUntil:null,note:"Automated fixture only"}})).status()).toBe(201);
  await grant(learner.id);const context=await browser.newContext(),lp=await context.newPage();await login(lp,learner);
  const enrollment=(await query<{id:string}>("select id from enrollment where course_id=$1 and user_id=$2",[courseId,learner.id]))[0]!.id;await lp.goto(`/learn/c/${enrollment}`);await expect(lp.locator(".mp-image-zoom img")).toBeVisible();
  const firstUrl=await lp.locator(".mp-image-zoom img").getAttribute("src");expect(firstUrl).toContain(firstAssetVersion);expect(firstUrl).toContain(`enrollment=${enrollment}`);expect(digest(await (await lp.request.get(firstUrl!)).body())).toBe(digest(png));
  const unauth=await browser.newContext();expect((await unauth.request.get(new URL(firstUrl!,lp.url()).toString())).status()).toBe(401);await unauth.close();
  const secondContext=await browser.newContext(),second=await secondContext.newPage();await login(second,other);expect((await second.request.get(new URL(firstUrl!,lp.url()).toString())).status()).toBe(404);
  const reveal=doc.units[0]!.screens[0]!.slots.body!.find(c=>c.type==="reveal")!;if(reveal.type!=="reveal")throw Error();
  const spoof=await lp.request.post(`/api/learn/enrollments/${enrollment}/events`,{data:{events:[{type:"reveal_item",componentId:reveal.id,itemId:reveal.items[1]!.id}]}});expect(spoof.status()).toBe(409);
  await lp.getByRole("button",{name:"בדיקה ראשונה"}).click();await expect.poll(async()=>{const row=(await query<{state:{opened?:Record<string,string[]>}}>("select state from enrollment where id=$1",[enrollment]))[0]!;return row.state.opened?.[reveal.id]?.length ?? 0;}).toBe(1);await lp.reload();await expect(lp.getByRole("button",{name:/בדיקה ראשונה/})).toHaveAttribute("aria-expanded","true");
  const staleFingerprint=validation.mediaFingerprint,replacementBytes=readFileSync(path.resolve("public/demo/demo-poster.jpg")),replacement=await upload(page.request,"replacement.jpg","image/jpeg",replacementBytes,image.id);const latestAssetVersion=await approveFixture(page.request,replacement);
  expect((await lp.request.get(`/api/media/${image.id}/versions/${latestAssetVersion}?enrollment=${enrollment}`)).status()).toBe(404);
  expect((await page.request.post(`/api/studio/chapters/${chapterId}/reviews`,{data:{screenId,revision:stored.revision,status:"approved",note:"Stale fixture should be rejected",mediaFingerprint:staleFingerprint}})).status()).toBe(409);
  publication=await page.request.post(`/api/studio/courses/${courseId}/publish`,{data:{medicalConfirmed:true}});expect(publication.status()).toBe(422);
  validation=await (await page.request.get(`/api/studio/chapters/${chapterId}/validation`)).json();expect(validation.reviewedScreenIds).not.toContain(screenId);
  expect((await page.request.post(`/api/studio/chapters/${chapterId}/reviews`,{data:{screenId,revision:stored.revision,status:"approved",note:"Synthetic new bytes reviewed for software test",mediaFingerprint:validation.mediaFingerprint}})).status()).toBe(200);
  publication=await page.request.post(`/api/studio/courses/${courseId}/publish`,{data:{medicalConfirmed:false}});expect(publication.status()).toBe(200);expect((await publication.json()).versionNo).toBe(2);
  await lp.reload();expect(await lp.locator(".mp-image-zoom img").getAttribute("src")).toBe(firstUrl);expect(digest(await (await lp.request.get(firstUrl!)).body())).toBe(digest(png));
  await grant(other.id);await second.goto("/learn");const otherEnrollment=(await query<{id:string}>("select id from enrollment where course_id=$1 and user_id=$2",[courseId,other.id]))[0]!.id;await second.goto(`/learn/c/${otherEnrollment}`);await expect(second.locator(".mp-image-zoom img")).toBeVisible();expect(await second.locator(".mp-image-zoom img").getAttribute("src")).toContain(latestAssetVersion);
  const versions=await (await page.request.get(`/api/studio/chapters/${chapterId}/versions`)).json(),first=versions.versions.find((v:{versionNo:number})=>v.versionNo===1);
  expect((await page.request.post(`/api/studio/chapters/${chapterId}/versions`,{data:{action:"rollback",versionId:first.id,revision:stored.revision}})).status()).toBe(200);expect((await chapter(chapterId)).revision).toBe(stored.revision+1);
  expect((await query<{published_version_id:string}>("select published_version_id from course where id=$1",[courseId]))[0]!.published_version_id).toBe((await query<{id:string}>("select id from course_version where course_id=$1 and version_no=2",[courseId]))[0]!.id);
  expect((await query<{current_version_id:string}>("select current_version_id from asset where id=$1",[image.id]))[0]!.current_version_id).toBe(latestAssetVersion);
  expect((await page.request.post(`/api/studio/courses/${courseId}/publish`,{data:{medicalConfirmed:false}})).status()).toBe(200);
  expect((await page.request.delete(`/api/studio/media/${image.id}`)).status()).toBe(409);const usage=await (await page.request.get(`/api/studio/media/${image.id}/versions`)).json();expect(usage.usage.some((u:{courseId?:string})=>u.courseId===courseId)).toBe(true);
  const grantId=(await query<{id:string}>("select id from course_access where course_id=$1 and user_id=$2 and revoked_at is null",[courseId,learner.id]))[0]!.id;expect((await page.request.patch(`/api/studio/access/${grantId}`,{data:{revoke:true}})).status()).toBe(200);expect((await lp.request.get(firstUrl!)).status()).toBe(404);
  await context.close();await secondContext.close();
});

test("v2 new blocks play with touch alternatives, audio captions, animation and required completion",async({page},info)=>{
  test.setTimeout(120_000);await login(page);const suffix=`${info.project.name}-${randomUUID().slice(0,6)}`;
  const image=await upload(page.request,`${suffix}.png`,"image/png",png),audio=await upload(page.request,`${suffix}.mp3`,"audio/mpeg",readFileSync(path.resolve("e2e/fixtures/test-roar.mp3"))),captions=await upload(page.request,`${suffix}.vtt`,"text/vtt",Buffer.from("WEBVTT\n\n00:00.000 --> 00:04.000\nכתוביות בדיקת תוכנה\n"));
  const animation=await upload(page.request,`${suffix}.json`,"application/json",Buffer.from(JSON.stringify({v:"5.13.0",w:100,h:100,fr:30,ip:0,op:60,layers:[]})));
  const imported=await importFile(page.request,{schema:"mozes-chapter",schemaVersion:2,title:`נגן V2 ${suffix}`,screens:[
    {id:"new-blocks",title:"רכיבי בדיקה",template:"text",narration:{media:{assetId:audio.id},captions:{assetId:captions.id},autoplay:false,cues:[{atMs:500,componentId:"narrated"}]},slots:{body:[text("narrated","טקסט מתוזמן לבדיקה"),{id:"image",type:"image",media:{assetId:image.id},alt:"תמונת תוכנה"},{id:"animation",type:"animation",media:{assetId:animation.id},alt:"אנימציית בדיקה",playOn:"click"},
      {id:"reveal",type:"reveal",mode:"sequential",requireAll:true,items:[{id:"r-one",title:"פריט ראשון",content:{kind:"text",body:[]}},{id:"r-two",title:"פריט שני",content:{kind:"image",media:{assetId:image.id},alt:"תמונת פריט"}}]},
      {id:"explore",type:"hotspotExplore",media:{assetId:image.id},alt:"תמונת אזורים",requireAll:true,hotspots:[{id:"left",label:"אזור ראשון",shape:{kind:"rect",x:5,y:5,w:30,h:30},title:"פירוט ראשון",body:[]},{id:"right",label:"אזור שני",shape:{kind:"circle",cx:70,cy:70,r:15},title:"פירוט שני",body:[]}]},
      {id:"sim",type:"simulation",module:"software-sequence",moduleVersion:1,config:{steps:["צעד תוכנה א","צעד תוכנה ב","צעד תוכנה ג"]},completion:{required:true}},
    ]}},
    {id:"sequence-screen",title:"רצף בדיקה",template:"sequence",slots:{task:[{id:"sequence",type:"sequenceTask",prompt:"סדרו שלבי תוכנה",maxAttempts:2,items:[{id:"a",text:"שלב א"},{id:"b",text:"שלב ב"},{id:"c",text:"שלב ג"}]}]}},
    {id:"hotspot-screen",title:"שאלת אזורים",template:"hotspot",slots:{task:[{id:"hotspot",type:"hotspotImage",prompt:"בחרו באזור תוכנה נכון",media:{assetId:image.id},alt:"תמונת שאלה",mode:"single",hotspots:[{id:"h-good",label:"אזור תשובה נכון",shape:{kind:"rect",x:10,y:10,w:30,h:30},correct:true},{id:"h-bad",label:"אזור תשובה אחר",shape:{kind:"rect",x:60,y:60,w:20,h:20},correct:false}]}]}},
    {id:"choice-screen",title:"אפשרות עם תמונה",template:"question",slots:{question:[{id:"choice",type:"choiceQuestion",prompt:"בחרו תשובת תוכנה",mode:"single",options:[{id:"choice-a",text:"תשובת תוכנה נכונה",correct:true,image:{assetId:image.id},imageAlt:"תמונת אפשרות"},{id:"choice-b",text:"תשובה אחרת",correct:false}]}]}},
    {id:"summary",title:"סיום בדיקה",template:"summary",slots:{body:[text("end","הבדיקה הסתיימה")]}},
  ]});expect(imported.ok,imported.message).toBe(true);const id=imported.chapters[0].id;await page.goto(`/studio/chapters/${id}`);await page.getByRole("button",{name:"תצוגה מקדימה",exact:true}).click();const pv=page.getByRole("dialog",{name:"תצוגה מקדימה"});
  await expect(pv.getByText("טקסט מתוזמן לבדיקה",{exact:true})).toHaveCount(0);const narration=pv.locator(".mp-narration audio");
  if(process.platform==="win32" && info.project.name==="iphone"){
    // The Windows WebKit build fails to decode these real files even as data URLs.
    // CI on Linux must exercise actual playback; keep the other iPhone interactions here.
    info.annotations.push({type:"environment",description:"Windows WebKit media decoder unavailable; narration playback remains required in Linux CI"});
    await pv.getByRole("button",{name:"הצגת כל התוכן ללא המתנה לקריינות"}).click();
  }else{
    await pv.getByRole("button",{name:"הפעלת קריינות",exact:true}).click();await expect.poll(()=>narration.evaluate(a=>(a as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(1);await expect(pv.getByText("טקסט מתוזמן לבדיקה",{exact:true})).toBeVisible();await expect(pv.locator(".mp-live-caption")).toContainText("כתוביות בדיקת תוכנה");
  }
  await pv.getByLabel("השתקת קריינות בקורס").check();await pv.getByRole("button",{name:"הגדלת תמונה: תמונת תוכנה"}).click();await expect(page.getByRole("dialog",{name:"תמונה מוגדלת"})).toBeVisible();await page.getByRole("dialog",{name:"תמונה מוגדלת"}).getByRole("button",{name:"סגירה"}).click();
  await expect(pv.locator(".mp-animation svg")).toBeAttached();await expect(pv.getByRole("button",{name:"פריט שני"})).toBeDisabled();await pv.getByRole("button",{name:"פריט ראשון"}).click();await pv.getByRole("button",{name:"פריט שני"}).click();
  await pv.locator(".mp-hotspot-alternative").getByRole("button",{name:/אזור ראשון/}).click();await pv.locator(".mp-hotspot-alternative").getByRole("button",{name:/אזור שני/}).click();await expect(pv.getByText("נפתחו 2 מתוך 2 אזורים.")).toBeVisible();
  await pv.getByRole("button",{name:"התחלת בדיקת התוכנה"}).click();await pv.getByRole("button",{name:"3. צעד תוכנה ג",exact:true}).click();await pv.getByRole("button",{name:"1. צעד תוכנה א",exact:true}).click();await pv.getByRole("button",{name:"2. צעד תוכנה ב",exact:true}).click();await pv.getByRole("button",{name:"3. צעד תוכנה ג",exact:true}).click();await expect(pv.getByText(/ציון בדיקה: 90/)).toBeVisible();
  await pv.getByRole("button",{name:"המשך",exact:true}).click();await expect(pv.getByText("סדרו שלבי תוכנה")).toBeVisible();
  const order=()=>pv.locator(".mp-seq-text").allTextContents();let shown=await order();if(JSON.stringify(shown)===JSON.stringify(["שלב א","שלב ב","שלב ג"]))await pv.getByRole("button",{name:"העברה למטה: שלב א"}).click();
  await pv.getByRole("button",{name:"בדיקה",exact:true}).click();await expect(pv.getByText(/השלב הראשון שאינו במקומו/)).toBeVisible();
  for(let wanted=0;wanted<3;wanted++){const label=["שלב א","שלב ב","שלב ג"][wanted]!;shown=await order();while(shown.indexOf(label)>wanted){await pv.getByRole("button",{name:`העברה למעלה: ${label}`,exact:true}).click();shown=await order();}}
  await pv.getByRole("button",{name:"בדיקה",exact:true}).click();await expect(pv.getByText("תשובה נכונה",{exact:true})).toBeVisible();await pv.getByRole("button",{name:"המשך",exact:true}).click();
  await pv.locator(".mp-hotspot-alternative").getByRole("button",{name:"אזור תשובה נכון",exact:true}).click();await pv.getByRole("button",{name:"בדיקה",exact:true}).click();await expect(pv.getByText("תשובה נכונה",{exact:true})).toBeVisible();await pv.getByRole("button",{name:"המשך",exact:true}).click();
  await expect(pv.getByAltText("תמונת אפשרות")).toBeVisible();await pv.getByRole("radio",{name:/תשובת תוכנה נכונה/}).check();await pv.getByRole("button",{name:"בדיקה",exact:true}).click();await pv.getByRole("button",{name:"המשך",exact:true}).click();await expect(pv.getByText("הבדיקה הסתיימה",{exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/screens/v2-${info.project.name}.png`});expect((await page.request.post(`/api/studio/chapters/${id}/versions`,{data:{action:"publish",revision:1}})).status()).toBe(409);
});

test("medical reviewers can review media but cannot grant licenses, edit content, or invent verified devices",async({page,browser},info)=>{
  test.skip(info.project.name!=="desktop","role assertions run once");await login(page);const token=randomUUID().slice(0,8),asset=await upload(page.request,`review-only-${token}.png`,"image/png",png);
  const credentials={email:`reviewer-${token}@schema-v2.test`,password:"V2-reviewer-test-123"},created=await page.request.post("/api/studio/users",{data:{name:"סוקר בדיקת תוכנה",roles:["medical_reviewer"],...credentials}});expect(created.status()).toBe(201);
  const deviceResponse=await page.request.post("/api/studio/devices",{data:{name:`דגם בדיקת תוכנה ${token}`,manufacturer:"Synthetic test fixture",deviceType:"semi_automatic",manualUrl:"https://example.invalid/software-fixture"}});expect(deviceResponse.status()).toBe(201);const deviceId=(await deviceResponse.json()).id;
  const context=await browser.newContext(),reviewer=await context.newPage();await login(reviewer,credentials);
  expect((await reviewer.request.patch(`/api/studio/media/${asset.id}/metadata`,{data:{expectedVersionId:asset.versionId,metadata:{commercialUseAllowed:true},review:"approved"}})).status()).toBe(403);
  expect((await reviewer.request.post("/api/studio/devices",{data:{name:"forbidden",manufacturer:"test",deviceType:"semi_automatic",manualUrl:"https://example.invalid/test"}})).status()).toBe(403);
  const devices=await (await reviewer.request.get("/api/studio/devices")).json(),device=devices.devices.find((d:{id:string})=>d.id===deviceId);
  expect((await reviewer.request.patch("/api/studio/devices",{data:{id:deviceId,expectedUpdatedAt:device.updatedAt,evidence:{guideReviewed:false,trainerTested:false,notes:"No real trainer test has been performed"}}})).status()).toBe(409);
  await reviewer.goto("/studio/media");const card=reviewer.locator(".media-card",{hasText:`review-only-${token}.png`});await card.getByRole("button",{name:"פרטי נכס, רישיון וגרסאות"}).click();await expect(reviewer.getByLabel("האם מותר שימוש מסחרי?")).toBeDisabled();await reviewer.getByRole("button",{name:"אישור רפואי לאחר בדיקת הנכס"}).click();
  await expect.poll(async()=>{const rows=await query<{metadata:{medicalStatus:string;commercialUseAllowed:boolean|null}}>("select v.metadata from asset a join asset_version v on a.current_version_id=v.id where a.id=$1",[asset.id]);return rows[0]!.metadata.medicalStatus;}).toBe("approved");
  const current=(await query<{metadata:{commercialUseAllowed:boolean|null}}>("select v.metadata from asset a join asset_version v on a.current_version_id=v.id where a.id=$1",[asset.id]))[0]!;expect(current.metadata.commercialUseAllowed).toBeNull();
  expect((await query<{status:string}>("select status from device_model where id=$1",[deviceId]))[0]!.status).toBe("draft");await context.close();
});

test("v2 author builds interactions without JSON and draws, moves and resizes image regions",async({page},info)=>{
  test.skip(info.project.name!=="desktop","desktop authoring with pointer and keyboard alternatives");test.setTimeout(90_000);await login(page);
  const token=randomUUID().slice(0,8),image=await upload(page.request,`canvas-${token}.png`,"image/png",png);
  await page.goto("/studio/chapters");await page.getByLabel("שם הפרק").fill(`עריכה חזותית ${token}`);await page.getByRole("button",{name:"יצירת פרק",exact:true}).click();await expect(page).toHaveURL(/\/studio\/chapters\/ch-/);
  const id=page.url().split("/").pop()!,main=page.locator(".ed-main"),saved=()=>expect(page.getByText("כל השינויים נשמרו")).toBeVisible();
  await main.getByLabel("סוג רכיב להוספה").selectOption("hotspotExplore");await main.getByRole("button",{name:"+ הוספת רכיב",exact:true}).click();
  await main.locator(".v2-media-ref",{has:page.locator("legend",{hasText:"תמונה לאזורים לחיצים"})}).getByRole("button",{name:"בחירה",exact:true}).click();
  await page.getByRole("button",{name:`בחירת canvas-${token}.png`,exact:true}).click();await saved();
  const canvas=main.locator(".v2-hotspot-canvas");await expect(canvas.locator("img")).toBeVisible();await main.getByRole("button",{name:"ציור מלבן חדש"}).click();await canvas.scrollIntoViewIfNeeded();const rect=await canvas.boundingBox();if(!rect)throw Error("Canvas has no size");
  const gesture=async(x:number,y:number,endX:number,endY:number)=>{await page.mouse.move(rect.x+rect.width*x,rect.y+rect.height*y);await page.mouse.down();await page.mouse.move(rect.x+rect.width*endX,rect.y+rect.height*endY,{steps:6});await page.mouse.up();};
  await gesture(.55,.55,.85,.85);await expect(main.getByLabel("אזור לעריכה").locator("option")).toHaveCount(2);
  await main.getByLabel("מרחק משמאל (%)").fill("40");await main.getByLabel("רוחב (%)").fill("25");await saved();
  const before=(await chapter(id));const docBefore=Course.parse(before.content);const beforeExplore=docBefore.units[0]!.screens[0]!.slots.body!.find(c=>c.type==="hotspotExplore");if(beforeExplore?.type!=="hotspotExplore")throw Error();
  expect(beforeExplore.hotspots[1]!.shape).toMatchObject({kind:"rect",x:40,w:25});
  await canvas.scrollIntoViewIfNeeded();const move=canvas.getByRole("button",{name:"בחירה והזזה: אזור חדש",exact:true}),box=await move.boundingBox();if(!box)throw Error();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+rect.width*.05,box.y+box.height/2+rect.height*.05,{steps:5});await page.mouse.up();await saved();
  const resize=canvas.getByRole("button",{name:"שינוי גודל: אזור חדש",exact:true}),handle=await resize.boundingBox();if(!handle)throw Error();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+rect.width*.05,handle.y+handle.height/2,{steps:5});await page.mouse.up();await saved();
  await main.getByLabel("סוג רכיב להוספה").selectOption("reveal");await main.getByRole("button",{name:"+ הוספת רכיב",exact:true}).click();await main.getByLabel("כותרת הפריט").first().fill("כותרת שנוצרה בטופס");await main.getByLabel("סדר חשיפת פריטים").selectOption("sequential");await saved();
  await main.getByLabel("תבנית המסך").selectOption("summary");await saved();
  const stored=await chapter(id),doc=Course.parse(stored.content),body=doc.units[0]!.screens[0]!.slots.body!;expect(doc.schemaVersion).toBe(2);expect(body.some(c=>c.type==="richText")).toBe(true);expect(body.some(c=>c.type==="reveal")).toBe(true);
  const explore=body.find(c=>c.type==="hotspotExplore");if(explore?.type!=="hotspotExplore")throw Error();expect(explore.media.assetId).toBe(image.id);expect(explore.hotspots).toHaveLength(2);const shape=explore.hotspots[1]!.shape;if(shape.kind!=="rect")throw Error();expect(shape.x).toBeGreaterThan(43);expect(shape.w).toBeGreaterThan(28);expect(shape.x+shape.w).toBeLessThanOrEqual(100);
  await page.reload();await expect(main.getByLabel("תבנית המסך")).toHaveValue("summary");await expect(main.getByRole("button",{name:/חקירת תמונה/})).toBeVisible();
  await page.screenshot({path:"test-results/screens/v2-visual-authoring.png"});
});

test("v2 native video exposes multiple VTT tracks and requires the real ended event at 100 percent",async({page},info)=>{
  test.skip(process.platform==="win32" && info.project.name==="iphone","Windows WebKit cannot decode the real MP4 fixture; playback remains mandatory in Linux CI");
  test.setTimeout(90_000);await login(page);const token=randomUUID().slice(0,8),video=await upload(page.request,`${token}.mp4`,"video/mp4",readFileSync(path.resolve("public/demo/demo-clip.mp4")));
  const captions=await upload(page.request,`${token}.vtt`,"text/vtt",Buffer.from("WEBVTT\n\n00:00.000 --> 00:10.000\nכתוביות בדיקה\n"));
  const imported=await importFile(page.request,{schema:"mozes-chapter",schemaVersion:2,title:`בדיקת וידאו ${info.project.name} ${token}`,screens:[{id:"video",title:"בדיקת נגן תוכנה",template:"text",slots:{body:[{id:"v",type:"video",media:{assetId:video.id},requiredWatchPercent:100,captions:[{media:{assetId:captions.id},language:"he",label:"עברית",default:true},{media:{assetId:captions.id},language:"en",label:"English",default:false}]}]}},{id:"end",title:"סיום",template:"summary",slots:{body:[text("end-text","סיום בדיקת וידאו")]}}]});expect(imported.ok,imported.message).toBe(true);
  await page.goto(`/studio/chapters/${imported.chapters[0].id}`);await page.getByRole("button",{name:"תצוגה מקדימה",exact:true}).click();const pv=page.getByRole("dialog",{name:"תצוגה מקדימה"}),element=pv.locator("video"),next=pv.getByRole("button",{name:"המשך",exact:true});
  await expect(element.locator("track")).toHaveCount(2);await expect(element.locator('track[srclang="he"]')).toHaveAttribute("default","");await expect(next).toBeDisabled();
  await expect.poll(()=>element.evaluate(e=>Number.isFinite((e as HTMLVideoElement).duration))).toBe(true);
  // A near-end update must not be rounded up to completion. Only ended releases the gate.
  await element.evaluate(e=>{const v=e as HTMLVideoElement;v.currentTime=Math.max(0,v.duration-.3);v.dispatchEvent(new Event("timeupdate"));});await expect(next).toBeDisabled();
  await element.evaluate(e=>(e as HTMLVideoElement).play());await expect(next).toBeEnabled({timeout:15_000});await expect.poll(()=>element.evaluate(e=>(e as HTMLVideoElement).ended)).toBe(true);
  await next.click();await expect(pv.getByText("סיום בדיקת וידאו",{exact:true})).toBeVisible();
});
