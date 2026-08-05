import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const skillName = "qiuzhao-toudi-assistant";
const projectRoot = resolve(import.meta.dirname, "..");
const skillRoot = resolve(projectRoot, "skills", skillName);
const required = [
  "SKILL.md",
  "agents/openai.yaml",
  "scripts/prepare-extension.ps1"
];

const contents = new Map();
for (const relativePath of required) {
  contents.set(relativePath, await readFile(resolve(skillRoot, relativePath), "utf8"));
}

const skill = contents.get("SKILL.md");
const metadata = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!metadata) throw new Error("SKILL.md is missing YAML frontmatter.");
const keys = [...metadata[1].matchAll(/^([a-z_]+):/gm)].map((match) => match[1]);
if (keys.join(",") !== "name,description") {
  throw new Error(`SKILL.md frontmatter must contain only name and description; found ${keys.join(", ")}.`);
}
if (!metadata[1].includes(`name: ${skillName}`)) throw new Error("Skill name does not match its directory.");
if (/\bTODO\b|\[TODO/i.test(skill)) throw new Error("SKILL.md still contains placeholder text.");
if (skill.split(/\r?\n/).length > 500) throw new Error("SKILL.md exceeds the 500-line guidance.");

const openaiYaml = contents.get("agents/openai.yaml");
for (const requiredText of ["display_name:", "short_description:", "default_prompt:", `$${skillName}`]) {
  if (!openaiYaml.includes(requiredText)) throw new Error(`agents/openai.yaml is missing ${requiredText}.`);
}

const combined = [...contents.values()].join("\n");
for (const safetyText of ["activeTab", "最终提交", "CAPTCHA", "Cookie", "npm run validate"]) {
  if (!combined.includes(safetyText)) throw new Error(`Skill safety/workflow contract is missing ${safetyText}.`);
}
for (const privatePattern of [/C:\\Users\\[^\\\r\n]+/i, /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i]) {
  if (privatePattern.test(combined)) throw new Error(`Skill contains forbidden private pattern ${privatePattern}.`);
}

console.log(`Verified ${skillName}: ${required.length} required files and guarded workflow metadata.`);
