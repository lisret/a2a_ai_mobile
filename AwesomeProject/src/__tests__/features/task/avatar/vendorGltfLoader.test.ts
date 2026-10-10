import fs from 'fs';
import path from 'path';

describe('vendored GLTFLoader.js', () => {
  const generatedPath = path.resolve(
    __dirname,
    '../../../../features/task/avatar/GLTFLoader.js',
  );

  it('packs the local three ESM build into Android avatar assets', () => {
    const gradle = fs.readFileSync(
      path.resolve(__dirname, '../../../../../android/app/build.gradle'),
      'utf8',
    );
    expect(gradle).toContain('node_modules/three/build');
    expect(gradle).toContain('three.module.js');
    expect(
      fs.existsSync(
        path.resolve(__dirname, '../../../../../node_modules/three/build/three.module.js'),
      ),
    ).toBe(true);
  });

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
