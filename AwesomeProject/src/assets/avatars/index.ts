/**
 * 首页默认虚拟形象：Elel Silverbell
 * 来源：Open Source Avatars · Xmas Chibis
 * 授权：CC0（可自由使用、修改、再分发，无需署名）
 */
export const DEFAULT_AVATAR = {
  id: 'elel-silverbell',
  name: 'Elel Silverbell',
  collection: 'Xmas Chibis',
  license: 'CC0',
  source: 'Open Source Avatars',
  credit:
    'Elel Silverbell\n来自 Open Source Avatars · Xmas Chibis\n授权：CC0，可自由使用。',
  vrmUrl:
    'https://ipfs.io/ipfs/QmSpb8jZRtwDhpp7zjpfvU47GZyapmh8GvQApmzTxFcaLz/Avatar01_Neutral.vrm',
  /** Android 本地 3D：`file:///android_asset/vrm/elel.vrm` */
  bust: require('./elel-bust.jpg'),
  full: require('./elel-full.jpg'),
} as const;
