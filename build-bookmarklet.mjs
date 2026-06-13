import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "standup-companion.js");
const outputPath = join(here, "standup-companion.bookmarklet.js");

const source = readFileSync(sourcePath, "utf8").trim();
const payload = `javascript:${encodeURIComponent(source)}`;

writeFileSync(outputPath, `${payload}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
