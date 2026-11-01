import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/actor";
import { getLaunchData } from "@/server/learning";
import { LearnPlayer } from "./LearnPlayer";

export const metadata: Metadata = { title: "קורס" };
export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  // Returns null for other users' enrollments too — never reveal that they exist.
  const data = await getLaunchData(user.actor.userId, id);
  if (!data) notFound();

  return (
    <div className="course-shell">
      <nav className="course-bar" aria-label="ניווט קורס">
        <Link href="/learn" className="course-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          הקורסים שלי
        </Link>
        {data.isDemo && <span className="course-demo-flag">קורס הדגמה · לא רפואי</span>}
      </nav>
      <LearnPlayer enrollmentId={data.enrollmentId} course={data.content} initialState={data.state} media={data.media} />
    </div>
  );
}
