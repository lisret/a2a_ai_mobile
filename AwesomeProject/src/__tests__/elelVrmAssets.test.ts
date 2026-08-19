/**
 * Elel 3D 资源与播放器契约
 */
import fs from 'fs';
import path from 'path';

const VRM_DIR = path.resolve(
  __dirname,
  '../../android/app/src/main/assets/vrm',
);
const SOURCE_TS = path.resolve(
  __dirname,
  '../features/task/components/vrmViewerSource.ts',
);

describe('Elel 3D 资源', () => {
  it('打包了 Elel VRM 0.x 模型', () => {
    const file = path.join(VRM_DIR, 'elel.vrm');
    const header = fs.readFileSync(file).subarray(0, 4).toString('ascii');
    expect(header).toBe('glTF');
    expect(fs.statSync(file).size).toBeGreaterThan(1_000_000);
  });

  it('离线播放器会把 VRM 0.x 转正并对着镜头', () => {
    const runtime = fs.readFileSync(path.join(VRM_DIR, 'vrm-viewer.js'), 'utf8');
    expect(runtime).toContain("window.__ELEL_MODEL || 'elel.vrm'");
    expect(runtime).toContain('rotation.y = Math.PI');
    expect(runtime).toContain('autoRotate');
    expect(runtime).toContain('getBoneNode');
  });

  it('Android 走本地 assets，iOS 同源播放器也会转 180 度', () => {
    const html = fs.readFileSync(path.join(VRM_DIR, 'index.html'), 'utf8');
    const source = fs.readFileSync(SOURCE_TS, 'utf8');
    expect(html).toContain('vrm-viewer.js');
    expect(html).toContain("window.__ELEL_MODEL = 'elel.vrm'");
    expect(source).toContain("file:///android_asset/vrm/index.html");
    expect(source).toContain('rotation.y = Math.PI');
    expect(source).toContain('Avatar01_Neutral.vrm');
  });
});
