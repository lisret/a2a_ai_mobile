# 共用源码预览：研究核实

DeepSeek Harness 执行了只读研究。下列结论经主 agent 读取源码、构建及实际浏览器检查后采用；原始咨询中的“全部页面只读 Facade”“像素基准应采用 HTML 原型”等说法未采用。

| source | exact quote or line | impact |
| --- | --- | --- |
| `AwesomeProject/package.json` | `react: 18.2.0`, `react-native: 0.73.6` | 页面是 React Native TSX，使用 React 18 兼容的 React Native Web 0.19.13；网页依赖独立安装。 |
| `src/application/facades/AppFacadesContext.tsx:25` | `export function useAppFacades(): AppFacades` | 浏览器入口显式注入演示应用服务，避免加载生产模型/凭据图。 |
| `src/navigation/AppNavigator.tsx:37` | `const MainTabs = () =>` | 直接导入现有导航注册、四主 tab 和全部 19 个注册页面。浏览器导航适配器不等同原生转场。 |
| `src/features/task/components/NonoAvatar3D.tsx:10` | `import WebView from 'react-native-webview'` | 仅把宿主 WebView 替换为同源 iframe，角色 HTML/scene.js/GLTFLoader 沿用 App 源码。 |
| `src/shared/components/Icon.tsx:2` | `import Icon from 'react-native-vector-icons/FontAwesome'` | 图标使用相同 FontAwesome 字体及 glyphmap，避免以另一组图标替代。 |
| `src/features/task/screens/HomeScreen.tsx:236` | `require('react-native-permissions')` | Vite 仅在预览编译期间改写这一个动态 require 并注入演示权限，不修改 App 页面。 |
| `src/shared/components/PageLayout.tsx:120` | `Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 8` | 预览执行 Android/iOS 原有布局分支；状态栏和安全区用固定模拟值，最终仍需目标机型核对。 |

参考：[React Native Web 官方模块别名配置](https://necolas.github.io/react-native-web/docs/setup/)。

浏览器字体、原生 Switch、elevation、键盘、系统 Alert、安全区和原生导航转场不能由同一份 TSX 自动保证像素相等。用户最终调整应保存到共享页面/样式源码；DevTools 内的临时 CSS 不会写回源码。
