#!/usr/bin/env node
/**
 * Serves web-preview/dist on a throwaway local port and loads the production
 * bundle in its own hidden headless browser: proves `npm run build` output runs
 * (entry chunk, avatar assets, icon font) without touching the dev server on
 * 5173 or any existing browser tab.
 *
 * Usage: node verification/dist-smoke.mjs
 */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const PORT = Number(process.env.DIST_PORT || 5183);
const CDP_PORT = Number(process.env.CDP_PORT || 9397);
const BIN =
  process.env.CHROME_HEADLESS_SHELL ||
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({name, ok: !!ok, detail: String(detail).slice(0, 500)});
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + String(detail).slice(0, 240) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- static integrity of the build output -------------------------------
const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const referenced = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
check(
  'dist/index.html 引用资源齐备',
  referenced.length > 0 && referenced.every(r => fs.existsSync(path.join(dist, r.replace(/^\//, '')))),
  referenced.join(' '),
);
const cssFile = fs.readdirSync(path.join(dist, 'assets')).find(f => f.endsWith('.css'));
const css = fs.readFileSync(path.join(dist, 'assets', cssFile), 'utf8');
check('构建产物包含 FontAwesome @font-face 且字体文件存在', css.includes('/fonts/FontAwesome.ttf') && fs.existsSync(path.join(dist, 'fonts/FontAwesome.ttf')));
for (const asset of ['nono-avatar/avatar.html', 'nono-avatar/scene.js', 'nono-avatar/GLTFLoader.js', 'nono-avatar/three.min.js', 'nono-avatar/three.module.js']) {
  check(`构建产物复用 App 资源 ${asset}`, fs.existsSync(path.join(dist, asset)));
}

// ---- throwaway static server -------------------------------------------
const types = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const file = path.join(dist, url === '/' ? 'index.html' : decodeURIComponent(url));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-dist-verify-'));
const child = spawn(
  BIN,
  [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-sandbox',
   '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
   '--enable-unsafe-swiftshader', '--hide-scrollbars', '--window-size=1440,1000', 'about:blank'],
  {stdio: 'ignore'},
);

let version;
for (let i = 0; i < 80 && !version; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    if (res.ok) version = await res.json();
  } catch { await sleep(200); }
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, {once: true}));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const {resolve, reject} = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') events.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, {resolve, reject});
    ws.send(JSON.stringify({id: msgId, method, params, ...(sessionId ? {sessionId} : {})}));
    setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); reject(new Error('timeout ' + method)); } }, 30000);
  });

const target = await send('Target.createTarget', {url: 'about:blank'});
const {sessionId} = await send('Target.attachToTarget', {targetId: target.targetId, flatten: true});
for (const d of ['Page.enable', 'Runtime.enable']) await send(d, {}, sessionId);
await send('Page.navigate', {url: `http://127.0.0.1:${PORT}/?page=Home`}, sessionId);
const evalIn = async expression => {
  const res = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}, sessionId);
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
};
const waitFor = async (expr, label, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await evalIn(expr)) return true; } catch {}
    await sleep(200);
  }
  console.log('  (timeout waiting for ' + label + ')');
  return false;
};

const rendered = await waitFor(`((document.querySelector('#app-canvas')?.innerText)||'').length > 5`, 'app canvas');
const text = await evalIn(`(document.querySelector('#app-canvas')?.innerText)||''`);
check('生产构建在浏览器中渲染主界面', rendered && ['首页', '能力', '活动', '设置'].every(t => text.includes(t)), text.slice(0, 100));
const scene = await waitFor(`(() => {try {const w = document.querySelector('#app-canvas iframe').contentWindow; return !!(w && w.NonoAvatar);} catch (e) {return false;}})()`, 'avatar scene', 20000);
check('生产构建加载 /nono-avatar 场景（three.js 场景就绪）', scene);
const font = await evalIn(
  `(async () => {try {await document.fonts.load('16px FontAwesome');} catch (e) {} await document.fonts.ready; return document.fonts.check('16px FontAwesome');})()`,
);
check('生产构建加载 /fonts/FontAwesome.ttf（字体可用）', font === true, `document.fonts.check=${font}`);
const png = await send('Page.captureScreenshot', {format: 'png'}, sessionId);
fs.writeFileSync(path.join(artifacts, '09-dist-home.png'), Buffer.from(png.data, 'base64'));
check('生产构建无 console.error / 未捕获异常', events.length === 0, events.slice(0, 4).join(' | ') || '0 errors');

child.kill('SIGTERM');
server.close();
fs.rmSync(profile, {recursive: true, force: true});
const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(artifacts, 'dist-check-results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} dist checks passed`);
process.exit(failed.length ? 1 : 0);
