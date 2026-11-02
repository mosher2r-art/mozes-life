import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("scorm-again")).replace(/[\\/](?:esm|cjs)$/, "");
const out = new URL("../src/server/import/generated/", import.meta.url);
await mkdir(out, { recursive: true });
const scripts: Record<string, string> = {};
for (const name of ["scorm12.min.js", "scorm2004.min.js"]) {
  scripts[name] = await readFile(path.join(dist, name), "utf8");
}
await writeFile(new URL("scorm.ts", out), `// Generated from the pinned scorm-again package. Do not edit.\nexport const scripts: Record<string, string> = ${JSON.stringify(scripts)};\n`);
