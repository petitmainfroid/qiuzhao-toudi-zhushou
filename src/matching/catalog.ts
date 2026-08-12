import type { ControlKind } from "./types";
import { supplementalCanonicalFields } from "./supplementalCatalog";

export interface CanonicalField {
  path: string;
  label: string;
  aliases: string[];
  kinds: ControlKind[];
  autocomplete?: string[];
  sensitive?: boolean;
  contextHints?: string[];
}

const textKinds: ControlKind[] = ["text", "textarea", "contenteditable"];
const dateKinds: ControlKind[] = ["date", "month", "date-range", "text"];

export const canonicalFields: CanonicalField[] = [
  {
    path: "basic.fullName",
    label: "姓名",
    aliases: ["姓名", "真实姓名", "中文姓名", "姓 名", "full name", "legal name", "chinese name", "name"],
    kinds: textKinds,
    autocomplete: ["name"]
  },
  {
    path: "basic.preferredName",
    label: "常用英文名",
    aliases: ["英文名", "英文姓名", "常用英文名", "english name", "preferred name"],
    kinds: textKinds
  },
  {
    path: "basic.gender",
    label: "性别",
    aliases: ["性别", "gender", "sex"],
    kinds: ["radio", "select", "text"],
    sensitive: true
  },
  {
    path: "basic.birthDate",
    label: "出生日期",
    aliases: ["出生日期", "出生年月", "生日", "date of birth", "birth date", "birthday", "dob"],
    kinds: dateKinds,
    autocomplete: ["bday"],
    sensitive: true
  },
  {
    path: "derived.age",
    label: "年龄（由出生日期计算）",
    aliases: ["年龄", "周岁", "age"],
    kinds: ["number", "text"],
    sensitive: true
  },
  {
    path: "basic.phone",
    label: "手机号码",
    aliases: ["手机号码", "手机号", "联系电话", "移动电话", "mobile", "mobile phone", "phone", "phone number", "telephone"],
    kinds: ["tel", "text"],
    autocomplete: ["tel"]
  },
  {
    path: "basic.email",
    label: "邮箱",
    aliases: ["邮箱", "电子邮箱", "电子邮件", "email", "email address", "e-mail"],
    kinds: ["email", "text"],
    autocomplete: ["email"]
  },
  {
    path: "basic.nationality",
    label: "国籍（地区）",
    aliases: ["国籍（地区）", "国籍(地区)", "国籍", "国家或地区", "国家/地区", "nationality", "country or region", "country/region"],
    kinds: ["text", "select"],
    sensitive: true
  },
  {
    path: "basic.currentCity",
    label: "当前城市",
    aliases: ["当前城市", "现居城市", "现居地", "当前居住城市", "所在城市", "current city", "city of residence", "residence city"],
    kinds: ["text", "select"]
  },
  {
    path: "basic.hometown",
    label: "籍贯",
    aliases: ["籍贯", "生源地", "家乡", "hometown", "native place"],
    kinds: ["text", "select"],
    sensitive: true
  },
  {
    path: "basic.politicalStatus",
    label: "政治面貌",
    aliases: ["政治面貌", "political status", "political affiliation"],
    kinds: ["text", "select", "radio"],
    sensitive: true
  },
  {
    path: "education.0.school",
    label: "毕业院校",
    aliases: ["毕业院校", "院校名称", "学校名称", "就读院校", "大学名称", "university", "college", "school name", "university name"],
    kinds: ["text", "select"],
    contextHints: ["教育", "学历", "education"]
  },
  {
    path: "education.0.degree",
    label: "学历",
    aliases: ["学历", "最高学历", "degree", "education level", "highest degree"],
    kinds: ["text", "select", "radio"],
    contextHints: ["教育", "学历", "education"]
  },
  {
    path: "education.0.educationType",
    label: "学历类型",
    aliases: ["学历类型", "培养方式", "学习形式", "教育类型", "education type", "study type", "attendance type"],
    kinds: ["text", "select", "radio"],
    contextHints: ["教育", "学历", "education"]
  },
  {
    path: "education.0.major",
    label: "专业",
    aliases: ["专业", "所学专业", "专业名称", "主修专业", "major", "field of study", "specialization"],
    kinds: ["text", "select"],
    contextHints: ["教育", "学历", "education"]
  },
  {
    path: "education.0.startDate",
    label: "入学时间",
    aliases: ["入学时间", "入学日期", "教育开始时间", "起止时间", "开始时间", "开始日期", "enrollment date", "education start date", "start of study", "start date"],
    kinds: dateKinds,
    contextHints: ["教育", "院校", "education"]
  },
  {
    path: "education.0.endDate",
    label: "毕业时间",
    aliases: ["毕业时间", "毕业日期", "预计毕业时间", "教育结束时间", "起止时间", "结束时间", "结束日期", "graduation date", "expected graduation", "education end date", "end date"],
    kinds: dateKinds,
    contextHints: ["教育", "院校", "education"]
  },
  {
    path: "education.0.gpa",
    label: "GPA",
    aliases: ["gpa", "平均绩点", "绩点", "grade point average"],
    kinds: ["text", "number"]
  },
  {
    path: "education.0.ranking",
    label: "专业排名",
    aliases: ["专业排名", "成绩排名", "班级排名", "综合排名", "academic ranking", "class rank", "ranking"],
    kinds: ["text", "number", "select"]
  },
  {
    path: "workExperiences.0.company",
    label: "实习公司",
    aliases: ["实习公司", "公司名称", "单位名称", "雇主名称", "company name", "employer", "organization"],
    kinds: textKinds,
    contextHints: ["实习", "工作", "work", "experience"]
  },
  {
    path: "workExperiences.0.department",
    label: "实习部门",
    aliases: ["实习部门", "所在部门", "部门名称", "department", "business unit"],
    kinds: textKinds,
    contextHints: ["实习", "工作", "work"]
  },
  {
    path: "workExperiences.0.role",
    label: "实习岗位",
    aliases: ["实习岗位", "岗位名称", "职位名称", "工作职位", "job title", "position title", "work role"],
    kinds: textKinds,
    contextHints: ["实习", "工作", "work", "experience"]
  },
  {
    path: "workExperiences.0.startDate",
    label: "实习开始时间",
    aliases: ["实习开始时间", "工作开始时间", "任职开始时间", "起止时间", "开始时间", "开始日期", "employment start date", "work start date", "start date"],
    kinds: dateKinds,
    contextHints: ["实习", "工作", "work"]
  },
  {
    path: "workExperiences.0.endDate",
    label: "实习结束时间",
    aliases: ["实习结束时间", "工作结束时间", "离职时间", "起止时间", "结束时间", "结束日期", "employment end date", "work end date", "end date"],
    kinds: dateKinds,
    contextHints: ["实习", "工作", "work"]
  },
  {
    path: "workExperiences.0.description",
    label: "工作描述",
    aliases: ["工作描述", "实习描述", "工作内容", "工作职责", "描述", "work description", "job description", "responsibilities", "description"],
    kinds: ["textarea", "contenteditable", "text"],
    contextHints: ["实习", "工作", "work"]
  },
  {
    path: "projects.0.name",
    label: "项目名称",
    aliases: ["项目名称", "项目名", "project name", "project title"],
    kinds: textKinds,
    contextHints: ["项目", "project"]
  },
  {
    path: "projects.0.role",
    label: "项目角色",
    aliases: ["项目角色", "承担角色", "项目职责", "project role", "role in project"],
    kinds: textKinds,
    contextHints: ["项目", "project"]
  },
  {
    path: "projects.0.startDate",
    label: "项目开始时间",
    aliases: ["项目开始时间", "项目开始日期", "起止时间", "开始时间", "开始日期", "project start date", "start date"],
    kinds: dateKinds,
    contextHints: ["项目", "project"]
  },
  {
    path: "projects.0.endDate",
    label: "项目结束时间",
    aliases: ["项目结束时间", "项目结束日期", "起止时间", "结束时间", "结束日期", "project end date", "end date"],
    kinds: dateKinds,
    contextHints: ["项目", "project"]
  },
  {
    path: "projects.0.description",
    label: "项目描述",
    aliases: ["项目描述", "项目内容", "项目介绍", "描述", "project description", "about the project", "description"],
    kinds: ["textarea", "contenteditable", "text"],
    contextHints: ["项目", "project"]
  },
  {
    path: "projects.0.outcome",
    label: "项目成果",
    aliases: ["项目成果", "项目产出", "项目成绩", "project outcome", "project result", "achievements"],
    kinds: ["textarea", "contenteditable", "text"],
    contextHints: ["项目", "project"]
  },
  {
    path: "projects.0.link",
    label: "项目链接",
    aliases: ["项目链接", "项目地址", "project link", "project url"],
    kinds: textKinds,
    contextHints: ["项目", "project"]
  },
  {
    path: "workSamples.0.link",
    label: "作品链接",
    aliases: ["作品链接", "作品地址", "作品网址", "portfolio link", "portfolio url", "work sample link"],
    kinds: textKinds,
    contextHints: ["作品", "portfolio", "work sample"]
  },
  {
    path: "workSamples.0.description",
    label: "作品描述",
    aliases: ["作品描述", "描述", "portfolio description", "work sample description", "description"],
    kinds: textKinds,
    contextHints: ["作品", "portfolio", "work sample"]
  },
  {
    path: "awards.0.name",
    label: "获奖名称",
    aliases: ["获奖名称", "奖项名称", "荣誉名称", "award name", "award title", "honor"],
    kinds: textKinds,
    contextHints: ["获奖", "奖项", "award", "honor"]
  },
  {
    path: "awards.0.date",
    label: "获奖时间",
    aliases: ["获奖时间", "获奖日期", "award date", "award time"],
    kinds: dateKinds,
    contextHints: ["获奖", "奖项", "award", "honor"]
  },
  {
    path: "awards.0.description",
    label: "获奖描述",
    aliases: ["获奖描述", "奖项描述", "描述", "award description", "description"],
    kinds: textKinds,
    contextHints: ["获奖", "奖项", "award", "honor"]
  },
  {
    path: "languages.0.language",
    label: "语言",
    aliases: ["语言", "语言种类", "外语", "language"],
    kinds: ["text", "select"],
    contextHints: ["语言能力", "外语", "language"]
  },
  {
    path: "languages.0.proficiency",
    label: "熟练程度",
    aliases: ["精通程度", "熟练程度", "语言水平", "proficiency", "language proficiency", "fluency"],
    kinds: ["text", "select", "radio"],
    contextHints: ["语言能力", "外语", "language"]
  },
  {
    path: "jobPreference.targetRoles",
    label: "目标岗位",
    aliases: ["目标岗位", "意向岗位", "应聘职位", "求职岗位", "target role", "target position", "desired position", "position applied for"],
    kinds: ["text", "select"]
  },
  {
    path: "jobPreference.preferredCities",
    label: "意向城市",
    aliases: ["意向城市", "期望城市", "工作地点", "期望工作地点", "preferred city", "preferred location", "work location"],
    kinds: ["text", "select"]
  },
  {
    path: "jobPreference.availableDate",
    label: "可到岗日期",
    aliases: ["可到岗日期", "到岗时间", "最早到岗时间", "available date", "earliest start date", "date available"],
    kinds: dateKinds
  },
  {
    path: "answers.selfIntroduction",
    label: "自我介绍",
    aliases: ["自我介绍", "个人简介", "self introduction", "about yourself", "personal statement"],
    kinds: ["textarea", "contenteditable", "text"]
  },
  {
    path: "answers.selfEvaluation",
    label: "自我评价",
    aliases: ["自我评价", "个人评价", "自我评述", "self evaluation", "self assessment"],
    kinds: ["textarea", "contenteditable", "text"]
  },
  {
    path: "answers.strengths",
    label: "个人优势",
    aliases: ["个人优势", "核心优势", "个人特长", "优势与特长", "strengths", "personal strengths", "key strengths"],
    kinds: ["textarea", "contenteditable", "text"]
  },
  {
    path: "answers.careerPlan",
    label: "职业规划",
    aliases: ["职业规划", "职业目标", "未来规划", "career plan", "career goals", "career objective"],
    kinds: ["textarea", "contenteditable", "text"]
  },
  ...supplementalCanonicalFields
];
