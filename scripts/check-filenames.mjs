// Enforces kebab-case file and folder names in source directories, so a build that
// passes on a case-insensitive Mac can't fail on a case-sensitive Linux CI.
// Next.js route segments like [code] and reserved files (page.tsx, layout.tsx) are allowed.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_DIRS = [
  "packages/game-core/src",
  "packages/game-core/test",
  "apps/room-server/src",
  "apps/room-server/test",
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "scripts",
];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)*$/;
const ROUTE_SEGMENT = /^\[[a-z][a-zA-Z0-9]*\]$/;

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const isDir = statSync(full).isDirectory();
    if (!(KEBAB.test(name) || (isDir && ROUTE_SEGMENT.test(name)))) {
      problems.push(relative(ROOT, full));
    }
    if (isDir) walk(full);
  }
}
for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));

if (problems.length > 0) {
  console.error("Non-kebab-case paths:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Filename check passed (${SOURCE_DIRS.length} source dirs).`);
