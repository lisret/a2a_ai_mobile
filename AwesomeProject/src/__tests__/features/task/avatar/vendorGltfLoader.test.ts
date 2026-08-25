import fs from 'fs';
import path from 'path';

describe('vendored GLTFLoader.js', () => {
  const generatedPath = path.resolve(
    __dirname,
    '../../../../features/task/avatar/GLTFLoader.js',
  );

  it('imports three from the local ESM build and never from a CDN', () => {
    const source = fs.readFileSync(generatedPath, 'utf8');

    expect(source).toContain("from './three.module.js'");
    expect(source).not.toContain('cdn.jsdelivr');
    expect(source).not.toContain('unpkg.com');
    expect(source).not.toContain('cdnjs');
    expect(source).not.toContain("from 'three'");
    expect(source).not.toContain("from '../utils/BufferGeometryUtils.js'");
  });
});
