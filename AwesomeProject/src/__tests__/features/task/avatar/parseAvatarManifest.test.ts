import {parseAvatarManifest} from '../../../../features/task/avatar/parseAvatarManifest';

const valid = {
  schemaVersion: 1,
  id: 'box',
  version: '1',
  title: '测试盒',
  files: {
    model: {
      name: 'model.glb',
      bytes: 1664,
      sha256: 'ed52f7192b8311d700ac0ce80644e3852cd01537e4d62241b9acba023da3d54e',
    },
  },
  clips: {wave: 'Wave'},
};

describe('parseAvatarManifest', () => {
  it('accepts a v1 pack with only manifest files listed', () => {
    expect(parseAvatarManifest(valid, ['manifest.json', 'model.glb']).id).toBe(
      'box',
    );
  });

  it('rejects builtin as a downloadable id', () => {
    expect(() =>
      parseAvatarManifest({...valid, id: 'builtin'}, ['manifest.json', 'model.glb']),
    ).toThrow('invalid_id');
  });

  it('rejects extra files in the directory', () => {
    expect(() =>
      parseAvatarManifest(valid, ['manifest.json', 'model.glb', 'hack.js']),
    ).toThrow('extra_files');
  });

  it('rejects missing model.glb', () => {
    expect(() => parseAvatarManifest(valid, ['manifest.json'])).toThrow(
      'missing_model',
    );
  });
});
