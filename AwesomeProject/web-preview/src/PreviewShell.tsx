import React, {useEffect, useMemo, useState} from 'react';
import {AppNavigator} from '../../src/navigation/AppNavigator';
import {AppFacadesProvider} from '../../src/application/facades/AppFacadesContext';
import {CustomAlert} from '../../src/shared/components/CustomAlert';
import {createPreviewFacades} from './fixtures';
import {previewPlatform} from './adapters/react-native';

const pages = [
  ['Home', '首页'],
  ['Capabilities', '能力'],
  ['History', '活动'],
  ['Settings', '设置'],
  ['PhoneOperate', '操控手机'],
  ['RemoteControl', '被操控模式'],
  ['LanMcp', '局域网模式'],
  ['VisualAgentTools', '视觉工具'],
  ['OpenClaw', 'OpenClaw'],
  ['Errands', '交代的事'],
  ['ErrandDetail', '交代详情'],
  ['Privacy', '隐私'],
  ['CompanionConfig', '陪伴配置'],
  ['AvatarLooks', '角色外观'],
  ['AddModel', '新增模型'],
  ['EditModel', '编辑模型'],
  ['APIKeyGuide', 'API Key 指引'],
  ['TaskHistory', '模型任务'],
  ['TaskDetail', '任务详情'],
  ['DebugLog', '调试日志'],
  ['About', '关于'],
];
const files: Record<string, string> = {
  Home: 'features/task/screens/HomeScreen.tsx',
  Capabilities: 'features/capability/screens/CapabilitiesScreen.tsx',
  History: 'features/task/screens/TaskHistoryScreenTab.tsx',
  Settings: 'features/settings/screens/SettingsScreen.tsx',
  PhoneOperate: 'features/capability/screens/PhoneOperateScreen.tsx',
  RemoteControl: 'features/capability/screens/RemoteControlScreen.tsx',
  LanMcp: 'features/capability/screens/LanMcpScreen.tsx',
  VisualAgentTools: 'features/capability/screens/VisualAgentToolsScreen.tsx',
  OpenClaw: 'features/capability/screens/OpenClawScreen.tsx',
  Errands: 'features/capability/screens/ErrandsScreen.tsx',
  ErrandDetail: 'features/capability/screens/ErrandDetailScreen.tsx',
  Privacy: 'features/capability/screens/PrivacyScreen.tsx',
  CompanionConfig: 'features/settings/screens/CompanionConfigScreen.tsx',
  AvatarLooks: 'features/settings/screens/AvatarLooksScreen.tsx',
  AddModel: 'features/model/screens/AddModelScreen.tsx',
  EditModel: 'features/model/screens/EditModelScreen.tsx',
  APIKeyGuide: 'features/settings/screens/APIKeyGuideScreen.tsx',
  TaskHistory: 'features/task/screens/TaskHistoryScreen.tsx',
  TaskDetail: 'features/task/screens/TaskDetailScreen.tsx',
  DebugLog: 'features/debug/screens/DebugLogScreen.tsx',
  About: 'features/settings/screens/AboutScreen.tsx',
};
const presets = [
  {name: '390 × 844', width: 390, height: 844},
  {name: '393 × 852', width: 393, height: 852},
  {name: '360 × 800', width: 360, height: 800},
  {name: '412 × 915', width: 412, height: 915},
];

class PreviewErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {error: Error | null}
> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  render() {
    if (this.state.error)
      return (
        <div className="preview-error">
          <strong>页面暂时无法预览</strong>
          <p>{this.state.error.message}</p>
          <button onClick={() => location.reload()}>重新加载</button>
        </div>
      );
    return this.props.children;
  }
}

export function PreviewShell() {
  const facades = useMemo(createPreviewFacades, []);
  const [page, setPage] = useState(
    new URLSearchParams(location.search).get('page') ?? 'Home',
  );
  const [device, setDevice] = useState(0);
  const [fit, setFit] = useState(true);
  const [windowSize, setWindowSize] = useState({
    width: innerWidth,
    height: innerHeight,
  });
  const [utterance, setUtterance] = useState('你好，NoNo');
  const [alert, setAlert] = useState<any>(null);
  const dimensions = presets[device];
  const scale = fit
    ? Math.min(
        1,
        Math.max(0.3, (windowSize.height - 132) / dimensions.height),
        Math.max(
          0.3,
          (windowSize.width - (windowSize.width > 680 ? 400 : 40)) /
            dimensions.width,
        ),
      )
    : 1;
  useEffect(() => {
    const resize = () =>
      setWindowSize({width: innerWidth, height: innerHeight});
    const route = (event: Event) => setPage((event as CustomEvent).detail);
    const modal = (event: Event) => setAlert((event as CustomEvent).detail);
    addEventListener('resize', resize);
    addEventListener('nono-preview:route', route);
    addEventListener('nono-preview:alert', modal);
    return () => {
      removeEventListener('resize', resize);
      removeEventListener('nono-preview:route', route);
      removeEventListener('nono-preview:alert', modal);
    };
  }, []);
  useEffect(() => {
    (window as any).__nonoPreviewUtterance = utterance;
  }, [utterance]);
  const changePage = (name: string) => {
    setPage(name);
    dispatchEvent(new CustomEvent('nono-preview:navigate', {detail: {name}}));
  };
  const reloadOption = (key: string, value: string) => {
    const url = new URL(location.href);
    url.searchParams.set(key, value);
    url.searchParams.set('page', page);
    location.assign(url);
  };
  return (
    <div className="preview-workspace">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">SHARED SOURCE PREVIEW</span>
          <h1>NoNo 页面工作台</h1>
        </div>
        <span className="live-badge">
          <i /> 本地运行
        </span>
      </header>
      <div className="workspace-body">
        <aside className="controls">
          <section>
            <label htmlFor="page-picker">页面</label>
            <select
              id="page-picker"
              value={page}
              onChange={event => changePage(event.target.value)}>
              {pages.map(([name, label]) => (
                <option key={name} value={name}>
                  {label}
                </option>
              ))}
            </select>
          </section>
          <section>
            <label htmlFor="platform-picker">App 布局</label>
            <select
              id="platform-picker"
              value={previewPlatform}
              onChange={event => reloadOption('platform', event.target.value)}>
              <option value="android">Android</option>
              <option value="ios">iOS</option>
            </select>
          </section>
          <section>
            <label htmlFor="device-picker">屏幕尺寸（逻辑像素）</label>
            <select
              id="device-picker"
              value={device}
              onChange={event => setDevice(Number(event.target.value))}>
              {presets.map((preset, index) => (
                <option key={preset.name} value={index}>
                  {preset.name}
                </option>
              ))}
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={fit}
                onChange={event => setFit(event.target.checked)}
              />{' '}
              适应窗口 · 当前 {Math.round(scale * 100)}%
            </label>
          </section>
          <section>
            <label htmlFor="data-picker">页面数据</label>
            <select
              id="data-picker"
              value={
                new URLSearchParams(location.search).get('data') ?? 'sample'
              }
              onChange={event => reloadOption('data', event.target.value)}>
              <option value="sample">示例内容 / 已配置</option>
              <option value="empty">空内容 / 未配置</option>
            </select>
          </section>
          <section>
            <label htmlFor="utterance">演示发言</label>
            <textarea
              id="utterance"
              value={utterance}
              onChange={event => setUtterance(event.target.value)}
              rows={3}
            />
            <p>
              回到首页，点击角色后使用这段文字。可试“记住我喜欢安静”或“帮我打开地图”。
            </p>
          </section>
          <section className="source-card">
            <label>当前共用文件</label>
            <code>AwesomeProject/src/{files[page]}</code>
            <p>
              修改这里的 TSX / StyleSheet 并保存，预览自动更新，App
              使用同一份修改。
            </p>
          </section>
          <p className="boundary-note">
            使用演示数据，不调用真实模型或操作手机。字体、原生控件、键盘与系统动画需真机核对。浏览器开发者工具里的临时修改不会保存到
            App。
          </p>
        </aside>
        <main className="stage">
          <div className="canvas-meta">
            <span>{pages.find(([name]) => name === page)?.[1] ?? page}</span>
            <span>
              {dimensions.width} × {dimensions.height} · {previewPlatform}
            </span>
          </div>
          <div
            className="phone-slot"
            style={{
              width: dimensions.width * scale,
              height: dimensions.height * scale,
            }}>
            <div
              className="phone-viewport"
              style={{
                width: dimensions.width,
                height: dimensions.height,
                transform: `scale(${scale})`,
              }}>
              <div id="app-canvas">
                <PreviewErrorBoundary>
                  <AppFacadesProvider value={facades}>
                    <AppNavigator />
                  </AppFacadesProvider>
                </PreviewErrorBoundary>
              </div>
              <div className="system-status" aria-hidden="true">
                <span>9:41</span>
                <span>▴ ▰ ▱</span>
              </div>
              {previewPlatform === 'ios' && (
                <div className="home-indicator" aria-hidden="true" />
              )}
              <div id="phone-overlays" />
              {alert && (
                <CustomAlert
                  visible
                  title={alert.title}
                  message={alert.message}
                  buttons={alert.buttons}
                  onDismiss={() => setAlert(null)}
                />
              )}
            </div>
          </div>
          <p className="canvas-caption">
            画面直接来自 App 源码 · 未另写 HTML 页面
          </p>
        </main>
      </div>
    </div>
  );
}
