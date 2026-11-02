import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeZip, extractZip, parseManifest, LIMITS } from "./analyze";

const dir = mkdtempSync(path.join(tmpdir(), "mozes-zip-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Builds a zip with Python's zipfile (which, unlike most writers, allows hostile names). */
function zip(name: string, files: Record<string, string | { size: number }>, opts: { symlink?: string } = {}): string {
  const out = path.join(dir, name);
  const script = `
import json, sys, zipfile
spec = json.loads(sys.argv[2])
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for n, v in spec["files"].items():
        data = ("\\0" * v["size"]) if isinstance(v, dict) else v
        z.writestr(n, data)
    if spec.get("symlink"):
        info = zipfile.ZipInfo(spec["symlink"])
        info.external_attr = (0o120777 << 16)
        z.writestr(info, "/etc/passwd")
`;
  execFileSync(process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3"), ["-c", script, out, JSON.stringify({ files, symlink: opts.symlink })]);
  return out;
}

const MANIFEST_12 = `<?xml version="1.0"?>
<manifest identifier="m" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org"><organization identifier="org"><title>קורס מיובא</title>
    <item identifier="i1" identifierref="r1"><title>שיעור</title></item>
  </organization></organizations>
  <resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/><file href="app.js"/></resource></resources>
</manifest>`;

describe("parseManifest", () => {
  it("reads SCORM 1.2 title, launch and SCO count", () => {
    expect(parseManifest(MANIFEST_12)).toMatchObject({ format: "scorm12", title: "קורס מיובא", launch: "index.html", scoCount: 1 });
  });
  it("detects SCORM 2004 and sequencing", () => {
    const m = parseManifest(MANIFEST_12.replace("<schemaversion>1.2</schemaversion>", "<schemaversion>2004 4th Edition</schemaversion>").replace("</organization>", "<imsss:sequencing/></organization>"));
    expect(m.format).toBe("scorm2004");
    expect(m.sequencing).toBe(true);
  });
});

describe("analyzeZip", () => {
  it("extracts a package over the Free subrequest limit in ordered batches without gaps or duplicate files", async () => {
    const entries = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [i === 0 ? "index.html" : `asset-${i}.js`, `content-${i}`]));
    const file = zip("batched.zip", entries);
    const report = await analyzeZip(file);
    const written: string[] = [];
    let offset = 0;
    let bytes = 0;
    for (let batch = 0; batch < 3; batch++) {
      const result = await extractZip(file, report, async (name, stream) => {
        let body = "";
        for await (const chunk of stream) body += chunk.toString();
        expect(body).toBe(entries[name]);
        written.push(name);
      }, { offset, limit: 32 });
      expect(result.files).toBe(batch < 2 ? 32 : 6);
      offset += result.files;
      bytes += result.bytes;
    }
    expect(written).toEqual(Object.keys(entries));
    expect(bytes).toBe(Object.values(entries).reduce((n, body) => n + Buffer.byteLength(body), 0));
  });
  it("accepts a clean SCORM 1.2 package, including inside a top folder", async () => {
    const r = await analyzeZip(zip("ok.zip", { "course/imsmanifest.xml": MANIFEST_12, "course/index.html": "<title>x</title>", "course/app.js": "1" }));
    expect(r).toMatchObject({ verdict: "play_only", format: "scorm12", rootPrefix: "course/", launchPath: "course/index.html", title: "קורס מיובא" });
  });

  it("accepts HTML5 and reports external dependencies as a partial match", async () => {
    const r = await analyzeZip(zip("h5.zip", { "index.html": '<title>לומדה</title><script src="https://cdn.example.com/lib.js"></script>', "a.css": "" }));
    expect(r).toMatchObject({ verdict: "partial", format: "html5", title: "לומדה" });
    expect(r.externalHosts).toContain("cdn.example.com");
  });

  it("rejects ZIP Slip paths", async () => {
    const r = await analyzeZip(zip("slip.zip", { "index.html": "x", "../../evil.html": "x" }));
    expect(r.verdict).toBe("unsupported");
    expect(r.items.map((i) => i.code)).toContain("ZIP_SLIP");
  });

  it("rejects symbolic links", async () => {
    const r = await analyzeZip(zip("link.zip", { "index.html": "x" }, { symlink: "passwd" }));
    expect(r.items.map((i) => i.code)).toContain("SYMLINK");
  });

  it("rejects executables and skips server scripts", async () => {
    expect((await analyzeZip(zip("exe.zip", { "index.html": "x", "setup.exe": "MZ" }))).items.map((i) => i.code)).toContain("EXECUTABLE");
    const r = await analyzeZip(zip("php.zip", { "index.html": "x", "api.php": "<?php ?>" }));
    expect(r.verdict).toBe("partial");
    expect(r.skipped).toContain("api.php");
  });

  it("rejects ZIP bombs by compression ratio", async () => {
    const r = await analyzeZip(zip("bomb.zip", { "index.html": "x", "big.txt": { size: 30 * 1024 * 1024 } }));
    expect(r.items.map((i) => i.code)).toContain("ZIP_BOMB");
  });

  it("rejects archives without a launch file and non-zip data", async () => {
    expect((await analyzeZip(zip("none.zip", { "readme.txt": "hi" }))).items.map((i) => i.code)).toContain("NO_LAUNCH");
    const notZip = path.join(dir, "not.zip");
    execFileSync(process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3"), ["-c", "open(__import__('sys').argv[1],'w').write('hello')", notZip]);
    expect((await analyzeZip(notZip)).items.map((i) => i.code)).toContain("BAD_ZIP");
  });

  it("extracts only accepted files relative to the package root", async () => {
    const file = zip("ex.zip", { "course/imsmanifest.xml": MANIFEST_12, "course/index.html": "<p>hi</p>", "course/app.js": "1", "course/run.php": "x" });
    const r = await analyzeZip(file);
    const written: string[] = [];
    await extractZip(file, r, async (rel, stream) => {
      written.push(rel);
      stream.resume();
    });
    expect(written.sort()).toEqual(["app.js", "imsmanifest.xml", "index.html"]);
  });
  it("enforces Worker entry and expanded-byte budgets before extraction", async () => {
    const file = zip("worker-limits.zip", { "index.html": "0123456789", "asset.js": "x" });
    expect((await analyzeZip(file, { ...LIMITS, maxEntries: 1 })).items.map(i => i.code)).toContain("TOO_MANY_FILES");
    expect((await analyzeZip(file, { ...LIMITS, maxTotalBytes: 5 })).items.map(i => i.code)).toContain("TOO_LARGE");
  });

});
