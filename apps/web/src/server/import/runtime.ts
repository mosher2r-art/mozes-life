import { scripts } from "./generated/scorm";
import type { PackageFormat } from "./analyze";

/**
 * The launch page that sits next to every imported package (same origin as the courseware,
 * a different origin from the app). It hosts the SCORM API (scorm-again), records every value
 * the courseware sets, and forwards them to the app with postMessage — only to the app origin
 * named in the URL, and it only accepts its start-up data from that same origin.
 */
export function launchPage(format: PackageFormat, launchRel: string): string {
  const cfg = JSON.stringify({ format, launch: `../${launchRel}` });
  const lib = format === "scorm12" ? '<script src="scorm12.min.js"></script>' : format === "scorm2004" ? '<script src="scorm2004.min.js"></script>' : "";
  return `<!doctype html>
<html lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOZES LIFE</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style>
${lib}
</head><body><iframe id="sco" title="לומדה" allow="fullscreen; autoplay"></iframe>
<script>
(function () {
  var CFG = ${cfg};
  var parentOrigin = new URLSearchParams(location.search).get("parent") || "";
  if (!/^https?:\\/\\/[^/]+$/.test(parentOrigin)) return;
  var api = null, data = {}, timer = null;
  function send(type, payload) { parent.postMessage({ source: "mozes-runtime", type: type, data: payload }, parentOrigin); }
  function flush() { clearTimeout(timer); send("commit", data); }
  function record(el, value) { if (typeof el === "string" && el.indexOf("cmi.") === 0) { data[el] = String(value); clearTimeout(timer); timer = setTimeout(flush, 800); } }
  window.addEventListener("message", function (e) {
    if (e.origin !== parentOrigin || !e.data || e.data.source !== "mozes-app" || e.data.type !== "init" || api) return;
    var saved = e.data.cmi || {}, learner = e.data.learner || {};
    var settings = { autocommit: false, lmsCommitUrl: false, logLevel: 5 };
    if (CFG.format === "scorm12" && window.Scorm12API) {
      api = new window.Scorm12API(settings);
      var seed12 = Object.assign({}, saved, { "cmi.core.student_id": learner.id || "", "cmi.core.student_name": learner.name || "" });
      if (saved["cmi.core.exit"] === "suspend") seed12["cmi.core.entry"] = "resume";
      try { api.loadFromFlattenedJSON(seed12, ""); } catch (x) {}
      api.on("LMSSetValue", record);
      api.on("LMSCommit", flush);
      api.on("LMSFinish", flush);
      window.API = api;
    } else if (CFG.format === "scorm2004" && window.Scorm2004API) {
      api = new window.Scorm2004API(settings);
      var seed = Object.assign({}, saved, { "cmi.learner_id": learner.id || "", "cmi.learner_name": learner.name || "" });
      if (saved["cmi.exit"] === "suspend") seed["cmi.entry"] = "resume";
      try { api.loadFromFlattenedJSON(seed, ""); } catch (x) {}
      api.on("SetValue", record);
      api.on("Commit", flush);
      api.on("Terminate", flush);
      window.API_1484_11 = api;
    } else {
      api = {};
    }
    data = Object.assign({}, saved);
    document.getElementById("sco").src = CFG.launch;
  });
  window.addEventListener("pagehide", function () { if (api) flush(); });
  send("ready", { format: CFG.format });
})();
</script></body></html>`;
}

/** The scorm-again runtime file to place next to the launch page. */
export async function runtimeScript(format: PackageFormat): Promise<{ name: string; body: Buffer } | null> {
  if (format === "html5") return null;
  const name = format === "scorm12" ? "scorm12.min.js" : "scorm2004.min.js";
  return { name, body: Buffer.from(scripts[name]!, "utf8") };
}
