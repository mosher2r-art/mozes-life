import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { normalizeLottie } from "./lottie-policy";
const animation = (extra = {}) => Buffer.from(JSON.stringify({ v: "5.13.0", w: 300, h: 200, fr: 30, ip: 0, op: 60, layers: [], ...extra }));
const zip=(entries:[string,Buffer][])=>execFileSync(process.env.PYTHON ?? (process.platform==="win32" ? "python" : "python3"),["-c","import sys,json,io,zipfile,base64\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:\n for name,data in json.load(sys.stdin): z.writestr(name,base64.b64decode(data))\nsys.stdout.buffer.write(b.getvalue())"],{input:JSON.stringify(entries.map(([name,bytes])=>[name,bytes.toString("base64")])),maxBuffer:4*1024**2});
describe("private animation ingestion", () => {
  it("returns a self-contained animation with measured metadata", async () => {
    const result = await normalizeLottie(animation(), "demo.json");
    expect(result).toMatchObject({ width: 300, height: 200, durationMs: 2000 });
    expect(JSON.parse(result.bytes.toString()).v).toBe("5.13.0");
  });
  it("rejects JavaScript expressions, including nested compositions", async () => {
    await expect(normalizeLottie(animation({ assets: [{ layers: [{ ks: { p: { x: "fetch('https://example.com')" } } }] }] }), "demo.json")).rejects.toThrow("JavaScript");
  });
  it("rejects external and SVG image assets", async () => {
    for (const p of ["https://example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4="]) await expect(normalizeLottie(animation({ assets: [{ p, u: "" }] }), "demo.json")).rejects.toThrow();
  });
  it("rejects invalid image bytes even when the MIME says PNG", async () => {
    await expect(normalizeLottie(animation({ assets: [{ p: "data:image/png;base64,YWJj", u: "" }] }), "demo.json")).rejects.toThrow();
  });
  it("rejects arbitrary JSON, excessive duration and external fonts", async () => {
    for (const bytes of [Buffer.from('{"name":"not Lottie"}'), animation({ op: 30 * 601 }), animation({ fonts: { list: [] } })]) await expect(normalizeLottie(bytes, "demo.json")).rejects.toThrow();
  });
  it("rejects malformed dotLottie archives", async () => {
    await expect(normalizeLottie(Buffer.from("PK invalid"), "demo.lottie")).rejects.toThrow();
  });
  it("normalizes a declared dotLottie animation to JSON without extracting any files",async()=>{
    const bytes=zip([["manifest.json",Buffer.from('{"animations":[{"id":"demo"}]}')],["animations/demo.json",animation()]]);
    expect(await normalizeLottie(bytes,"demo.lottie")).toMatchObject({width:300,height:200,durationMs:2000});
  });
  it("rejects archive traversal, duplicate entries and undeclared multiple animations",async()=>{
    const manifest: [string,Buffer]=["manifest.json",Buffer.from('{"animations":[{"id":"demo"}]}')],file:[string,Buffer]=["animations/demo.json",animation()];
    for(const entries of [[manifest,file,["../escape.json",Buffer.from("bad")]], [manifest,file,file], [["manifest.json",Buffer.from('{"animations":[{"id":"a"},{"id":"b"}]}')],file]] as [string,Buffer][][])await expect(normalizeLottie(zip(entries),"bad.lottie")).rejects.toThrow();
  });
});
