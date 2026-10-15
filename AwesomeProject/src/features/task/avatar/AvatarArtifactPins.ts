export interface AvatarArtifactPin {
  id: string;
  version: string;
  title: string;
  url: string;
  bytes: number;
  sha256: string;
}

/**
 * 钉死的可下载头像外观清单。仅允许 HTTPS 直链，安装校验字节数与 SHA-256。
 */
export const AVATAR_PINS = [
  {
    id: 'box',
    version: '1',
    title: '测试盒',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Models/raw/main/2.0/Box/glTF-Binary/Box.glb',
    bytes: 1664,
    sha256: 'ed52f7192b8311d700ac0ce80644e3852cd01537e4d62241b9acba023da3d54e',
  },
] as const;
