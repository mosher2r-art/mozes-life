import "server-only";
import { sql } from "drizzle-orm";
import { Course, flattenScreens, mediaUses } from "@mozes/content-schema";
import { db } from "@/db";
import { chapter, chapterVersion, course, courseDraft, courseVersion } from "@/db/schema";
export interface AssetUsage { chapterId?:string;courseId?:string;title:string;screenId:string;screenTitle:string;status:"draft"|"published";versionNo?:number }
export async function assetUsage(assetId:string):Promise<AssetUsage[]> {
  const needle=`%"assetId": "${assetId}"%`;
  const [chapters,chapterVersions,drafts,published,courses]=await Promise.all([
    db.select().from(chapter).where(sql`${chapter.content}::text like ${needle}`),
    db.select().from(chapterVersion).where(sql`${chapterVersion.content}::text like ${needle}`),
    db.select().from(courseDraft).where(sql`${courseDraft.content}::text like ${needle}`),
    db.select().from(courseVersion).where(sql`${courseVersion.content}::text like ${needle}`),
    db.select({id:course.id,title:course.title,chapters:course.chapterIds}).from(course),
  ]);
  const uses:AssetUsage[]=[];
  const add=(content:unknown,scope:Omit<AssetUsage,"screenId"|"screenTitle">)=>{const parsed=Course.safeParse(content);if(!parsed.success)return;const ids=new Set(mediaUses(parsed.data).filter(use=>use.ref.assetId===assetId).map(use=>use.screenId));for(const {screen} of flattenScreens(parsed.data))if(ids.has(screen.id))uses.push({...scope,screenId:screen.id,screenTitle:screen.title});};
  for(const ch of chapters){add(ch.content,{chapterId:ch.id,title:ch.title,status:"draft"});for(const c of courses)if(c.chapters?.includes(ch.id))add(ch.content,{chapterId:ch.id,courseId:c.id,title:c.title,status:"draft"});}
  const chapterTitles=new Map(chapters.map(ch=>[ch.id,ch.title])),courseTitles=new Map(courses.map(c=>[c.id,c.title]));
  for(const version of chapterVersions)add(version.content,{chapterId:version.chapterId,title:chapterTitles.get(version.chapterId) ?? "גרסת פרק",status:"published",versionNo:version.versionNo});
  for(const draft of drafts)add(draft.content,{courseId:draft.courseId,title:courseTitles.get(draft.courseId) ?? "טיוטת קורס",status:"draft"});
  for(const version of published)add(version.content,{courseId:version.courseId,title:courseTitles.get(version.courseId) ?? "גרסת קורס",status:"published",versionNo:version.versionNo});
  return uses;
}
