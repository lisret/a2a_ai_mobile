#!/usr/bin/env node
/** Focused DOM evidence probe for the preview (own hidden headless browser).
 *  Usage: node verification/dom-probe.mjs "?page=Home" "[expr]"        */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const PORT = Number(process.env.CDP_PORT || 9395);
const BIN =
  process.env.CHROME_HEADLESS_SHELL ||
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const query = process.argv[2] || '?page=Home';
const expression =
  process.argv[3] ||
  `({labels: [...document.querySelectorAll('#app-canvas [aria-label]')].map(e => e.getAttribute('aria-label')).slice(0, 30),
     dialogs: [...document.querySelectorAll('#phone-overlays [role="dialog"]')].map(d => d.innerText.slice(0, 60)),
     overlays: document.getElementById('phone-overlays')?.children.length ?? null,
     buttons: [...document.querySelectorAll('#app-canvas [role="button"]')].length})`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-probe-'));
const child = spawn(
  BIN,
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-sandbox',
   '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000', 'about:blank'],
  {stdio: 'ignore'},
);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const send = (ws, id, method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const onMsg = e => {
      const m = JSON.parse(e.data);
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    setTimeout(() => reject(new Error('timeout ' + method)), 20000);
  });

let version;
for (let i = 0; i < 60 && !version; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) version = await res.json();
  } catch { await sleep(200); }
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, {once: true}));
const target = await send(ws, 1, 'Target.createTarget', {url: 'about:blank'});
const attach = await send(ws, 2, 'Target.attachToTarget', {targetId: target.targetId, flatten: true});
const sid = attach.sessionId;
await send(ws, 3, 'Page.enable', {}, sid);
await send(ws, 4, 'Runtime.enable', {}, sid);
await send(ws, 5, 'Page.navigate', {url: BASE + '/' + query}, sid);
for (let i = 0; i < 80; i++) {
  await sleep(250);
  const probe = await send(ws, 100 + i, 'Runtime.evaluate',
    {expression: `(document.querySelector('#app-canvas')?.innerText||'').length > 5`, returnByValue: true}, sid);
  if (probe.result.value) break;
}
const out = await send(ws, 999, 'Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}, sid);
console.log(JSON.stringify(out.result.value ?? out, null, 2));
child.kill('SIGTERM');
fs.rmSync(profile, {recursive: true, force: true});
process.exit(0);
