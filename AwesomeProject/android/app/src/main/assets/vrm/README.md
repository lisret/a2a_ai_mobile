# Elel 3D (VRM 0.x)

离线播放器，给 Android WebView 用（无 importmap，兼容 Android 7 System WebView）。

| 文件 | 说明 |
| --- | --- |
| `elel.vrm` | Elel Silverbell，CC0，约 3.2MB |
| `three.min.js` | three@0.140.2 UMD |
| `GLTFLoader.js` / `OrbitControls.js` | three examples/js |
| `three-vrm.min.js` | @pixiv/three-vrm@0.6.11 |
| `index.html` / `vrm-viewer.js` | 眨眼、骨骼待机、自动旋转、点按回传 RN。VRM 0.x 会转 180° 面对镜头 |

首页加载失败时 `AvatarStage` 会退回半身静图。
