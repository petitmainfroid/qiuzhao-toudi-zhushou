import { canonicalFields, type CanonicalField } from "./catalog";
import { jaccardSimilarity, normalizeFieldText, tokenizeFieldText } from "./normalize";
import type {
  ExclusionReason,
  FieldDescriptor,
  MatchConfidence,
  MatchResult
} from "./types";

interface ScoredCandidate {
  field: CanonicalField;
  score: number;
  reasons: string[];
}

const unsupportedKinds = new Set(["file", "password", "hidden", "button", "checkbox"]);
const verificationPatterns = ["验证码", "短信验证", "图形验证", "captcha", "verificationcode", "smscode"];
const unsupportedSensitivePatterns = [
  "个人证件",
  "银行卡号",
  "社会保障号",
  "bankcardnumber",
  "socialsecuritynumber"
];

const repeatablePathSignals: Array<{ prefix: string; signals: string[] }> = [
  { prefix: "education", signals: ["education", "education_list", "educationList"] },
  { prefix: "workExperiences", signals: ["internship", "internship_list", "internshipList", "career_list", "careerList", "workExperiences"] },
  { prefix: "projects", signals: ["project", "project_list", "projectList", "projects"] },
  { prefix: "workSamples", signals: ["works", "works_list", "worksList", "workSamples"] },
  { prefix: "awards", signals: ["award", "award_list", "awardList", "awards"] },
  { prefix: "languages", signals: ["language", "language_list", "languageList", "languages"] }
];

function displayLabel(descriptor: FieldDescriptor): string {
  return descriptor.label || descriptor.ariaLabel || descriptor.placeholder || descriptor.name || "未命名字段";
}

function excluded(
  descriptor: FieldDescriptor,
  reason: ExclusionReason,
  explanation: string
): MatchResult {
  return {
    elementId: descriptor.elementId,
    fieldLabel: displayLabel(descriptor),
    profilePath: null,
    canonicalLabel: null,
    score: 0,
    confidence: "none",
    reasons: [explanation],
    requiresConfirmation: true,
    excludedReason: reason
  };
}

function aliasSimilarity(candidateText: string, alias: string): number {
  const candidate = normalizeFieldText(candidateText);
  const normalizedAlias = normalizeFieldText(alias);
  if (!candidate || !normalizedAlias) return 0;
  if (candidate === normalizedAlias) return 1;

  if (candidate.includes(normalizedAlias) || normalizedAlias.includes(candidate)) {
    const shorter = Math.min(candidate.length, normalizedAlias.length);
    const longer = Math.max(candidate.length, normalizedAlias.length);
    if (shorter <= 2 || (normalizedAlias.length <= 4 && /^[a-z]+$/.test(normalizedAlias))) {
      return 0.56;
    }
    return 0.72 + (shorter / longer) * 0.1;
  }

  const tokenScore = jaccardSimilarity(
    tokenizeFieldText(candidateText),
    tokenizeFieldText(alias)
  );
  return tokenScore >= 0.5 ? 0.52 + tokenScore * 0.22 : 0;
}

function scoreCanonicalField(descriptor: FieldDescriptor, field: CanonicalField): ScoredCandidate {
  const sources = [
    ["字段标题", descriptor.label, 0.93],
    ["无障碍标签", descriptor.ariaLabel, 0.9],
    ["占位提示", descriptor.placeholder, 0.84],
    ["字段名称", descriptor.name, 0.78],
    ["字段标识", descriptor.domId, 0.72]
  ] as const;

  let bestScore = 0;
  let bestReason = "";
  for (const [sourceName, sourceValue, weight] of sources) {
    for (const alias of field.aliases) {
      const similarity = aliasSimilarity(sourceValue, alias);
      const score = similarity * weight;
      if (score > bestScore) {
        bestScore = score;
        bestReason = similarity === 1
          ? `${sourceName}“${sourceValue}”与“${alias}”完全一致`
          : `${sourceName}“${sourceValue}”与“${alias}”语义接近`;
      }
    }
  }

  const reasons = bestReason ? [bestReason] : [];
  const kindCompatible = field.kinds.includes(descriptor.kind)
    || (descriptor.kind === "custom-select" && field.kinds.includes("select"));
  if (kindCompatible) {
    bestScore += 0.055;
    reasons.push(`控件类型 ${descriptor.kind} 与目标字段兼容`);
  }
  else if (bestScore > 0) {
    bestScore -= 0.12;
    reasons.push(`控件类型 ${descriptor.kind} 需要额外确认`);
  }

  if (
    descriptor.autocomplete &&
    field.autocomplete?.some(
      (hint) => normalizeFieldText(hint) === normalizeFieldText(descriptor.autocomplete)
    )
  ) {
    bestScore += 0.09;
    reasons.push(`浏览器自动填充标记为 ${descriptor.autocomplete}`);
  }

  const normalizedContext = normalizeFieldText(descriptor.contextText);
  if (
    normalizedContext &&
    field.contextHints?.some((hint) => normalizedContext.includes(normalizeFieldText(hint)))
  ) {
    bestScore += 0.045;
    reasons.push("所在表单章节与目标字段一致");
  }

  const repeatable = repeatablePathSignals.find(({ prefix }) => field.path.startsWith(`${prefix}.0.`));
  const normalizedStructure = normalizeFieldText([descriptor.name, descriptor.domId].join(" "));
  const structuralOwner = repeatablePathSignals.find(({ signals }) =>
    signals.some((signal) => normalizedStructure.includes(normalizeFieldText(signal)))
  );
  if (repeatable && structuralOwner) {
    if (repeatable.prefix === structuralOwner.prefix) {
      bestScore += 0.085;
      reasons.push("字段结构标识与重复经历类型一致");
    }
    else {
      bestScore -= 0.16;
    }
  }

  return { field, score: Math.max(0, Math.min(1, bestScore)), reasons };
}

function confidenceFor(score: number): MatchConfidence {
  if (score >= 0.86) return "high";
  if (score >= 0.64) return "medium";
  if (score > 0) return "low";
  return "none";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function indexedProfilePath(path: string, descriptor: FieldDescriptor): { path: string; index: number | null } {
  const config = repeatablePathSignals.find(({ prefix }) => path.startsWith(`${prefix}.0.`));
  if (!config) return { path, index: null };
  const structuralText = [descriptor.name, descriptor.domId].filter(Boolean).join(" ");
  for (const signal of config.signals) {
    const pattern = new RegExp(`${escapeRegExp(signal)}(?:\\[|[._-])?(\\d+)(?:\\]|[._-]|$)`, "i");
    const match = pattern.exec(structuralText);
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 0) continue;
    return { path: path.replace(`${config.prefix}.0.`, `${config.prefix}.${index}.`), index };
  }
  return { path, index: null };
}

function addDateDirectionEvidence(
  candidate: ScoredCandidate,
  descriptor: FieldDescriptor
): ScoredCandidate {
  const structuralText = [descriptor.placeholder, descriptor.name, descriptor.domId, descriptor.ariaLabel]
    .filter(Boolean)
    .join(" ");
  const localizedHint = normalizeFieldText([descriptor.placeholder, descriptor.ariaLabel].join(" "));
  const directionTokens = Array.from(
    structuralText.matchAll(/(?:^|[._\[\]-])(start|from|end|to)(?=$|[._\[\]-])/gi),
    (match) => match[1].toLowerCase()
  );
  const trailingDirection = directionTokens.at(-1);
  const endSignal = localizedHint.includes("结束")
    || localizedHint.includes("毕业")
    || localizedHint.includes("离职")
    || (!localizedHint.includes("开始") && ["end", "to"].includes(trailingDirection ?? ""));
  const startSignal = localizedHint.includes("开始")
    || localizedHint.includes("入学")
    || localizedHint.includes("起始")
    || (!localizedHint.includes("结束") && ["start", "from"].includes(trailingDirection ?? ""));
  const isEndPath = candidate.field.path.endsWith(".endDate");
  const isStartPath = candidate.field.path.endsWith(".startDate");
  if ((endSignal && isEndPath) || (startSignal && isStartPath)) {
    return {
      ...candidate,
      score: Math.min(1, candidate.score + 0.075),
      reasons: [...candidate.reasons, endSignal ? "控件标记为结束时间" : "控件标记为开始时间"]
    };
  }
  if ((endSignal && isStartPath) || (startSignal && isEndPath)) {
    return { ...candidate, score: Math.max(0, candidate.score - 0.075) };
  }
  return candidate;
}

export function matchField(descriptor: FieldDescriptor): MatchResult {
  if (descriptor.disabled || descriptor.readOnly) {
    return excluded(descriptor, "disabled-or-readonly", "字段不可编辑，已跳过");
  }
  if (unsupportedKinds.has(descriptor.kind)) {
    return excluded(descriptor, "unsupported-control", `不填写 ${descriptor.kind} 类型控件`);
  }

  const allText = normalizeFieldText([
    descriptor.label,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.domId,
    descriptor.contextText
  ].join(" "));

  if (verificationPatterns.some((pattern) => allText.includes(normalizeFieldText(pattern)))) {
    return excluded(descriptor, "verification-control", "验证码或验证字段必须由用户亲自完成");
  }
  if (unsupportedSensitivePatterns.some((pattern) => allText.includes(normalizeFieldText(pattern)))) {
    return excluded(descriptor, "sensitive-unsupported", "高敏感身份或财务信息不在自动填写范围内");
  }

  if (descriptor.kind === "date-range" && descriptor.dateRangePaths) {
    const [startPath, endPath] = descriptor.dateRangePaths;
    return {
      elementId: descriptor.elementId,
      fieldLabel: displayLabel(descriptor),
      profilePath: startPath,
      companionProfilePath: endPath,
      canonicalLabel: "起止时间",
      score: 1,
      confidence: "high",
      reasons: ["根据同一经历区块的结构标识确定起止时间和记录序号"],
      requiresConfirmation: false
    };
  }

  const candidates = canonicalFields
    .map((field) => addDateDirectionEvidence(scoreCanonicalField(descriptor, field), descriptor))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.score < 0.5) {
    return excluded(descriptor, "unmatched", "没有找到足够可靠的档案字段");
  }

  const ambiguous = Boolean(second && second.score >= 0.5 && best.score - second.score < 0.07);
  const rawConfidence = confidenceFor(best.score);
  const confidence: MatchConfidence = ambiguous && rawConfidence === "high" ? "medium" : rawConfidence;
  const reasons = best.reasons.slice(0, 3);
  const indexed = indexedProfilePath(best.field.path, descriptor);
  if (indexed.index !== null) reasons.push(`识别为第 ${indexed.index + 1} 条重复经历`);
  if (ambiguous) reasons.push(`与“${second.field.label}”的得分接近`);
  if (best.field.sensitive) reasons.push("该字段包含需要确认的个人信息");

  return {
    elementId: descriptor.elementId,
    fieldLabel: displayLabel(descriptor),
    profilePath: indexed.path,
    canonicalLabel: best.field.label,
    score: Number(best.score.toFixed(3)),
    confidence,
    reasons,
    requiresConfirmation: Boolean(best.field.sensitive || ambiguous || confidence !== "high")
  };
}

export function matchFields(descriptors: FieldDescriptor[]): MatchResult[] {
  return descriptors.map(matchField);
}
