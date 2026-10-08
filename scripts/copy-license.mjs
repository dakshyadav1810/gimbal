// One canonical LICENSE at the repo root, copied into every published package.
// `node scripts/copy-license.mjs --check` fails if any copy differs (used in CI).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonical = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
const check = process.argv.includes("--check");
let bad = 0;
for (const pkg of ["shared", "core", "cli"]) {
  const file = path.join(root, "packages", pkg, "LICENSE");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (current === canonical) continue;
  if (check) {
    console.error(`packages/${pkg}/LICENSE differs from the root LICENSE`);
    bad++;
  } else {
    fs.writeFileSync(file, canonical);
    console.log(`updated packages/${pkg}/LICENSE`);
  }
}
process.exit(bad ? 1 : 0);
