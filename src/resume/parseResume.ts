import {
  createAwardRecord,
  createEducationRecord,
  createEmptyProfile,
  createLanguageRecord,
  createProjectRecord,
  createWorkExperienceRecord,
  createWorkSampleRecord,
  type CandidateProfile
} from "../domain/profile";

type SectionKey =
  | "header"
  | "education"
  | "work"
  | "projects"
  | "works"
  | "awards"
  | "languages"
  | "skills"
  | "activities"
  | "selfIntroduction"
  | "selfEvaluation"
  | "careerPlan";

interface DateRange {
  raw: string;
  start: string;
  end: string;
}

interface RecordCandidate {
  startIndex: number;
  endIndex: number;
  text: string;
  range: DateRange;
}

export interface ParsedResume {
  profile: CandidateProfile;
  populatedPaths: string[];
  warnings: string[];
}

export interface ResumeMergeResult {
  profile: CandidateProfile;
  importedFieldCount: number;
  preservedFieldCount: number;
  addedRecordCount: number;
  importedPaths: string[];
  preservedPaths: string[];
}

const SECTION_BREAK = "\u001e";
const SECTION_ALIASES: Array<[SectionKey, string[]]> = [
  ["education", ["教育经历", "教育背景", "教育程度", "Education Background", "Educational Background"]],
  ["work", ["研究与实习经历", "研究及实习经历", "科研与实习经历", "实习与工作经历", "工作与实习经历", "实习经历", "工作经历", "实践经历", "职业经历", "工作经验", "实习经验", "Work Experience", "Internship Experience"]],
  ["projects", ["论文与科研成果", "科研与项目经历", "科研项目经历", "科研经历", "科研项目", "研究经历", "研究项目", "项目经历", "项目经验", "科研成果", "Project Experience", "Research Experience", "Projects"]],
  ["works", ["个人作品", "作品集", "作品", "Portfolio", "Work Samples"]],
  ["awards", ["竞赛经历", "比赛经历", "竞赛获奖", "获奖经历", "奖项证书", "奖项荣誉", "荣誉奖项", "荣誉与奖励", "Awards and Honors", "Awards"]],
  ["languages", ["语言能力", "外语能力", "语言技能", "Languages", "Language"]],
  ["skills", ["专业技能", "技能特长", "个人优势", "核心技能", "Skills"]],
  ["activities", ["校园经历", "校内活动", "学生活动", "社团经历", "社会实践", "志愿服务", "Campus Activities", "Activities"]],
  ["selfIntroduction", ["个人简介", "自我介绍", "Profile", "Summary"]],
  ["selfEvaluation", ["自我评价", "个人评价", "Self Evaluation"]],
  ["careerPlan", ["职业规划", "发展规划", "Career Plan"]]
];

const DEGREE_VALUES = ["博士", "MBA", "硕士", "本科", "学士", "大专", "专科", "高中", "PhD", "Master", "Bachelor"];
const EDUCATION_TYPE_VALUES = ["海外及港澳台", "统招全日制", "统招非全日制", "自考", "全日制", "非全日制"];
const LANGUAGE_VALUES = [
  "英语", "法语", "日语", "韩语", "德语", "俄语", "西班牙语", "葡萄牙语", "阿拉伯语", "普通话", "粤语",
  "English", "French", "Japanese", "Korean", "German", "Russian", "Spanish", "Portuguese", "Mandarin", "Cantonese"
];
const PROFICIENCY_VALUES = ["入门", "日常会话", "商务会话", "无障碍沟通", "母语"];

function cleanLine(line: string): string {
  const normalized = line.normalize("NFKC");
  const bullet = /^\s*(?:[•●▪◦·■□]|[-–—](?=\s))\s*/.test(normalized);
  const cleaned = normalized
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/^\s*(?:[•●▪◦·■□]|[-–—](?=\s))\s*/, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return bullet && cleaned ? `• ${cleaned}` : cleaned;
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
}

function phrasePattern(phrase: string): RegExp {
  const parts = [...phrase].map((character) => {
    if (/\s/.test(character)) return "\\s+";
    return `${escapeRegExp(character)}${/\p{Script=Han}/u.test(character) ? "\\s*" : ""}`;
  });
  return new RegExp(parts.join(""), "giu");
}

interface SectionMatch {
  key: SectionKey;
  start: number;
  end: number;
}

function sectionMatches(line: string): SectionMatch[] {
  const matches: SectionMatch[] = [];
  for (const [key, aliases] of SECTION_ALIASES) {
    for (const alias of aliases) {
      const pattern = phrasePattern(alias);
      for (const match of line.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const prefix = line.slice(0, match.index)
          .replace(/[一二三四五六七八九十]/g, "")
          .replace(/[^\p{L}\p{N}]/gu, "");
        const urlAtMatch = /https?:\/\/\S*$/i.test(line.slice(0, match.index));
        if (prefix || urlAtMatch) continue;
        matches.push({ key, start: match.index, end: match.index + match[0].length });
      }
    }
  }
  matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  const nonOverlapping: SectionMatch[] = [];
  for (const match of matches) {
    if (nonOverlapping.some((kept) => match.start < kept.end && match.end > kept.start)) continue;
    nonOverlapping.push(match);
  }
  return nonOverlapping.sort((left, right) => left.start - right.start);
}

function sectionForHeading(line: string): SectionKey | null {
  const matches = sectionMatches(line);
  if (matches.length !== 1) return null;
  const match = matches[0];
  const remainder = `${line.slice(0, match.start)}${line.slice(match.end)}`.replace(/[：:|｜·•—_\-\s]/g, "");
  return remainder.length <= 12 ? match.key : null;
}

function partitionSections(lines: string[]): Record<SectionKey, string[]> {
  const sections: Record<SectionKey, string[]> = {
    header: [], education: [], work: [], projects: [], works: [], awards: [], languages: [], skills: [], activities: [],
    selfIntroduction: [], selfEvaluation: [], careerPlan: []
  };
  let current: SectionKey = "header";
  for (const line of lines) {
    const matches = sectionMatches(line);
    if (matches.length === 0) {
      sections[current].push(line);
      continue;
    }
    let cursor = 0;
    for (const match of matches) {
      const before = cleanLine(line.slice(cursor, match.start));
      if (before) sections[current].push(before);
      if (sections[match.key].length > 0 && sections[match.key].at(-1) !== SECTION_BREAK) {
        sections[match.key].push(SECTION_BREAK);
      }
      current = match.key;
      cursor = match.end;
    }
    const after = cleanLine(line.slice(cursor));
    if (after) sections[current].push(after);
  }
  return sections;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelledValue(lines: string[], labels: string[]): string {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const pattern = new RegExp(`^(?:${labelPattern})\\s*[：:]\\s*(.+)$`, "i");
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function labelledValueAnywhere(lines: string[], labels: string[]): string {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const pattern = new RegExp(`(?:${labelPattern})\\s*[：:]\\s*(.+)$`, "i");
  for (const line of lines) {
    const match = pattern.exec(stripBullet(line));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function normalizePhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  return compact.startsWith("+86") ? compact : compact.replace(/^86(?=1[3-9]\d{9}$)/, "+86");
}

function normalizeMonth(year: string, month: string): string {
  const numericMonth = Number(month);
  if (numericMonth < 1 || numericMonth > 12) return "";
  return `${year}-${String(numericMonth).padStart(2, "0")}`;
}

function findDateRange(value: string): DateRange | null {
  const match = /((?:19|20)\d{2})\s*(?:[./-]\s*|年\s*)(\d{1,2})\s*(?:月)?\s*(?:[-–—~～至到]+)\s*(?:((?:19|20)\d{2})\s*(?:[./-]\s*|年\s*)(\d{1,2})\s*(?:月)?|至今|现在|present|current)/i.exec(value);
  if (!match) return null;
  const start = normalizeMonth(match[1], match[2]);
  const end = match[3] && match[4] ? normalizeMonth(match[3], match[4]) : "";
  return start ? { raw: match[0], start, end } : null;
}

function findMonth(value: string): string {
  const match = /((?:19|20)\d{2})\s*(?:[./-]\s*|年\s*)(\d{1,2})\s*(?:月)?/.exec(value);
  return match ? normalizeMonth(match[1], match[2]) : "";
}

function findFullDate(value: string): string {
  const match = /((?:19|20)\d{2})\s*(?:[./-]\s*|年\s*)(\d{1,2})\s*(?:[./-]\s*|月\s*)(\d{1,2})\s*(?:日)?/.exec(value);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractSchool(value: string): string {
  const compactChinese = value.replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "");
  const chinese = /([\p{Script=Han}·]{2,}?(?:大学|学院|学校|中学))/u.exec(compactChinese)?.[1];
  if (chinese) return chinese;
  return /([A-Za-z][A-Za-z .&'-]{2,}?(?:University|College|Institute|School))/i.exec(value)?.[1]?.trim() ?? "";
}

function extractCompany(value: string): string {
  const chinese = /([\p{Script=Han}A-Za-z0-9·&（）() -]{2,}?(?:股份有限公司|有限责任公司|有限公司|研究院|实验室|事务所|银行|集团|公司))/u.exec(value)?.[1];
  if (chinese) return chinese.trim();
  return /([A-Za-z][A-Za-z0-9 .&'-]{1,}?(?:Technologies|Technology|Corporation|Company|Inc\.?|Ltd\.?))/i.exec(value)?.[1]?.trim() ?? "";
}

function withoutKnownParts(value: string, parts: string[]): string {
  let result = value;
  for (const part of parts.filter(Boolean)) result = result.replace(part, " ");
  return result
    .replace(/(?:学校名称|院校名称|公司名称|职位名称|岗位名称|专业|学历|学历类型|项目名称|项目角色)\s*[：:]?/g, " ")
    .replace(/\s*[|｜]\s*/g, "  ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function canonicalDegree(value: string): string {
  const found = rawDegree(value);
  if (!found) return "";
  const mapping: Record<string, string> = { 学士: "本科", PhD: "博士", Master: "硕士", Bachelor: "本科", 专科: "大专" };
  return mapping[found] ?? found;
}

function rawDegree(value: string): string {
  return DEGREE_VALUES.find((degree) => /[\p{Script=Han}]/u.test(degree)
    ? value.includes(degree)
    : new RegExp(`\\b${escapeRegExp(degree)}\\b`, "i").test(value)) ?? "";
}

function canonicalEducationType(value: string): string {
  const found = EDUCATION_TYPE_VALUES.find((type) => value.includes(type));
  if (found === "全日制") return "统招全日制";
  if (found === "非全日制") return "统招非全日制";
  return found ?? "";
}

function findCandidates(
  lines: string[],
  identity: (value: string) => string
): RecordCandidate[] {
  const candidates: RecordCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    let endIndex = index;
    let text = lines[index];
    let range = findDateRange(text);
    let identityValue = identity(text);

    if (!range || !identityValue) {
      for (let offset = 1; offset <= 2 && index + offset < lines.length; offset += 1) {
        const combined = `${text}  ${lines[index + offset]}`;
        const combinedRange = findDateRange(combined);
        const combinedIdentity = identity(combined);
        if (combinedRange && combinedIdentity) {
          text = combined;
          range = combinedRange;
          identityValue = combinedIdentity;
          endIndex = index + offset;
          break;
        }
      }
    }

    if (range && identityValue) {
      if (!candidates.some((candidate) => index <= candidate.endIndex)) {
        candidates.push({ startIndex: index, endIndex, text, range });
      }
      index = endIndex;
    }
  }
  return candidates;
}

function candidateDetails(lines: string[], candidates: RecordCandidate[], index: number): string[] {
  const current = candidates[index];
  const nextStart = candidates[index + 1]?.startIndex ?? lines.length;
  return lines.slice(current.endIndex + 1, nextStart);
}

function sectionBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let block: string[] = [];
  for (const line of lines) {
    if (line === SECTION_BREAK) {
      if (block.length > 0) blocks.push(block);
      block = [];
      continue;
    }
    block.push(line);
  }
  if (block.length > 0) blocks.push(block);
  return blocks;
}

function isBulletLine(line: string): boolean {
  return /^•\s*/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^•\s*/, "").trim();
}

function meaningfulLines(lines: string[]): string[] {
  return lines.filter((line) => line !== SECTION_BREAK).map(stripBullet).filter(Boolean);
}

function cleanEducationMajor(value: string): string {
  return value
    .replace(/[（(]\s*(?:在读|预计|推免|保研)\s*[）)]/g, " ")
    .replace(/(?:211|985|双一流|在读|预计|推免|保研)/g, " ")
    .replace(/^[,，、;；:：|｜·\s]+|[,，、;；:：|｜·\s]+$/g, "")
    .replace(/[（()]\s*[）)]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function educationMajor(
  candidate: RecordCandidate,
  details: string[],
  school: string,
  sourceDegree: string
): string {
  const evidence = [candidate.text, ...details];
  const labelled = labelledValueAnywhere(evidence, ["专业", "专业名称", "主修"]);
  if (labelled) {
    return cleanEducationMajor(withoutKnownParts(labelled, [candidate.range.raw, sourceDegree]));
  }

  const inline = cleanEducationMajor(withoutKnownParts(candidate.text, [
    candidate.range.raw,
    school,
    sourceDegree,
    ...EDUCATION_TYPE_VALUES.filter((value) => candidate.text.includes(value))
  ]));
  if (inline) return inline;

  const detail = details.find((line) => {
    const value = stripBullet(line).trim();
    if (!value || value.length > 60 || rawDegree(value) === value) return false;
    return !/(?:GPA|绩点|排名|研究方向|相关课程|核心课程|主修课程|荣誉|奖项|英语水平|语言能力)/i.test(value)
      && !findDateRange(value)
      && !extractSchool(value);
  });
  return detail ? cleanEducationMajor(withoutKnownParts(detail, [rawDegree(detail)])) : "";
}

function parseEducation(lines: string[]): CandidateProfile["education"] {
  const plainLines = lines.filter((line) => line !== SECTION_BREAK);
  const candidates = findCandidates(plainLines, extractSchool);
  const records = candidates.map((candidate, index) => {
    const record = createEducationRecord();
    const details = candidateDetails(plainLines, candidates, index);
    const degreeDetails = details.slice(0, 3).filter((line) =>
      /^(?:(?:学历|学位)\s*[：:]\s*)?(?:博士|MBA|硕士|本科|学士|大专|专科|高中|PhD|Master|Bachelor)(?:\s*(?:在读|研究生))?$/i.test(stripBullet(line))
    );
    const educationEvidence = `${candidate.text} ${degreeDetails.join(" ")}`;
    record.school = extractSchool(candidate.text);
    const sourceDegree = rawDegree(educationEvidence);
    record.degree = canonicalDegree(educationEvidence);
    record.educationType = canonicalEducationType(educationEvidence);
    record.startDate = candidate.range.start;
    record.endDate = candidate.range.end;
    record.major = educationMajor(candidate, details, record.school, sourceDegree);
    record.gpa = /(?:GPA|平均绩点|学业成绩)\s*[：:]?\s*([0-9.]+(?:\s*\/\s*[0-9.]+)?)/i.exec(details.join(" "))?.[1]?.replace(/\s/g, "")
      || labelledValue(details, ["GPA", "平均绩点", "学业成绩"])
      || "";
    record.ranking = labelledValue(details, ["专业排名", "绩点排名", "排名"])
      || /(?:专业排名|绩点排名|排名)\s*[：:]?\s*([^，,；;]+)/.exec(details.join(" "))?.[1]?.trim()
      || /[（(]\s*((?:前|Top)\s*\d+(?:\.\d+)?\s*%?)\s*[）)]/i.exec(details.join(" "))?.[1]?.replace(/\s+/g, " ")
      || "";
    return record;
  });

  const lastIndex = records.length - 1;
  if (lastIndex > 0 && /推免|保研/.test(candidates[lastIndex]?.text ?? "")) {
    let undergraduateIndex = -1;
    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      if (records[index].degree === "本科") {
        undergraduateIndex = index;
        break;
      }
    }
    if (undergraduateIndex >= 0) {
      for (const key of ["gpa", "ranking"] as const) {
        if (!records[undergraduateIndex][key] && records[lastIndex][key]) {
          records[undergraduateIndex][key] = records[lastIndex][key];
          records[lastIndex][key] = "";
        }
      }
    }
  }
  return records;
}

function parseWork(lines: string[]): CandidateProfile["workExperiences"] {
  const rolePattern = /(?:实习生|实习|研究助理|科研助理|助理研究员|研究员|工程师|分析师|设计师|产品经理|项目经理|顾问|负责人|经理|助理|Intern|Engineer|Researcher|Analyst|Designer|Manager|Consultant)/i;
  const records: CandidateProfile["workExperiences"] = [];

  for (const block of sectionBlocks(lines)) {
    const starts = block.flatMap((line, index) => findDateRange(line) ? [index] : []);
    for (let candidateIndex = 0; candidateIndex < starts.length; candidateIndex += 1) {
      const start = starts[candidateIndex];
      const end = starts[candidateIndex + 1] ?? block.length;
      const entry = block.slice(start, end);
      const range = findDateRange(entry[0]);
      if (!range) continue;

      const record = createWorkExperienceRecord();
      record.startDate = range.start;
      record.endDate = range.end;

      const plainEntry = meaningfulLines(entry);
      const withoutRange = plainEntry.map((line) => line.replace(range.raw, " ").trim()).filter(Boolean);
      const firstBulletIndex = entry.findIndex(isBulletLine);
      const headerLines = meaningfulLines(entry.slice(0, firstBulletIndex < 0 ? entry.length : firstBulletIndex))
        .map((line) => line.replace(range.raw, " ").trim())
        .filter(Boolean);
      const joinedHeader = headerLines.join("  ") || withoutRange.join("  ");
      record.company = labelledValue(withoutRange, ["公司", "公司名称", "单位", "机构", "所属单位"])
        || extractCompany(joinedHeader)
        || extractCompany(withoutRange.join("  "));
      record.department = labelledValueAnywhere(withoutRange, ["部门", "所属部门", "团队", "所属团队"]);
      if (!record.company) {
        record.company = headerLines.find((line) => {
          if (/^(?:部门|所属部门|团队|所属团队|职位|岗位|角色)\s*[：:]/.test(line)) return false;
          return /(?:公司|集团|研究院|实验室|事务所|银行|中心|大学|学院|机构|团队|部门|Company|Corporation|Institute|Laboratory|University|College)/i.test(line)
            && !rolePattern.test(line) && !/^https?:\/\//i.test(line) && line.length <= 80;
        }) ?? "";
      }
      record.role = labelledValueAnywhere(withoutRange, ["职位", "岗位", "角色", "实习岗位"]);

      if (!record.role) {
        const roleLine = headerLines.find((line) => line !== record.company && rolePattern.test(line) && line.length <= 80);
        if (roleLine && record.company) {
          record.role = roleLine.replace(record.company, "").replace(/^[|｜·\s]+/, "").trim();
        }
        else if (roleLine) {
          const match = rolePattern.exec(roleLine);
          if (match) {
            const separator = Math.max(roleLine.lastIndexOf(" ", match.index), roleLine.lastIndexOf("｜", match.index), roleLine.lastIndexOf("|", match.index));
            const roleStart = separator >= 0 ? separator + 1 : match.index;
            record.role = roleLine.slice(roleStart).replace(/^[|｜·\s]+/, "").trim();
            record.company = roleLine.slice(0, roleStart).replace(/[|｜·\s]+$/, "").trim();
          }
        }
      }

      if (!record.role && record.company) {
        const sameLineRole = headerLines
          .map((line) => line.replace(record.company, "").replace(/^[|｜·\s]+/, "").trim())
          .find((line) => line && rolePattern.test(line) && line.length <= 60);
        record.role = sameLineRole ?? "";
      }

      if (!record.role) {
        const roleLine = withoutRange.find((line) => rolePattern.test(line));
        const match = roleLine ? rolePattern.exec(roleLine) : null;
        if (roleLine && match) {
          const roleStart = match.index;
          record.role = roleLine.slice(roleStart).replace(/^[|｜·\s]+/, "").trim();
          if (!record.company) {
            record.company = roleLine.slice(0, roleStart).replace(/[|｜·\s]+$/, "").trim();
          }
        }
      }

      const metadata = new Set([
        record.company,
        record.role,
        ...withoutRange.filter((line) => /^(?:公司|公司名称|单位|机构|所属单位|部门|所属部门|团队|所属团队|职位|岗位|角色|实习岗位)\s*[：:]/.test(line))
      ].filter(Boolean));
      const headerDescription = withoutKnownParts(
        stripBullet(entry[0]).replace(range.raw, " "),
        [record.company, record.role]
      )
        .replace(/(?:部门|所属部门|团队|所属团队|职位|岗位|角色|实习岗位)\s*[：:].*$/, " ")
        .replace(/[|｜·]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      record.description = (headerDescription ? [headerDescription] : [])
        .concat(entry
        .slice(1)
        .map(stripBullet)
        .filter((line) => line && !metadata.has(line) && line !== record.company && line !== record.role))
        .join("\n")
        .trim();
      records.push(record);
    }
  }
  return records;
}

function splitTitleAndRole(value: string): { title: string; role: string } {
  const segments = value.split(/\s{2,}|\s*[|｜]\s*/).map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) return { title: segments[0], role: segments.slice(1).join(" ") };
  const roleMatch = /(.+?)\s+(项目负责人|负责人|核心成员|项目成员|产品经理|算法工程师|开发工程师|设计师)$/.exec(value);
  return roleMatch ? { title: roleMatch[1].trim(), role: roleMatch[2] } : { title: value.trim(), role: "" };
}

interface ProjectCandidate {
  lines: string[];
  bulletEntry: boolean;
}

function isProjectMetadata(line: string): boolean {
  return /^(?:作者角色|项目角色|承担角色|角色|项目成果|论文成果|研究成果|成果|链接|项目链接|时间)\s*[：:]/.test(stripBullet(line));
}

const PROJECT_ROLE_PATTERN = /(?:学生一作|共同一作|第一作者|第二作者|第三作者|一作|二作|三作|项目负责人|负责人|核心成员|项目成员|参与者|参与)/;

function standaloneProjectRole(line: string): string {
  const value = stripBullet(line).replace(/[（）()，,在投\s]/g, "");
  if (!value || value.length > 12) return "";
  return PROJECT_ROLE_PATTERN.exec(value)?.[0] ?? "";
}

function evidencedProjectRole(lines: string[]): string {
  for (const source of lines) {
    const line = stripBullet(source);
    const match = PROJECT_ROLE_PATTERN.exec(line);
    if (!match) continue;
    const authorRole = /学生一作|共同一作|第一作者|第二作者|第三作者|一作|二作|三作/.test(match[0]);
    const bounded = line.length <= 20
      || new RegExp(`(?:^|[|｜（(：:])\\s*${escapeRegExp(match[0])}(?:$|[|｜，,、；;）)])`).test(line);
    if (authorRole || bounded) return match[0];
  }
  return "";
}

function isDateFragmentLine(line: string): boolean {
  return /^(?:(?:19|20)\d{2}\s*(?:[./-]\s*|年\s*)\d{1,2}\s*(?:月)?\s*(?:[-–—~～至到]+\s*)?){1,2}$/.test(stripBullet(line));
}

function bulletStartsProject(line: string): boolean {
  if (!isBulletLine(line)) return false;
  const value = stripBullet(line);
  const colon = value.search(/[：:]/);
  if (colon < 2 || colon > 48) return false;
  const prefix = value.slice(0, colon).trim();
  if (/^(?:职责|工作|研究|项目描述|背景|方法|成果|技术|主要|负责|内容|产出|简介|任务|贡献|结果)/.test(prefix)) return false;
  return !/[。；;]/.test(prefix);
}

function explicitProjectStart(line: string): boolean {
  return /^(?:•\s*)?(?:论文|项目|课题)(?:\s*(?:\d+|[一二三四五六七八九十]+)?\s*[：:、.]|\s+(?=[A-Z]))/.test(line);
}

function looksLikeStandaloneProjectTitle(line: string): boolean {
  const value = stripBullet(line);
  if (!value || isProjectMetadata(value) || /^https?:\/\//i.test(value) || findDateRange(value)) return false;
  if (value.length > 120 || /[。；;]$/.test(value)) return false;
  return !/^(?:负责|参与|使用|采用|基于|通过|完成|协助|实现|研究内容|工作内容|主要工作)/.test(value);
}

function looksLikeLatinPaperTitle(line: string): boolean {
  const value = stripBullet(line);
  const words = value.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  return /^[A-Z]/.test(value) && words.length >= 5 && !/[。；]$/.test(value);
}

function projectCandidates(block: string[]): ProjectCandidate[] {
  const candidates: ProjectCandidate[] = [];
  const bulletListMode = isBulletLine(block[0] ?? "");

  for (const line of block) {
    const current = candidates.at(-1);
    const hasRange = Boolean(findDateRange(line));
    const hasBullets = current?.lines.some(isBulletLine) ?? false;
    const currentHasRange = current?.lines.some((value) => Boolean(findDateRange(value))) ?? false;
    const explicit = explicitProjectStart(line);
    const bulletEntry = bulletListMode && bulletStartsProject(line);
    const standaloneAfterBullets = !isBulletLine(line) && hasBullets && looksLikeLatinPaperTitle(line);
    const datedStart = hasRange && Boolean(current) && (hasBullets || currentHasRange || !looksLikeStandaloneProjectTitle(current?.lines[0] ?? ""));

    if (!current || explicit || (bulletEntry && current.bulletEntry) || standaloneAfterBullets || datedStart) {
      candidates.push({ lines: [line], bulletEntry });
    }
    else {
      current.lines.push(line);
    }
  }
  return candidates;
}

function parseProjects(lines: string[]): CandidateProfile["projects"] {
  const records: CandidateProfile["projects"] = [];
  for (const block of sectionBlocks(lines)) {
    for (const candidate of projectCandidates(block)) {
      const record = createProjectRecord();
      const plain = meaningfulLines(candidate.lines);
      const range = plain.map(findDateRange).find((value): value is DateRange => Boolean(value))
        ?? findDateRange(plain.join(" "));
      if (range) {
        record.startDate = range.start;
        record.endDate = range.end;
      }

      const titleLine = plain.find((line) => {
        const withoutRange = range ? line.replace(range.raw, "").trim() : line;
        return withoutRange && !isProjectMetadata(withoutRange) && !/^https?:\/\//i.test(withoutRange);
      }) ?? "";
      let titleSource = range ? titleLine.replace(range.raw, "").trim() : titleLine;
      titleSource = titleSource.replace(/(?:19|20)\d{2}\s*(?:[./-]\s*|年\s*)\d{1,2}\s*(?:月)?\s*(?:[-–—~～至到]+\s*)?$/, "").trim();
      let inlineDescription = "";
      if (candidate.bulletEntry) {
        const colon = titleSource.search(/[：:]/);
        if (colon >= 0) {
          inlineDescription = titleSource.slice(colon + 1).trim();
          titleSource = titleSource.slice(0, colon).trim();
        }
      }
      titleSource = titleSource.replace(/^(?:论文|项目|课题)(?:\s*(?:\d+|[一二三四五六七八九十]+)?\s*[：:、.]|\s+(?=[A-Z]))\s*/, "");
      const titleAndRole = splitTitleAndRole(withoutKnownParts(titleSource, []));
      record.name = titleAndRole.title.replace(/^(?:项目名称)\s*[：:]?\s*/, "").trim();
      record.role = labelledValue(plain, ["作者角色", "项目角色", "承担角色", "角色"])
        || titleAndRole.role.replace(/^(?:项目角色|承担角色)\s*[：:]?\s*/, "");
      if (!record.role) record.role = evidencedProjectRole(plain);
      if (!record.role) record.role = plain.map(standaloneProjectRole).find(Boolean) ?? "";
      if (record.role) record.name = record.name.replace(record.role, "").replace(/[|｜·（）()，,\s]+$/, "").trim();
      record.link = plain.map((line) => /https?:\/\/\S+/i.exec(line)?.[0] ?? "").find(Boolean) ?? "";
      record.outcome = labelledValue(plain, ["项目成果", "论文成果", "研究成果", "成果"]);
      const descriptionLines = candidate.lines
        .filter((line) => stripBullet(line) !== titleLine)
        .map(stripBullet)
        .filter((line) => line && !/^https?:\/\//i.test(line) && !isProjectMetadata(line)
          && !isDateFragmentLine(line) && !standaloneProjectRole(line));
      record.description = [inlineDescription, ...descriptionLines].filter(Boolean).join("\n").trim();
      if (record.name) records.push(record);
    }
  }
  return records;
}

function parseWorkSamples(lines: string[]): CandidateProfile["workSamples"] {
  const seen = new Set<string>();
  return lines.filter((line) => line !== SECTION_BREAK).flatMap((line) => {
    const link = /https?:\/\/\S+/i.exec(line)?.[0];
    if (!link || seen.has(link)) return [];
    seen.add(link);
    const record = createWorkSampleRecord();
    record.link = link;
    record.description = line.replace(link, "").replace(/^(?:作品|描述)\s*[：:]?\s*/, "").trim();
    return [record];
  });
}

function createAwardFromLine(line: string, description = ""): CandidateProfile["awards"][number] | null {
  const record = createAwardRecord();
  record.date = findMonth(line);
  record.name = stripBullet(line)
    .replace(/((?:19|20)\d{2})[./年-](\d{1,2})(?:月)?/, "")
    .replace(/^(?:获奖名称|奖项|荣誉奖项|荣誉奖励|获奖经历)\s*[：:]?\s*/, "")
    .trim();
  record.description = description.trim();
  return record.name ? record : null;
}

function parseAwards(lines: string[], allLines: string[] = []): CandidateProfile["awards"] {
  const records: CandidateProfile["awards"] = [];
  for (const block of sectionBlocks(lines)) {
    const meaningful = block.filter((line) => !/(?:大学英语|CET[-\s]?\d|TOEFL|IELTS)/i.test(line));
    if (meaningful.length === 0) continue;
    const narrativeCompetition = meaningful.length > 1
      && (Boolean(findDateRange(meaningful[0])) || /(?:Challenge|Kaggle)/i.test(meaningful[0]));
    if (narrativeCompetition) {
      const record = createAwardFromLine(meaningful[0], meaningful.slice(1).map(stripBullet).join("\n"));
      if (record) records.push(record);
      continue;
    }
    const entries: string[][] = [];
    for (const line of meaningful) {
      const value = stripBullet(line);
      const startsRecord = entries.length === 0
        || (value.length <= 100 && /(?:奖学金|竞赛|比赛|大赛|Challenge|Kaggle|训练计划|优秀学生|优秀营员|荣誉称号)/i.test(value));
      if (startsRecord) entries.push([line]);
      else entries.at(-1)?.push(line);
    }
    for (const entry of entries) {
      const record = createAwardFromLine(entry[0], entry.slice(1).map(stripBullet).join("\n"));
      if (record) records.push(record);
    }
  }

  for (const line of allLines) {
    if (!/^(?:•\s*)?(?:荣誉奖项|荣誉奖励|获奖经历)\s*[：:]/.test(line)) continue;
    const record = createAwardFromLine(line);
    if (record) records.push(record);
  }
  const seen = new Set<string>();
  return records.filter((record) => {
    const identity = record.name.replace(/[\s，,。；;、"“”'‘’《》]/g, "").toLocaleLowerCase();
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function canonicalLanguage(value: string): string {
  const found = LANGUAGE_VALUES.find((language) => new RegExp(escapeRegExp(language), "i").test(value));
  const mapping: Record<string, string> = {
    English: "英语", French: "法语", Japanese: "日语", Korean: "韩语", German: "德语", Russian: "俄语",
    Spanish: "西班牙语", Portuguese: "葡萄牙语", Mandarin: "普通话", Cantonese: "粤语"
  };
  return found ? (mapping[found] ?? found) : "";
}

function parseLanguages(lines: string[]): CandidateProfile["languages"] {
  const records: CandidateProfile["languages"] = [];
  for (const line of lines) {
    if (line === SECTION_BREAK) continue;
    const language = canonicalLanguage(line);
    if (!language || records.some((record) => record.language === language)) continue;
    const record = createLanguageRecord();
    record.language = language;
    record.proficiency = PROFICIENCY_VALUES.find((value) => line.includes(value)) ?? "";
    records.push(record);
  }
  return records;
}

function meaningfulRecord(record: object): boolean {
  return Object.entries(record).some(([key, value]) => key !== "id" && typeof value === "string" && value.trim());
}

function populatedPaths(profile: CandidateProfile): string[] {
  const paths: string[] = [];
  const collectObject = (prefix: string, value: Record<string, string>) => {
    for (const [key, fieldValue] of Object.entries(value)) {
      if (fieldValue.trim()) paths.push(`${prefix}.${key}`);
    }
  };
  collectObject("basic", profile.basic as unknown as Record<string, string>);
  collectObject("jobPreference", profile.jobPreference as unknown as Record<string, string>);
  collectObject("answers", profile.answers as unknown as Record<string, string>);
  const arrays: Array<[string, Array<Record<string, string>>]> = [
    ["education", profile.education as unknown as Array<Record<string, string>>],
    ["workExperiences", profile.workExperiences as unknown as Array<Record<string, string>>],
    ["projects", profile.projects as unknown as Array<Record<string, string>>],
    ["workSamples", profile.workSamples as unknown as Array<Record<string, string>>],
    ["awards", profile.awards as unknown as Array<Record<string, string>>],
    ["languages", profile.languages as unknown as Array<Record<string, string>>]
  ];
  for (const [prefix, records] of arrays) {
    records.forEach((record, index) => collectObject(`${prefix}.${index}`, Object.fromEntries(Object.entries(record).filter(([key]) => key !== "id"))));
  }
  return paths;
}

export function parseResumeText(text: string): ParsedResume {
  const lines = normalizeLines(text);
  const sections = partitionSections(lines);
  const profile = createEmptyProfile();
  const allText = lines.join("\n");
  const header = sections.header;

  profile.basic.fullName = labelledValue(header, ["姓名", "Name"]);
  if (!profile.basic.fullName) {
    const nameLine = header.slice(0, 8).find((line) => {
      if (sectionForHeading(line) || /[：:@\d]/.test(line) || /个人简历|求职简历|resume|curriculum vitae/i.test(line)) return false;
      return /^(?:[\p{Script=Han}·]\s*){2,8}$/u.test(line) || /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(line);
    });
    profile.basic.fullName = nameLine
      ? (/\p{Script=Han}/u.test(nameLine) ? nameLine.replace(/\s/g, "") : nameLine.replace(/\s+/g, " ").trim())
      : "";
  }
  if (!profile.basic.fullName) {
    profile.basic.fullName = header.slice(0, 8)
      .map((line) => /^([\p{Script=Han}·]{2,8})(?=\s+(?:[\p{Script=Han}]{2,}(?:大学|学院|学校)|[|｜]))/u.exec(line)?.[1] ?? "")
      .find(Boolean) ?? "";
  }
  profile.basic.preferredName = labelledValue(header, ["英文名", "常用英文名", "Preferred name"]);
  const phone = /(?<!\d)(?:(?:\+?86)[\s-]?)?1[3-9](?:[\s-]?\d){9}(?!\d)/.exec(allText)?.[0] ?? "";
  profile.basic.phone = normalizePhone(phone);
  profile.basic.email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(allText)?.[0] ?? "";
  profile.basic.gender = labelledValue(lines, ["性别", "Gender"]).match(/男|女|保密/)?.[0]
    ?? /(?:^|[|｜·•，,\s])(男|女|保密)(?=$|[|｜·•，,\s])/m.exec(header.join("\n"))?.[1]
    ?? "";
  profile.basic.birthDate = findFullDate(labelledValue(lines, ["出生日期", "出生年月日", "生日", "Date of birth"]));
  profile.basic.nationality = labelledValue(lines, ["国籍", "国籍（地区）", "Nationality"]);
  profile.basic.currentCity = labelledValue(lines, ["当前城市", "现居地", "现居城市", "所在地", "Current city"]);
  if (!profile.basic.currentCity) {
    profile.basic.currentCity = /(?:^|[|｜·•，,\s])((?:北京|上海|天津|重庆)(?:市)?)(?=$|[|｜·•，,\s])/m.exec(header.join("\n"))?.[1] ?? "";
  }
  profile.basic.hometown = labelledValue(lines, ["籍贯", "家乡", "Hometown"]);
  profile.basic.politicalStatus = labelledValue(lines, ["政治面貌"]);
  if (!profile.basic.politicalStatus) {
    profile.basic.politicalStatus = /中共预备党员|中共党员|共青团员|群众|民主党派/.exec(header.join("\n"))?.[0] ?? "";
  }

  profile.jobPreference.targetRoles = labelledValue(lines, ["求职意向", "求职岗位", "目标岗位", "应聘岗位", "Target role"]);
  profile.jobPreference.preferredCities = labelledValue(lines, ["意向城市", "期望工作地点", "期望城市", "Preferred cities"]);
  profile.jobPreference.availableDate = findFullDate(labelledValue(lines, ["可到岗日期", "到岗日期", "Available date"]));

  const education = parseEducation(sections.education);
  profile.education = education.length > 0 ? education : [createEducationRecord()];
  profile.workExperiences = parseWork(sections.work);
  profile.projects = parseProjects(sections.projects);
  profile.workSamples = parseWorkSamples([...sections.works, ...header]);
  profile.awards = parseAwards(sections.awards, lines);
  profile.languages = parseLanguages(lines);
  profile.answers.selfIntroduction = meaningfulLines(sections.selfIntroduction).join("\n").trim();
  profile.answers.selfEvaluation = meaningfulLines(sections.selfEvaluation).join("\n").trim();
  profile.answers.strengths = meaningfulLines(sections.skills).join("\n").trim();
  profile.answers.careerPlan = meaningfulLines(sections.careerPlan).join("\n").trim();

  const paths = populatedPaths(profile);
  const warnings: string[] = [];
  if (paths.length === 0) warnings.push("没有识别到可映射的档案字段。");
  if (!profile.basic.fullName) warnings.push("未识别姓名，请在基本信息中补充。");
  if (profile.education.every((record) => !meaningfulRecord(record))) warnings.push("未识别教育经历，请检查简历章节标题或手动补充。");
  return { profile, populatedPaths: paths, warnings };
}

function mergeScalarObject(
  target: Record<string, string>,
  source: Record<string, string>,
  prefix: string,
  result: ResumeMergeResult
) {
  for (const [key, sourceValue] of Object.entries(source)) {
    if (!sourceValue.trim()) continue;
    const path = `${prefix}.${key}`;
    const targetValue = target[key] ?? "";
    if (!targetValue.trim()) {
      target[key] = sourceValue;
      result.importedFieldCount += 1;
      result.importedPaths.push(path);
    }
    else if (targetValue.trim() !== sourceValue.trim()) {
      result.preservedFieldCount += 1;
      result.preservedPaths.push(path);
    }
  }
}

function recordIdentity(record: Record<string, string>, keys: string[]): string {
  return keys.map((key) => record[key]?.trim().toLocaleLowerCase() ?? "").filter(Boolean).join("|");
}

function mergeRecordArray(
  target: Array<Record<string, string>>,
  source: Array<Record<string, string>>,
  prefix: string,
  identityKeys: string[],
  result: ResumeMergeResult
) {
  for (const sourceRecord of source.filter(meaningfulRecord)) {
    const identity = recordIdentity(sourceRecord, identityKeys);
    let targetIndex = identity
      ? target.findIndex((record) => recordIdentity(record, identityKeys) === identity)
      : -1;
    if (targetIndex < 0) targetIndex = target.findIndex((record) => !meaningfulRecord(record));

    if (targetIndex < 0) {
      target.push(structuredClone(sourceRecord));
      targetIndex = target.length - 1;
      result.addedRecordCount += 1;
    }
    const targetRecord = target[targetIndex];
    mergeScalarObject(
      targetRecord,
      Object.fromEntries(Object.entries(sourceRecord).filter(([key]) => key !== "id")),
      `${prefix}.${targetIndex}`,
      result
    );
  }
}

export function mergeResumeIntoProfile(existing: CandidateProfile, parsed: CandidateProfile): ResumeMergeResult {
  const result: ResumeMergeResult = {
    profile: structuredClone(existing),
    importedFieldCount: 0,
    preservedFieldCount: 0,
    addedRecordCount: 0,
    importedPaths: [],
    preservedPaths: []
  };

  mergeScalarObject(
    result.profile.basic as unknown as Record<string, string>,
    parsed.basic as unknown as Record<string, string>,
    "basic",
    result
  );
  mergeScalarObject(
    result.profile.jobPreference as unknown as Record<string, string>,
    parsed.jobPreference as unknown as Record<string, string>,
    "jobPreference",
    result
  );
  mergeScalarObject(
    result.profile.answers as unknown as Record<string, string>,
    parsed.answers as unknown as Record<string, string>,
    "answers",
    result
  );

  mergeRecordArray(
    result.profile.education as unknown as Array<Record<string, string>>,
    parsed.education as unknown as Array<Record<string, string>>,
    "education", ["school", "degree", "major", "startDate"], result
  );
  mergeRecordArray(
    result.profile.workExperiences as unknown as Array<Record<string, string>>,
    parsed.workExperiences as unknown as Array<Record<string, string>>,
    "workExperiences", ["company", "role", "startDate"], result
  );
  mergeRecordArray(
    result.profile.projects as unknown as Array<Record<string, string>>,
    parsed.projects as unknown as Array<Record<string, string>>,
    "projects", ["name", "startDate"], result
  );
  mergeRecordArray(
    result.profile.workSamples as unknown as Array<Record<string, string>>,
    parsed.workSamples as unknown as Array<Record<string, string>>,
    "workSamples", ["link"], result
  );
  mergeRecordArray(
    result.profile.awards as unknown as Array<Record<string, string>>,
    parsed.awards as unknown as Array<Record<string, string>>,
    "awards", ["name", "date"], result
  );
  mergeRecordArray(
    result.profile.languages as unknown as Array<Record<string, string>>,
    parsed.languages as unknown as Array<Record<string, string>>,
    "languages", ["language"], result
  );
  return result;
}
