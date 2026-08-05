import { access, cp, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const skillName = "qiuzhao-toudi-assistant";
const projectRoot = resolve(import.meta.dirname, "..");
const source = resolve(projectRoot, "skills", skillName);

const args = process.argv.slice(2);
let destinationRoot;
let force = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--force") {
    force = true;
  } else if (argument === "--destination") {
    const value = args[index + 1];
    if (!value) throw new Error("--destination requires a directory.");
    destinationRoot = resolve(value);
    index += 1;
  } else if (argument === "--help") {
    console.log("Usage: node scripts/install-skill.mjs [--destination <skills-dir>] [--force]");
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

await access(resolve(source, "SKILL.md"));
const codexRoot = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : resolve(homedir(), ".codex");
destinationRoot ??= resolve(codexRoot, "skills");
const target = resolve(destinationRoot, skillName);

if (dirname(target) !== destinationRoot || target === source) {
  throw new Error("Refusing to install outside the selected skills directory or over the source Skill.");
}

let targetExists = false;
try {
  await access(target);
  targetExists = true;
} catch {
  targetExists = false;
}

if (targetExists && !force) {
  throw new Error(`Skill already exists at ${target}. Re-run with --force only after reviewing that directory.`);
}

await mkdir(destinationRoot, { recursive: true });
if (targetExists) await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true, errorOnExist: true });
console.log(`Installed ${skillName} at ${target}`);
console.log("Restart Codex, then invoke $qiuzhao-toudi-assistant.");
