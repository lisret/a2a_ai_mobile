import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(root, '..');
const src = path.join(app, 'src');
const require = createRequire(import.meta.url);
const adapter = (name: string) => path.join(root, 'src/adapters', name);
const nativeFiles = new Set([
  'features/capability/services/operatePermissions',
  'features/task/asr/AsrModelStore',
  'features/task/asr/SilentAsrUpgrade',
  'features/task/asr/SpeechRouter',
  'features/task/avatar/LocalPack',
  'features/model/services/ModelService',
]);

export default defineConfig({
  root,
  resolve: {
    alias: [
      {find: /^react-native$/, replacement: adapter('react-native.tsx')},
      {find: /^react$/, replacement: require.resolve('react')},
      {
        find: /^react\/jsx-runtime$/,
        replacement: require.resolve('react/jsx-runtime'),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: require.resolve('react/jsx-dev-runtime'),
      },
      {find: /^react-dom$/, replacement: require.resolve('react-dom')},
      {
        find: /^react-dom\/client$/,
        replacement: require.resolve('react-dom/client'),
      },
      {
        find: /^@react-navigation\/(native|native-stack|bottom-tabs)$/,
        replacement: adapter('navigation.tsx'),
      },
      {
        find: /^react-native-safe-area-context$/,
        replacement: adapter('safe-area.tsx'),
      },
      {find: /^react-native-webview$/, replacement: adapter('webview.tsx')},
      {find: /^react-native-svg$/, replacement: adapter('svg.tsx')},
      {
        find: /^react-native-vector-icons\/FontAwesome$/,
        replacement: adapter('font-icon.tsx'),
      },
      {
        find: /^@react-native-async-storage\/async-storage$/,
        replacement: adapter('storage.ts'),
      },
      {
        find: /^react-native-permissions$/,
        replacement: adapter('native-services.ts'),
      },
      {find: /^@core\/ability$/, replacement: adapter('native-services.ts')},
      {find: '@shared', replacement: path.join(src, 'shared')},
      {find: '@features', replacement: path.join(src, 'features')},
      {find: '@core', replacement: path.join(src, 'core')},
      {find: '@navigation', replacement: path.join(src, 'navigation')},
    ],
    dedupe: ['react', 'react-dom', 'react-native-web'],
  },
  plugins: [
    {
      name: 'nono-preview-native-boundaries',
      enforce: 'pre',
      resolveId(id, importer) {
        if (!importer) return;
        const absolute = path.isAbsolute(id)
          ? id
          : path.resolve(path.dirname(importer.split('?')[0]), id);
        const relative = path
          .relative(src, absolute)
          .replace(/\.(tsx?|jsx?)$/, '');
        if (relative === 'features/capability/services/lanMcp/LanMcpService')
          return adapter('lan-mcp.ts');
        if (nativeFiles.has(relative)) return adapter('native-services.ts');
      },
      async transform(code, id) {
        if (!id.startsWith(src) || !/\.[jt]sx?$/.test(id)) return;
        // Home uses one lazy native require. Keep its mobile source unchanged.
        if (code.includes("require('react-native-permissions')")) {
          code =
            `import * as __previewPermissions from '${adapter(
              'native-services.ts',
            )}';\n` +
            code.replaceAll(
              "require('react-native-permissions')",
              '__previewPermissions',
            );
        }
        return {code, map: null};
      },
      configureServer(server) {
        const avatarDirectory = path.join(src, 'features/task/avatar');
        server.watcher.add(avatarDirectory);
        server.watcher.on('change', filename => {
          if (filename.startsWith(avatarDirectory + path.sep))
            server.ws.send({type: 'full-reload'});
        });
        // Serve the actual App avatar and icon font; no copied asset versions.
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').split('?')[0];
          let filename: string | undefined;
          if (/^\/nono-avatar\/[a-zA-Z0-9._-]+$/.test(url)) {
            filename = path.join(
              src,
              'features/task/avatar',
              path.basename(url),
            );
            if (
              path.basename(url) === 'three.min.js' ||
              path.basename(url) === 'three.module.js'
            ) {
              filename = path.join(
                app,
                'node_modules/three/build',
                path.basename(url),
              );
            }
          } else if (url === '/fonts/FontAwesome.ttf') {
            filename = path.join(
              app,
              'node_modules/react-native-vector-icons/Fonts/FontAwesome.ttf',
            );
          }
          if (!filename) return next();
          if (!fs.existsSync(filename)) {
            res.statusCode = 404;
            res.end('Asset not found');
            return;
          }
          res.setHeader(
            'Content-Type',
            filename.endsWith('.html')
              ? 'text/html; charset=utf-8'
              : filename.endsWith('.js') || filename.endsWith('.mjs')
              ? 'application/javascript'
              : filename.endsWith('.glb')
              ? 'model/gltf-binary'
              : 'font/ttf',
          );
          fs.createReadStream(filename).pipe(res);
        });
      },
      closeBundle() {
        const output = path.join(root, 'dist');
        fs.mkdirSync(path.join(output, 'nono-avatar'), {recursive: true});
        for (const name of [
          'avatar.html',
          'scene.js',
          'GLTFLoader.js',
          'AvatarAnimation.mjs',
          'AvatarAsset.mjs',
          'AvatarOrbit.mjs',
          'nono-detached.glb',
        ]) {
          fs.copyFileSync(
            path.join(src, 'features/task/avatar', name),
            path.join(output, 'nono-avatar', name),
          );
        }
        for (const name of ['three.min.js', 'three.module.js']) {
          fs.copyFileSync(
            path.join(app, 'node_modules/three/build', name),
            path.join(output, 'nono-avatar', name),
          );
        }
        fs.mkdirSync(path.join(output, 'fonts'), {recursive: true});
        fs.copyFileSync(
          path.join(
            app,
            'node_modules/react-native-vector-icons/Fonts/FontAwesome.ttf',
          ),
          path.join(output, 'fonts/FontAwesome.ttf'),
        );
      },
    },
    react({babel: {babelrc: false, configFile: false}}),
  ],
  define: {__DEV__: 'true', global: 'globalThis'},
  server: {host: '127.0.0.1', port: 5173, strictPort: true, fs: {allow: [app]}},
  build: {outDir: 'dist', emptyOutDir: true},
});
