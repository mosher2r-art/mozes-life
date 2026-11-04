import { describe, expect, it } from "vitest";
import { validateCourse } from "./index";
const course = (body: unknown[]) => ({ schema: "mozes-course", schemaVersion: 2, id: "c", title: "בדיקת תוכנה", locale: "he", units: [{ id: "u", title: "u", screens: [{ id: "s", title: "מסך מדיה", template: "text", required: true, slots: { body } }] }] });
describe("v2 publish and import gates", () => {
  it("admits defined placeholders into drafts and blocks publication", () => { const input = course([{ id: "image", type: "image", media: { placeholder: { requestId: "request", description: "תמונה דרושה" } }, alt: "תיאור" }]); expect(validateCourse(input).ok).toBe(true); expect(validateCourse(input, { purpose: "publish", assets: {} }).issues.some(i => i.code === "PLACEHOLDER" && i.severity === "error")).toBe(true); });
  it("rejects nonexistent assets with the screen name and field path", () => { const input = course([{ id: "image", type: "image", media: { assetId: "invented" }, alt: "תיאור" }]); const result = validateCourse(input, { purpose: "import", assets: {} }); expect(result.ok).toBe(false); expect(result.issues[0]).toMatchObject({ screenId: "s", componentId: "image", path: "slots.body.image.media" }); expect(result.issues[0]!.message).toContain("מסך מדיה"); });
  it("rejects a ready asset of the wrong type", () => { const input = course([{ id: "image", type: "image", media: { assetId: "a" }, alt: "תיאור" }]); expect(validateCourse(input, { assets: { a: { id: "a", ready: true, kind: "audio" } } }).ok).toBe(false); });
  it("does not trust review or rights claims inside JSON", () => { const input = course([{ id: "image", type: "image", media: { assetId: "a" }, alt: "תיאור" }]); const result = validateCourse(input, { purpose: "publish", assets: { a: { id: "a", kind: "image", ready: true, commercialUseAllowed: false, medicalStatus: "draft" } } }); expect(result.issues.map(i => i.code)).toEqual(expect.arrayContaining(["ASSET_LICENSE", "ASSET_MEDICAL_REVIEW"])); });
  it("keeps the test simulation out of published content", () => { const input = course([{ id: "sim", type: "simulation", module: "software-sequence", moduleVersion: 1, config: { steps: ["one", "two", "three"] }, completion: { required: true } }]); expect(validateCourse(input).ok).toBe(true); expect(validateCourse(input, { purpose: "publish" }).ok).toBe(false); });
  it("does not count an impossible decision default as an exit from a loop",()=>{
    const input={schema:"mozes-course",schemaVersion:2,id:"branch",title:"בדיקת ניווט",locale:"he",units:[{id:"unit",title:"בדיקה",screens:[{id:"decision",title:"צומת ללא יציאה",template:"decision",slots:{media:[{id:"image",type:"image",media:{placeholder:{requestId:"image-request",description:"תמונת בדיקה"}},alt:"בדיקה"}],intro:[{id:"intro",type:"richText",body:[]}],decision:[{id:"q",type:"choiceQuestion",prompt:"בחירת בדיקה",mode:"single",maxAttempts:1,options:[{id:"one",text:"א",correct:true,feedback:"משוב א"},{id:"two",text:"ב",correct:false,feedback:"משוב ב"}]}]},flow:{default:{kind:"end"},rules:["one","two"].map(choice=>({id:`rule-${choice}`,when:{componentId:"q",outcome:{choice}},then:{kind:"goto",screenId:"decision"}}))}}]}]};
    expect(validateCourse(input).issues.some(i=>i.code==="DEAD_END")).toBe(true);
  });
  it("requires source and license documentation even when a boolean permission is true",()=>{
    const input=course([{id:"image",type:"image",media:{assetId:"a"},alt:"תיאור"}]);
    expect(validateCourse(input,{purpose:"publish",assets:{a:{id:"a",kind:"image",ready:true,medicalStatus:"approved",commercialUseAllowed:true}}}).issues.some(i=>i.code==="ASSET_PROVENANCE")).toBe(true);
    expect(validateCourse(input,{purpose:"publish",assets:{a:{id:"a",kind:"image",ready:true,medicalStatus:"approved",commercialUseAllowed:true,source:"Synthetic test fixture",licenseType:"test-only"}}}).ok).toBe(true);
  });
  it("rejects imported medical stamps without an authoritative matching review",()=>{
    const input=course([{id:"text",type:"richText",body:[]}]);
    const screen={...input.units[0]!.screens[0]!,medical:{relevant:true,reviewedBy:"imported-claim",reviewedAt:"2026-01-01T00:00:00Z",sources:[{title:"בדיקת תוכנה בלבד",url:"https://example.invalid/test",date:"2026-01-01"}]}};
    expect(validateCourse({...input,units:[{...input.units[0]!,screens:[screen]}]},{purpose:"publish",assets:{}}).issues.some(i=>i.code==="MEDICAL_REVIEW")).toBe(true);
  });
  it("reports a malformed new block with its screen name and schema field path",()=>{
    const result=validateCourse(course([{id:"anim",type:"animation",media:{placeholder:{requestId:"request",description:"בדיקה"}},alt:"בדיקה",playOn:"unknown"}]));
    expect(result.ok).toBe(false);expect(result.issues[0]!.message).toContain("מסך מדיה");expect(result.issues[0]!.path).toContain("slots.body.0");
  });
});
