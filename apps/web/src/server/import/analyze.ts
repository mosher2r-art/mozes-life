/**
 * Courseware package analysis and extraction (SCORM 1.2 / SCORM 2004 / HTML5 ZIP).
 *
 * Security model: nothing is extracted until every entry has been checked.
 *  - ZIP Slip: absolute paths, "..", backslashes, drive letters and NUL are rejected (yauzl
 *    validates names; we add our own checks and translate errors into report items).
 *  - Symbolic links are rejected.
 *  - ZIP bombs: entry count, total and per-entry size and compression ratio are capped, and
 *    yauzl's validateEntrySizes makes the real stream size match the declared one.
 *  - Executables reject the whole package; server-side scripts and unknown types are skipped.
 * The extracted package is only ever served from a separate origin inside a sandboxed iframe.
 */
import { open as openZip, type Entry, type ZipFile } from "yauzl";
import { XMLParser } from "fast-xml-parser";
import type { Readable } from "node:stream";

export type PackageFormat = "scorm12" | "scorm2004" | "html5";
export type Verdict = "play_only" | "partial" | "unsupported";

export interface ReportItem {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface AnalysisReport {
  verdict: Verdict;
  format: PackageFormat | null;
  title: string;
  launchPath: string | null;
  rootPrefix: string;
  fileCount: number;
  totalBytes: number;
  scoCount: number;
  externalHosts: string[];
  skipped: string[];
  tracking: string;
  items: ReportItem[];
}

export const LIMITS = {
  maxEntries: 20_000,
  maxTotalBytes: 2 * 1024 ** 3,
  maxEntryBytes: 1024 ** 3,
  maxRatio: 100,
  ratioMinBytes: 10 * 1024 ** 2,
  maxScanBytes: 5 * 1024 ** 2,
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  play_only: "נתמך להפעלה בלבד",
  partial: "נתמך חלקית",
  unsupported: "אינו נתמך",
};

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json", xml: "application/xml", xsd: "application/xml", dtd: "application/xml-dtd",
  txt: "text/plain; charset=utf-8", vtt: "text/vtt", srt: "text/plain; charset=utf-8", map: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject", pdf: "application/pdf", swf: "application/x-shockwave-flash",
};
const EXECUTABLE = new Set(["exe", "dll", "bat", "cmd", "msi", "scr", "com", "vbs", "ps1", "jar", "sh", "app", "apk", "dmg"]);
const SERVER_SCRIPT = new Set(["php", "asp", "aspx", "jsp", "py", "rb", "pl", "cgi", "htaccess", "config"]);
const TEXT_SCAN = new Set(["html", "htm", "js", "mjs", "css"]);
const NAMESPACE_HOSTS = /(^|\.)(w3\.org|imsglobal\.org|adlnet\.org|adlnet\.gov|adobe\.com|purl\.org|xmlns\.com|schemas\.microsoft\.com|ogp\.me|schema\.org)$/;

export const extOf = (name: string) => (name.includes(".") ? name.toLowerCase().split(".").pop()! : "");
export const contentTypeOf = (name: string) => CONTENT_TYPES[extOf(name)] ?? "application/octet-stream";

function openFile(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) =>
    openZip(file, { lazyEntries: true, autoClose: true, validateEntrySizes: true, strictFileNames: true, decodeStrings: true }, (err, zip) =>
      err || !zip ? reject(err ?? new Error("cannot open zip")) : resolve(zip),
    ),
  );
}

function readStream(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (err, s) => (err || !s ? reject(err ?? new Error("stream")) : resolve(s))));
}

async function readText(zip: ZipFile, entry: Entry, max: number): Promise<string> {
  const s = await readStream(zip, entry);
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of s as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > max) {
      s.destroy();
      break;
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

interface ScannedEntry {
  name: string;
  size: number;
  entry: Entry;
}

/** Iterates entries one by one (lazy), letting the callback inspect each. */
async function forEachEntry(file: string, fn: (zip: ZipFile, entry: Entry) => Promise<void>): Promise<void> {
  const zip = await openFile(file);
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (entry: Entry) => {
      fn(zip, entry).then(() => zip.readEntry(), (e) => {
        zip.close();
        reject(e);
      });
    });
    zip.on("end", () => resolve());
    zip.on("error", reject);
    zip.readEntry();
  });
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v: unknown): string => (typeof v === "string" ? v : v && typeof v === "object" && "#text" in (v as object) ? String((v as { "#text": unknown })["#text"]) : "");

interface Manifest {
  format: "scorm12" | "scorm2004";
  title: string;
  launch: string | null;
  scoCount: number;
  resourceFiles: string[];
  sequencing: boolean;
}

export function parseManifest(xml: string): Manifest {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, attributeNamePrefix: "@_", parseAttributeValue: false, processEntities: false });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const m = (doc.manifest ?? {}) as Record<string, unknown>;
  const schemaVersion = textOf((m.metadata as Record<string, unknown> | undefined)?.schemaversion);
  const attrs = Object.entries(m).filter(([k]) => k.startsWith("@_")).map(([, v]) => String(v)).join(" ");
  let format: Manifest["format"] = "scorm12";
  if (/2004|CAM 1\.3/i.test(schemaVersion) || /adlcp_v1p3|adlseq|imsss/i.test(attrs)) format = "scorm2004";
  else if (/1\.2/.test(schemaVersion) || /adlcp_rootv1p2/i.test(attrs)) format = "scorm12";

  const orgs = (m.organizations ?? {}) as Record<string, unknown>;
  const orgList = asArray(orgs.organization as Record<string, unknown> | Record<string, unknown>[]);
  const org = orgList.find((o) => o["@_identifier"] === orgs["@_default"]) ?? orgList[0];
  const resources = asArray(((m.resources ?? {}) as Record<string, unknown>).resource as Record<string, unknown> | Record<string, unknown>[]);
  const byId = new Map(resources.map((r) => [String(r["@_identifier"]), r]));

  const items: Record<string, unknown>[] = [];
  const walk = (node: Record<string, unknown>) => {
    for (const it of asArray(node.item as Record<string, unknown> | Record<string, unknown>[])) {
      items.push(it);
      walk(it);
    }
  };
  if (org) walk(org);

  const isSco = (r: Record<string, unknown>) => String(r["@_scormtype"] ?? r["@_scormType"] ?? "").toLowerCase() === "sco";
  const scoItems = items.filter((it) => {
    const r = byId.get(String(it["@_identifierref"] ?? ""));
    return r && isSco(r) && r["@_href"];
  });
  const first = scoItems[0] ?? items.find((it) => byId.get(String(it["@_identifierref"] ?? ""))?.["@_href"]);
  let launch: string | null = null;
  if (first) {
    const r = byId.get(String(first["@_identifierref"]))!;
    const base = String(r["@_base"] ?? "");
    launch = base + String(r["@_href"]) + String(first["@_parameters"] ?? "");
  } else {
    const r = resources.find((x) => x["@_href"]);
    if (r) launch = String(r["@_base"] ?? "") + String(r["@_href"]);
  }
  const resourceFiles = resources.flatMap((r) => asArray(r.file as Record<string, unknown> | Record<string, unknown>[]).map((f) => String(r["@_base"] ?? "") + String(f["@_href"] ?? "")).filter(Boolean));
  return {
    format,
    title: textOf(org?.title) || textOf(((m.metadata as Record<string, unknown> | undefined)?.lom as Record<string, unknown> | undefined)?.title) || "",
    launch,
    scoCount: scoItems.length,
    resourceFiles,
    sequencing: /<(\w+:)?sequencing[\s/>]/i.test(xml),
  };
}

/** Pass 1: inspect every entry without writing anything. */
export async function analyzeZip(file: string, limits = LIMITS): Promise<AnalysisReport> {
  const items: ReportItem[] = [];
  const add = (severity: ReportItem["severity"], code: string, message: string) => items.push({ severity, code, message });
  const entries: ScannedEntry[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];
  const hosts = new Set<string>();
  const texts = new Map<string, string>();
  let total = 0;
  let scanned = 0;
  let fatal = false;

  try {
    await forEachEntry(file, async (zip, entry) => {
      const name = entry.fileName;
      if (/\/$/.test(name)) return; // directory
      if (entries.length + skipped.length >= limits.maxEntries) {
        fatal = true;
        throw new Error("too_many_entries");
      }
      if (/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(name)) return;
      if (name.includes("\0") || /^[a-zA-Z]:/.test(name) || name.startsWith("/") || name.split("/").includes("..")) {
        fatal = true;
        add("error", "ZIP_SLIP", `נתיב קובץ לא חוקי בחבילה: ${name.slice(0, 120)}`);
        return;
      }
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (mode === 0o120000) {
        fatal = true;
        add("error", "SYMLINK", `החבילה מכילה קישור סמלי (${name.slice(0, 120)}), ולכן היא נדחתה.`);
        return;
      }
      const lower = name.toLowerCase();
      if (seen.has(lower)) {
        fatal = true;
        add("error", "DUPLICATE", `שם קובץ כפול בחבילה: ${name.slice(0, 120)}`);
        return;
      }
      seen.add(lower);
      const size = entry.uncompressedSize;
      if (size > limits.maxEntryBytes) {
        fatal = true;
        add("error", "ENTRY_TOO_LARGE", `הקובץ ${name.slice(0, 120)} גדול מדי.`);
        return;
      }
      if (size > limits.ratioMinBytes && entry.compressedSize > 0 && size / entry.compressedSize > limits.maxRatio) {
        fatal = true;
        add("error", "ZIP_BOMB", "יחס הדחיסה בחבילה חריג (חשד ל-ZIP bomb), ולכן היא נדחתה.");
        return;
      }
      total += size;
      if (total > limits.maxTotalBytes) {
        fatal = true;
        throw new Error("too_large");
      }
      const ext = extOf(name);
      if (EXECUTABLE.has(ext)) {
        fatal = true;
        add("error", "EXECUTABLE", `החבילה מכילה קובץ הרצה (${name.slice(0, 120)}), ולכן היא נדחתה.`);
        return;
      }
      if (SERVER_SCRIPT.has(ext) || !CONTENT_TYPES[ext]) {
        skipped.push(name);
        return;
      }
      entries.push({ name, size, entry });
      const base = lower.split("/").pop()!;
      const isKey = ["imsmanifest.xml", "index.html", "index_lms.html", "story.html", "story_html5.html"].includes(base);
      if (isKey || (TEXT_SCAN.has(ext) && scanned < 50 * 1024 ** 2)) {
        const t = await readText(zip, entry, limits.maxScanBytes);
        if (isKey) texts.set(name, t);
        if (!TEXT_SCAN.has(ext)) return;
        scanned += t.length;
        for (const m of t.matchAll(/(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?=[/"'`:?\s)])/gi)) {
          const h = m[1]!.toLowerCase();
          if (!NAMESPACE_HOSTS.test(h)) hosts.add(h);
        }
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fatal = true;
    if (msg === "too_many_entries") add("error", "TOO_MANY_FILES", `החבילה מכילה יותר מ-${limits.maxEntries} קבצים.`);
    else if (msg === "too_large") add("error", "TOO_LARGE", "הגודל הכולל של החבילה אחרי פריסה חורג מהמותר (2GB).");
    else if (/invalid relative path|absolute path|invalid characters/i.test(msg)) add("error", "ZIP_SLIP", "החבילה מכילה נתיבי קבצים לא חוקיים, ולכן היא נדחתה.");
    else if (/bytes|size/i.test(msg)) add("error", "ZIP_BOMB", "גודל הקבצים בחבילה אינו תואם להצהרה שלה, ולכן היא נדחתה.");
    else add("error", "BAD_ZIP", "הקובץ אינו קובץ ZIP תקין.");
  }

  const report: AnalysisReport = {
    verdict: "unsupported",
    format: null,
    title: "",
    launchPath: null,
    rootPrefix: "",
    fileCount: entries.length,
    totalBytes: total,
    scoCount: 0,
    externalHosts: [...hosts].slice(0, 20),
    skipped: skipped.slice(0, 50),
    tracking: "",
    items,
  };
  if (fatal) return report;

  // Locate the root: imsmanifest.xml (SCORM) or an HTML launch page, possibly inside one top folder.
  const names = entries.map((e) => e.name);
  const find = (file: string) => names.filter((n) => n.toLowerCase() === file || n.toLowerCase().endsWith(`/${file}`)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  const manifestPath = find("imsmanifest.xml");
  let launchCandidate: string | undefined;
  if (manifestPath) {
    report.rootPrefix = manifestPath.slice(0, manifestPath.length - "imsmanifest.xml".length);
    let mf: Manifest;
    try {
      mf = parseManifest(texts.get(manifestPath) ?? "");
    } catch {
      add("error", "BAD_MANIFEST", "קובץ imsmanifest.xml אינו תקין.");
      return report;
    }
    report.format = mf.format;
    report.title = mf.title;
    report.scoCount = mf.scoCount;
    if (!mf.launch) {
      add("error", "NO_LAUNCH", "בקובץ imsmanifest.xml לא נמצא קובץ פתיחה ללומדה.");
      return report;
    }
    launchCandidate = report.rootPrefix + mf.launch.split(/[?#]/)[0];
    report.launchPath = report.rootPrefix + mf.launch;
    const missing = mf.resourceFiles.filter((f) => !names.includes(report.rootPrefix + f));
    if (missing.length) add("warning", "MISSING_FILES", `${missing.length} קבצים שמופיעים ב-imsmanifest.xml חסרים בחבילה.`);
    if (mf.scoCount > 1) add("warning", "MULTI_SCO", `החבילה מכילה ${mf.scoCount} יחידות (SCO). בשלב זה תופעל הראשונה בלבד.`);
    if (mf.format === "scorm2004" && mf.sequencing) add("warning", "SEQUENCING", "חוקי רצף (Sequencing) של SCORM 2004 אינם נתמכים. הניווט יהיה לפי הלומדה עצמה.");
    report.tracking = "התקדמות, השלמה וציון מדווחים על ידי הלומדה דרך SCORM.";
    add("info", "FORMAT", mf.format === "scorm12" ? "זוהתה חבילת SCORM 1.2." : "זוהתה חבילת SCORM 2004.");
  } else {
    launchCandidate = find("index.html") ?? find("index_lms.html") ?? find("story.html") ?? find("story_html5.html");
    if (!launchCandidate) {
      add("error", "NO_LAUNCH", "לא נמצא imsmanifest.xml או index.html. זו כנראה אינה לומדה מסוג SCORM או HTML5.");
      return report;
    }
    report.format = "html5";
    report.rootPrefix = launchCandidate.includes("/") ? launchCandidate.slice(0, launchCandidate.lastIndexOf("/") + 1) : "";
    report.launchPath = launchCandidate;
    report.title = (texts.get(launchCandidate)?.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1] ?? "").trim();
    report.tracking = "ללומדת HTML5 אין דיווח אוטומטי. הלומד יסמן ״סיימתי״ בסוף.";
    add("info", "FORMAT", "זוהתה לומדת HTML5.");
  }

  if (!names.includes(launchCandidate)) {
    add("error", "LAUNCH_MISSING", `קובץ הפתיחה ${launchCandidate} חסר בחבילה.`);
    return report;
  }
  if (skipped.length) add("warning", "SKIPPED", `${skipped.length} קבצים מסוג שאינו נתמך לא ייובאו (למשל ${skipped[0]}).`);
  if (names.some((n) => extOf(n) === "swf")) add("warning", "FLASH", "החבילה מכילה תוכן Flash, שאינו פועל בדפדפנים מודרניים.");
  if (report.externalHosts.length) add("warning", "EXTERNAL", `הלומדה טוענת קבצים מאתרים חיצוניים (${report.externalHosts.slice(0, 3).join(", ")}). ייתכן שחלקים לא יעבדו ללא חיבור אליהם.`);

  report.verdict = items.some((i) => i.severity === "warning") ? "partial" : "play_only";
  return report;
}

/** Pass 2: stream every accepted entry to `write`, with paths relative to the package root. */
export async function extractZip(
  file: string,
  report: AnalysisReport,
  write: (relPath: string, stream: Readable, size: number, contentType: string) => Promise<void>,
): Promise<{ files: number; bytes: number }> {
  if (report.verdict === "unsupported") throw new Error("refusing to extract an unsupported package");
  const skipped = new Set(report.skipped);
  let files = 0;
  let bytes = 0;
  await forEachEntry(file, async (zip, entry) => {
    const name = entry.fileName;
    if (/\/$/.test(name) || /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(name) || skipped.has(name)) return;
    if (!CONTENT_TYPES[extOf(name)]) return;
    if (!name.startsWith(report.rootPrefix)) return; // files outside the package root are not served
    const rel = name.slice(report.rootPrefix.length);
    const s = await readStream(zip, entry);
    await write(rel, s, entry.uncompressedSize, contentTypeOf(name));
    files++;
    bytes += entry.uncompressedSize;
  });
  return { files, bytes };
}
