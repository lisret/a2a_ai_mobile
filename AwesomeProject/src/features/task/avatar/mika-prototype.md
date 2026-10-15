# 米咔 · 自制 3D 原型

此文件对应 `mika-prototype.glb`，为 NoNo 项目程序化制作的角色原型，非官方模型、非游戏提取资产。角色外形参考 https://wiki.biligame.com/seer/米咔 ，参考图片未打包进 App。角色名称与设计来自赛尔号；本文件不声称获得角色 IP 的产品发行许可。

模型可用 `node scripts/generate-mika-avatar.mjs` 重新生成，无需下载素材或新安装建模软件。GLB 内嵌材质与顶点颜色，没有外部贴图，约 967 KiB，14 根骨骼。耳朵与躯干使用多骨骼混合权重；头、四肢和眼睛均通过骨骼驱动。

动作：idle（呼吸、眨眼）、listen（倾听、抬耳）、thinking（歪头、抬手）、confirm（点头）、success（轻跳）、error（疑惑摇头）。后三个是一次性动作，播放完回到 idle。面部当前采用几何细节与眼部骨骼，不包含口型同步。

`node scripts/test-mika-avatar.mjs` 检查骨骼、归一化权重、真实顶点形变、动作切换与低动态设置。Android 与浏览器共用 GLB、AvatarAnimation.mjs 和 scene.js；真机渲染仍需设备验收。
