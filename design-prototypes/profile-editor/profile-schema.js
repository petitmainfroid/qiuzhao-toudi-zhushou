(function () {
  "use strict";

  const options = {
    gender: ["", "男", "女", "其他", "不愿透露"],
    identityType: ["", "身份证", "护照", "其他"],
    political: ["", "中共党员", "中共预备党员", "共青团员", "民主党派", "无党派人士", "群众", "其他"],
    yesNo: ["", "是", "否"],
    degree: ["", "专科", "本科", "硕士研究生", "博士研究生"],
    academicDegree: ["", "无", "学士", "硕士", "博士", "其他"],
    educationType: ["", "全日制", "非全日制", "其他"],
    language: ["", "中文（普通话）", "英语", "日语", "韩语", "法语", "德语", "西班牙语", "俄语", "阿拉伯语", "其他"],
    languageProficiency: ["", "母语", "精通", "熟练", "良好", "基础"],
    languageExam: ["", "CET-4（四级）", "CET-6（六级）", "TEM-4（专四）", "TEM-8（专八）", "IELTS（雅思）", "TOEFL（托福）", "TOEIC（托业）", "JLPT（日语能力测试）", "TOPIK（韩语能力考试）", "DELF / DALF（法语）", "TestDaF（德语）", "其他"],
    awardLevel: ["", "国际级", "国家级", "省级", "市级", "区县级", "校级", "院级", "行业或企业级", "其他"],
    awardCategory: ["", "竞赛获奖", "奖学金", "荣誉称号", "科研成果", "其他"],
    maritalStatus: ["", "未婚", "已婚", "离异", "丧偶", "其他", "不愿透露"],
    religion: ["", "无", "佛教", "道教", "基督教", "天主教", "伊斯兰教", "其他", "不愿透露"],
    workYears: ["", "应届生", "1年以下", "1–3年", "3–5年", "5–10年", "10年以上"],
    salaryPeriod: ["", "月薪", "年薪", "日薪", "时薪"],
    currency: ["", "人民币 CNY", "美元 USD", "港币 HKD", "欧元 EUR", "其他"],
    campusLevel: ["", "校级", "院级", "班级", "社团", "其他"],
    participationType: ["", "全职", "兼职", "志愿服务", "社会实践", "其他"],
    patentType: ["", "发明专利", "实用新型专利", "外观设计专利", "其他"],
    patentStatus: ["", "申请中", "已公开", "已授权", "已失效", "其他"],
    relationship: ["", "父亲", "母亲", "配偶", "兄弟姐妹", "子女", "其他"]
  };

  const sections = [
    {
      id: "resume",
      title: "常用简历",
      kicker: "附件与资料导入",
      description: "保存用于招聘网站上传的 PDF，与从简历中导入档案信息是两个独立动作。",
      uploads: [
        { id: "reusable-resume", title: "设置常用简历 PDF", description: "后续投递时选择这份文件作为附件；正式产品会把 PDF 保存在本机。", accept: ".pdf", note: "仅 PDF · 本原型不保存文件内容" },
        { id: "resume-import", title: "从简历导入档案信息", description: "解析后先进入可编辑草稿，不会自动覆盖已经保存的字段。", accept: ".pdf,.doc,.docx,.md", note: "PDF / DOC / DOCX / MD · 仅用于解析" }
      ],
      fields: []
    },
    {
      id: "basic",
      title: "基本信息",
      kicker: "身份与联系方式",
      description: "常用身份、联系方式和结构化所在地；敏感字段在网页写入时仍需确认。",
      fields: [
        ["姓名", "basic.fullName", "text", "请输入姓名", "core"],
        ["常用英文名", "basic.preferredName", "text", "请输入英文名或拼音"],
        ["性别", "basic.gender", "select", options.gender],
        ["出生日期", "basic.birthDate", "date"],
        ["国籍（地区）", "basic.nationality", "text", "例如：中国"],
        ["证件类型", "basic.identityDocumentType", "select", options.identityType, "sensitive"],
        ["证件号码", "basic.identityDocumentNumber", "password", "请输入证件号码", "sensitive wide"],
        ["手机号码", "basic.phone", "tel", "请输入含区号的手机号码", "core"],
        ["电子邮箱", "basic.email", "email", "请输入电子邮箱", "core"],
        ["现居省份", "basic.currentProvince", "text", "请输入省或直辖市"],
        ["现居城市", "basic.currentCity", "text", "请输入城市", "core"],
        ["现居区县", "basic.currentDistrict", "text", "请输入区县"],
        ["籍贯", "basic.hometown", "text", "请输入籍贯"],
        ["家庭所在省份", "basic.homeProvince", "text", "请输入省或直辖市", "sensitive"],
        ["家庭所在城市", "basic.homeCity", "text", "请输入城市", "sensitive"],
        ["家庭所在区县", "basic.homeDistrict", "text", "请输入区县", "sensitive"],
        ["民族", "basic.ethnicity", "text", "请输入民族", "sensitive"],
        ["政治面貌", "basic.politicalStatus", "select", options.political, "sensitive"],
        ["婚姻状况", "basic.maritalStatus", "select", options.maritalStatus, "sensitive"],
        ["宗教信仰", "basic.religion", "select", options.religion, "sensitive"],
        ["身高（cm）", "basic.heightCm", "number", "例如：175", "sensitive"],
        ["体重（kg）", "basic.weightKg", "number", "例如：65", "sensitive"],
        ["兴趣爱好", "basic.hobbies", "textarea", "填写真实、可复用的兴趣爱好", "wide"]
      ]
    },
    {
      id: "preference",
      title: "求职期望",
      kicker: "长期偏好与投递上下文",
      description: "职位、行业和城市支持多值；内推和信息来源随每次申请变化。",
      fields: [
        ["目标岗位", "jobPreference.targetRoles", "text", "多个岗位请用顿号分隔", "core wide"],
        ["期望行业", "jobPreference.targetIndustries", "text", "多个行业请用顿号分隔"],
        ["意向城市", "jobPreference.preferredCities", "text", "多个城市请用顿号分隔", "core"],
        ["期望薪资下限", "jobPreference.expectedSalaryMin", "number", "请输入数字"],
        ["期望薪资上限", "jobPreference.expectedSalaryMax", "number", "请输入数字"],
        ["薪资币种", "jobPreference.salaryCurrency", "select", options.currency],
        ["薪资周期", "jobPreference.salaryPeriod", "select", options.salaryPeriod],
        ["当前薪资", "jobPreference.currentSalary", "text", "应届生可留空"],
        ["可到岗日期", "jobPreference.availableDate", "date"],
        ["工作经验", "jobPreference.workYears", "select", options.workYears],
        ["是否接受岗位调剂", "jobPreference.acceptsAdjustment", "select", options.yesNo],
        ["是否内推", "jobPreference.internalReferral", "select", options.yesNo, "contextual", "随公司和岗位变化，投递前确认"],
        ["招聘信息来源", "jobPreference.recruitmentSource", "text", "例如：公司官网、校园宣讲", "contextual wide", "随本次申请变化，不参与默认填写"]
      ]
    },
    {
      id: "education",
      title: "教育经历",
      kicker: "院校、专业与成绩",
      description: "学历层级与学位分开保存；从最高学历开始添加。",
      repeatable: true,
      baseline: true,
      fields: [
        ["学校名称", "education.school", "text", "请输入学校", "core"],
        ["学院名称", "education.college", "text", "请输入学院"],
        ["学历层级", "education.degree", "select", options.degree, "core"],
        ["学位", "education.academicDegree", "select", options.academicDegree],
        ["学历类型", "education.educationType", "select", options.educationType, "core"],
        ["专业分类", "education.majorCategory", "text", "请输入专业分类"],
        ["专业", "education.major", "text", "请输入专业", "core"],
        ["学校所在省份", "education.schoolProvince", "text", "请输入省或直辖市"],
        ["学校所在城市", "education.schoolCity", "text", "请输入城市"],
        ["入学时间", "education.startDate", "month"],
        ["毕业时间", "education.endDate", "month"],
        ["当前状态", "education.currentStatus", "select", ["", "在读", "已毕业", "肄业", "其他"]],
        ["GPA", "education.gpa", "text", "例如：3.7"],
        ["GPA 满分", "education.gpaScale", "text", "例如：4.0"],
        ["专业排名", "education.ranking", "text", "例如：前 10%"],
        ["专业主要课程", "education.mainCourses", "textarea", "填写与目标岗位相关的课程", "wide"],
        ["专业描述", "education.description", "textarea", "补充培养方向或毕业设计", "wide"]
      ]
    },
    {
      id: "career",
      title: "实习与工作",
      kicker: "分别保存两类职业经历",
      description: "招聘网站经常分别提供实习经历和工作经历，因此这里不混用同一条记录。",
      groups: [
        {
          id: "workExperiences",
          title: "实习经历",
          description: "校招和实习招聘常用；与当前正式档案路径保持一致。",
          repeatable: true,
          fields: [
            ["公司名称", "workExperiences.company", "text", "请输入公司", "core"],
            ["行业类别", "workExperiences.industry", "text", "请输入行业"],
            ["所在部门", "workExperiences.department", "text", "请输入部门"],
            ["岗位名称", "workExperiences.role", "text", "请输入岗位", "core"],
            ["工作地点", "workExperiences.location", "text", "请输入城市"],
            ["开始时间", "workExperiences.startDate", "month"],
            ["结束时间", "workExperiences.endDate", "month"],
            ["工作描述", "workExperiences.description", "textarea", "描述职责、方法与协作", "core wide"],
            ["实习成果", "workExperiences.achievement", "textarea", "描述可验证的成果", "wide"]
          ]
        },
        {
          id: "employmentExperiences",
          title: "工作经历",
          description: "用于正式全职、兼职或创业经历；属于后续正式档案扩展候选。",
          repeatable: true,
          fields: [
            ["单位名称", "employmentExperiences.company", "text", "请输入单位", "core"],
            ["行业类别", "employmentExperiences.industry", "text", "请输入行业"],
            ["所在部门", "employmentExperiences.department", "text", "请输入部门"],
            ["岗位名称", "employmentExperiences.role", "text", "请输入岗位", "core"],
            ["用工类型", "employmentExperiences.employmentType", "select", ["", "全职", "兼职", "创业", "其他"]],
            ["工作地点", "employmentExperiences.location", "text", "请输入城市"],
            ["开始时间", "employmentExperiences.startDate", "month"],
            ["结束时间", "employmentExperiences.endDate", "month"],
            ["工作描述", "employmentExperiences.description", "textarea", "描述职责、方法与协作", "core wide"],
            ["工作成果", "employmentExperiences.achievement", "textarea", "描述可验证的成果", "wide"]
          ]
        }
      ]
    },
    {
      id: "projects",
      title: "项目经历",
      kicker: "问题、行动与结果",
      description: "项目经历与实习分开保存，网页缺少项目条目时由填写流程按需创建。",
      repeatable: true,
      fields: [
        ["项目名称", "projects.name", "text", "请输入项目名称", "core"],
        ["担任角色", "projects.role", "text", "请输入角色", "core"],
        ["开始日期", "projects.startDate", "month"],
        ["结束日期", "projects.endDate", "month"],
        ["项目链接", "projects.link", "url", "https://", "wide"],
        ["项目描述", "projects.description", "textarea", "说明项目背景和目标", "core wide"],
        ["项目中职责", "projects.responsibilities", "textarea", "说明本人负责的部分", "wide"],
        ["项目成果", "projects.outcome", "textarea", "说明结果和影响", "wide"]
      ]
    },
    {
      id: "workSamples",
      title: "作品",
      kicker: "可访问的能力证明",
      description: "保存作品链接与说明；作品附件仍由用户在招聘页面单独确认。",
      repeatable: true,
      fields: [
        ["作品链接", "workSamples.link", "url", "https://", "core wide"],
        ["作品说明", "workSamples.description", "textarea", "说明作品内容和本人贡献", "core wide"]
      ]
    },
    {
      id: "campus",
      title: "校园经历",
      kicker: "职务与活动分别建档",
      description: "学生干部经历和校园活动的字段含义不同，在同一章节中分别维护。",
      groups: [
        {
          id: "campusLeadership",
          title: "在校职务",
          description: "学生组织、班级、学院或学校层面的正式职务。",
          repeatable: true,
          fields: [
            ["职务名称", "campusLeadership.title", "text", "请输入职务", "core"],
            ["干部级别", "campusLeadership.level", "select", options.campusLevel],
            ["组织或项目名称", "campusLeadership.organization", "text", "请输入名称", "core"],
            ["开始时间", "campusLeadership.startDate", "month"],
            ["结束时间", "campusLeadership.endDate", "month"],
            ["职务描述", "campusLeadership.description", "textarea", "描述职责与成果", "core wide"]
          ]
        },
        {
          id: "campusActivities",
          title: "校园活动",
          description: "社会实践、志愿活动、社团项目及其他校内外活动。",
          repeatable: true,
          fields: [
            ["活动名称", "campusActivities.name", "text", "请输入活动", "core"],
            ["担任职务", "campusActivities.role", "text", "请输入职务"],
            ["实践方式", "campusActivities.participationType", "select", options.participationType],
            ["开始时间", "campusActivities.startDate", "month"],
            ["结束时间", "campusActivities.endDate", "month"],
            ["活动内容", "campusActivities.description", "textarea", "描述行动与成果", "core wide"]
          ]
        }
      ]
    },
    {
      id: "awards",
      title: "获奖经历",
      kicker: "荣誉与证明",
      description: "奖项类别、级别和等级分别记录，避免“一等奖”和“国家级”混用。",
      repeatable: true,
      fields: [
        ["奖项名称", "awards.name", "text", "请输入奖项", "core"],
        ["奖项类别", "awards.category", "select", options.awardCategory],
        ["获奖级别", "awards.level", "select", options.awardLevel],
        ["奖项等级", "awards.grade", "text", "例如：一等奖、金奖"],
        ["颁发机构", "awards.issuer", "text", "请输入颁发机构"],
        ["获奖时间", "awards.date", "month"],
        ["奖项描述", "awards.description", "textarea", "补充评选范围或成绩", "wide"]
      ]
    },
    {
      id: "languages",
      title: "语言能力",
      kicker: "实际能力与考试成绩分开",
      description: "一门语言可以对应多项考试；熟练程度不会再与 CET、IELTS 等考试混在一起。",
      groups: [
        {
          id: "languages",
          title: "语言技能",
          description: "描述实际使用能力，不填写考试名称。",
          repeatable: true,
          fields: [
            ["语言", "languages.language", "select", options.language, "core"],
            ["综合熟练程度", "languages.proficiency", "select", options.languageProficiency, "core"],
            ["听说能力", "languages.listeningSpeaking", "select", options.languageProficiency],
            ["读写能力", "languages.readingWriting", "select", options.languageProficiency]
          ]
        },
        {
          id: "languageExams",
          title: "语言考试",
          description: "每项考试独立记录成绩、日期和有效期。",
          repeatable: true,
          fields: [
            ["对应语言", "languageExams.language", "select", options.language, "core"],
            ["考试类型", "languageExams.examType", "select", options.languageExam, "core"],
            ["成绩", "languageExams.score", "text", "例如：CET-6 520 / IELTS 7.0", "core"],
            ["考试日期", "languageExams.examDate", "date"],
            ["有效期至", "languageExams.validUntil", "date"],
            ["证书编号", "languageExams.certificateNumber", "text", "选填"]
          ]
        }
      ]
    },
    {
      id: "certificates",
      title: "证书信息",
      kicker: "资质与技能证明",
      description: "语言考试不在这里重复保存；这里记录职业资格和技能证书。",
      repeatable: true,
      fields: [
        ["证书名称", "certificates.name", "text", "请输入证书", "core"],
        ["颁发机构", "certificates.issuingOrganization", "text", "请输入颁发机构"],
        ["证书编号", "certificates.credentialNumber", "text", "选填"],
        ["获得时间", "certificates.date", "month"],
        ["有效期至", "certificates.validUntil", "month"],
        ["证书描述", "certificates.description", "textarea", "补充证书等级或适用范围", "wide"]
      ]
    },
    {
      id: "research",
      title: "论文与专利",
      kicker: "两种不同的科研记录",
      description: "论文和专利分别保存各自需要的刊物、作者顺序、编号与状态。",
      groups: [
        {
          id: "publications",
          title: "论文期刊",
          description: "保存刊物、作者顺序、影响因子与公开链接。",
          repeatable: true,
          fields: [
            ["论文名称", "publications.title", "text", "请输入论文名称", "core"],
            ["刊物名称", "publications.journal", "text", "请输入刊物", "core"],
            ["发表时间", "publications.publishedAt", "month"],
            ["刊物层级", "publications.tier", "text", "例如：SCI 一区、中文核心"],
            ["论文作者顺序", "publications.authorPosition", "text", "例如：第一作者"],
            ["期刊影响因子", "publications.impactFactor", "text", "选填"],
            ["论文链接", "publications.link", "url", "https://", "wide"],
            ["论文描述", "publications.description", "textarea", "说明本人贡献", "wide"]
          ]
        },
        {
          id: "patents",
          title: "专利成果",
          description: "保存专利编号、类型、状态和本人贡献。",
          repeatable: true,
          fields: [
            ["专利名称", "patents.name", "text", "请输入专利名称", "core"],
            ["专利编号", "patents.number", "text", "请输入申请号或授权号", "core"],
            ["专利类型", "patents.type", "select", options.patentType],
            ["专利状态", "patents.status", "select", options.patentStatus],
            ["专利成果", "patents.description", "textarea", "说明本人贡献", "wide"]
          ]
        }
      ]
    },
    {
      id: "family",
      title: "家庭与紧急联系人",
      kicker: "敏感第三方信息",
      description: "仅在招聘表明确要求时使用；保存前应获得联系人同意，网页写入仍需确认。",
      sensitive: true,
      groups: [
        {
          id: "emergencyContact",
          title: "紧急联系人",
          description: "紧急联系人独立于家庭成员列表。",
          fields: [
            ["紧急联系人", "basic.emergencyContactName", "text", "请输入联系人", "sensitive"],
            ["紧急联系人电话", "basic.emergencyContactPhone", "tel", "请输入联系电话", "sensitive"]
          ]
        },
        {
          id: "familyMembers",
          title: "家庭成员",
          description: "家庭成员属于第三方高敏信息，可按招聘表要求选择性填写。",
          repeatable: true,
          fields: [
            ["姓名", "familyMembers.name", "text", "请输入姓名", "sensitive core"],
            ["与本人关系", "familyMembers.relationship", "select", options.relationship, "sensitive core"],
            ["联系电话", "familyMembers.phone", "tel", "请输入含区号的电话", "sensitive"],
            ["出生日期", "familyMembers.birthDate", "date", "", "sensitive"],
            ["工作单位", "familyMembers.employer", "text", "请输入单位", "sensitive"],
            ["职务", "familyMembers.role", "text", "请输入职务", "sensitive"],
            ["所在地", "familyMembers.location", "text", "请输入省、市、区县", "sensitive"],
            ["政治面貌", "familyMembers.politicalStatus", "select", options.political, "sensitive"]
          ]
        }
      ]
    },
    {
      id: "answers",
      title: "常用问答",
      kicker: "开放题事实素材",
      description: "保存可复用的事实基础，投递时根据公司、岗位和字数限制再次检查。",
      fields: [
        ["自我介绍", "answers.selfIntroduction", "textarea", "用简洁事实介绍自己", "wide"],
        ["自我评价", "answers.selfEvaluation", "textarea", "用事实支撑评价，避免空泛表述", "wide"],
        ["个人优势", "answers.strengths", "textarea", "填写与目标岗位相关的优势", "wide"],
        ["职业规划", "answers.careerPlan", "textarea", "填写阶段目标与行动", "wide"]
      ]
    }
  ];

  window.QIUZHAO_PROFILE_PROTOTYPE_SCHEMA = { sections };
})();
