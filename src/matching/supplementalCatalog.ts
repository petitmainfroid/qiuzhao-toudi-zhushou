import type { CanonicalField } from "./catalog";
import type { ControlKind } from "./types";

const text: ControlKind[] = ["text", "textarea", "contenteditable"];
const choice: ControlKind[] = ["text", "select", "radio"];
const date: ControlKind[] = ["date", "month", "date-range", "text"];

function field(
  path: string,
  label: string,
  aliases: string[],
  kinds: ControlKind[] = text,
  options: Pick<CanonicalField, "sensitive" | "contextHints"> = {}
): CanonicalField {
  return { path, label, aliases, kinds, ...options };
}

export const supplementalCanonicalFields: CanonicalField[] = [
  field("basic.ethnicity", "民族", ["民族", "ethnicity", "ethnic group"], choice, { sensitive: true }),
  field("basic.maritalStatus", "婚姻状况", ["婚姻状况", "婚姻状态", "marital status"], choice, { sensitive: true }),
  field("basic.religion", "宗教信仰", ["宗教信仰", "宗教", "religion"], choice, { sensitive: true }),
  field("basic.heightCm", "身高", ["身高", "身高(cm)", "height"], ["number", "text"], { sensitive: true }),
  field("basic.weightKg", "体重", ["体重", "体重(kg)", "weight"], ["number", "text"], { sensitive: true }),
  field("basic.homeCity", "家庭所在城市", ["家庭所在城市", "家庭城市", "家庭所在地城市", "family city"], ["text", "select"], { sensitive: true }),
  field("basic.homeDistrict", "家庭所在区县", ["家庭所在区县", "家庭区县", "家庭所在地辖区", "family district"], ["text", "select"], { sensitive: true }),
  field("basic.schoolCity", "学校所在城市", ["学校所在城市", "院校所在城市", "school city", "university city"], ["text", "select"]),
  field("basic.schoolDistrict", "学校所在区县", ["学校所在区县", "院校所在区县", "school district", "university district"], ["text", "select"]),
  field("basic.currentProvince", "现居省份", ["现居省份", "当前省份", "current province"], ["text", "select"]),
  field("basic.currentDistrict", "现居区县", ["现居区县", "当前区县", "current district"], ["text", "select"]),
  field("basic.homeProvince", "家庭所在省份", ["家庭所在省份", "家庭省份", "family province"], ["text", "select"], { sensitive: true }),
  field("basic.emergencyContactName", "紧急联系人姓名", ["紧急联系人", "紧急联系人姓名", "emergency contact", "emergency contact name"], text, { sensitive: true }),
  field("basic.emergencyContactPhone", "紧急联系人电话", ["紧急联系人电话", "紧急联系电话", "emergency contact phone"], ["tel", "text"], { sensitive: true }),
  field("basic.hobbies", "兴趣爱好", ["兴趣爱好", "爱好", "个人爱好", "hobbies", "interests"]),
  field("basic.identityDocumentType", "证件类型", ["证件类型", "身份证件类型", "个人证件类型", "identity document type", "id type"], choice, { sensitive: true }),
  field("basic.identityDocumentNumber", "证件号码", ["证件号码", "身份证号", "身份证号码", "护照号码", "identity document number", "identity number", "id card number", "passport number"], text, { sensitive: true }),

  field("education.0.college", "学院名称", ["学院名称", "学院", "院系", "college", "faculty"], text, { contextHints: ["教育", "院校", "education"] }),
  field("education.0.majorCategory", "专业分类", ["专业分类", "专业类别", "学科门类", "major category", "discipline"], ["text", "select"], { contextHints: ["教育", "专业", "education"] }),
  field("education.0.mainCourses", "专业主要课程", ["专业主要课程", "主修课程", "主要课程", "main courses", "relevant coursework"], text, { contextHints: ["教育", "专业", "education"] }),
  field("education.0.description", "专业描述", ["专业描述", "教育描述", "在校情况", "education description"], text, { contextHints: ["教育", "专业", "education"] }),
  field("education.0.academicDegree", "学位", ["学位", "academic degree"], ["text", "select"], { contextHints: ["教育", "院校", "education"] }),
  field("education.0.schoolProvince", "学校所在省份", ["学校所在省份", "院校所在省份", "school province"], ["text", "select"], { contextHints: ["教育", "院校", "education"] }),
  field("education.0.schoolCity", "学校所在城市", ["学校所在城市", "院校所在城市", "school city"], ["text", "select"], { contextHints: ["教育", "院校", "education"] }),
  field("education.0.currentStatus", "教育当前状态", ["当前状态", "就读状态", "education status"], choice, { contextHints: ["教育", "院校", "education"] }),
  field("education.0.gpaScale", "GPA 满分", ["GPA满分", "绩点满分", "gpa scale"], ["text", "number"], { contextHints: ["教育", "成绩", "education"] }),

  field("workExperiences.0.industry", "行业类别", ["行业类别", "所属行业", "公司行业", "industry"], ["text", "select"], { contextHints: ["实习", "工作", "work"] }),
  field("workExperiences.0.location", "工作地点", ["工作地点", "实习地点", "任职地点", "work location", "job location"], ["text", "select"], { contextHints: ["实习", "工作", "work"] }),
  field("workExperiences.0.achievement", "实习成果", ["实习成果", "工作成果", "主要业绩", "work achievements", "internship outcome"], text, { contextHints: ["实习", "工作", "work"] }),
  field("employmentExperiences.0.company", "工作单位", ["单位名称", "公司名称", "工作单位", "employer"], text, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.industry", "工作行业", ["行业类别", "所属行业", "industry"], ["text", "select"], { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.department", "工作部门", ["所在部门", "部门", "department"], text, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.role", "工作岗位", ["岗位名称", "职位名称", "position"], text, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.employmentType", "用工类型", ["用工类型", "工作类型", "employment type"], choice, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.location", "工作地点", ["工作地点", "任职地点", "work location"], ["text", "select"], { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.startDate", "工作开始时间", ["开始时间", "入职时间", "employment start"], date, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.endDate", "工作结束时间", ["结束时间", "离职时间", "employment end"], date, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.description", "工作描述", ["工作描述", "工作内容", "employment description"], text, { contextHints: ["工作经历", "全职", "employment"] }),
  field("employmentExperiences.0.achievement", "工作成果", ["工作成果", "主要业绩", "employment achievement"], text, { contextHints: ["工作经历", "全职", "employment"] }),
  field("projects.0.responsibilities", "项目中职责", ["项目中职责", "项目职责", "负责内容", "project responsibilities", "responsibilities"], text, { contextHints: ["项目", "project"] }),

  field("awards.0.category", "奖项类别", ["奖项类别", "获奖类别", "award category"], ["text", "select"], { contextHints: ["获奖", "奖项", "award"] }),
  field("awards.0.level", "奖项级别", ["奖项级别", "获奖级别", "award level"], ["text", "select"], { contextHints: ["获奖", "奖项", "award"] }),
  field("awards.0.grade", "奖项等级", ["奖项等级", "获奖等级", "名次", "award grade", "prize level"], ["text", "select"], { contextHints: ["获奖", "奖项", "award"] }),
  field("awards.0.issuer", "颁发机构", ["颁发机构", "授予机构", "award issuer"], text, { contextHints: ["获奖", "奖项", "award"] }),

  field("languages.0.listeningSpeaking", "听说能力", ["听说能力", "口语能力", "listening and speaking"], choice, { contextHints: ["语言", "英语", "language"] }),
  field("languages.0.readingWriting", "读写能力", ["读写能力", "阅读写作能力", "reading and writing"], choice, { contextHints: ["语言", "英语", "language"] }),
  field("languageExams.0.language", "考试对应语言", ["对应语言", "考试语种", "exam language"], ["text", "select"], { contextHints: ["语言考试", "英语考试", "language exam"] }),
  field("languageExams.0.examType", "语言考试类型", ["英语水平", "考试类型", "语言考试", "语言证书", "英语证书", "language qualification", "language test"], ["text", "select"], { contextHints: ["语言考试", "英语考试", "language exam"] }),
  field("languageExams.0.score", "语言考试成绩", ["语言成绩", "考试成绩", "英语成绩", "language score", "test score"], ["text", "number"], { contextHints: ["语言考试", "英语考试", "language exam"] }),
  field("languageExams.0.examDate", "语言考试日期", ["考试日期", "考试时间", "language exam date"], date, { contextHints: ["语言考试", "英语考试", "language exam"] }),
  field("languageExams.0.validUntil", "语言成绩有效期", ["有效期至", "成绩有效期", "valid until"], date, { contextHints: ["语言考试", "英语考试", "language exam"] }),
  field("languageExams.0.certificateNumber", "语言证书编号", ["语言证书编号", "成绩单编号", "certificate number"], text, { contextHints: ["语言考试", "英语考试", "language exam"] }),

  field("jobPreference.targetIndustries", "期望行业", ["期望行业", "意向行业", "目标行业", "preferred industry", "target industry"], ["text", "select"]),
  field("jobPreference.expectedSalary", "期望薪资", ["期望薪资", "期望月薪", "薪资期望", "expected salary", "salary expectation"], ["text", "number", "select"]),
  field("jobPreference.currentSalary", "当前薪资", ["当前薪资", "目前薪资", "现薪", "current salary"], ["text", "number"]),
  field("jobPreference.expectedSalaryMin", "期望薪资下限", ["期望薪资下限", "最低期望薪资", "minimum expected salary"], ["text", "number"]),
  field("jobPreference.expectedSalaryMax", "期望薪资上限", ["期望薪资上限", "最高期望薪资", "maximum expected salary"], ["text", "number"]),
  field("jobPreference.salaryCurrency", "薪资币种", ["薪资币种", "币种", "salary currency"], choice),
  field("jobPreference.salaryPeriod", "薪资周期", ["薪资周期", "薪资类型", "salary period"], choice),
  field("jobPreference.acceptsAdjustment", "是否接受岗位调剂", ["是否接受岗位调剂", "是否接受调剂", "是否服从调配", "accept adjustment", "accept reassignment"], choice),
  field("jobPreference.internalReferral", "是否内推", ["是否内推", "是否员工推荐", "internal referral", "employee referral"], choice),
  field("jobPreference.recruitmentSource", "招聘信息来源", ["招聘信息来源", "了解招聘信息的渠道", "获知渠道", "recruitment source", "how did you hear"], ["text", "select"]),
  field("jobPreference.workYears", "工作经验", ["工作经验", "工作年限", "从业年限", "years of experience", "work experience"], choice),

  field("campusLeadership.0.title", "在校职务名称", ["职务名称", "在校职务", "学生干部职务", "campus title"], text, { contextHints: ["在校职务", "学生干部", "campus"] }),
  field("campusLeadership.0.level", "学生干部级别", ["学生干部级别", "职务级别", "干部级别", "leadership level"], choice, { contextHints: ["在校职务", "学生干部", "campus"] }),
  field("campusLeadership.0.organization", "组织或活动名称", ["项目/活动名称", "组织名称", "社团名称", "organization name"], text, { contextHints: ["在校职务", "学生干部", "campus"] }),
  field("campusLeadership.0.startDate", "在校职务开始时间", ["任职开始时间", "职务开始时间", "开始时间", "leadership start date"], date, { contextHints: ["在校职务", "学生干部", "campus"] }),
  field("campusLeadership.0.endDate", "在校职务结束时间", ["任职结束时间", "职务结束时间", "结束时间", "leadership end date"], date, { contextHints: ["在校职务", "学生干部", "campus"] }),
  field("campusLeadership.0.description", "在校职务描述", ["职务描述", "职务内容", "主要职责", "leadership description"], text, { contextHints: ["在校职务", "学生干部", "campus"] }),

  field("campusActivities.0.name", "校园活动名称", ["活动名称", "实践名称", "校园活动名称", "activity name"], text, { contextHints: ["校园活动", "社会实践", "activity"] }),
  field("campusActivities.0.role", "校园活动职务", ["担任职务", "活动角色", "实践角色", "activity role"], text, { contextHints: ["校园活动", "社会实践", "activity"] }),
  field("campusActivities.0.participationType", "实践方式", ["实践方式", "参与方式", "participation type"], choice, { contextHints: ["校园活动", "社会实践", "activity"] }),
  field("campusActivities.0.startDate", "校园活动开始时间", ["活动开始时间", "实践开始时间", "开始时间", "activity start date"], date, { contextHints: ["校园活动", "社会实践", "activity"] }),
  field("campusActivities.0.endDate", "校园活动结束时间", ["活动结束时间", "实践结束时间", "结束时间", "activity end date"], date, { contextHints: ["校园活动", "社会实践", "activity"] }),
  field("campusActivities.0.description", "校园活动内容", ["活动内容", "实践描述", "活动描述", "activity description"], text, { contextHints: ["校园活动", "社会实践", "activity"] }),

  field("familyMembers.0.name", "家庭成员姓名", ["家庭成员姓名", "家属姓名", "family member name"], text, { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.relationship", "与本人关系", ["与本人关系", "家庭关系", "relationship"], choice, { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.employer", "家庭成员工作单位", ["工作单位", "家庭成员单位", "employer"], text, { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.phone", "家庭成员联系电话", ["家庭成员联系电话", "家属电话", "family phone"], ["tel", "text"], { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.role", "家庭成员职务", ["职务", "家庭成员职务", "family member role"], text, { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.birthDate", "家庭成员出生日期", ["家庭成员出生日期", "家属生日", "family birth date"], date, { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.location", "家庭所在地", ["家庭所在地", "家庭地址", "family location"], ["text", "select"], { sensitive: true, contextHints: ["家庭成员", "family"] }),
  field("familyMembers.0.politicalStatus", "家庭成员政治面貌", ["家庭成员政治面貌", "家属政治面貌", "family political status"], choice, { sensitive: true, contextHints: ["家庭成员", "family"] }),

  field("certificates.0.name", "证书名称", ["证书名称", "资质名称", "certificate name"], text, { contextHints: ["证书", "资质", "certificate"] }),
  field("certificates.0.date", "证书获得时间", ["获得时间", "证书时间", "certificate date"], date, { contextHints: ["证书", "资质", "certificate"] }),
  field("certificates.0.description", "证书描述", ["证书描述", "证书说明", "certificate description"], text, { contextHints: ["证书", "资质", "certificate"] }),
  field("certificates.0.issuingOrganization", "证书颁发机构", ["颁发机构", "发证机构", "issuing organization"], text, { contextHints: ["证书", "资质", "certificate"] }),
  field("certificates.0.credentialNumber", "证书编号", ["证书编号", "资质编号", "credential number"], text, { contextHints: ["证书", "资质", "certificate"] }),
  field("certificates.0.validUntil", "证书有效期", ["有效期至", "证书有效期", "certificate valid until"], date, { contextHints: ["证书", "资质", "certificate"] }),

  field("publications.0.title", "论文名称", ["论文名称", "论文题目", "paper title", "publication title"], text, { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.journal", "刊物名称", ["刊物名称", "期刊名称", "journal name", "publication venue"], text, { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.publishedAt", "论文发表时间", ["发表时间", "论文发表时间", "publication date"], date, { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.tier", "刊物层级", ["刊物层级", "期刊级别", "journal tier"], choice, { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.authorPosition", "论文作者顺序", ["论文作者", "作者顺序", "author position"], choice, { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.impactFactor", "期刊影响因子", ["期刊影响因子", "影响因子", "impact factor"], ["text", "number"], { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.link", "论文链接", ["论文链接", "论文地址", "publication link", "doi url"], text, { contextHints: ["论文", "期刊", "publication"] }),
  field("publications.0.description", "论文描述", ["论文描述", "论文摘要", "publication description"], text, { contextHints: ["论文", "期刊", "publication"] }),

  field("patents.0.name", "专利名称", ["专利名称", "patent name", "patent title"], text, { contextHints: ["专利", "patent"] }),
  field("patents.0.number", "专利编号", ["专利编号", "专利号", "patent number"], text, { contextHints: ["专利", "patent"] }),
  field("patents.0.type", "专利类型", ["专利类型", "patent type"], choice, { contextHints: ["专利", "patent"] }),
  field("patents.0.status", "专利状态", ["专利状态", "申请状态", "patent status"], choice, { contextHints: ["专利", "patent"] }),
  field("patents.0.description", "专利成果", ["专利成果", "专利描述", "patent description"], text, { contextHints: ["专利", "patent"] })
];
