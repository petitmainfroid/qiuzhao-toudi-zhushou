import { useEffect, useState } from "react";
import { CircleStop, Link2, RefreshCw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import type {
  PageActionAuthorizationView,
  PageFindResult,
  PrivacySafePageState,
  PowerSessionView
} from "../bridge/protocol";
import type { PowerSessionBridge } from "./powerSessionBridge";

function reasonText(reason: PowerSessionView["reason"]): string {
  if (reason === "origin-changed") return "页面已切换到其他站点，会话已暂停。";
  if (reason === "expired") return "会话已到期，请重新连接。";
  if (reason === "tab-closed") return "目标标签页已经关闭。";
  if (reason === "debugger-detached") return "浏览器已断开调试连接。";
  if (reason === "debugger-busy") return "目标页面正被 DevTools 或其他工具占用。";
  if (reason === "unsupported-page") return "只允许连接没有内嵌凭据的 HTTPS 页面。";
  if (reason === "session-inactive") return "请先连接当前 HTTPS 招聘页面。";
  if (reason === "bridge-failed") return "浏览器会话没有建立，请检查扩展权限后重试。";
  return "连接后，助手会固定当前 HTTPS 标签页 10 分钟。";
}

export function PowerSessionCard({ bridge }: { bridge: PowerSessionBridge }) {
  const [session, setSession] = useState<PowerSessionView>({ status: "inactive", reason: "not-started" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageState, setPageState] = useState<PrivacySafePageState | null>(null);
  const [findText, setFindText] = useState("");
  const [findResult, setFindResult] = useState<PageFindResult | null>(null);
  const [actionAuthorization, setActionAuthorization] = useState<PageActionAuthorizationView | null>(null);

  useEffect(() => {
    let active = true;
    void bridge.status().then((next) => {
      if (active) setSession(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [bridge]);

  async function run(operation: () => Promise<PowerSessionView>) {
    setBusy(true);
    setError("");
    try {
      const next = await operation();
      setSession(next);
      if (next.status !== "active") {
        setPageState(null);
        setFindResult(null);
        setActionAuthorization(null);
      }
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "浏览器会话操作失败。");
    }
    finally {
      setBusy(false);
    }
  }

  async function authorizeActions() {
    setBusy(true);
    setError("");
    try {
      setActionAuthorization(await bridge.authorizeActions());
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "动作授权失败。");
    }
    finally {
      setBusy(false);
    }
  }

  async function readStructure() {
    setBusy(true);
    setError("");
    try {
      setPageState(await bridge.pageState());
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "页面结构读取失败。");
    }
    finally {
      setBusy(false);
    }
  }

  async function findControl() {
    const text = findText.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      setFindResult(await bridge.find({ text, limit: 8 }));
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "语义查找失败。");
    }
    finally {
      setBusy(false);
    }
  }

  const active = session.status === "active";
  const paused = session.status === "paused";
  return (
    <section className={`power-session-card session-${session.status}`} aria-labelledby="power-session-title">
      <div className="power-session-heading">
        <span aria-hidden="true">{active ? <Link2 size={18} /> : <ShieldAlert size={18} />}</span>
        <div>
          <p className="eyebrow">浏览器内核 · K0–K1</p>
          <h2 id="power-session-title">{active ? "已连接当前招聘页" : paused ? "会话已安全暂停" : "连接招聘页面"}</h2>
        </div>
        <strong>{active ? "运行中" : paused ? "已暂停" : "未连接"}</strong>
      </div>

      {active ? (
        <dl className="power-session-state">
          <div><dt>站点</dt><dd>{session.origin}</dd></div>
          <div><dt>路径</dt><dd>{session.path}</dd></div>
          <div><dt>结构</dt><dd>{session.pageState?.interactiveCount ?? 0} 个控件 · {session.pageState?.frameCount ?? 0} 个 frame</dd></div>
        </dl>
      ) : <p className="power-session-copy">{reasonText(session.reason)}</p>}

      <p className="power-session-boundary">只读取结构摘要；不读取 Cookie、密码或输入框值，也不会提交申请。</p>
      {active ? (
        <div className="action-authorization-panel">
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <p>
              <strong>K2 限时填写批次</strong>
              <span>{actionAuthorization ? "已授权 60 秒；仅允许本地档案和当前快照。" : "填写前需要再次点击；页面可能自动保存草稿。"}</span>
            </p>
          </div>
          <button type="button" onClick={() => void authorizeActions()} disabled={busy}>
            {actionAuthorization ? "重新授权" : "允许本次内核填写"}
          </button>
        </div>
      ) : null}
      {error ? <p className="power-session-error" role="alert">{error}</p> : null}

      <div className="power-session-actions">
        {active ? (
          <>
            <button type="button" onClick={() => void run(() => bridge.refresh())} disabled={busy}>
              <RefreshCw size={14} aria-hidden="true" />刷新状态
            </button>
            <button type="button" onClick={() => void run(() => bridge.stop())} disabled={busy}>
              <CircleStop size={14} aria-hidden="true" />断开连接
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void run(() => bridge.start())} disabled={busy}>
            <Link2 size={14} aria-hidden="true" />{busy ? "正在连接" : "连接当前招聘页"}
          </button>
        )}
      </div>

      {active ? (
        <section className="page-state-panel" aria-labelledby="page-state-title">
          <div className="page-state-title-row">
            <div>
              <p className="eyebrow">只读页面结构</p>
              <h3 id="page-state-title">State / Find</h3>
            </div>
            <button type="button" onClick={() => void readStructure()} disabled={busy}>读取结构</button>
          </div>
          {pageState ? (
            <p className="page-state-summary">
              已识别 {pageState.summary.controlCount} 个控件 · {pageState.summary.frameCount} 个 frame · {pageState.summary.openShadowRootCount} 个开放 shadow
            </p>
          ) : <p className="page-state-copy">只返回标签、角色和不透明引用，不返回输入值、DOM ID、class 或选择器。</p>}
          <form className="page-find-form" onSubmit={(event) => { event.preventDefault(); void findControl(); }}>
            <label htmlFor="page-find-text">按字段语义查找</label>
            <div>
              <input
                id="page-find-text"
                type="search"
                value={findText}
                maxLength={120}
                placeholder="例如：毕业院校"
                onChange={(event) => setFindText(event.target.value)}
              />
              <button type="submit" disabled={busy || !findText.trim()}><Search size={13} aria-hidden="true" />查找</button>
            </div>
          </form>
          {findResult ? (
            <ul className="page-find-results" aria-label="语义查找结果">
              {findResult.matches.length ? findResult.matches.map((match) => (
                <li key={match.ref}>
                  <div><strong>{match.label}</strong><span>{match.role} · {(match.score * 100).toFixed(0)}%</span></div>
                  <code>{match.ref}</code>
                  {match.safety !== "ordinary" ? <em>已限制：{match.safety}</em> : null}
                </li>
              )) : <li><span>没有找到相符控件。</span></li>}
            </ul>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
