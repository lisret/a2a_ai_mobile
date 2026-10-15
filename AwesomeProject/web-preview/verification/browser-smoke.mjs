#!/usr/bin/env node
/**
 * Independent browser acceptance for the NoNo shared-source web preview.
 *
 * Runs its OWN hidden chrome-headless-shell process over CDP with a throwaway
 * user-data-dir. It never attaches to, or reuses, the user's or the main
 * agent's browser tabs/windows. No network model calls, no device access.
 *
 * Usage: node verification/browser-smoke.mjs
 *   PREVIEW_URL=http://127.0.0.1:5173   override target
 *   CHROME_HEADLESS_SHELL=/path/to/bin  override browser binary
 *   CDP_PORT=9391                       override debug port
 */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.resolve(here, '..', 'artifacts');
fs.mkdirSync(artifacts, {recursive: true});

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const PORT = Number(process.env.CDP_PORT || 9391);
const SHELL_BIN =
  process.env.CHROME_HEADLESS_SHELL ||
  path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  );

const results = [];
const check = (name, ok, detail = '') => {
  results.push({name, ok: !!ok, detail: String(detail).slice(0, 800)});
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + String(detail).slice(0, 300) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Bottom gap between the app canvas and the shared CustomTabBar. The tab bar
 *  wrap carries `paddingBottom: max(insets.bottom, 8)`, so this number differs
 *  between the Android (24) and iOS (34) safe-area branches. */
const TAB_BAR_BOTTOM_INSET = `(() => {
  const canvas = document.querySelector('#app-canvas');
  if (!canvas) return null;
  const labels = ['首页', '能力', '活动', '设置'];
  const depth = el => {let n = 0; for (let p = el; p; p = p.parentElement) n++; return n;};
  const bar = [...canvas.querySelectorAll('div')]
    .filter(d => {const t = d.innerText || ''; return labels.every(l => t.includes(l));})
    .map(d => ({d, size: (d.innerText || '').length, depth: depth(d)}))
    .sort((a, b) => (a.size - b.size) || (b.depth - a.depth))[0]?.d;
  if (!bar) return null;
  return Math.round((canvas.getBoundingClientRect().bottom - bar.getBoundingClientRect().bottom) * 10) / 10;
})()`;

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Set();
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, {once: true});
      this.ws.addEventListener('error', () => reject(new Error('CDP websocket error')), {once: true});
    });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const {resolve, reject} = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (id ${msg.id})`));
        else resolve(msg.result);
        return;
      }
      for (const handler of this.handlers) handler(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject});
      this.ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }
  on(handler) {
    this.handlers.add(handler);
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

class Page {
  constructor(cdp, targetId, sessionId) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.errors = [];
  }
  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }
  async init() {
    for (const domain of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await this.send(domain);
    this.requests = [];
    this.cdp.on(msg => {
      if (msg.sessionId !== this.sessionId) return;
      if (msg.method === 'Network.requestWillBeSent') {
        this.requests.push(msg.params.request.url);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push('exception: ' + (d.exception?.description || d.text || ''));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.errors.push('log: ' + msg.params.entry.text);
      }
    });
  }
  navigate(url) {
    return this.send('Page.navigate', {url});
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (res.exceptionDetails) {
      throw new Error('eval failed: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result.value;
  }
  text() {
    return this.eval(`(document.querySelector('#app-canvas')?.innerText) || ''`);
  }
  async waitFor(expression, label, timeout = 10000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      try {
        if (await this.eval(expression)) return true;
      } catch {}
      if (Date.now() > deadline) {
        console.log(`  (timeout waiting for ${label})`);
        return false;
      }
      await sleep(150);
    }
  }
  waitForText(text, timeout = 10000) {
    return this.waitFor(`((document.querySelector('#app-canvas')?.innerText)||'').includes(${JSON.stringify(text)})`, `text ${text}`, timeout);
  }
  async rectFor(expression) {
    return this.eval(`(() => {
      const el = ${expression};
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return {x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height};
    })()`);
  }
  async clickPoint(point) {
    await this.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: point.x, y: point.y, button: 'none'});
    await this.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1});
    await this.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1});
  }
  async clickSelector(selector) {
    const point = await this.rectFor(`document.querySelector(${JSON.stringify(selector)})`);
    if (!point) throw new Error('not clickable: ' + selector);
    await this.clickPoint(point);
    return point;
  }
  /** Click the smallest visible element whose trimmed text equals `text`.
   *  `where` restricts to the top/bottom quarter of the scope box so that a
   *  tab-bar label is not confused with a same-named page heading. `scope`
   *  selects the DOM root: the app canvas, or the phone overlay portal that
   *  hosts RN Modal / CustomAlert. */
  async clickText(text, where = 'any', scope = '#app-canvas') {
    const point = await this.eval(`(() => {
      const canvas = document.querySelector(${JSON.stringify(scope)});
      if (!canvas) return null;
      const cr = canvas.getBoundingClientRect();
      const all = [...canvas.querySelectorAll('*')]
        .filter(el => el.childElementCount === 0 && (el.textContent || '').trim() === ${JSON.stringify(text)})
        .map(el => ({r: el.getBoundingClientRect()}))
        .filter(o => o.r.width > 0 && o.r.height > 0);
      const region = ${JSON.stringify(where)};
      const inRegion = all.filter(o => {
        const rel = (o.r.top + o.r.height / 2 - cr.top) / cr.height;
        if (region === 'bottom') return rel > 0.75;
        if (region === 'top') return rel < 0.25;
        return true;
      });
      const pick = (inRegion.length ? inRegion : all).sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height)[0];
      if (!pick) return null;
      return {x: pick.r.left + pick.r.width / 2, y: pick.r.top + pick.r.height / 2, w: pick.r.width, h: pick.r.height};
    })()`);
    if (!point) throw new Error('text not clickable: ' + text);
    await this.clickPoint(point);
    return point;
  }
  typeText(text) {
    return this.send('Input.insertText', {text});
  }
  setInputValue(selector, value) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', {bubbles: true}));
      return true;
    })()`);
  }
  inputValue(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
  }
  async screenshot(name) {
    const {data} = await this.send('Page.captureScreenshot', {format: 'png'});
    const file = path.join(artifacts, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }
}

async function waitForDevServer(deadlineMs = 20000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/', {signal: AbortSignal.timeout(2000)});
      if (res.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

const opened = [];

async function newTab(cdp, url) {
  const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten: true});
  const page = new Page(cdp, targetId, sessionId);
  page.label = url;
  opened.push(page);
  await page.init();
  await page.navigate(url);
  const ready = await page.waitFor(
    `(() => {const c = document.querySelector('#app-canvas'); return !!c && (c.innerText || '').length > 5;})()`,
    `app canvas at ${url}`,
    20000,
  );
  if (!ready) throw new Error('app canvas never rendered: ' + url);
  return page;
}

async function closeTab(cdp, page) {
  try {
    await cdp.send('Target.closeTarget', {targetId: page.targetId});
  } catch {}
}

async function main() {
  if (!fs.existsSync(SHELL_BIN)) throw new Error('chrome headless shell not found: ' + SHELL_BIN);
  if (!(await waitForDevServer())) throw new Error(`no dev server at ${BASE} (start npm run dev first)`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-preview-verify-'));
  const child = spawn(
    SHELL_BIN,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Chromium's own sandbox cannot initialize inside the agent harness sandbox.
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // Software WebGL so the shared three.js avatar scene can actually build.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--window-size=1440,1000',
      'about:blank',
    ],
    {stdio: ['ignore', 'pipe', 'pipe']},
  );
  let browserLog = '';
  child.stdout.on('data', d => (browserLog += d));
  child.stderr.on('data', d => (browserLog += d));

  const cdp = new CDP(await resolveBrowserWs());
  await cdp.connect();
  if (child.exitCode !== null) {
    throw new Error(`headless browser exited early (code ${child.exitCode}): ${browserLog.slice(-400)}`);
  }

  const scenarios = [
    ['主 tab：四个入口渲染与切换', async () => {
      const p = await newTab(cdp, `${BASE}/?page=Home`);
      const homeText = await p.text();
      check('Home 渲染底部四个 tab', ['首页', '能力', '活动', '设置'].every(t => homeText.includes(t)), homeText.slice(0, 120));
      check('Home 使用演示 facades（陪伴模型标签）', homeText.includes('陪伴 · NoNo 演示对话模型'), homeText.slice(0, 160));

      const steps = [
        ['能力', '操控手机', 'Capabilities'],
        ['活动', '它还记得', 'History'],
        ['设置', '执行偏好', 'Settings'],
        ['首页', '陪伴 · ', 'Home'],
      ];
      for (const [label, marker, route] of steps) {
        await p.clickText(label, 'bottom');
        const ok = await p.waitForText(marker, 8000);
        const pickerOk = await p.waitFor(
          `document.querySelector('#page-picker')?.value === ${JSON.stringify(route)}`,
          `page-picker ${route}`,
          5000,
        );
        const picker = await p.inputValue('#page-picker');
        check(`点击 tab「${label}」→ ${route} 屏幕渲染`, ok && pickerOk, `marker=${marker} found=${ok} page-picker=${picker}`);
      }
      await p.screenshot('01-tabs-home');
      await closeTab(cdp, p);
    }],

    ['详情页：点击进入 + 返回 + 深链', async () => {
      const p = await newTab(cdp, `${BASE}/?page=Capabilities`);
      check('Capabilities 列表渲染', (await p.text()).includes('操控手机'));

      await p.clickText('操控手机');
      const entered = await p.waitForText('使用此模式', 8000);
      const pickerOk = await p.waitFor(`document.querySelector('#page-picker')?.value === 'PhoneOperate'`, 'page-picker PhoneOperate', 5000);
      const picker = await p.inputValue('#page-picker');
      check('点击卡片「操控手机」→ PhoneOperate 详情屏', entered && pickerOk, `found=${entered} page-picker=${picker}`);
      await p.screenshot('02-detail-phone-operate');

      await p.clickText('\uf060', 'top'); // FontAwesome arrow-left back button
      const back = await p.waitForText('操控手机', 8000);
      const pickerBackOk = await p.waitFor(`document.querySelector('#page-picker')?.value === 'Capabilities'`, 'page-picker Capabilities', 5000);
      const pickerBack = await p.inputValue('#page-picker');
      check('详情页返回按钮回到 Capabilities', back && pickerBackOk, `found=${back} page-picker=${pickerBack}`);
      await closeTab(cdp, p);

      const deep = await newTab(cdp, `${BASE}/?page=ErrandDetail`);
      const deepText = await deep.text();
      check('深链 ?page=ErrandDetail 渲染交代详情', deepText.includes('交代详情'), deepText.slice(0, 120));
      await closeTab(cdp, deep);
    }],

    ['平台分支：Android / iOS', async () => {
      const ios = await newTab(cdp, `${BASE}/?page=Home&platform=ios`);
      const iosMeta = await ios.eval(`document.querySelector('.canvas-meta')?.innerText`);
      const iosIndicator = await ios.eval(`!!document.querySelector('.home-indicator')`);
      const iosTabInset = await ios.eval(TAB_BAR_BOTTOM_INSET);
      check('iOS：渲染 home indicator 且 meta 显示 ios', iosIndicator === true && String(iosMeta).includes('ios'), `indicator=${iosIndicator} meta=${iosMeta}`);
      const iosText = await ios.text();
      check('iOS：屏幕在 iOS 分支下仍渲染内容', iosText.includes('陪伴 · '), iosText.slice(0, 100));
      await ios.screenshot('03-ios-home');
      await closeTab(cdp, ios);

      const android = await newTab(cdp, `${BASE}/?page=Home&platform=android`);
      const androidMeta = await android.eval(`document.querySelector('.canvas-meta')?.innerText`);
      const androidIndicator = await android.eval(`!!document.querySelector('.home-indicator')`);
      const androidTabInset = await android.eval(TAB_BAR_BOTTOM_INSET);
      check('Android：无 home indicator 且 meta 显示 android', androidIndicator === false && String(androidMeta).includes('android'), `indicator=${androidIndicator} meta=${androidMeta}`);
      check(
        'Android/iOS 安全区分支生效（tab bar 距画布底部不同）',
        iosTabInset !== null && androidTabInset !== null && iosTabInset !== androidTabInset,
        `ios=${iosTabInset}px android=${androidTabInset}px`,
      );
      await closeTab(cdp, android);
    }],

    ['空数据 / 示例数据', async () => {
      const empty = await newTab(cdp, `${BASE}/?page=Errands&data=empty`);
      const emptyText = await empty.text();
      check('空数据：交代列表显示空状态', emptyText.includes('还没有交代'), emptyText.slice(0, 140));
      await empty.screenshot('04-empty-errands');
      await closeTab(cdp, empty);

      const sample = await newTab(cdp, `${BASE}/?page=Errands&data=sample`);
      const sampleText = await sample.text();
      check('示例数据：交代列表显示演示条目', sampleText.includes('晚上提醒我整理照片'), sampleText.slice(0, 140));
      await closeTab(cdp, sample);

      const history = await newTab(cdp, `${BASE}/?page=History&data=sample`);
      const historyText = await history.text();
      check('示例数据：活动页显示记忆偏好', historyText.includes('喜欢安静的地方'), historyText.slice(0, 140));
      await closeTab(cdp, history);
    }],

    ['表单：输入 + 校验弹窗 + 保存', async () => {
      const p = await newTab(cdp, `${BASE}/?page=AddModel&data=empty`);
      const hasCred = await p.eval(`!!document.querySelector('[data-testid="credential-input"]')`);
      const hasSave = await p.eval(`!!document.querySelector('[data-testid="model-form-save"]')`);
      check('AddModel：凭据输入与保存按钮渲染', hasCred && hasSave, `credential=${hasCred} save=${hasSave}`);

      await p.clickSelector('[data-testid="credential-input"]');
      await p.typeText('sk-preview-acceptance');
      const value = await p.inputValue('[data-testid="credential-input"]');
      const type = await p.eval(`document.querySelector('[data-testid="credential-input"]')?.type`);
      check('AddModel：输入进入受控输入框（secureTextEntry）', value === 'sk-preview-acceptance' && type === 'password', `value=${value} type=${type}`);

      await p.clickSelector('[data-testid="model-form-save"]');
      const alertOk = await p.waitFor(
        `(() => {const d = document.querySelector('#phone-overlays [role="dialog"]'); return !!d && d.innerText.includes('请填写模型 ID');})()`,
        'empty model id alert',
        8000,
      );
      check('AddModel：空模型 ID 触发校验弹窗', alertOk, 'alert text 请填写模型 ID');
      await p.screenshot('05-addmodel-alert');

      await p.clickText('确定', 'any', '#phone-overlays');
      const dismissed = await p.waitFor(`!document.querySelector('#phone-overlays [role="dialog"]')`, 'alert dismissed', 5000);
      check('AddModel：弹窗确认后关闭', dismissed);

      await p.setInputValue('[data-testid="manual-model-id"]', 'preview-acceptance-model');
      const typedModel = await p.inputValue('[data-testid="manual-model-id"]');
      check('AddModel：手动模型 ID 可编辑', typedModel === 'preview-acceptance-model', `value=${typedModel}`);

      await p.clickSelector('[data-testid="model-form-save"]');
      const saved = await p.waitFor(`!((document.querySelector('#app-canvas')?.innerText)||'').includes('保存模型')`, 'save navigates back', 8000);
      check('AddModel：有效表单保存后返回上一屏', saved);
      await closeTab(cdp, p);
    }],

    ['Modal 弹窗（设置页）', async () => {
      const p = await newTab(cdp, `${BASE}/?page=Settings`);
      check('Settings 渲染', (await p.text()).includes('执行偏好'));
      await p.clickText('搜索框位置');
      const opened = await p.waitFor(
        `(() => {const d = document.querySelector('#phone-overlays [role="dialog"]'); return !!d && d.innerText.includes('设置搜索框位置描述');})()`,
        'settings modal',
        8000,
      );
      check('设置页 Modal 打开并限制在手机画布内', opened);
      const placeholder = await p.eval(
        `(() => {const d = document.querySelector('#phone-overlays [role="dialog"]'); const field = d && d.querySelector('input, textarea'); return field ? field.placeholder : null;})()`,
      );
      check('设置页 Modal 文本域可交互', placeholder === '请输入搜索框位置描述...', `placeholder=${placeholder}`);
      await p.screenshot('06-settings-modal');
      await p.clickText('取消', 'any', '#phone-overlays');
      const closed = await p.waitFor(`!document.querySelector('#phone-overlays [role="dialog"]')`, 'settings modal closed', 5000);
      check('设置页 Modal 取消后关闭', closed);
      await closeTab(cdp, p);
    }],

    ['全部注册页面深链渲染巡检', async () => {
      const seed = await newTab(cdp, `${BASE}/?page=Home`);
      const names = await seed.eval(
        `[...document.querySelectorAll('#page-picker option')].map(o => o.value)`,
      );
      await closeTab(cdp, seed);
      check('工作台注册页面数量 ≥ 19', Array.isArray(names) && names.length >= 19, (names || []).join(','));

      const bad = [];
      for (const name of names) {
        const p = await newTab(cdp, `${BASE}/?page=${name}&data=sample`);
        const ready = await p.waitFor(
          `((document.querySelector('#app-canvas')?.innerText)||'').length > 5`,
          `render ${name}`,
          15000,
        );
        const boundary = await p.eval(`document.body.innerText.includes('页面暂时无法预览')`);
        if (!ready || boundary || p.errors.length) {
          bad.push(`${name}:${ready ? '' : '未渲染'}${boundary ? ' 命中错误边界' : ''}${p.errors.length ? ' ' + p.errors[0].slice(0, 80) : ''}`);
        }
        await closeTab(cdp, p);
      }
      check('全部注册页面深链可渲染且无页面级异常', bad.length === 0, bad.join(' | ') || `${names.length} pages clean`);
    }],

    ['头像与演示语音', async () => {
      const p = await newTab(cdp, `${BASE}/?page=Home&data=sample`);
      const iframeSrc = await p.eval(`document.querySelector('#app-canvas iframe')?.getAttribute('src') ?? null`);
      check('Home 复用 App 头像宿主（iframe）', !!iframeSrc && iframeSrc.includes('/nono-avatar/avatar.html'), `src=${iframeSrc}`);

      const canvasReady = await p.waitFor(
        `(() => {try {const f = document.querySelector('#app-canvas iframe'); return !!f && !!f.contentDocument?.querySelector('#avatar-canvas');} catch (e) {return false;}})()`,
        'avatar iframe canvas',
        15000,
      );
      check('头像 iframe 内 3D 画布挂载', canvasReady);
      const frameErrors = await p.eval(
        `(() => {try {const w = document.querySelector('#app-canvas iframe').contentWindow; return w.__nonoPreviewFrameLoaded === undefined ? 'loaded' : String(w.__nonoPreviewFrameLoaded);} catch (e) {return 'blocked:' + e.message;}})()`,
      );
      check('头像 iframe 同源可访问（无跨域阻断）', frameErrors === 'loaded', `frame=${frameErrors}`);
      const sceneReady = await p.waitFor(
        `(() => {try {const w = document.querySelector('#app-canvas iframe').contentWindow; return !!(w && w.NonoAvatar && typeof w.NonoAvatar.setMood === 'function');} catch (e) {return false;}})()`,
        'NonoAvatar scene API',
        15000,
      );
      check('头像 scene.js 真实建立 three.js 场景（window.NonoAvatar 就绪）', sceneReady);
      await p.screenshot('07-avatar-home');

      await p.clickSelector('#app-canvas [aria-label="和 NoNo 说话"]');
      const spoke = await p.waitForText('我听到了', 8000);
      check('点击头像走演示 ASR 适配器并出对话气泡', spoke, 'Bubble 我听到了');
      await p.screenshot('08-avatar-reply');
      await closeTab(cdp, p);
    }],
  ];

  for (const [name, fn] of scenarios) {
    console.log(`\n== ${name} ==`);
    try {
      await fn();
    } catch (error) {
      check(`${name}（场景异常）`, false, error.message);
    }
  }

  // Console/runtime cleanliness across every preview tab opened above.
  const pageErrors = opened.flatMap(p => p.errors.map(e => `${p.label} → ${e}`));
  check(
    '全部页面无 console.error / 未捕获异常',
    pageErrors.length === 0,
    pageErrors.slice(0, 6).join(' | ') || '0 errors',
  );

  // No model/provider egress: every request must stay on the local preview
  // origin (plus data:/blob: inline assets).
  const allowed = new Set([new URL(BASE).host, '127.0.0.1:5173', 'localhost:5173']);
  const allRequests = [...new Set(opened.flatMap(p => p.requests))];
  const local = allRequests.filter(url => {
    if (/^(data:|blob:)/.test(url)) return true;
    try {
      const parsed = new URL(url);
      return allowed.has(parsed.host) && ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  });
  const external = allRequests.filter(url => !local.includes(url));
  check(
    '无外部网络请求（不联网调用模型/供应商）',
    external.length === 0,
    `${allRequests.length} 个请求全部本机（${local.filter(u => u.startsWith('http')).length} http / ${local.filter(u => u.startsWith('ws')).length} ws）；外部=${external.length}${external.length ? ': ' + external.slice(0, 4).join(' ') : ''}`,
  );

  cdp.close();
  child.kill('SIGTERM');
  await sleep(300);
  if (!child.killed) child.kill('SIGKILL');
  fs.rmSync(profile, {recursive: true, force: true});
  fs.writeFileSync(path.join(artifacts, 'browser.log'), browserLog);

  const failed = results.filter(r => !r.ok);
  const failedFile = path.join(artifacts, 'check-results.json');
  fs.writeFileSync(failedFile, JSON.stringify({base: BASE, results}, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log('results: ' + failedFile);
  return failed.length === 0 ? 0 : 1;
}

async function resolveBrowserWs() {
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`, {signal: AbortSignal.timeout(1500)});
      if (res.ok) {
        const info = await res.json();
        if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
      }
    } catch {}
    if (Date.now() > deadline) throw new Error('headless browser did not expose CDP on port ' + PORT);
    await sleep(200);
  }
}

main()
  .then(code => process.exit(code))
  .catch(error => {
    console.error('ERROR: ' + error.message);
    console.error('results so far: ' + JSON.stringify(results.filter(r => !r.ok), null, 2));
    process.exit(2);
  });
