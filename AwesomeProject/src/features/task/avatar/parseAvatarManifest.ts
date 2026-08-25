export interface AvatarManifestV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  files: {
    model: {name: 'model.glb'; bytes: number; sha256: string};
  };
  clips: {wave?: string; nod?: string; talk?: string};
}

export function parseAvatarManifest(
  raw: unknown,
  dirFiles: string[],
): AvatarManifestV1 {
  const value = raw as AvatarManifestV1;
  if (!value || value.schemaVersion !== 1) {
    throw new Error('invalid_schema');
  }
  if (!value.id || value.id === 'builtin') {
    throw new Error('invalid_id');
  }
  if (value.files?.model?.name !== 'model.glb') {
    throw new Error('invalid_model');
  }
  const names = [...dirFiles].sort();
  const expected = ['manifest.json', 'model.glb'].sort();
  if (names.join() !== expected.join()) {
    if (!names.includes('model.glb')) {
      throw new Error('missing_model');
    }
    throw new Error('extra_files');
  }
  return value;
}
