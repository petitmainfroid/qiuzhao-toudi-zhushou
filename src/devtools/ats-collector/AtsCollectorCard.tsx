import { useMemo, useState } from "react";
import { Braces, CheckCircle2, Download, ScanSearch, ShieldAlert } from "lucide-react";
import type { AtsObservation, AtsPageType } from "../../ats/contracts";
import { createShareableAtsObservation } from "../../ats/observation";
import type { PowerSessionBridge } from "../../sidepanel/powerSessionBridge";
import { resolvePowerSessionBridge } from "../../sidepanel/powerSessionBridge";
import { assessObservationQuality } from "./xiaomiQuality";
import "./collector.css";

export const ATS_COLLECTOR_BUILD_MARKER = "QIUZHAO_ATS_COLLECTOR_DEV_ONLY_V1";

type CollectorState = "idle" | "collecting" | "ready" | "blocked" | "downloaded" | "error";

export interface AtsCollectorCardProps {
  bridge?: PowerSessionBridge;
  now?: () => Date;
  download?: (observation: AtsObservation) => void;
  captureToolVersion?: string;
  language?: string;
}

function inferPageType(path: string): AtsPageType {
  if (/(?:^|\/)(?:apply|application)(?:\/|$)/i.test(path)) return "application";
  if (/(?:^|\/)(?:profile|resume)(?:\/|$)/i.test(path)) return "profile";
  if (/(?:^|\/)(?:screening|questionnaire)(?:\/|$)/i.test(path)) return "screening";
  if (/(?:^|\/)(?:assessment|exam)(?:\/|$)/i.test(path)) return "assessment";
  return "unknown";
}

function runtimeVersion(): string {
  try {
    return chrome.runtime?.getManifest?.().version || "0.2.0";
  }
  catch {
    return "0.2.0";
  }
}

function defaultLanguage(): string {
  return document.documentElement.lang || navigator.language || "und";
}

export function downloadAtsObservation(observation: AtsObservation): void {
  const blob = new Blob([`${JSON.stringify(observation, null, 2)}\n`], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = observation.capturedAt.replace(/[:.]/g, "-");
  link.href = url;
  link.download = `ats-observation-${observation.source.pageType}-${timestamp}.json`;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function visibleLabel(control: AtsObservation["controls"][number]): string {
  return control.semantics.label
    || control.semantics.ariaLabel
    || control.semantics.placeholder
    || control.semantics.name
    || control.role;
}

export function AtsCollectorCard({
  bridge = resolvePowerSessionBridge(),
  now = () => new Date(),
  download = downloadAtsObservation,
  captureToolVersion = runtimeVersion(),
  language = defaultLanguage()
}: AtsCollectorCardProps) {
  const [state, setState] = useState<CollectorState>("idle");
  const [observation, setObservation] = useState<AtsObservation | null>(null);
  const [message, setMessage] = useState("");
  const preview = useMemo(() => observation ? JSON.stringify(observation, null, 2) : "", [observation]);
  const quality = useMemo(() => observation ? assessObservationQuality(observation) : null, [observation]);

  async function collect() {
    setState("collecting");
    setMessage("");
    setObservation(null);
    try {
      const current = await bridge.status();
      if (current.status !== "active") await bridge.start();
      const pageState = await bridge.pageState();
      const next = createShareableAtsObservation(pageState, {
        capturedAt: now().toISOString(),
        captureToolVersion,
        language,
        pageType: inferPageType(pageState.path)
      });
      setObservation(next);
      const assessment = assessObservationQuality(next);
      if (!assessment.downloadAllowed) {
        setState("blocked");
        setMessage(`匿名检查通过，但独立覆盖验收未通过：${assessment.blockingReasons.join("；")}。已禁止下载，请刷新页面结构后重试。`);
      }
      else {
        setState("ready");
        setMessage("隐私检查和独立覆盖验收通过。请先查看预览，再下载匿名 JSON。");
      }
    }
    catch {
      setState("error");
      setMessage("采集已停止：页面未安全连接，或匿名结构未通过隐私检查。");
    }
  }

  function save() {
    if (!observation || !quality?.downloadAllowed) return;
    download(observation);
    setState("downloaded");
    setMessage("匿名 JSON 已交给浏览器下载；扩展没有保存或上传副本。");
  }

  return (
    <section
      className="ats-collector-card"
      aria-labelledby="ats-collector-title"
      data-build-marker={ATS_COLLECTOR_BUILD_MARKER}
    >
      <header className="ats-collector-heading">
        <span aria-hidden="true"><Braces size={18} /></span>
        <div>
          <p className="eyebrow">仅开发构建</p>
          <h2 id="ats-collector-title">ATS 匿名结构采集器</h2>
        </div>
        <strong>DEV</strong>
      </header>

      <p className="ats-collector-copy">
        点击后只读取当前 HTTPS 页面的字段结构，不读取输入值、Cookie、文件名或登录信息，也不会填写或提交。
      </p>

      <button
        className="ats-collector-scan"
        type="button"
        onClick={() => void collect()}
        disabled={state === "collecting"}
      >
        <ScanSearch size={16} aria-hidden="true" />
        {state === "collecting" ? "正在执行隐私扫描" : observation ? "重新采集匿名结构" : "采集匿名结构"}
      </button>

      {message ? (
        <p className={`ats-collector-message collector-${state}`} role={state === "error" || state === "blocked" ? "alert" : "status"}>
          {state === "error" || state === "blocked" ? <ShieldAlert size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
          <span>{message}</span>
        </p>
      ) : null}

      {observation ? (
        <div className="ats-collector-preview">
          <dl>
            <div><dt>Origin</dt><dd>{observation.source.origin}</dd></div>
            <div><dt>路径模板</dt><dd>{observation.source.pathTemplate}</dd></div>
            <div><dt>ATS</dt><dd>{observation.family.id} · {(observation.family.confidence * 100).toFixed(0)}%</dd></div>
            <div><dt>控件</dt><dd>{observation.summary.controlCount} 个 · 限制 {observation.summary.blockedControlCount} 个</dd></div>
            <div><dt>质量基准</dt><dd>{quality?.applicable ? quality.baselineLabel : "通用隐私检查"}</dd></div>
            <div><dt>分组</dt><dd>{quality?.applicable ? `${quality.observedSectionCount} / ${quality.expectedSectionCount}` : observation.summary.sectionCount}</dd></div>
            <div><dt>逻辑字段</dt><dd>{quality?.applicable ? `${quality.observedFieldCount} / ${quality.expectedFieldCount}` : "未配置基准"}</dd></div>
            <div><dt>选项节点</dt><dd>{quality ? `${quality.optionControlCount} 个 · 不计入逻辑字段` : "-"}</dd></div>
            <div><dt>语义命名</dt><dd>{quality ? `${quality.semanticControlCount} / ${quality.semanticControlTotal} · ${(quality.semanticCoverage * 100).toFixed(0)}%` : "-"}</dd></div>
            <div><dt>最终投递</dt><dd>{quality?.finalSubmitProtected ? "已识别并保护" : "未确认"}</dd></div>
          </dl>

          {quality?.applicable && quality.missingSections.length > 0 ? (
            <p className="ats-collector-gap">缺少分组：{quality.missingSections.join("、")}</p>
          ) : null}
          {quality?.applicable && quality.missingFields.length > 0 ? (
            <details className="ats-collector-gaps">
              <summary>查看 {quality.missingFields.length} 个未观察到的逻辑字段</summary>
              <ul>{quality.missingFields.map((field) => <li key={field}>{field}</li>)}</ul>
            </details>
          ) : null}
          {quality?.applicable && quality.requiredMismatches.length > 0 ? (
            <p className="ats-collector-gap">必填状态未识别：{quality.requiredMismatches.join("、")}</p>
          ) : null}

          <ul aria-label="匿名字段预览">
            {observation.controls.slice(0, 12).map((control) => (
              <li key={control.controlKey}>
                <span>{visibleLabel(control)}</span>
                <em>{control.role}{control.required ? " · 必填" : ""}{control.safety !== "ordinary" ? ` · ${control.safety}` : ""}</em>
              </li>
            ))}
          </ul>
          {observation.controls.length > 12 ? <p className="ats-collector-more">另有 {observation.controls.length - 12} 个字段已包含在 JSON 中。</p> : null}

          <details>
            <summary>检查完整 JSON 预览</summary>
            <pre>{preview}</pre>
          </details>

          {quality?.downloadAllowed ? (
            <button className="ats-collector-download" type="button" onClick={save}>
              <Download size={16} aria-hidden="true" />下载匿名 JSON
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
