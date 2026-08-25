/**
 * Vendor three.js's GLTFLoader for the offline avatar WebView.
 *
 * GLTFLoader.js normally imports from the bare 'three' specifier and from a
 * sibling BufferGeometryUtils.js module. The WebView only ships avatar.html,
 * scene.js, GLTFLoader.js and three.module.js (no bundler, no CDN), so this
 * script rewrites the 'three' import to the vendored ESM build and inlines
 * the single BufferGeometryUtils helper GLTFLoader depends on
 * (toTrianglesDrawMode), avoiding a second module fetch inside the WebView.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const loaderSrc = path.join(
  appRoot,
  'node_modules/three/examples/jsm/loaders/GLTFLoader.js',
);
const bufferUtilsSrc = path.join(
  appRoot,
  'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
);
const dest = path.join(appRoot, 'src/features/task/avatar/GLTFLoader.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(loaderSrc) || !fs.existsSync(bufferUtilsSrc)) {
  fail('Missing three/examples/jsm sources. Install three@0.160.1');
}

/** Extracts a top-level `function name(...) { ... }` block by brace counting. */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) {
    fail(`Could not find function ${name} in BufferGeometryUtils.js`);
  }
  const openBrace = source.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === '{') {
      depth += 1;
    } else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  fail(`Unbalanced braces while extracting function ${name}`);
  return '';
}

let loader = fs.readFileSync(loaderSrc, 'utf8');
const bufferUtils = fs.readFileSync(bufferUtilsSrc, 'utf8');

const threeImportTail = "} from 'three';";
if (!loader.includes(threeImportTail)) {
  fail("Unexpected GLTFLoader.js: missing \"from 'three';\" import");
}
loader = loader.replace(threeImportTail, "} from './three.module.js';");

const bufferUtilsImport =
  "import { toTrianglesDrawMode } from '../utils/BufferGeometryUtils.js';";
if (!loader.includes(bufferUtilsImport)) {
  fail('Unexpected GLTFLoader.js: missing BufferGeometryUtils import');
}

// toTrianglesDrawMode() also references TrianglesDrawMode, which GLTFLoader
// does not otherwise import (it only imports the Fan/Strip variants).
if (!loader.includes('TriangleStripDrawMode,')) {
  fail('Unexpected GLTFLoader.js: missing TriangleStripDrawMode import');
}
loader = loader.replace(
  'TriangleStripDrawMode,',
  'TriangleStripDrawMode,\n\tTrianglesDrawMode,',
);

const toTrianglesDrawMode = extractFunction(bufferUtils, 'toTrianglesDrawMode');
const inlinedComment =
  '// Inlined from three/examples/jsm/utils/BufferGeometryUtils.js so the\n' +
  '// WebView only fetches GLTFLoader.js and three.module.js.\n';
loader = loader.replace(
  bufferUtilsImport,
  `${inlinedComment}${toTrianglesDrawMode}`,
);

fs.mkdirSync(path.dirname(dest), {recursive: true});
fs.writeFileSync(dest, loader, 'utf8');
console.info('Wrote', path.relative(appRoot, dest));
