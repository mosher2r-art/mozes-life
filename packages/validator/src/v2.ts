import { CourseV2, type FlowTarget, TEMPLATES, mediaUses, isQuestion, type MediaKind } from "@mozes/content-schema";
import type { Issue } from "./v1";
export interface ValidationContext {
  purpose?: "draft" | "import" | "publish";
  assets?: Record<string, { id: string; kind: MediaKind; ready: boolean; source?: string; licenseType?: string; commercialUseAllowed?: boolean | null; medicalStatus?: string; creditRequired?: boolean; creditText?: string | null }>;
  reviewedScreenIds?: ReadonlySet<string>;
  devices?: Record<string, { status: "draft" | "verified" }>;
}
export function validateV2(input: unknown, context: ValidationContext = {}) {
  const parsed = CourseV2.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(i => {
    const units = input && typeof input === "object" && "units" in input ? input.units : undefined;
    const unit = Array.isArray(units) && typeof i.path[1] === "number" ? units[i.path[1]] as { screens?: unknown[] } | undefined : undefined;
    const screen = unit && Array.isArray(unit.screens) && typeof i.path[3] === "number" ? unit.screens[i.path[3]] as { id?: unknown; title?: unknown } | undefined : undefined;
    return { severity: "error" as const, code: "SCHEMA", message: `${typeof screen?.title === "string" ? `במסך ״${screen.title}״: ` : ""}מבנה v2 אינו תקין: ${i.message}`, screenId: typeof screen?.id === "string" ? screen.id : undefined, path: i.path.join(".") };
  }) };
  const course = parsed.data, issues: Issue[] = [], publishing = context.purpose === "publish";
  const flat = course.units.flatMap(unit => unit.screens.map(screen => ({ unit, screen })));
  const byId = new Map(flat.map(({ screen }, i) => [screen.id, { screen, i }]));
  const seen = new Set<string>();
  const issue = (code: string, message: string, screenId?: string, componentId?: string, path?: string, severity: Issue["severity"] = "error") => { const title = screenId ? byId.get(screenId)?.screen.title : undefined; issues.push({ code, message: title ? `במסך ״${title}״: ${message}` : message, severity, screenId, componentId, path }); };
  const claim = (id: string, screenId?: string, componentId?: string) => { if (seen.has(id)) issue("DUPLICATE_ID", `המזהה ״${id}״ מופיע יותר מפעם אחת`, screenId, componentId); seen.add(id); };
  const variables = course.settings.variables ?? {};
  if (!course.units.length || !flat.length) issue("NO_SCREENS", "בקורס אין מסכים");
  const edges = new Map<string, string[]>();
  for (const unit of course.units) { claim(unit.id); if (!unit.screens.length) issue("EMPTY_UNIT", `היחידה ״${unit.title}״ ריקה`, undefined, undefined, undefined, "warning"); }
  for (const { screen } of flat) {
    claim(screen.id, screen.id);
    const template = TEMPLATES[screen.template], components = Object.values(screen.slots).flat();
    const ids = new Set(components.map(c => c.id));
    for (const key of Object.keys(screen.slots)) if (!template.slots.some(s => s.id === key)) issue("UNKNOWN_SLOT", `האזור ״${key}״ אינו קיים בתבנית`, screen.id, undefined, `slots.${key}`);
    for (const slot of template.slots) {
      const items = screen.slots[slot.id] ?? [];
      if (items.length < slot.min || items.length > slot.max) issue("SLOT_COUNT", `באזור ״${slot.label}״ נדרשים ${slot.min}–${slot.max} רכיבים`, screen.id, undefined, `slots.${slot.id}`);
      for (const c of items) if (!slot.accepts.includes(c.type)) issue("SLOT_TYPE", `הרכיב ״${c.type}״ אינו מתאים לאזור ״${slot.label}״`, screen.id, c.id, `slots.${slot.id}`);
    }
    const targets: string[] = [];
    const target = (value: FlowTarget, path: string, possible = true) => {
      const destination = value.kind === "end" ? "END" : value.kind === "next" ? flat[byId.get(screen.id)!.i + 1]?.screen.id ?? "END" : value.screenId;
      if (destination !== "END" && !byId.has(destination)) issue("MISSING_TARGET", `יעד הניווט ״${destination}״ אינו קיים באותו פרק`, screen.id, undefined, path);
      else if (possible) targets.push(destination);
    };
    const decision = screen.template === "decision" ? components.find(c => c.type === "choiceQuestion") : undefined;
    const exhaustiveDecision = decision?.type === "choiceQuestion" && decision.mode === "single" && decision.options.every(o => screen.flow.rules.some(r => "componentId" in r.when && r.when.componentId === decision.id && typeof r.when.outcome === "object" && r.when.outcome.choice === o.id));
    target(screen.flow.default, "flow.default", !exhaustiveDecision);
    for (const rule of screen.flow.rules) {
      claim(rule.id, screen.id);
      target(rule.then, `flow.rules.${rule.id}.then`);
      if ("variable" in rule.when) { if (!(rule.when.variable in variables) || typeof variables[rule.when.variable] !== typeof rule.when.equals) issue("VARIABLE_CONDITION", "תנאי התרחיש מפנה למשתנה לא מוגדר או לערך מסוג שגוי", screen.id, undefined, `flow.rules.${rule.id}.when`); }
      else {
        const when = rule.when, c = components.find(c => c.id === when.componentId);
        if (!c || !isQuestion(c)) issue("RULE_QUESTION", "כלל הניווט מפנה לשאלה שאינה קיימת במסך", screen.id, when.componentId);
        else if (typeof when.outcome === "object" && (c.type !== "choiceQuestion" || !c.options.some(o => o.id === (typeof when.outcome === "object" ? when.outcome.choice : undefined)))) issue("RULE_CHOICE", "כלל הניווט מפנה לאפשרות תשובה חסרה", screen.id, c.id);
      }
    }
    for (const c of components) {
      claim(c.id, screen.id, c.id);
      if (c.type === "button") target(c.target, `slots.${c.id}.target`);
      if (c.type === "heading" && !c.text.trim()) issue("EMPTY_TEXT", "חסר טקסט בכותרת", screen.id, c.id);
      if (c.type === "image" && !c.decorative && !c.alt.trim()) issue("MISSING_ALT", "חסר תיאור חלופי לתמונה", screen.id, c.id, "alt");
      if (c.type === "choiceQuestion") {
        c.options.forEach(o => claim(o.id, screen.id, c.id));
        const correct = c.options.filter(o => o.correct).length;
        if ((c.mode === "single" && correct !== 1) || !correct) issue("CORRECT_OPTIONS", "מספר התשובות הנכונות אינו מתאים לסוג השאלה", screen.id, c.id);
        for (const o of c.options) {
          if (o.image && !o.imageAlt?.trim()) issue("MISSING_ALT", "חסר תיאור לתמונת אפשרות התשובה", screen.id, c.id, `options.${o.id}.imageAlt`);
          for (const [name, value] of Object.entries(o.setVariables ?? {})) if (screen.template !== "decision" || c.mode !== "single" || !(name in variables) || typeof variables[name] !== typeof value) issue("VARIABLE_ASSIGNMENT", "משתנה ניתן לקביעה רק בבחירה יחידה במסך החלטה, ובסוג שהוגדר מראש", screen.id, c.id, `options.${o.id}.setVariables.${name}`);
        }
        if (screen.template === "decision" && (c.mode !== "single" || c.maxAttempts !== 1 || c.options.length > 4 || c.options.some(o => !o.feedback?.trim() || !screen.flow.rules.some(r => "componentId" in r.when && r.when.componentId === c.id && typeof r.when.outcome === "object" && r.when.outcome.choice === o.id)))) issue("DECISION_CHOICES", "במסך החלטה נדרשים בחירה יחידה, ניסיון אחד לכל ביקור, ומשוב ויעד מפורש לכל אחת מ־2–4 הבחירות", screen.id, c.id);
      }
      if (c.type === "hotspotImage" || c.type === "hotspotExplore") {
        c.hotspots.forEach(o => { claim(o.id, screen.id, c.id); const s = o.shape; const fits = s.kind === "rect" ? s.x + s.w <= 100 && s.y + s.h <= 100 : s.cx - s.r >= 0 && s.cy - s.r >= 0 && s.cx + s.r <= 100 && s.cy + s.r <= 100; if (!fits) issue("HOTSPOT_BOUNDS", "אזור לחיץ חורג מגבולות התמונה", screen.id, c.id, `hotspots.${o.id}.shape`); });
        if (c.type === "hotspotImage" && !c.hotspots.some(h => h.correct)) issue("HOTSPOT_ANSWER", "יש להגדיר לפחות אזור נכון אחד", screen.id, c.id);
      }
      if (c.type === "sequenceTask") c.items.forEach(o => claim(o.id, screen.id, c.id));
      if (c.type === "reveal") c.items.forEach(o => claim(o.id, screen.id, c.id));
      if (c.type === "simulation") {
        if (publishing) issue("SIMULATION_TEST_ONLY", "מודול בדיקת התוכנה מיועד לתצוגה מקדימה בלבד ואינו ניתן לפרסום", screen.id, c.id);
        if (c.config.deviceModelId && !context.devices?.[c.config.deviceModelId]) issue("UNKNOWN_DEVICE", "דגם המכשיר לא קיים ברשימת הדגמים", screen.id, c.id, "config.deviceModelId");
        if (publishing && c.config.deviceModelId && context.devices?.[c.config.deviceModelId]?.status !== "verified") issue("UNVERIFIED_DEVICE", "דגם המכשיר עדיין לא אומת", screen.id, c.id);
      }
    }
    if (screen.narration) {
      let previous = -1;
      const cued=new Set<string>();
      for (const cue of screen.narration.cues) { if (!ids.has(cue.componentId)) issue("NARRATION_TARGET", "נקודת הקריינות מפנה לרכיב חסר במסך", screen.id, cue.componentId, "narration.cues"); if(cued.has(cue.componentId)) issue("NARRATION_DUPLICATE","רכיב יכול לקבל זמן הופעה אחד בלבד",screen.id,cue.componentId,"narration.cues"); cued.add(cue.componentId); if (cue.atMs < previous) issue("NARRATION_ORDER", "נקודות הקריינות צריכות להיות מסודרות לפי הזמן", screen.id, cue.componentId, "narration.cues"); previous = cue.atMs; }
    }
    if (screen.medical.relevant && !context.reviewedScreenIds?.has(screen.id)) issue("MEDICAL_REVIEW", "התוכן הרפואי טרם אושר עבור גרסת המסך הנוכחית", screen.id, undefined, "medical", publishing ? "error" : "warning");
    if (screen.medical.relevant && !screen.medical.sources?.length) issue("MEDICAL_SOURCES", "חסרים מקורות ותאריך לתוכן הרפואי", screen.id, undefined, "medical.sources", publishing ? "error" : "warning");
    edges.set(screen.id, targets);
  }
  const reachable = new Set<string>(), queue = flat.length ? [flat[0]!.screen.id] : [];
  while (queue.length) { const id = queue.shift()!; if (reachable.has(id)) continue; reachable.add(id); for (const next of edges.get(id) ?? []) if (next !== "END" && !reachable.has(next)) queue.push(next); }
  for (const { screen } of flat) if (!reachable.has(screen.id)) issue("UNREACHABLE", "אין דרך להגיע למסך מתחילת הפרק", screen.id);
  const canEnd = new Set<string>(); let changed = true;
  while (changed) { changed = false; for (const [id, out] of edges) if (!canEnd.has(id) && out.some(t => t === "END" || canEnd.has(t))) { canEnd.add(id); changed = true; } }
  for (const id of reachable) if (!canEnd.has(id)) issue("DEAD_END", "המסלול או הלולאה אינם מאפשרים להגיע לסיום", id);
  for (const unit of course.units) if (unit.kind === "exam" && !unit.screens.some(s => Object.values(s.slots).flat().some(isQuestion))) issue("EXAM_WITHOUT_QUESTIONS", `במבחן ״${unit.title}״ אין שאלות`);
  if (course.settings.completion.passingScore !== null && !flat.some(({ screen }) => Object.values(screen.slots).flat().some(isQuestion))) issue("PASSING_SCORE_WITHOUT_QUESTIONS", "נקבע ציון מעבר אך אין שאלות בקורס");
  for (const use of mediaUses(course)) {
    if ("placeholder" in use.ref) { issue("PLACEHOLDER", `נכס חסר: ${use.ref.placeholder.description}`, use.screenId, use.componentId, use.path, publishing ? "error" : "warning"); continue; }
    const asset = context.assets?.[use.ref.assetId];
    if (!context.assets) { issue("ASSET_NOT_CHECKED", "יש לאמת את הפניית הנכס מול ספריית המדיה בשרת", use.screenId, use.componentId, use.path, publishing ? "error" : "warning"); continue; }
    if (!asset?.ready) { issue("MISSING_ASSET", `הנכס ״${use.ref.assetId}״ אינו קיים או שהעלאתו לא הושלמה`, use.screenId, use.componentId, use.path); continue; }
    if (!use.kinds.includes(asset.kind)) issue("ASSET_TYPE", "סוג הנכס אינו מתאים לשדה", use.screenId, use.componentId, use.path);
    if (publishing && asset.commercialUseAllowed !== true) issue("ASSET_LICENSE", "לא אושרה הרשאה לשימוש מסחרי בנכס", use.screenId, use.componentId, use.path);
    if (publishing && (!asset.source?.trim() || !asset.licenseType?.trim() || asset.licenseType === "unknown")) issue("ASSET_PROVENANCE", "חסר תיעוד מקור הקובץ או סוג הרישיון בספרייה", use.screenId, use.componentId, use.path);
    if (publishing && asset.medicalStatus !== "approved") issue("ASSET_MEDICAL_REVIEW", "הנכס טרם אושר רפואית", use.screenId, use.componentId, use.path);
    if (publishing && asset.creditRequired && !asset.creditText?.trim()) issue("ASSET_CREDIT", "נדרש קרדיט לנכס אך נוסח הקרדיט חסר בספרייה", use.screenId, use.componentId, use.path);
  }
  return { ok: !issues.some(i => i.severity === "error"), issues, course };
}
