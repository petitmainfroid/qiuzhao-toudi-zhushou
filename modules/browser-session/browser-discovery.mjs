import { access } from 'node:fs/promises';
import path from 'node:path';

function candidates(env = process.env) {
  const programFiles = [env.PROGRAMFILES, env['PROGRAMFILES(X86)']].filter(Boolean);
  const local = env.LOCALAPPDATA;
  const result = [];
  for (const root of programFiles) {
    result.push({ kind: 'chrome', executablePath: path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe') });
    result.push({ kind: 'edge', executablePath: path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe') });
  }
  if (local) {
    result.push({ kind: 'chrome', executablePath: path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') });
    result.push({ kind: 'edge', executablePath: path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe') });
  }
  return result;
}

export async function discoverBrowsers(env = process.env) {
  const found = [];
  for (const candidate of candidates(env)) {
    try {
      await access(candidate.executablePath);
      if (!found.some((item) => item.executablePath.toLowerCase() === candidate.executablePath.toLowerCase())) {
        found.push({ ...candidate, source: 'installed' });
      }
    } catch {
      // Continue to the next known installation path.
    }
  }
  return found;
}

export async function selectBrowser(kind, env = process.env) {
  const installed = await discoverBrowsers(env);
  const selected = kind ? installed.find((browser) => browser.kind === kind) : installed[0];
  if (!selected) throw new Error(kind ? `${kind}_not_found` : 'chrome_or_edge_not_found');
  return selected;
}
