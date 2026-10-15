# NoNo 现成模型检索 — 2026-10-10

状态更新：用户已下载 Ronin_FaShan 的 `磁吸超能nono.3mf`，本轮已验证嵌入作者、许可与网格，并生成共享 NoNo GLB。下文保留早期联网检索记录；早期“尚未取得文件”已被本地下载取代。适配说明见 `src/features/task/avatar/nono-companion.md`。

## 用户要求与实施判断

用户指定赛尔号 NoNo，使用网上现成造型，并要求最终有骨骼动画。
这不要求下载资源本身已经带动画：取得合适静态模型后补骨骼与动作符合现有授权，不需要再次让用户选路线。

## 已核实来源

| 来源 | 原文/证据 | 影响 |
|---|---|---|
| https://www.ugsnx.com/thread-356116-1-1.html | 标题“赛尔号nono”，作者 zyj09，2025-09-12；附件“nono.prt.rar (139 Bytes)” | 存在模型分享条目；附件尺寸异常小，未取得文件，不能据文件名确认其内部内容或骨骼情况。 |
| 上述页面附件按钮 | “抱歉，只有特定用户可以下载本站附件” | 主 agent 实际点击后确认访问权限阻碍，未下载、未绕过。 |
| https://makerworld.com.cn/zh/models/593427-sai-er-hao-chao-neng-nono | 图片检索返回“赛尔号 超能nono 来自 林深时见鹿”，含打印展示图；集合页也列同名作者条目 | 模型存在的线索已交叉确认；作者详情直接访问 HTTP 403，文件格式、许可和骨骼尚未验证。 |
| https://makerworld.com.cn/zh/models/602377-ci-xi-chao-neng-nono | 图片检索返回“磁吸超能nono 来自 Ronin_FaShan”，展示分件打印造型；集合页也列同名作者条目 | 分件结构是后续补骨骼的候选；没有文件不能宣称已经可以转换，或确定没有骨骼。详情访问 HTTP 403。 |
| https://www.zcool.com.cn/work/ZMzA4ODI4NDA%3D.html | 检索内容“超能NONO”“子非鱼2160”“参考图来自赛尔号” | 仅确认作者展示线索，没有发现下载入口。直接页面返回脚本挑战。 |

来源集合：https://makerworld.com.cn/zh/collections/598625-sai-er-hao
UG 展示图：https://ugsnx.oss-cn-hangzhou.aliyuncs.com/forum/202509/12/102138agp68q16yqxg66vf.png

## DSH 子 agent 的补充线索（未由主 agent 完成文件验证）

- https://www.bilibili.com/video/BV12aTu6oEU1 ：子 agent 读取视频信息后记录“超能NONO模型来自拓竹开源社区，原作者只发布了未做拆件处理完整白模”，指向 MakerWorld 593427。说明该视频讨论打印处理，不证明源包绝对没有骨骼。
- https://www.bilibili.com/video/BV1pWMuzTEtt ：作者孤言 OmO，描述“重绘+live2d制作”；普通 NoNo / 超能 NoNo 网盘分享。作者条件包含“禁止用于盈利，禁止二次配布”。这是 2D 资产，不可未经额外许可打包分发进 App；不能因此断言个人本地预览也一律禁止。
- https://budeco.top/124422.html ：子 agent 从 HTML 记录“赛尔号超能NONO 超能nono.blend”，署名 Kirhty、登录下载控件。仅是第三方源工程线索，作者身份、文件内容、骨骼与许可未知，未下载。
- https://makerworld.com.cn/zh/models/1143924-sai-er-hao-nono-ci-xi-fen-jian-ban ：磁吸分件版线索，未核实详情。
- https://makerworld.com/zh/models/739381-saierhao-super-power-nono ：国际站线索，未核实详情。

## 验证边界

- 未取得任何候选模型文件，不能报告接入成功或动画可用。
- 没有在本次覆盖渠道验证到可直接使用的带骨骼 NoNo；不等于网上不存在。
- MakerWorld 当前实测是 403；没有完成其下载界面验证，不能把 403 直接等同于只需用户登录就能解决。
- 未更换造型、未购买、未联系作者、未发布、未安装软件。
- 后续优先取得上述作者原始模型，检查分件/材质/许可后补骨骼与动作，导出共享 GLB。

研究由 DeepSeek Harness 执行（会话 feecc407-edaa-4838-8aa0-ef246ce9688b），主 agent 核实并修正过度结论。初次广泛检索已停止，收尾任务 d16b8498-077c-4d20-abde-27862d02d273 已完成。

## 续接获取尝试

用户已同意现成 NoNo 加骨骼路线。国际站 739381 通过检索工具访问返回 HTTP 402（不能据此判断模型收费）；已打开的 MakerWorld 标签存在，但浏览器自动控制连接连续超时。B站相关检索页返回验证码，未尝试代做。尚未取得模型文件。需要用户在正常浏览器下载作者提供的原始模型并给出本地路径，之后可继续检查分件、许可及转换绑定。未修改 App。
