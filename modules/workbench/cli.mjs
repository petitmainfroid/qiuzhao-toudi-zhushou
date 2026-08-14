import http from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBundledNodeModule } from '../browser-kernel/source-loader.mjs';

const SESSION_COOKIE = 'qiuzhao_workbench_session';
const CSS = `:root{font-family:Epilogue,system-ui,sans-serif;color:#34402e;background:#E8DCC7}*{box-sizing:border-box}body{margin:0;min-width:320px;background:radial-gradient(rgba(96,108,56,.09) 1px,transparent 1px) 0 0/5px 5px}.shell{max-width:1140px;margin:auto;padding:48px 24px 64px}.mast{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:30px}.mast h1{font-size:clamp(30px,5vw,52px);line-height:1;margin:0;color:#606C38;letter-spacing:-.05em}.mast p{max-width:440px;margin:0;color:#55614e;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px}.card{background:#D4B895;border:1px solid rgba(96,108,56,.25);border-radius:24px;padding:22px;box-shadow:0 12px 28px rgba(72,68,45,.12);transition:transform .35s ease,box-shadow .35s ease}.card:hover{transform:translateY(-3px);box-shadow:0 18px 35px rgba(72,68,45,.18)}.company{color:#606C38;font-weight:700;margin:0 0 8px}.title{font-size:22px;line-height:1.15;margin:0 0 12px;color:#473b2b}.location,.state{display:inline-block;border-radius:999px;padding:6px 10px;background:#8B9D83;color:#20311f;font-size:13px;margin:0 6px 13px 0}.state{background:#C08E3A;color:#3b2f18}.jd{color:#51483a;line-height:1.55;margin:4px 0 18px;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.link{color:#803d21;font-weight:700;text-decoration-thickness:2px;text-underline-offset:3px}.empty{border:1px dashed #8B9D83;border-radius:24px;padding:32px;color:#55614e;background:rgba(212,184,149,.55)}@media(max-width:600px){.shell{padding:32px 16px}.mast{display:block}.mast p{margin-top:14px}}`;

function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function rootPath(env = process.env) { return path.join(env.LOCALAPPDATA ?? env.TEMP ?? process.cwd(), 'QiuzhaoRecruitmentAgent', 'yonghuxinxi'); }
function isValidHost(request, port) { return request.headers.host === `127.0.0.1:${port}`; }
function hasSession(request, session) { return String(request.headers.cookie ?? '').split(/;\s*/).includes(`${SESSION_COOKIE}=${session}`); }

export async function loadWorkbenchCards({ env = process.env } = {}) {
  const [repositoryModule, profileModule, workbenchModule] = await Promise.all([
    loadBundledNodeModule('modules/job-repository/src/repository.ts'),
    loadBundledNodeModule('gerenxinxi/profile-service/src/index.ts'),
    loadBundledNodeModule('modules/workbench/src/index.ts')
  ]);
  const repository = new repositoryModule.FileJobRepository({ filePath: path.join(rootPath(env), 'jobs', 'jobs.json'), protector: new profileModule.WindowsDpapiProtector() });
  return workbenchModule.toWorkbenchCards((await repository.list()).records);
}

function renderPage(cards) {
  const deck = cards.length ? cards.map((card) => `<article class="card"><p class="company">${escapeHtml(card.company)}</p><h2 class="title">${escapeHtml(card.title)}</h2><span class="location">${escapeHtml(card.location)}</span><span class="state">${escapeHtml(card.state)}</span><p class="jd">${escapeHtml(card.jd)}</p><a class="link" href="${escapeHtml(card.link)}" target="_blank" rel="noreferrer">打开岗位页</a></article>`).join('') : '<div class="empty">本地岗位库还没有可展示的岗位。先在已登录的 BOSS 结果页运行一次“发现岗位”。</div>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>岗位工作台</title><link rel="stylesheet" href="/assets/workbench.css"></head><body><main class="shell"><header class="mast"><h1>岗位工作台</h1><p>已发现的岗位仅保存在本机。打开岗位页不会自动沟通、上传简历或提交申请。</p></header><section class="grid">${deck}</section></main></body></html>`;
}

export async function createWorkbenchServer({ env = process.env, loadCards = () => loadWorkbenchCards({ env }), now = () => Date.now() } = {}) {
  const bootstrap = randomBytes(32).toString('hex'); const session = randomBytes(32).toString('hex'); const expiry = now() + 10 * 60_000; let consumed = false;
  const server = http.createServer(async (request, response) => {
    const port = server.address()?.port;
    if (!port || !isValidHost(request, port)) { response.writeHead(421); response.end(); return; }
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('X-Frame-Options', 'DENY'); response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (url.pathname === `/bootstrap/${bootstrap}` && !consumed && now() < expiry) { consumed = true; response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`); response.writeHead(303, { Location: '/' }); response.end(); return; }
    if (url.pathname === '/assets/workbench.css' && hasSession(request, session)) { response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); response.end(CSS); return; }
    if (url.pathname === '/' && hasSession(request, session)) { try { const cards = await loadCards(); response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(renderPage(cards)); } catch { response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(renderPage([])); } return; }
    response.writeHead(404); response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('workbench_listen_failed');
  return Object.freeze({ url: `http://127.0.0.1:${address.port}/bootstrap/${bootstrap}`, close: () => new Promise((resolve) => server.close(resolve)) });
}

export async function main(args = process.argv.slice(2)) { if (args.length !== 1 || args[0] !== 'serve') throw new Error('usage: qiuzhao workbench serve'); const host = await createWorkbenchServer(); process.stdout.write(`${JSON.stringify({ url: host.url, expiresInMinutes: 10 })}\n`); }
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'workbench_failed'}\n`); process.exitCode = 1; });
