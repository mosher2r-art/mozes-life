/**
 * Course validator — technical checks only.
 *
 * IMPORTANT: passing validation is NOT medical approval. Medical review is a
 * separate, human process tracked outside the content.
 */
import {
  Course,
  type FlowTarget,
  type Screen,
  TEMPLATES,
  flattenScreens,
  isQuestion,
  screenComponents,
} from "@mozes/content-schema";

export type Severity = "error" | "warning" | "info";

export interface Issue {
  severity: Severity;
  code: string;
  message: string; // Hebrew, for authors
  screenId?: string;
  componentId?: string;
  path?: string;
}

export interface ValidationResult {
  /** True when there are no errors (warnings allowed). Errors block publishing. */
  ok: boolean;
  issues: Issue[];
  course?: Course;
}

export const TECHNICAL_ONLY_NOTICE = "בדיקת תקינות טכנית אינה מהווה אישור רפואי.";

export function validateCourse(input: unknown): ValidationResult {
  const parsed = Course.safeParse(input);
  if (!parsed.success) {
    const issues: Issue[] = parsed.error.issues.map((i) => ({
      severity: "error",
      code: "SCHEMA",
      message: i.message,
      path: i.path.join("."),
    }));
    return { ok: false, issues };
  }
  const course = parsed.data;
  const issues = [...checkStructure(course), ...checkContent(course), ...checkFlow(course), ...checkScoring(course)];
  return { ok: !issues.some((i) => i.severity === "error"), issues, course };
}

/* ───────────── Structure: ids, templates, slots ───────────── */

function checkStructure(course: Course): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, string>();
  const claim = (id: string, what: string, screenId?: string) => {
    if (seen.has(id)) {
      issues.push({ severity: "error", code: "DUPLICATE_ID", message: `המזהה "${id}" מופיע יותר מפעם אחת (${seen.get(id)} ו-${what})`, screenId });
    } else seen.set(id, what);
  };

  if (!course.units.length) issues.push({ severity: "error", code: "NO_UNITS", message: "בקורס אין יחידות" });

  for (const unit of course.units) {
    claim(unit.id, "יחידה");
    if (!unit.screens.length) issues.push({ severity: "warning", code: "EMPTY_UNIT", message: `היחידה "${unit.title}" ריקה` });

    for (const screen of unit.screens) {
      claim(screen.id, "מסך", screen.id);
      const tpl = TEMPLATES[screen.template];
      const slotIds = new Set(tpl.slots.map((s) => s.id));

      for (const key of Object.keys(screen.slots)) {
        if (!slotIds.has(key)) {
          issues.push({ severity: "error", code: "UNKNOWN_SLOT", message: `האזור "${key}" אינו קיים בתבנית "${tpl.label}"`, screenId: screen.id });
        }
      }
      for (const slot of tpl.slots) {
        const items = screen.slots[slot.id] ?? [];
        if (items.length < slot.min) {
          issues.push({ severity: "error", code: "SLOT_MIN", message: `באזור "${slot.label}" חסר תוכן (נדרש לפחות ${slot.min})`, screenId: screen.id });
        }
        if (items.length > slot.max) {
          issues.push({ severity: "error", code: "SLOT_MAX", message: `באזור "${slot.label}" יותר מדי רכיבים (מותר עד ${slot.max})`, screenId: screen.id });
        }
        for (const c of items) {
          claim(c.id, "רכיב", screen.id);
          if (!slot.accepts.includes(c.type)) {
            issues.push({ severity: "error", code: "SLOT_TYPE", message: `רכיב מסוג ${c.type} אינו מותר באזור "${slot.label}"`, screenId: screen.id, componentId: c.id });
          }
        }
      }
    }
  }
  return issues;
}

/* ───────────── Content & accessibility ───────────── */

function checkContent(course: Course): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: string, message: string, screen: Screen, componentId?: string) =>
    issues.push({ severity, code, message, screenId: screen.id, componentId });

  for (const { screen } of flattenScreens(course)) {
    if (screen.medical.relevant) add("info", "MEDICAL_REVIEW_REQUIRED", "מסך זה מסומן כתוכן רפואי ודורש אישור מקצועי לפני פרסום", screen);

    for (const c of screenComponents(screen)) {
      switch (c.type) {
        case "image":
          if (!c.decorative && !c.alt) add("error", "IMAGE_ALT", "לתמונה חסר טקסט חלופי (או סימון כדקורטיבית)", screen, c.id);
          break;
        case "video":
          if (!c.captions) add("warning", "VIDEO_CAPTIONS", "לסרטון אין כתוביות", screen, c.id);
          if (screen.template === "scenario" && c.requiredWatchPercent > 0 && c.pauseAtMs !== undefined)
            add("warning", "SCENARIO_WATCH", "בתרחיש עם עצירה, דרישת צפייה עלולה למנוע מענה", screen, c.id);
          break;
        case "choiceQuestion": {
          const correct = c.options.filter((o) => o.correct).length;
          if (correct === 0) add("error", "NO_CORRECT_OPTION", "לשאלה אין תשובה נכונה", screen, c.id);
          if (c.mode === "single" && correct > 1) add("error", "SINGLE_MULTIPLE_CORRECT", "בשאלת בחירה יחידה מסומנת יותר מתשובה נכונה אחת", screen, c.id);
          if (new Set(c.options.map((o) => o.id)).size !== c.options.length) add("error", "DUPLICATE_OPTION", "מזהי תשובות כפולים", screen, c.id);
          if (!c.feedback.correct && !c.feedback.incorrect && !c.options.some((o) => o.feedback))
            add("warning", "NO_FEEDBACK", "לשאלה אין משוב ללומד", screen, c.id);
          break;
        }
        case "trueFalse":
          if (!c.feedback.correct && !c.feedback.incorrect) add("warning", "NO_FEEDBACK", "לשאלה אין משוב ללומד", screen, c.id);
          break;
        case "hotspotImage": {
          const correct = c.hotspots.filter((h) => h.correct).length;
          if (correct === 0) add("error", "NO_CORRECT_HOTSPOT", "אין אזור נכון במשימה", screen, c.id);
          if (c.mode === "single" && correct > 1) add("error", "SINGLE_MULTIPLE_CORRECT", "במצב בחירה יחידה מסומן יותר מאזור נכון אחד", screen, c.id);
          for (const h of c.hotspots) {
            const s = h.shape;
            const outside = s.kind === "circle" ? s.cx - s.r < 0 || s.cx + s.r > 100 || s.cy - s.r < 0 || s.cy + s.r > 100 : s.x + s.w > 100 || s.y + s.h > 100;
            if (outside) add("warning", "HOTSPOT_OUTSIDE", `האזור "${h.label}" חורג מגבולות התמונה`, screen, c.id);
          }
          break;
        }
        case "sequenceTask":
          if (new Set(c.items.map((i) => i.id)).size !== c.items.length) add("error", "DUPLICATE_ITEM", "מזהי שלבים כפולים", screen, c.id);
          break;
        default:
          break;
      }
    }
  }
  return issues;
}

/* ───────────── Flow graph ───────────── */

interface Edge {
  to: string | "END";
  conditional: boolean;
}

function checkFlow(course: Course): Issue[] {
  const issues: Issue[] = [];
  const flat = flattenScreens(course);
  if (!flat.length) return issues;
  const ids = new Set(flat.map((r) => r.screen.id));
  const edges = new Map<string, Edge[]>();

  const targetOf = (t: FlowTarget, index: number, screen: Screen, ctx: { componentId?: string; conditional: boolean }): Edge | null => {
    if (t.kind === "end") return { to: "END", conditional: ctx.conditional };
    if (t.kind === "next") return { to: flat[index + 1]?.screen.id ?? "END", conditional: ctx.conditional };
    if (!ids.has(t.screenId)) {
      issues.push({ severity: "error", code: "BROKEN_LINK", message: `הפניה למסך שאינו קיים ("${t.screenId}")`, screenId: screen.id, componentId: ctx.componentId });
      return null;
    }
    return { to: t.screenId, conditional: ctx.conditional };
  };

  for (const { screen, index } of flat) {
    const out: Edge[] = [];
    const comps = screenComponents(screen);
    const byId = new Map(comps.map((c) => [c.id, c]));

    for (const rule of screen.flow.rules) {
      const c = byId.get(rule.when.componentId);
      if (!c || !isQuestion(c)) {
        issues.push({ severity: "error", code: "RULE_COMPONENT", message: "כלל הסתעפות מתייחס לשאלה שאינה במסך", screenId: screen.id, componentId: rule.when.componentId });
        continue;
      }
      const o = rule.when.outcome;
      if (typeof o === "object" && (c.type !== "choiceQuestion" || !c.options.some((opt) => opt.id === o.choice))) {
        issues.push({ severity: "error", code: "RULE_OPTION", message: "כלל הסתעפות מתייחס לתשובה שאינה קיימת", screenId: screen.id, componentId: c.id });
        continue;
      }
      const e = targetOf(rule.then, index, screen, { componentId: c.id, conditional: true });
      if (e) out.push(e);
    }

    // Buttons are alternative exits chosen by the learner.
    for (const c of comps) if (c.type === "button") {
      const e = targetOf(c.target, index, screen, { componentId: c.id, conditional: true });
      if (e) out.push(e);
    }

    const d = targetOf(screen.flow.default, index, screen, { conditional: false });
    if (d) out.push(d);
    edges.set(screen.id, out);
  }

  // Reachability from the first screen.
  const start = flat[0]!.screen.id;
  const reachable = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    for (const e of edges.get(queue.shift()!) ?? []) {
      if (e.to !== "END" && !reachable.has(e.to)) {
        reachable.add(e.to);
        queue.push(e.to);
      }
    }
  }
  for (const { screen } of flat) {
    if (!reachable.has(screen.id)) {
      issues.push({ severity: "warning", code: "UNREACHABLE", message: `אי אפשר להגיע למסך "${screen.title}" מתחילת הקורס`, screenId: screen.id });
    }
  }

  // Every reachable screen must be able to reach the end (no traps).
  const canEnd = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, out] of edges) {
      if (!canEnd.has(id) && out.some((e) => e.to === "END" || canEnd.has(e.to))) {
        canEnd.add(id);
        changed = true;
      }
    }
  }
  for (const id of reachable) {
    if (!canEnd.has(id)) {
      const title = flat.find((r) => r.screen.id === id)?.screen.title;
      issues.push({ severity: "error", code: "DEAD_END", message: `מהמסך "${title}" אין דרך להגיע לסיום הקורס`, screenId: id });
    }
  }

  // Unconditional cycles = infinite loop without any learner decision.
  const uncond = new Map([...edges].map(([id, out]) => [id, out.filter((e) => !e.conditional && e.to !== "END").map((e) => e.to)]));
  const reported = new Set<string>();
  for (const startId of uncond.keys()) {
    const path: string[] = [];
    let cur: string | undefined = startId;
    while (cur && !path.includes(cur)) {
      path.push(cur);
      cur = uncond.get(cur)?.[0];
    }
    if (cur && path.includes(cur)) {
      const cycle = path.slice(path.indexOf(cur));
      const key = [...cycle].sort().join("|");
      if (!reported.has(key)) {
        reported.add(key);
        issues.push({ severity: "error", code: "INFINITE_LOOP", message: `לולאה אינסופית בין המסכים: ${cycle.join(" → ")}`, screenId: cur });
      }
    }
  }

  // Conditional cycles are allowed (e.g. "watch again") — surface them for review.
  const onStack = new Set<string>();
  const done = new Set<string>();
  const loopNotes = new Set<string>();
  const dfs = (id: string) => {
    onStack.add(id);
    for (const e of edges.get(id) ?? []) {
      if (e.to === "END") continue;
      if (onStack.has(e.to)) loopNotes.add(e.to);
      else if (!done.has(e.to)) dfs(e.to);
    }
    onStack.delete(id);
    done.add(id);
  };
  dfs(start);
  for (const id of loopNotes) {
    if (![...reported].some((k) => k.split("|").includes(id))) {
      issues.push({ severity: "info", code: "INTENDED_LOOP", message: "קיים מסלול שחוזר למסך קודם לפי בחירת הלומד — ודאו שזה מכוון", screenId: id });
    }
  }

  return issues;
}

/* ───────────── Scoring: exams and passing score ───────────── */

function checkScoring(course: Course): Issue[] {
  const issues: Issue[] = [];
  const hasQuestion = (screens: Screen[]) => screens.some((s) => screenComponents(s).some(isQuestion));
  for (const unit of course.units) {
    if (unit.kind === "exam" && unit.screens.length && !hasQuestion(unit.screens)) {
      issues.push({ severity: "error", code: "EXAM_WITHOUT_QUESTIONS", message: `במבחן "${unit.title}" אין שאלות` });
    }
  }
  const { passingScore } = course.settings.completion;
  if (passingScore !== null && !hasQuestion(course.units.flatMap((u) => u.screens))) {
    issues.push({ severity: "error", code: "PASSING_SCORE_WITHOUT_QUESTIONS", message: "נקבע ציון עובר, אבל בקורס אין שאלות" });
  }
  return issues;
}
