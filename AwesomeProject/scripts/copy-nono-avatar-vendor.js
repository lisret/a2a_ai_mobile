/**
 * Copy local three.min.js for the HTML prototype. No CDN.
 * Android APK copy is handled by copyNonoAvatarAssets in app/build.gradle.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const repoRoot = path.join(appRoot, '..');
const src = path.join(appRoot, 'node_modules/three/build/three.min.js');
const destDir = path.join(repoRoot, 'vendor');
const dest = path.join(destDir, 'three.min.js');

if (!fs.existsSync(src)) {
  console.error('Missing local three.min.js. Install three@0.160.1');
  process.exit(1);
}

fs.mkdirSync(destDir, {recursive: true});
fs.copyFileSync(src, dest);
console.info('Copied', path.relative(repoRoot, dest));
