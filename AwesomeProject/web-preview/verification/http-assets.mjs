#!/usr/bin/env node
/**
 * HTTP / static-resource probe for the running preview dev server (default
 * http://127.0.0.1:5173). Read-only: it fetches pages and assets the browser
 * would request, and asserts they resolve with the expected content type.
 *
 * Usage: node verification/http-assets.mjs
 */
const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';

const checks = [
  {path: '/', type: 'text/html', needle: '/src/main.tsx', label: '预览 HTML 入口'},
  {path: '/src/main.tsx', type: 'javascript', needle: 'PreviewShell', label: '入口模块'},
  {path: '/src/PreviewShell.tsx', type: 'javascript', needle: 'AppNavigator', label: '工作台外壳（复用 AppNavigator）'},
  {path: '/src/fixtures.ts', type: 'javascript', needle: 'createPreviewFacades', label: '演示 facades'},
  {path: '/nono-avatar/avatar.html', type: 'text/html', needle: 'avatar-canvas', label: '复用 App 头像 HTML'},
  {path: '/nono-avatar/scene.js', type: 'javascript', needle: 'THREE', label: '复用 App 角色场景'},
  {path: '/nono-avatar/three.module.js', type: 'javascript', needle: 'three', label: 'three 模块'},
  {path: '/fonts/FontAwesome.ttf', type: 'font', needle: null, label: 'FontAwesome 字体'},
];

let failed = 0;
for (const check of checks) {
  try {
    const res = await fetch(BASE + check.path, {signal: AbortSignal.timeout(8000)});
    const raw = await res.arrayBuffer();
    const body = check.needle ? new TextDecoder().decode(raw) : '';
    const bytes = raw.byteLength;
    const typeOk = String(res.headers.get('content-type') || '').includes(check.type);
    const needleOk = check.needle ? body.includes(check.needle) : true;
    const ok = res.status === 200 && typeOk && needleOk && bytes > 0;
    if (!ok) failed++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${check.label}  ${check.path}  status=${res.status} type=${res.headers.get('content-type')} bytes=${bytes}${check.needle ? ` contains(${check.needle})=${needleOk}` : ''}`,
    );
  } catch (error) {
    failed++;
    console.log(`FAIL  ${check.label}  ${check.path}  error=${error.message}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} http checks passed`);
process.exit(failed ? 1 : 0);
