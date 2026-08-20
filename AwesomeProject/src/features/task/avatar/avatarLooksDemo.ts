export type AvatarLook = {
  id: string;
  title: string;
  sizeLabel: string;
  installed: boolean;
  bundled: boolean;
};

const SEED: AvatarLook[] = [
  {
    id: 'builtin',
    title: '默认角色',
    sizeLabel: '随安装包',
    installed: true,
    bundled: true,
  },
  {
    id: 'look-mint',
    title: '薄荷护目',
    sizeLabel: '6.1 MB',
    installed: true,
    bundled: false,
  },
  {
    id: 'look-dusk',
    title: '晚风紫',
    sizeLabel: '8.4 MB',
    installed: false,
    bundled: false,
  },
  {
    id: 'look-box',
    title: '测试盒',
    sizeLabel: '2 KB',
    installed: false,
    bundled: false,
  },
];

function cloneSeed(): AvatarLook[] {
  return SEED.map(item => ({...item}));
}

let items = cloneSeed();
let activeId = 'builtin';

export function resetAvatarLooksDemo(): void {
  items = cloneSeed();
  activeId = 'builtin';
}

export function listAvatarLooks(): AvatarLook[] {
  return items.map(item => ({...item}));
}

export function getActiveAvatarLook(): AvatarLook {
  return items.find(item => item.id === activeId) || items[0];
}

export function selectAvatarLook(id: string): boolean {
  const item = items.find(look => look.id === id);
  if (!item?.installed) {
    return false;
  }
  activeId = item.id;
  return true;
}

export function installAvatarLook(id: string): boolean {
  const item = items.find(look => look.id === id);
  if (!item || item.bundled) {
    return false;
  }
  item.installed = true;
  activeId = item.id;
  return true;
}
