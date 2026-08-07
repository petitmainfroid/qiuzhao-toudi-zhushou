import { describe, expect, it } from "vitest";
import { createEmptyProfile, createProjectRecord } from "../domain/profile";
import { mergeResumeIntoProfile, parseResumeText } from "./parseResume";

const REALISTIC_CAMPUS_RESUME = `
林晓舟
手机：138 0013 8000 | 邮箱：lin.xiaozhou@example.com
性别：女
出生日期：2003年06月18日
国籍：中国
现居城市：上海
籍贯：江苏苏州
政治面貌：中共党员
求职意向：算法工程师
意向城市：上海、北京
身份证号：320000200306180000

教育经历
2022.09 - 2026.06 上海交通大学 计算机科学与技术 本科 统招全日制
GPA：3.82/4.0；专业排名：前 10%
2020.09 - 2022.06 苏州中学 高中

实习经历
2025.06 - 2025.09 星云科技有限公司 算法工程师实习生
部门：推荐系统组
构建离线评估流程，将实验准备时间缩短 35%。
与产品、后端协作完成灰度验证。

项目经历
2024.10 - 2025.03 校园招聘匹配系统 项目负责人
设计可解释的规则匹配与置信度分层。
项目成果：覆盖 40 类中英文招聘字段。
https://example.test/campus-matcher

作品
https://portfolio.example.test 个人项目与技术文章

获奖经历
2025.05 全国大学生计算机设计大赛一等奖

语言能力
英语 CET-6 无障碍沟通

技能特长
TypeScript、Python、数据分析；擅长把模糊需求拆成可验证规则。

自我评价
重视事实与边界，习惯用测试验证结果。

职业规划
持续深耕推荐系统与开发者工具。
`;

describe("resume parser", () => {
  it("does not infer an identity number from an unlabelled numeric token", () => {
    const parsed = parseResumeText(`匿名候选人\n编号 320000200306180000\n教育经历\n2022.09 - 2026.06 测试大学 软件工程 本科`);
    expect(parsed.profile.basic.identityDocumentType).toBe("");
    expect(parsed.profile.basic.identityDocumentNumber).toBe("");
  });

  it("maps a realistic Chinese campus resume into the existing profile schema", () => {
    const parsed = parseResumeText(REALISTIC_CAMPUS_RESUME);

    expect(parsed.profile.basic).toMatchObject({
      fullName: "林晓舟",
      gender: "女",
      birthDate: "2003-06-18",
      phone: "13800138000",
      email: "lin.xiaozhou@example.com",
      nationality: "中国",
      currentCity: "上海",
      hometown: "江苏苏州",
      politicalStatus: "中共党员",
      identityDocumentType: "居民身份证",
      identityDocumentNumber: "320000200306180000"
    });
    expect(parsed.profile.education).toHaveLength(2);
    expect(parsed.profile.education[0]).toMatchObject({
      school: "上海交通大学",
      degree: "本科",
      educationType: "统招全日制",
      major: "计算机科学与技术",
      startDate: "2022-09",
      endDate: "2026-06"
    });
    expect(parsed.profile.workExperiences[0]).toMatchObject({
      company: "星云科技有限公司",
      role: "算法工程师实习生",
      department: "推荐系统组",
      startDate: "2025-06",
      endDate: "2025-09"
    });
    expect(parsed.profile.workExperiences[0].description).toContain("缩短 35%");
    expect(parsed.profile.projects[0]).toMatchObject({
      name: "校园招聘匹配系统",
      role: "项目负责人",
      outcome: "覆盖 40 类中英文招聘字段。",
      link: "https://example.test/campus-matcher"
    });
    expect(parsed.profile.workSamples[0].link).toBe("https://portfolio.example.test");
    expect(parsed.profile.awards[0].name).toBe("全国大学生计算机设计大赛一等奖");
    expect(parsed.profile.languages[0]).toMatchObject({ language: "英语", proficiency: "无障碍沟通" });
    expect(parsed.profile.jobPreference).toMatchObject({ targetRoles: "算法工程师", preferredCities: "上海、北京" });
    expect(parsed.profile.answers.strengths).toContain("TypeScript");
    expect(parsed.profile.answers.selfEvaluation).toContain("重视事实与边界");
    expect(parsed.populatedPaths.length).toBeGreaterThan(25);
  });

  it("fills blanks, merges repeatable records, and preserves conflicting existing values", () => {
    const existing = createEmptyProfile();
    existing.basic.currentCity = "杭州";
    existing.basic.email = "kept@example.test";
    const existingProject = createProjectRecord();
    existingProject.name = "校园招聘匹配系统";
    existingProject.startDate = "2024-10";
    existingProject.description = "用户已经确认的项目描述";
    existing.projects.push(existingProject);

    const parsed = parseResumeText(REALISTIC_CAMPUS_RESUME);
    const merged = mergeResumeIntoProfile(existing, parsed.profile);

    expect(merged.profile.basic.fullName).toBe("林晓舟");
    expect(merged.profile.basic.currentCity).toBe("杭州");
    expect(merged.profile.basic.email).toBe("kept@example.test");
    expect(merged.profile.education[0].school).toBe("上海交通大学");
    expect(merged.profile.workExperiences).toHaveLength(1);
    expect(merged.profile.projects).toHaveLength(1);
    expect(merged.profile.projects[0].description).toBe("用户已经确认的项目描述");
    expect(merged.profile.projects[0].role).toBe("项目负责人");
    expect(merged.importedFieldCount).toBeGreaterThan(20);
    expect(merged.preservedPaths).toEqual(expect.arrayContaining([
      "basic.currentCity",
      "basic.email",
      "projects.0.description"
    ]));
  });

  it("does not fabricate data when sections are absent", () => {
    const parsed = parseResumeText("姓名：周然\n邮箱：zhou.ran@example.com\n这是一份不完整的文字简历");
    expect(parsed.profile.basic.fullName).toBe("周然");
    expect(parsed.profile.basic.email).toBe("zhou.ran@example.com");
    expect(parsed.profile.education[0].school).toBe("");
    expect(parsed.profile.projects).toEqual([]);
    expect(parsed.warnings).toContain("未识别教育经历，请检查简历章节标题或手动补充。");
  });

  it("parses spaced and inline headings when organization, role, and date are split", () => {
    const parsed = parseResumeText(`
实 习 经 历
2025.06 - 2025.09
松岚智能中心
算法工程师实习生
所属团队：推荐平台
• 完成离线评估工具。
项 目 经 历 2024.10 - 2025.03 校园信息匹配工具 | 项目负责人
• 设计确定性字段规则。
`);

    expect(parsed.profile.workExperiences).toHaveLength(1);
    expect(parsed.profile.workExperiences[0]).toMatchObject({
      company: "松岚智能中心",
      role: "算法工程师实习生",
      department: "推荐平台",
      startDate: "2025-06",
      endDate: "2025-09"
    });
    expect(parsed.profile.projects).toHaveLength(1);
    expect(parsed.profile.projects[0]).toMatchObject({
      name: "校园信息匹配工具",
      role: "项目负责人",
      startDate: "2024-10",
      endDate: "2025-03"
    });
  });

  it("splits combined research-internship sections into multiple dated roles", () => {
    const parsed = parseResumeText(`
研 究 与 实 习 经 历
2025.06 - 2025.09 青禾研究院 研究实习生
• 构建评测数据。
2024.10 - 2025.02 云岫实验室 研究助理
• 复现实验并整理结论。
论文与科研成果
匿名论文甲 2025.01 - 2025.05
• 完成对照实验。
Anonymous Study of Reliable Matching
WCUA 2025（三作，在投）
• 设计评测协议。
校内活动
2023.07 - 2024.07 学生社团成员
`);

    expect(parsed.profile.workExperiences).toHaveLength(2);
    expect(parsed.profile.workExperiences.every((record) => record.company && record.startDate)).toBe(true);
    expect(parsed.profile.projects).toHaveLength(2);
    expect(parsed.profile.projects[1].name).toBe("Anonymous Study of Reliable Matching");
    expect(parsed.profile.projects.some((record) => record.name.includes("学生社团"))).toBe(false);
  });

  it("treats undated bullet entries as projects without importing competitions", () => {
    const parsed = parseResumeText(`
项目经历
• 匿名工具甲：实现本地字段匹配与预览。
• 匿名工具乙：实现可解释的置信度提示。
竞赛经历
2025.05 全国匿名技术竞赛一等奖
`);

    expect(parsed.profile.projects).toHaveLength(2);
    expect(parsed.profile.projects.map((record) => record.name)).toEqual(["匿名工具甲", "匿名工具乙"]);
    expect(parsed.profile.projects.every((record) => !record.startDate && record.description)).toBe(true);
  });

  it("normalizes compatibility glyphs and spaced Chinese dates in education records", () => {
    const parsed = parseResumeText(`
匿名同学 南川⼤学 · 硕士在读
教育背景
南川⼤学（硕士在读） 统计学 2025.09 - 至今
北岭大学 985 双一流 本科 专业：应用数学 2021 年 9 月 - 2025 年 6 月
2020.09 - 2023.06
东湖大学
硕士
健康数据科学
研究方向：匿名研究方向
`);

    expect(parsed.profile.basic.fullName).toBe("匿名同学");
    expect(parsed.profile.education).toHaveLength(3);
    expect(parsed.profile.education[0]).toMatchObject({
      school: "南川大学",
      degree: "硕士",
      major: "统计学",
      startDate: "2025-09",
      endDate: ""
    });
    expect(parsed.profile.education[1]).toMatchObject({
      school: "北岭大学",
      degree: "本科",
      major: "应用数学",
      startDate: "2021-09",
      endDate: "2025-06"
    });
    expect(parsed.profile.education[2]).toMatchObject({
      school: "东湖大学",
      degree: "硕士",
      major: "健康数据科学",
      startDate: "2020-09",
      endDate: "2023-06"
    });
  });

  it("keeps a current-date marker out of date-first education school and major values", () => {
    const parsed = parseResumeText(`
教育经历
2023.09 - 至今 厦门大学 博士 健康医疗大数据
`);

    expect(parsed.profile.education).toHaveLength(1);
    expect(parsed.profile.education[0]).toMatchObject({
      school: "厦门大学",
      degree: "博士",
      major: "健康医疗大数据",
      startDate: "2023-09",
      endDate: ""
    });
  });

  it("keeps evidence-backed project roles and outcomes when metadata is wrapped", () => {
    const parsed = parseResumeText(`
科研经历
匿名概念研究 2025.10 - 2026.04
论文成果：Anonymous Evidence Study，学生一作
• 完成匿名对照实验。
Anonymous Evidence System Study With Controls
2026 年 2 月 - 2026 年 5 月
参与
项目成果：形成可复核的评测集。
• 构建匿名测试流程。
`);

    expect(parsed.profile.projects).toHaveLength(2);
    expect(parsed.profile.projects[0]).toMatchObject({
      role: "学生一作",
      startDate: "2025-10",
      endDate: "2026-04",
      outcome: "Anonymous Evidence Study,学生一作"
    });
    expect(parsed.profile.projects[1]).toMatchObject({
      role: "参与",
      startDate: "2026-02",
      endDate: "2026-05",
      outcome: "形成可复核的评测集。"
    });
  });

  it("does not borrow a degree from prose and places trailing undergraduate metrics on the evidenced record", () => {
    const parsed = parseResumeText(`
教育背景
西江大学 本科 专业：电子工程 2022 年 9 月 - 2026 年 7 月
北川大学 推免 专业：软件工程 2026 年 9 月 - 2029 年 7 月
学业成绩：3.79/5.0
绩点排名：前 5%
获本科创新计划支持
`);

    expect(parsed.profile.education).toHaveLength(2);
    expect(parsed.profile.education[0]).toMatchObject({
      degree: "本科",
      gpa: "3.79/5.0",
      ranking: "前 5%"
    });
    expect(parsed.profile.education[1]).toMatchObject({
      degree: "",
      gpa: "",
      ranking: ""
    });
  });

  it("groups award descriptions without turning each visual line into a record", () => {
    const parsed = parseResumeText(`
竞赛经历
Kaggle Anonymous Reasoning Challenge 银牌
22 / 4000
• 设计可验证的训练方案。
• 最终获得银牌并完成复盘。
竞赛获奖
全国匿名数学建模大赛 二等奖
全国匿名设计大赛 优胜奖
`);

    expect(parsed.profile.awards).toHaveLength(3);
    expect(parsed.profile.awards[0].name).toBe("Kaggle Anonymous Reasoning Challenge 银牌");
    expect(parsed.profile.awards[0].description).toContain("完成复盘");
    expect(parsed.profile.awards.map((award) => award.name)).toEqual([
      "Kaggle Anonymous Reasoning Challenge 银牌",
      "全国匿名数学建模大赛 二等奖",
      "全国匿名设计大赛 优胜奖"
    ]);
  });

  it("splits semicolon-separated award lists into distinct evidenced records", () => {
    const parsed = parseResumeText(`
获奖经历
匿名夏令营一等奖（2021）；匿名程序设计竞赛金奖（2020）；匿名区域赛
铜奖（2020）；匿名南京站二等奖、匿名秦皇岛站银奖（2019）
`);

    expect(parsed.profile.awards.map((award) => award.name)).toEqual([
      "匿名夏令营一等奖(2021)",
      "匿名程序设计竞赛金奖(2020)",
      "匿名区域赛铜奖(2020)",
      "匿名南京站二等奖",
      "匿名秦皇岛站银奖(2019)"
    ]);
  });

  it("keeps year-only education and internships without inventing months", () => {
    const parsed = parseResumeText(`
Anonymous Candidate
Phone: +971 58 535 9738 | candidate@example.test
教育经历
Example University 2024 - 预计 2028
机器学习博士；导师：匿名教授
Example University 2022 - 2024
机器学习硕士
南岭大学 2018 - 2022
计算机科学学士
代表论文
Anonymous Paper Title
实习经历
研究实习生 2023
匿名科技公司
研究实习生 2022
匿名算法中台
软件工程实习生 2021
匿名研究院
软件工程实习生 2020
匿名云平台
`);

    expect(parsed.profile.basic.phone).toBe("+971585359738");
    expect(parsed.profile.education).toHaveLength(3);
    expect(parsed.profile.education.map((record) => record.degree)).toEqual(["博士", "硕士", "本科"]);
    expect(parsed.profile.education.map((record) => record.major)).toEqual(["机器学习", "机器学习", "计算机科学"]);
    expect(parsed.profile.education.every((record) => !record.startDate && !record.endDate)).toBe(true);
    expect(parsed.profile.workExperiences).toHaveLength(4);
    expect(parsed.profile.workExperiences.every((record) => record.company && record.role)).toBe(true);
    expect(parsed.profile.workExperiences.map((record) => record.company)).toEqual([
      "匿名科技公司",
      "匿名算法中台",
      "匿名研究院",
      "匿名云平台"
    ]);
    expect(parsed.profile.workExperiences.every((record) => !record.startDate && !record.endDate)).toBe(true);

    const future = parseResumeText(`
教育背景
匿名科技大学 预期入学：2028年9月
人工智能博士
`);
    expect(future.profile.education[0]).toMatchObject({
      school: "匿名科技大学",
      degree: "博士",
      major: "人工智能",
      startDate: "2028-09",
      endDate: ""
    });
  });

  it("splits completed undated project entries and stops at publication boundaries", () => {
    const parsed = parseResumeText(`
在校科研
匿名研究甲
• 方法：构建匿名分析流程。
• 结果：完成稳定性验证。
匿名研究乙
• 方法：实现匿名数据管线。
• 结果：形成复现实验。
技能/目标
Python、TypeScript、可复核测试
项目经历
匿名系统甲：实现本地解析。
• 完成字段映射。
匿名系统乙
• 构建结构化输出。
项目成果
匿名成果甲。
匿名成果乙 2025.01 - 2025.03
• 完成匿名评测。
论文发表
Anonymous Publication That Must Not Become A Project
学术会议
Anonymous Conference 2026
`);

    expect(parsed.profile.projects).toHaveLength(6);
    expect(parsed.profile.projects.map((record) => record.name)).toEqual(expect.arrayContaining([
      "匿名研究甲",
      "匿名研究乙",
      "匿名系统甲",
      "匿名系统乙",
      "匿名成果甲。",
      "匿名成果乙"
    ]));
    expect(parsed.profile.projects.some((record) => /Publication|Conference/.test(record.name))).toBe(false);
    expect(parsed.profile.answers.strengths).toContain("TypeScript");
  });

  it("reads degree details, inline preferences, and multiple explicit language levels", () => {
    const parsed = parseResumeText(`
匿名同学
电话/微信：(+86) 193-7057-3269 | 邮箱：candidate@example.test | 求职意向：实习生
教育背景
匿名航天大学 2025.09 - 至今
直博 计算机学院 软件工程
其他
语言：中文（母语）、英文（流利）
`);

    expect(parsed.profile.basic.phone).toBe("+8619370573269");
    expect(parsed.profile.jobPreference.targetRoles).toBe("实习生");
    expect(parsed.profile.education[0]).toMatchObject({ degree: "博士", major: "软件工程" });
    expect(parsed.profile.languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ language: "普通话", proficiency: "母语" }),
      expect.objectContaining({ language: "英语", proficiency: "流利" })
    ]));
  });
});
