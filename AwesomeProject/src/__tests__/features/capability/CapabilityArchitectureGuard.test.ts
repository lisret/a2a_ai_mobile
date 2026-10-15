import fs from 'node:fs';
import path from 'node:path';

test('capability and activity screens have no direct storage/repository access', () => {
  const files = [
    'src/features/capability/screens/CapabilitiesScreen.tsx',
    'src/features/capability/screens/VisualAgentToolsScreen.tsx',
    'src/features/capability/screens/OpenClawScreen.tsx',
    'src/features/capability/screens/ErrandsScreen.tsx',
    'src/features/capability/screens/ErrandDetailScreen.tsx',
    'src/features/capability/screens/PrivacyScreen.tsx',
    'src/features/task/screens/TaskHistoryScreenTab.tsx',
  ];
  const source = files.map(file => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
  expect(source).not.toMatch(/NonoConfigService|nonoConfigService|ModelService|modelService|TaskHistoryService|taskHistoryService|MemoryItem|SEED_MEMORIES|AsyncStorage/);
  expect(source).toMatch(/useAppFacades/);
  // The visual-agent screens must not resurrect a legacy OpenClaw facade/state.
  expect(source).not.toMatch(/facades\.openClaw|OpenClawViewState|OpenClawFacade/);
});
