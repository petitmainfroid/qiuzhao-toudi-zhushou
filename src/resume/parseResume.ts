import {
  createAwardRecord,
  createEducationRecord,
  createEmptyProfile,
  createLanguageExamRecord,
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
  | "other"
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
  ["projects", ["论文与科研成果", "科研与项目经历", "科研项目经历", "在校科研", "科研经历", "科研项目", "研究经历", "研究项目", "开源项目贡献", "开源贡献", "项目成果", "项目经历", "项目经验", "科研成果", "Project Experience", "Research Experience", "Projects"]],
  ["works", ["个人作品", "作品集", "作品", "Portfolio", "Work Samples"]],
  ["awards", ["竞赛经历", "比赛经历", "竞赛获奖", "获奖经历", "奖项证书", "奖项荣誉", "荣誉奖项", "荣誉与奖励", "Awards and Honors", "Awards"]],
  ["languages", ["语言能力", "外语能力", "语言技能", "Languages", "Language"]],
  ["skills", ["技能/目标", "技术能力", "专业技能", "技能特长", "个人优势", "核心技能", "技能", "Skills"]],
  ["activities", ["课外活动", "校园经历", "校内活动", "学生活动", "社团经历", "社会实践", "志愿服务", "Campus Activities", "Activities"]],
  ["other", ["论文发表", "代表论文", "学术会议", "学术服务", "其他"]],
  ["selfIntroduction", ["个人总结", "研究简介", "个人简介", "自我介绍", "Profile", "Summary"]],
  ["selfEvaluation", ["自我评价", "个人评价", "Self Evaluation"]],
  ["careerPlan", ["职业规划", "发展规划", "Career Plan"]]
];

const DEGREE_VALUES = ["直博", "博士", "MBA", "硕士", "本科", "学士", "大专", "专科", "高中", "PhD", "Master", "Bachelor"];
const EDUCATION_TYPE_VALUES = ["海外及港澳台", "统招全日制", "统招非全日制", "自考", "全日制", "非全日制"];
const LANGUAGE_VALUES = [
  "英语", "英文", "法语", "日语", "韩语", "德语", "俄语", "西班牙语", "葡萄牙语", "阿拉伯语", "普通话", "中文", "粤语",
  "English", "French", "Japanese", "Korean", "German", "Russian", "Spanish", "Portuguese", "Mandarin", "Cantonese"
];
const PROFICIENCY_VALUES = ["入门", "日常会话", "商务会话", "熟练", "流利", "无障碍沟通", "母语"];
const EXACT_SECTION_ALIASES = new Set(["项目成果", "其他"]);

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
        if (EXACT_SECTION_ALIASES.has(alias)) {
          const suffix = line.slice(match.index + match[0].length).replace(/[：:|｜·•—_\-\s]/g, "");
          if (suffix) continue;
        }
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
    header: [], education: [], work: [], projects: [], works: [], awards: [], languages: [], skills: [], activities: [], other: [],
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
    if (after && after.replace(/[：:|｜·•—_\-\s]/g, "")) sections[current].push(after);
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
  const compact = value.replace(/[^\d+]/g, "");
  return compact.startsWith("+86") ? compact : compact.replace(/^86(?=1[3-9]\d{9}$)/, "+86");
}

function extractPhone(lines: string[]): string {
  const labelled = /(?:手机(?:号码)?|联系电话|电话(?:\s*\/\s*微信)?|Phone|Mobile|Tel)\s*[：:]?\s*((?:\(\+?\d{1,3}\)|\+?\d{1,3})?(?:[\s-]?\d){7,14})/i;
  for (const line of lines) {
    const value = labelled.exec(line)?.[1];
    if (value) return normalizePhone(value);
  }
  const allText = lines.join("\n");
  const chineseMobile = /(?<!\d)(?:(?:\+?86)[\s-]?)?1[3-9](?:[\s-]?\d){9}(?!\d)/.exec(allText)?.[0];
  if (chineseMobile) return normalizePhone(chineseMobile);
  const international = /(?<!\d)\+\d{1,3}(?:[\s-]?\d){7,14}(?!\d)/.exec(allText)?.[0];
  return international ? normalizePhone(international) : "";
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

function findYearEvidence(value: string): DateRange | null {
  const range = /(?<!\d)((?:19|20)\d{2})\s*(?:[-–—~～至到]+\s*(?:预计\s*)?((?:19|20)\d{2})|年)(?!\d)/.exec(value);
  if (range) return { raw: range[0], start: "", end: "" };
  const point = /(?<!\d)((?:19|20)\d{2})(?![\d.\/-])/.exec(value);
  return point ? { raw: point[0], start: "", end: "" } : null;
}

function findEducationRange(value: string): DateRange | null {
  const range = findDateRange(value);
  if (range) return range;
  if (/(?:预计入学|预期入学|计划入学|expected\s+(?:enrolment|enrollment|admission))/i.test(value)) {
    const month = /((?:19|20)\d{2})\s*(?:[./-]\s*|年\s*)(\d{1,2})\s*(?:月)?/.exec(value);
    if (month) {
      const start = normalizeMonth(month[1], month[2]);
      if (start) return { raw: month[0], start, end: "" };
    }
  }
  return findYearEvidence(value);
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
  const withoutCurrentMarker = value.replace(
    /(?:至今|现在|Present|Current)(?=\s*[\p{Script=Han}A-Za-z])/giu,
    " "
  );
  const compactChinese = withoutCurrentMarker.replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "");
  const chinese = /([\p{Script=Han}·]{2,}?(?:大学|学院|学校|中学))/u.exec(compactChinese)?.[1];
  const degreeLedDepartment = /^(?:直博|博士|MBA|硕士|本科|学士|大专|专科|高中|PhD|Master|Bachelor)\s+/i.test(withoutCurrentMarker)
    && chinese?.endsWith("学院")
    && !/(?:大学|学校|中学)/.test(chinese);
  if (chinese && !degreeLedDepartment) return chinese;
  return /([A-Za-z][A-Za-z .&'-]{2,}?(?:University|College|Institute|School))/i.exec(withoutCurrentMarker)?.[1]?.trim() ?? "";
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
  const mapping: Record<string, string> = { 直博: "博士", 学士: "本科", PhD: "博士", Master: "硕士", Bachelor: "本科", 专科: "大专" };
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
  identity: (value: string) => string,
  rangeFinder: (value: string) => DateRange | null = findDateRange
): RecordCandidate[] {
  const candidates: RecordCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    let endIndex = index;
    let text = lines[index];
    let range = rangeFinder(text);
    let identityValue = identity(text);

    if ((!range || !identityValue) && (range || identityValue)) {
      for (let offset = 1; offset <= 2 && index + offset < lines.length; offset += 1) {
        const combined = `${text}  ${lines[index + offset]}`;
        const combinedRange = rangeFinder(combined);
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
    .replace(/[（(]\s*(?:在读|预计|推免|保研|预计入学|预期入学|计划入学)\s*[）)]/g, " ")
    .replace(/(?:211|985|双一流|在读|预计入学|预期入学|计划入学|预计|推免|保研)/g, " ")
    .replace(/^(?:直博|博士|MBA|硕士|本科|学士|大专|专科|高中|PhD|Master|Bachelor)\s*/i, "")
    .replace(/^[\p{Script=Han}A-Za-z& .'-]{2,30}(?:学院|学部|系)\s*/u, "")
    .replace(/^[,，、;；:：|｜·\s]+|[,，、;；:：|｜·\s]+$/g, "")
    .replace(/[（()]\s*[）)]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function majorFromDegreeLine(lines: string[]): string {
  for (const source of lines.slice(0, 4)) {
    const value = stripBullet(source).trim();
    if (!value || value.length > 80) continue;
    const beforeDegree = /^(.{2,36}?)(?:直博|博士|硕士|学士|PhD|Master|Bachelor)(?:\s|[；;，,（(]|$)/i.exec(value)?.[1]?.trim();
    if (beforeDegree && !extractSchool(beforeDegree)) return cleanEducationMajor(beforeDegree);
    const afterDegree = /^(?:直博|博士|MBA|硕士|本科|学士|大专|专科|高中|PhD|Master|Bachelor)\s+(.{2,50})$/i.exec(value)?.[1]?.trim();
    if (afterDegree) return cleanEducationMajor(afterDegree);
  }
  return "";
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

  const degreeLineMajor = majorFromDegreeLine(details);
  if (degreeLineMajor) return degreeLineMajor;

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
  const candidates = findCandidates(plainLines, extractSchool, findEducationRange);
  const records = candidates.map((candidate, index) => {
    const record = createEducationRecord();
    const details = candidateDetails(plainLines, candidates, index);
    const degreeDetails = details.slice(0, 3).filter((line) =>
      /^(?:(?:学历|学位)\s*[：:]\s*)?(?:博士|MBA|硕士|本科|学士|大专|专科|高中|PhD|Master|Bachelor)(?:\s*(?:在读|研究生))?$/i.test(stripBullet(line))
    );
    const richDegreeDetails = details.slice(0, 3).filter((line) => {
      const value = stripBullet(line);
      return Boolean(rawDegree(value))
        && value.length <= 80
        && !/(?:获奖|荣誉|奖学金|支持|本科生|课程)/.test(value);
    });
    const educationEvidence = `${candidate.text} ${degreeDetails.join(" ")} ${richDegreeDetails.join(" ")}`;
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
  const rolePattern = /(?:(?:[\p{Script=Han}A-Za-z]{1,16})?实习生|实习|研究助理|科研助理|助理研究员|研究员|工程师|分析师|设计师|产品经理|项目经理|顾问|负责人|经理|助理|Intern|Engineer|Researcher|Analyst|Designer|Manager|Consultant)/iu;
  const temporalEvidence = (line: string) => findDateRange(line)
    ?? (rolePattern.test(line) ? findYearEvidence(line) : null);
  const records: CandidateProfile["workExperiences"] = [];

  for (const block of sectionBlocks(lines)) {
    const starts = block.flatMap((line, index) => temporalEvidence(line) ? [index] : []);
    for (let candidateIndex = 0; candidateIndex < starts.length; candidateIndex += 1) {
      const start = starts[candidateIndex];
      const end = starts[candidateIndex + 1] ?? block.length;
      const entry = block.slice(start, end);
      const range = temporalEvidence(entry[0]);
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

      if (record.company && record.role && record.company.includes(record.role)) {
        const companyWithoutRole = record.company
          .replace(record.role, " ")
          .replace(/^[|｜·\s]+|[|｜·\s]+$/g, "")
          .trim();
        if (companyWithoutRole) record.company = companyWithoutRole;
      }

      if (!record.company) {
        record.company = headerLines.find((line) => {
          const value = line.replace(record.role, "").replace(/^[|｜·\s]+|[|｜·\s]+$/g, "").trim();
          return value
            && value.length <= 50
            && !rolePattern.test(value)
            && !/[。；;]$/.test(value)
            && !/^(?:负责|参与|使用|采用|基于|通过|完成|协助|实现|构建|设计|开发)/.test(value);
        })?.replace(record.role, "").replace(/^[|｜·\s]+|[|｜·\s]+$/g, "").trim() ?? "";
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

function looksLikeProjectTitleAfterCompletedEntry(line: string): boolean {
  const value = stripBullet(line);
  if (looksLikeStandaloneProjectTitle(line)) {
    return value.length <= 40 || /[：:]/.test(value) || looksLikeLatinPaperTitle(value);
  }
  return value.length <= 90
    && !/[。；;]$/.test(value)
    && /^(?:基于|面向)/.test(value)
    && /(?:系统|平台|框架|模型|方法|研究|设计|作品|Agent|LLM)/i.test(value);
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
    const standaloneAfterCompletedEntry = !isBulletLine(line)
      && Boolean(current)
      && /[。；;]$/.test(stripBullet(current?.lines.at(-1) ?? ""))
      && looksLikeProjectTitleAfterCompletedEntry(line);
    const datedStart = hasRange && Boolean(current) && (hasBullets || currentHasRange || !looksLikeStandaloneProjectTitle(current?.lines[0] ?? ""));

    if (!current || explicit || (bulletEntry && current.bulletEntry) || standaloneAfterBullets || standaloneAfterCompletedEntry || datedStart) {
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
      const colon = titleSource.search(/[：:]/);
      const colonPrefix = colon >= 0 ? titleSource.slice(0, colon).trim() : "";
      const colonSuffix = colon >= 0 ? titleSource.slice(colon + 1).trim() : "";
      const descriptiveSuffix = /^(?:负责|参与|使用|采用|基于|通过|完成|协助|实现|研究|构建|设计|提出|开发|搭建|主导)/.test(colonSuffix);
      if (colon >= 2 && colon <= 48 && (candidate.bulletEntry || (colonPrefix.length <= 30 && descriptiveSuffix))) {
          inlineDescription = titleSource.slice(colon + 1).trim();
          titleSource = titleSource.slice(0, colon).trim();
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
      const actionSentence = /^(?:负责|参与|使用|采用|基于|通过|完成|协助|实现|研究|构建|设计|提出|开发|搭建|主导)/.test(record.name)
        && /[。；;]$/.test(record.name);
      if (record.name && !actionSentence) records.push(record);
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

function expandAwardListLines(lines: string[]): string[] {
  const values = lines.map(stripBullet).filter(Boolean);
  const joined = values.join(" ");
  const awardMarker = /(?:一等奖|二等奖|三等奖|特等奖|金奖|银奖|铜奖|优胜奖|奖学金|荣誉称号)/;
  const markerCount = joined.match(new RegExp(awardMarker.source, "g"))?.length ?? 0;
  if (!/[；;]/.test(joined) || markerCount < 2) return lines;

  const pieces = values.flatMap((line) => line.split(/[；;]/).map((part) => part.trim()).filter(Boolean));
  const expanded: string[] = [];
  let pending = "";
  for (const piece of pieces) {
    const joiner = pending && /\p{Script=Han}$/u.test(pending) && /^\p{Script=Han}/u.test(piece) ? "" : " ";
    const combined = pending ? `${pending}${joiner}${piece}`.trim() : piece;
    if (!awardMarker.test(combined)) {
      pending = combined;
      continue;
    }
    pending = "";
    let enumerated = combined.split(/[、，,]/).map((part) => part.trim()).filter(Boolean);
    if (enumerated.length === 1) {
      const acronymSeparated = combined.split(/\s+(?=[A-Z]{2,}\b)/).map((part) => part.trim()).filter(Boolean);
      if (acronymSeparated.length > 1 && acronymSeparated.every((part) => awardMarker.test(part))) enumerated = acronymSeparated;
    }
    if (enumerated.length > 1 && enumerated.every((part) => awardMarker.test(part))) expanded.push(...enumerated);
    else expanded.push(combined);
  }
  if (pending && expanded.length > 0) expanded[expanded.length - 1] = `${expanded.at(-1)}\n${pending}`;
  return expanded.length > 1 ? expanded : lines;
}

function parseAwards(lines: string[], allLines: string[] = []): CandidateProfile["awards"] {
  const records: CandidateProfile["awards"] = [];
  for (const block of sectionBlocks(lines)) {
    const meaningful = expandAwardListLines(
      block.filter((line) => !/(?:大学英语|CET[-\s]?\d|TOEFL|IELTS)/i.test(line))
    );
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
        || (value.length <= 100 && /(?:奖|荣誉|竞赛|比赛|大赛|Challenge|Kaggle|训练计划|优秀学生|优秀营员)/i.test(value));
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
  const mapping: Record<string, string> = {
    英文: "英语", 中文: "普通话",
    English: "英语", French: "法语", Japanese: "日语", Korean: "韩语", German: "德语", Russian: "俄语",
    Spanish: "西班牙语", Portuguese: "葡萄牙语", Mandarin: "普通话", Cantonese: "粤语"
  };
  return mapping[value] ?? value;
}

function languageMatches(value: string): Array<{ language: string; index: number; length: number }> {
  const matches = LANGUAGE_VALUES.flatMap((alias) => {
    const match = new RegExp(escapeRegExp(alias), "i").exec(value);
    return match ? [{ language: canonicalLanguage(alias), index: match.index, length: match[0].length }] : [];
  }).sort((left, right) => left.index - right.index || right.length - left.length);
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (seen.has(match.language)) return false;
    seen.add(match.language);
    return true;
  });
}

function parseLanguages(lines: string[]): CandidateProfile["languages"] {
  const records: CandidateProfile["languages"] = [];
  for (const line of lines) {
    if (line === SECTION_BREAK) continue;
    const matches = languageMatches(line);
    matches.forEach((match, index) => {
      const following = line.slice(match.index, matches[index + 1]?.index ?? line.length);
      const delimiter = following.search(/[、，,；;|｜]/);
      const evidence = delimiter >= 0 ? following.slice(0, delimiter) : following;
      const proficiency = PROFICIENCY_VALUES.find((value) => evidence.includes(value)) ?? "";
      const existing = records.find((record) => record.language === match.language);
      if (existing) {
        if (!existing.proficiency && proficiency) existing.proficiency = proficiency;
        return;
      }
      const record = createLanguageRecord();
      record.language = match.language;
      record.proficiency = proficiency;
      records.push(record);
    });
  }
  return records;
}

const LANGUAGE_EXAM_PATTERNS = [
  { language: "英语", examType: "CET-4（四级）", pattern: /(?:CET\s*[- ]?\s*4|大学英语四级|英语四级)/i },
  { language: "英语", examType: "CET-6（六级）", pattern: /(?:CET\s*[- ]?\s*6|大学英语六级|英语六级)/i },
  { language: "英语", examType: "TEM-4（专四）", pattern: /(?:TEM\s*[- ]?\s*4|英语专业四级|专四)/i },
  { language: "英语", examType: "TEM-8（专八）", pattern: /(?:TEM\s*[- ]?\s*8|英语专业八级|专八)/i },
  { language: "英语", examType: "IELTS（雅思）", pattern: /(?:IELTS|雅思)/i },
  { language: "英语", examType: "TOEFL（托福）", pattern: /(?:TOEFL|托福)/i },
  { language: "英语", examType: "TOEIC（托业）", pattern: /(?:TOEIC|托业)/i },
  { language: "日语", examType: "JLPT（日语能力测试）", pattern: /(?:JLPT|日语能力测试)/i },
  { language: "韩语", examType: "TOPIK（韩语能力考试）", pattern: /(?:TOPIK|韩语能力考试)/i }
] as const;

function parseLanguageExams(lines: string[]): NonNullable<CandidateProfile["languageExams"]> {
  const records: NonNullable<CandidateProfile["languageExams"]> = [];
  for (const line of lines) {
    if (line === SECTION_BREAK) continue;
    for (const definition of LANGUAGE_EXAM_PATTERNS) {
      const match = definition.pattern.exec(line);
      if (!match) continue;
      const remainder = line.slice(match.index + match[0].length);
      const score = /(?:成绩|分数|score)?\s*[：:]?\s*(\d{1,3}(?:\.\d+)?|[A-C][12]?)/i.exec(remainder)?.[1] ?? "";
      if (records.some((record) => record.examType === definition.examType && record.score === score)) continue;
      const record = createLanguageExamRecord();
      record.language = definition.language;
      record.examType = definition.examType;
      record.score = score;
      records.push(record);
    }
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
    ["languages", profile.languages as unknown as Array<Record<string, string>>],
    ["languageExams", (profile.languageExams ?? []) as unknown as Array<Record<string, string>>],
    ["campusLeadership", (profile.campusLeadership ?? []) as unknown as Array<Record<string, string>>],
    ["campusActivities", (profile.campusActivities ?? []) as unknown as Array<Record<string, string>>],
    ["familyMembers", (profile.familyMembers ?? []) as unknown as Array<Record<string, string>>],
    ["certificates", (profile.certificates ?? []) as unknown as Array<Record<string, string>>],
    ["publications", (profile.publications ?? []) as unknown as Array<Record<string, string>>],
    ["patents", (profile.patents ?? []) as unknown as Array<Record<string, string>>]
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
  profile.basic.phone = extractPhone(lines);
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
  profile.basic.identityDocumentType = labelledValueAnywhere(lines, ["证件类型", "身份证件类型", "Identity document type", "ID type"]);
  profile.basic.identityDocumentNumber = labelledValueAnywhere(lines, ["身份证号", "身份证号码", "证件号码", "护照号码", "Identity number", "ID card number", "Passport number"]);
  if (!profile.basic.identityDocumentType && profile.basic.identityDocumentNumber) {
    const identityLabel = lines.find((line) => /(?:身份证号|身份证号码|护照号码)\s*[：:]/i.test(line)) ?? "";
    profile.basic.identityDocumentType = /护照/.test(identityLabel) ? "护照" : /身份证/.test(identityLabel) ? "居民身份证" : "其他证件";
  }
  profile.basic.ethnicity = labelledValue(lines, ["民族", "Ethnicity"]);
  profile.basic.maritalStatus = labelledValue(lines, ["婚姻状况", "婚姻状态", "Marital status"]);
  profile.basic.religion = labelledValue(lines, ["宗教信仰", "Religion"]);
  profile.basic.heightCm = labelledValue(lines, ["身高", "Height"]).replace(/\s*(?:cm|厘米)$/i, "");
  profile.basic.weightKg = labelledValue(lines, ["体重", "Weight"]).replace(/\s*(?:kg|公斤)$/i, "");
  profile.basic.homeCity = labelledValue(lines, ["家庭所在城市", "家庭城市"]);
  profile.basic.homeDistrict = labelledValue(lines, ["家庭所在区县", "家庭区县"]);
  profile.basic.schoolCity = labelledValue(lines, ["学校所在城市", "院校所在城市"]);
  profile.basic.schoolDistrict = labelledValue(lines, ["学校所在区县", "院校所在区县"]);
  profile.basic.hobbies = labelledValueAnywhere(lines, ["兴趣爱好", "个人爱好", "Hobbies"]);

  profile.jobPreference.targetRoles = labelledValueAnywhere(lines, ["求职意向", "求职岗位", "目标岗位", "应聘岗位", "Target role"]);
  profile.jobPreference.preferredCities = labelledValueAnywhere(lines, ["意向城市", "期望工作地点", "期望城市", "Preferred cities"]);
  profile.jobPreference.availableDate = findFullDate(labelledValueAnywhere(lines, ["可到岗日期", "到岗日期", "Available date"]));
  profile.jobPreference.targetIndustries = labelledValueAnywhere(lines, ["期望行业", "意向行业", "Target industry"]);
  profile.jobPreference.expectedSalary = labelledValueAnywhere(lines, ["期望薪资", "薪资期望", "Expected salary"]);
  profile.jobPreference.currentSalary = labelledValueAnywhere(lines, ["当前薪资", "目前薪资", "Current salary"]);
  profile.jobPreference.recruitmentSource = labelledValueAnywhere(lines, ["招聘信息来源", "获知渠道", "Recruitment source"]);
  profile.jobPreference.workYears = labelledValueAnywhere(lines, ["工作经验", "工作年限", "Years of experience"]);

  const education = parseEducation(sections.education);
  profile.education = education.length > 0 ? education : [createEducationRecord()];
  profile.workExperiences = parseWork(sections.work);
  profile.projects = parseProjects(sections.projects);
  profile.workSamples = parseWorkSamples([...sections.works, ...header]);
  profile.awards = parseAwards(sections.awards, lines);
  profile.languages = parseLanguages(lines);
  profile.languageExams = parseLanguageExams(lines);
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
  result.profile.languageExams ??= [];
  result.profile.campusLeadership ??= [];
  result.profile.campusActivities ??= [];
  result.profile.familyMembers ??= [];
  result.profile.certificates ??= [];
  result.profile.publications ??= [];
  result.profile.patents ??= [];
  const optionalArrays: Array<[string, Array<Record<string, string>>, Array<Record<string, string>>, string[]]> = [
    ["languageExams", result.profile.languageExams as unknown as Array<Record<string, string>>, (parsed.languageExams ?? []) as unknown as Array<Record<string, string>>, ["language", "examType", "score"]],
    ["campusLeadership", result.profile.campusLeadership as unknown as Array<Record<string, string>>, (parsed.campusLeadership ?? []) as unknown as Array<Record<string, string>>, ["title", "organization", "startDate"]],
    ["campusActivities", result.profile.campusActivities as unknown as Array<Record<string, string>>, (parsed.campusActivities ?? []) as unknown as Array<Record<string, string>>, ["name", "startDate"]],
    ["familyMembers", result.profile.familyMembers as unknown as Array<Record<string, string>>, (parsed.familyMembers ?? []) as unknown as Array<Record<string, string>>, ["name", "relationship"]],
    ["certificates", result.profile.certificates as unknown as Array<Record<string, string>>, (parsed.certificates ?? []) as unknown as Array<Record<string, string>>, ["name", "date"]],
    ["publications", result.profile.publications as unknown as Array<Record<string, string>>, (parsed.publications ?? []) as unknown as Array<Record<string, string>>, ["title", "journal"]],
    ["patents", result.profile.patents as unknown as Array<Record<string, string>>, (parsed.patents ?? []) as unknown as Array<Record<string, string>>, ["name", "number"]]
  ];
  optionalArrays.forEach(([prefix, target, source, identityKeys]) => {
    mergeRecordArray(target, source, prefix, identityKeys, result);
  });
  return result;
}
