# 赛尔号陪伴角色与骨骼动画素材调研

日期：2026-10-10。DeepSeek Harness 检索，主 agent 复核并收窄结论。

## 结论与边界

首选米咔，备选布布种子；这是角色适配建议，不表示模型已经获得。
本次覆盖的公开渠道中，尚未验证到同时满足“小体型赛尔号精灵、可下载、3D 骨骼绑定、动画片段”的资源。搜索零结果不能证明资源不存在；私域、委托制作、未索引作品仍未覆盖。未下载模型，所以未作文件级骨骼与动画验证。

## 角色依据

| source | exact quote or line | impact |
|---|---|---|
| https://wiki.biligame.com/seer/米咔 | “性格温和，憨态可掬的小体型光系精灵” | 米咔优先，适合陪伴；该来源为社区图鉴。 |
| https://seer.61.com/main/spirit/1.html | 官方图鉴标题“布布种子” | 主 agent 通过网页工具成功核实角色，子 agent 的本机抓取受限不等于官网普遍不可访问。 |
| https://seer.61.com/main/spirit/4.html | “喜欢在海水中自由自在的玩耍” | 伊优也可作为活泼风格备选。 |
| https://game.61.com/news/10609.shtml | “米咔超进化” | 官方角色名写作米咔。用户并未写错名字，不应把研究提示里的别名算到用户身上。 |

陪伴适配排序是设计判断：米咔的耳朵和圆润轮廓适合倾听、歪头、轻跳；布布种子适合植物感的安静形象。无需以游戏战斗属性限制 App 内的表演设计。

## 资产检索线索（子 agent 返回；未下载复核）

| source | exact quote or line | impact |
|---|---|---|
| https://api.sketchfab.com/v3/search?type=models&q=米咔 | 子 agent 记录 total=0 | 此查询未命中，不能推出全站或全网不存在。 |
| https://sketchfab.com/3d-models/31201aaacd384dfea8322e57a2ffdb03 | API：name=雷伊（配布用）, isDownloadable=true, animationCount=0 | 不是目标小精灵；平台元数据没有动画，骨骼状态未证实。 |
| 同上 | API license label=CC Attribution | 平台标记不等于第三方角色 IP 的授权已核实，不能宣称可直接用于商业 App。 |
| https://sketchfab.com/3d-models/1f15711514394de8b19d12343ab38441 | API：name=雷伊宝贝, animationCount=1, isDownloadable=false | 有动画元数据但未开放下载；动画数量也不能单独证明是骨骼动画。 |
| https://www.aigei.com/s?q=赛尔号 | 搜索含“赛尔号角色模型C4D模型”“雷伊待机”；详情返回 banip403 | 仅线索，角色、格式、骨骼、动画、使用许可均未核实。 |
| https://makerworld.com.cn/zh/models/1854139-seer-bubuseed-blank-model | 搜索标题“赛尔号 布布种子 白模” | 打印资源方向；不能从标题推定源工程内容，未验证为可用动画模型。 |

其他检索覆盖英文/中文角色词、MMD 转载站、打印站和部分模型市场。模之屋 SPA、部分模型站不可访问；这些都是覆盖缺口，不能写成“已排除所有渠道”。主 agent 用网页工具打开上述 Sketchfab 详情也未成功，相关元数据保留为子 agent 的检索记录。

## 2D 与 3D 的区别

子 agent 找到 https://registry.npmjs.org/@seer-pet-anim/spine-renderer ，描述“基于 @esotericsoftware/spine-webgl 的赛尔号 Spine 宠物动画播放器”。这只能说明存在处理赛尔号 Spine 数据的社区工具，不能证明整个赛尔号系列均用 2D，也不能说明所有 3D 资产必须从零制作。

本轮未提取游戏文件。https://github.com/SeerAPI/seer-unity-assets 声明静态资源版权归淘米；播放器代码许可证不等于素材许可。这些资源不作为已确认可用于 App 的模型。

## 当前项目接入依据

| source | exact quote or line | impact |
|---|---|---|
| AwesomeProject/src/features/task/avatar/scene.js:278 | loadGltf(fileUrl) | 已有 GLTFLoader 接入，当前没有播放 gltf.animations，也没有 AnimationMixer。 |
| AwesomeProject/src/features/task/components/NonoAvatar3D.tsx | 状态注入同时触发 loadGltf | 实施时需让模型只在 URI 改变时加载，情绪变化只切换动作。 |
| https://threejs.org/manual/pages/animation-system.html | “actual playback is controlled by the AnimationMixer” | 可在现有 Three.js 中播放骨骼片段和混合过渡，无需先换引擎。 |

建议交付格式：GLB，包含网格、材质、贴图、骨骼、蒙皮权重与动作片段。Rigged 只表示绑定，不等于已有动画。面部眨眼可另用 morph targets。

最小动作：idle / listen / thinking / confirm / success / error，映射现有 App 状态；低幅度待机，短动作结束回到待机。验证模型内有 SkinnedMesh/骨骼、权重和驱动关节的动画轨道，再检查实际形变与切换。浏览器和 Android 复用模型及 scene.js，但需分别检查加载、材质、帧率、后台暂停和触摸表现。

## 可执行路线

1. 优先获取米咔作者提供的模型源文件与适用的使用许可；若只有静态网格，仍需适当拓扑、骨骼绑定、权重及动作制作。
2. 无合适成品时，可制作米咔的 3D 原型并绑骨，用于评审外观与动作；不得称其为官方模型或保证与官方资产一致。
3. 若用户偏好二维原画质感，可另行选择 2D 骨骼方案，但与当前 Three.js 3D 模型管线是不同资产路线。

本轮只完成选型与可行性调查，没有更换 App 角色，没有购买、联系作者或下载模型。
