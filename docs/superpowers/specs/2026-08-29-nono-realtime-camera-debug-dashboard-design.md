# NoNo 实时摄像头网页调试台设计

日期：2026-08-29

## 1. 目标

在现有 `tools/realtime_camera/` Mac 原型上增加一个仅本机访问的网页调试台。工具直接调用本机摄像头，持续展示实时视频、检测框、逐秒分析结果和性能指标，并允许在不中断摄像头的情况下热调整主要分析参数。

调试台必须帮助回答三个问题：

1. 摄像头、采样、快速分析、对象检测和语义增强分别是否正在工作？
2. 当前一秒结果使用了多少帧、花了多久、是否迟到或复用旧状态？
3. 调整采样 FPS 和阈值后，准确性、输出延迟和资源占用发生了什么变化？

快速通道继续承担每秒必达结果。网页渲染、浏览器断开和 VLM 延迟均不得阻塞摄像头采集或快速通道。

## 2. 当前基础与需要修正的问题

已有原型具备：

- OpenCV 摄像头采集。
- 一秒窗口和目标采样 FPS。
- 帧差与光流运动分析。
- MediaPipe EfficientDet-Lite0 对象检测。
- 进入、离开和对象变化状态。
- 每秒结构化摘要合同。
- latest-only 执行器的独立测试。

当前 `RealtimeCameraRuntime` 仍在一个同步循环里执行摄像头读取、运动分析、对象检测和结果发射。这可以跑通短测试，但摄像头读帧或模型偶发变慢时会直接推迟下一次结果；它也无法同时为浏览器稳定提供视频。因此调试台不能简单包一层网页，必须先拆分采集、调度、快速分析、语义分析和展示线程。

MediaPipe 1.0.1 已在当前 Apple M1 Pro/macOS 环境中实测发生 `DrishtiMetalHelper` 原生 abort；工具继续固定已验证可工作的 MediaPipe 0.10.31、OpenCV 4.12.0 和 NumPy 2.2.6。升级这些依赖必须重新执行真实模型加载和摄像头测试。

## 3. 采用方案

采用 Python 本地服务 + 浏览器网页调试台：

- Python 进程独占摄像头和模型。
- Flask 提供同源 HTML、MJPEG 视频流和 JSON API。
- 浏览器只负责展示、调参和控制，不直接请求浏览器摄像头权限，不运行推理。
- 服务默认只绑定 `127.0.0.1`，不向局域网暴露。

没有采用 OpenCV 原生窗口，因为其参数面板、事件历史和中文信息展示能力有限；没有采用 React Native 或 Electron，因为这一步的目标是快速测量模型流程，而不是交付最终手机 UI。

## 4. 总体架构

```text
OpenCVCameraSource
       │ 原始采集，独立线程
       ▼
LatestFrameStore ───────────────► PreviewEncoder ─► /video.mjpg
       │                              ▲
       │ 按配置采样                    │ 最近检测框/状态
       ▼                              │
OneSecondRingBuffer                  │
       │ 每秒冻结不可变窗口            │
       ▼                              │
LatestOnlyFastWorker ─► FastResultStore ─► DashboardStateStore
       │                                      │
       └─► SemanticTrigger                    ├─► /api/state
                  │                           ├─► /api/events
                  ▼                           └─► 网页轮询
        LatestOnlySemanticWorker
                  │
                  └─► SemanticResultStore

网页 PATCH /api/config ─► VersionedConfigStore ─► 各线程读取配置快照
```

每个模块职责：

| 模块 | 职责 | 线程/队列规则 |
| --- | --- | --- |
| `CaptureWorker` | 打开摄像头、持续读取、记录单调时间戳 | 一个线程；只覆盖 latest slot |
| `LatestFrameStore` | 保存最新原始帧与 capture 指标 | 最多一帧；读操作取得只读快照 |
| `AnalysisScheduler` | 按采样 FPS 收集帧、按绝对 1 Hz deadline 关闭窗口 | 不以 `sleep(1)` 累积漂移 |
| `LatestOnlyFastWorker` | 运动、对象检测、聚合 | 一个 running + 一个最新 pending |
| `SemanticWorker` | 变化触发后的代表帧/四帧图语义增强 | 一个 running + 一个最新 pending；可禁用 |
| `DashboardStateStore` | 保存配置、最新状态、指标和有限事件历史 | 锁内只做小对象替换，不做图像处理 |
| `PreviewEncoder` | 在视频副本上绘制检测框和状态，再编码 JPEG | 独立线程；默认 12 FPS；只保留最新 JPEG |
| Flask | 返回静态页、视频流和 JSON API | 浏览器慢只丢预览帧，不形成队列 |

## 5. 内存与帧所有权

原始帧默认不写磁盘。进程只允许持有：

- 一张最新摄像头帧。
- 最近一秒采样环形缓冲，最大按 24 FPS 加少量边界余量。
- 一张最新已标注预览帧或 JPEG。
- 当前语义任务的一张代表图或四帧时序拼图。

浏览器 MJPEG 客户端各自等待新的 JPEG generation；客户端来不及消费时跳到最新帧，不缓存中间帧。事件历史只保留最近 120 条结构化事件，不包含 JPEG、像素数组或人物身份。

## 6. 配置合同与热更新

配置以不可变、带版本号的快照发布：

```ts
interface DashboardConfigV1 {
  schemaVersion: 1;
  revision: number;
  analysisEnabled: boolean;
  detectorEnabled: boolean;
  semanticEnabled: boolean;
  sampleFps: number;
  previewFps: number;
  detectionScoreThreshold: number;
  motionPixelThreshold: number;
  motionRatioThreshold: number;
  sceneRatioThreshold: number;
  semanticCooldownSeconds: number;
}
```

范围固定为：

| 参数 | 范围 | 默认 | 生效方式 |
| --- | ---: | ---: | --- |
| `sampleFps` | 2～24 | 15 | 下一采样 tick |
| `previewFps` | 2～20 | 12 | 下一预览 tick |
| `detectionScoreThreshold` | 0.15～0.90 | 0.45 | 下一检测结果的软件过滤 |
| `motionPixelThreshold` | 5～80 | 20 | 下一窗口 |
| `motionRatioThreshold` | 0.001～0.20 | 0.01 | 下一窗口 |
| `sceneRatioThreshold` | 0.05～0.95 | 0.35 | 下一窗口 |
| `semanticCooldownSeconds` | 1～60 | 10 | 下一语义触发判断 |

MediaPipe detector 在创建时使用最低 0.15 阈值，网页阈值在结果映射阶段再次过滤，因此调整阈值不需要重建模型。每个一秒窗口只使用关闭窗口时取得的一份配置快照；同一窗口中途修改配置不会产生混合参数。

摄像头 index、分辨率和目标采集 FPS 属于冷配置。网页允许修改，但明确标记“应用并重启摄像头”；重启只停止采集线程和清空一秒缓冲，不重启网页服务。

所有更新执行完整字段校验。非法、未知或非有限数值返回 HTTP 400，当前有效配置不变。成功更新返回新的完整配置和 revision。

## 7. 本地 HTTP 接口

| 方法与路径 | 用途 |
| --- | --- |
| `GET /` | 单页调试台 |
| `GET /video.mjpg` | 最新标注画面的 MJPEG 流 |
| `GET /api/state` | 配置、生命周期、最新结果和实时指标 |
| `GET /api/events?after=<sequence>` | 获取 sequence 之后的有限事件 |
| `PATCH /api/config` | 热更新一个或多个参数 |
| `POST /api/control/start` | 启动或恢复分析 |
| `POST /api/control/stop` | 停止分析并释放摄像头 |
| `POST /api/control/restart-camera` | 应用冷配置并重启摄像头 |

接口只接受和返回 JSON。默认不启用 CORS，服务只绑定 loopback。网页启动时由 CLI 打开 `http://127.0.0.1:<port>/`；若端口占用，启动失败并打印明确错误，不静默换端口。

## 8. 页面设计

```text
┌──────────────────────── 视频与叠加层 ────────────────────────┬────────── 状态与控制 ──────────┐
│                                                             │ [运行中] [停止] [重启摄像头]     │
│  1280×720 MJPEG                                             │ 采集 20.4 FPS / 采样 13.5 FPS    │
│  [person 0.87]                                              │ 发射间隔 / 处理耗时 / stale      │
│                                                             ├────────── 参数 ────────────────┤
│  当前：检测到对象进入画面                                    │ 采样 FPS       [──●────] 15      │
│                                                             │ 检测阈值       [────●──] 0.45   │
│                                                             │ 运动/场景阈值、预览 FPS           │
├──────────────────── 最近一秒结果与事件时间线 ────────────────┴──────────────────────────────┤
│ #128  person · entered · stationary · 114ms · confidence 0.93 · fast_path                    │
│ #127  cup · left · stationary · 108ms · confidence 0.88                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

页面包含：

- 视频区：检测框、类别、置信度、窗口 ID、运动状态和当前短摘要。
- 生命周期：camera、fast detector、semantic worker 分别显示 starting/running/degraded/failed。
- 数值指标：采集 FPS、实际采样 FPS、窗口帧数、处理 P50/P95、结束到发射延迟、发射间隔、stale、丢窗口和最大 pending depth。
- 参数区：滑块输入显示精确数值；停止拖动后 150ms debounce 提交；失败时恢复服务端值并显示错误。
- 事件时间线：快速结果和语义增强使用不同标识，通过 `windowId` 关联；最多展示最近 60 条。
- 语义区：真实模型未就绪时显示 `semantic_analyzer_unavailable`，禁用开关且不生成占位描述。

页面使用原生 HTML、CSS 和 JavaScript，不引入前端构建链。桌面优先，同时允许窄窗口上下排列。

## 9. 视频标注规则

- 检测框来自最新已完成快速窗口，在下一结果到达前保持显示，并标明结果年龄。
- 结果年龄超过 1.5 秒时框变为灰色；超过 3 秒隐藏，避免把旧检测当成当前事实。
- 运动与场景变化使用文本徽标，不绘制未经验证的轨迹线。
- 预览编码使用图像副本，绝不在环形缓冲的分析帧上原地绘制。
- 预览默认按浏览器区域缩放，后端仍在配置的分析尺寸上工作。

## 10. 语义增强边界

调试台接入既定 `SemanticWorker` 接口，但不允许为了界面完整而伪造 VLM 输出：

- 未配置真实 FastVLM worker：快速流程完整运行，页面显示语义通道不可用。
- 配置真实 worker：变化窗口可提交代表帧或四帧拼图，结果异步追加到事件时间线。
- VLM 超时、退出或迟到：状态变 degraded，快速摘要和视频继续。
- 同时最多一个语义任务，pending 只保留最新窗口；落后超过一个窗口的结果丢弃。

“调试台完成”表示摄像头、视频、快速分析、调参和指标链路完成；“全部 VLM 流程完成”还必须产生真实模型 ID 的语义结果。两者在验收报告中分开表述。

## 11. 错误处理与生命周期

| 情况 | 后台行为 | 页面行为 |
| --- | --- | --- |
| 摄像头权限拒绝 | 不循环请求权限 | 显示系统设置指引 |
| 摄像头打开失败 | 服务继续运行，可修改 index 重试 | 视频占位图 + failed 状态 |
| 摄像头读帧中断 | 有界重连；期间不伪造新帧 | 显示 frame age 和 interrupted |
| 快速任务超过 700ms | 迟到结果丢弃，发射上一确认状态 | stale 计数增加 |
| 浏览器断开 | 释放该 MJPEG client | 后台分析继续 |
| detector 失败 | 关闭检测但保留运动路径 | degraded + 明确错误码 |
| VLM 失败 | 关闭语义 worker | 快速路径继续 |
| stop | 停止采样、关闭 worker、释放摄像头 | 状态 stopped，网页仍可 start |
| 服务退出 | 停止所有线程并释放摄像头 | 连接断开 |

后台线程错误不得直接把完整 traceback、模型原始响应或帧内容发给网页；API 返回固定错误码和简短安全信息，详细开发 traceback 只打印到本机 stderr。

## 12. 测试策略

### 12.1 自动测试

- 配置合同：范围、非有限数值、未知字段、revision、同窗口配置快照。
- 帧存储：latest-only、generation 等待、关闭唤醒、无界队列不存在。
- 调度：绝对 1 Hz deadline、采样 FPS 热更新、慢 fast worker 时 pending 深度不超过 1、stale fallback。
- 预览：在副本上画框、旧框变灰/隐藏、JPEG generation 覆盖而非排队。
- HTTP：页面、state、events、配置 PATCH、start/stop/restart、非法输入和 loopback 默认值。
- 浏览器慢客户端：人工阻塞读取时分析窗口数和发射节拍不受影响。
- detector/VLM 失败：页面状态降级而快速结果继续。

### 12.2 当前 Mac 实机测试

1. 打开网页并显示实时 1280×720 视频。
2. 连续运行至少 5 分钟，浏览器持续打开。
3. 在 8、12、15 FPS 间切换，每次调整不重启摄像头。
4. 调高/调低检测阈值，观察框与对象列表变化。
5. 覆盖静止、人物/物品进入、离开和明显移动。
6. 暂停浏览器网络读取或关闭页面，确认后台 1 Hz 继续。
7. stop 后确认摄像头指示灯熄灭；start 后恢复。
8. 禁用或终止语义 worker，确认快速流程继续。

## 13. 验收标准

- 浏览器能看到持续视频、检测框、当前摘要、参数和事件历史。
- 参数热更新在下一窗口生效，并显示新的配置 revision。
- 有效运行阶段每秒产生一条快速结果；5 分钟得到 300 条，摄像头明确中断除外。
- 发射间隔 P95 位于 900～1100ms。
- 窗口结束到快速结果输出 P95 小于 700ms。
- fast 和 semantic pending 深度均不超过 1。
- 慢浏览器或 VLM 不增加 fast 输出延迟。
- 15 FPS 目标下实际窗口帧数、处理耗时和丢帧可在页面直接观察。
- stop/退出后摄像头完全释放。
- `.runtime/` 中没有摄像头原始帧或录像文件。
- 真实 VLM 未配置时页面明确降级；只有收到真实 model ID 的结果才标记语义流程通过。

## 14. 非目标

- 不提供公网或局域网远程访问。
- 不做登录、多人协作、云端存储或历史数据库。
- 不录制视频、不保存截图、不做人脸或身份识别。
- 不在这一工具内训练或微调模型。
- 不把网页实现直接当成手机端 UI；手机端只复用线程边界、合同和测量结论。
