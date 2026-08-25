// Wave 4A Task 11 scaffold (release architecture gate). Verbatim from the
// Task 11 brief. RED is expected wherever a listed screen/component still
// imports a forbidden runtime-infrastructure symbol or a model form still
// hard-codes a provider chip; a later wave's production changes make these
// pass without editing this file.
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8');

test('screens depend on facades, not runtime infrastructure', () => {
  const screenFiles = [
    'src/features/task/screens/HomeScreen.tsx',
    'src/features/task/screens/TaskHistoryScreenTab.tsx',
    'src/features/capability/screens/CapabilitiesScreen.tsx',
    'src/features/capability/screens/PhoneOperateScreen.tsx',
    'src/features/capability/screens/VisualAgentToolsScreen.tsx',
    'src/features/capability/screens/OpenClawScreen.tsx',
    'src/features/model/screens/AddModelScreen.tsx',
    'src/features/model/screens/EditModelScreen.tsx',
    'src/features/model/screens/ModelListScreen.tsx',
    'src/features/settings/screens/APIKeyGuideScreen.tsx',
    'src/features/model/components/ModelListPanel.tsx',
    'src/features/model/components/ModelItem.tsx',
    'src/features/capability/screens/ErrandsScreen.tsx',
    'src/features/capability/screens/ErrandDetailScreen.tsx',
    'src/features/capability/screens/PrivacyScreen.tsx',
  ];
  const source = screenFiles.map(read).join('\n');
  expect(source).not.toMatch(/AsyncStorage|ModelService|NonoConfigService|TaskHistoryService|agentRuntime\/providers|OperateTaskRunner|DeviceEventEmitter|OpenClawFacade|OpenClawViewState/);
});

test('model forms have one mode axis and no hard-coded provider chips', () => {
  const source = [
    'src/features/model/screens/AddModelScreen.tsx',
    'src/features/model/screens/EditModelScreen.tsx',
    'src/features/model/screens/ModelListScreen.tsx',
    'src/features/model/components/ApiProviderSelector.tsx',
    'src/features/model/components/ModelNameSelector.tsx',
    'src/features/model/components/ModelListPanel.tsx',
    'src/features/model/components/ModelItem.tsx',
    'src/features/settings/screens/APIKeyGuideScreen.tsx',
  ].map(read).join('\n');
  expect(source).not.toMatch(/providerChip|huggingface|fetchModelList|modelService|AIModel|apiKey|ModelProviderRegistry/);
  expect(source).toMatch(/preset/);
  expect(source).toMatch(/custom/);
  expect(source).toMatch(/manual-model-id/);
});

test('forbidden persistent boundaries contain no sensitive fields', () => {
  const files = [
    'src/features/task/services/TaskExecutionHeadless.ts',
    'src/core/engine/operateRuntime/session/OperateSessionStore.ts',
    'src/features/task/services/TaskHistoryService.ts',
    'src/features/debug/services/DebugLogService.ts',
  ];
  const source = files.map(read).join('\n');
  expect(source).not.toMatch(/apiKey|Authorization|Bearer\s|data:image/);

  // `screenshotUri`/`modelResponse`/`finalScreenshot` are legitimately named
  // in TaskHistoryService.ts's `projectStepForStorage`/`projectTaskForStorage`
  // only as the destructured-and-discarded keys of the pre-persistence
  // redaction idiom `const {field, ...rest} = value;`, plus in a comment
  // describing that same idiom (`// ... individual steps still drop
  // screenshotUri/modelResponse below.`) — never as a value that reaches
  // `AsyncStorage.setItem`. Strip line comments and this exact discard idiom
  // before scanning so a genuine persisted occurrence of these fields still
  // fails the guard.
  const withoutLineComments = source
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n');
  const discardIdiom =
    /\{\s*(?:screenshotUri|modelResponse|finalScreenshot)(?:\s*,\s*(?:screenshotUri|modelResponse|finalScreenshot))*\s*,\s*\.\.\.[A-Za-z_$][\w$]*\s*\}\s*=/g;
  const withoutDiscardIdiom = withoutLineComments.replace(discardIdiom, '');
  expect(withoutDiscardIdiom).not.toMatch(/modelResponse|finalScreenshot|screenshotUri/);
});
