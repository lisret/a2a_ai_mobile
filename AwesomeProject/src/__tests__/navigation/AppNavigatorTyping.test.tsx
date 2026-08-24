import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
import {
  mapLegacyProviderIdToPreset,
  normalizeApiKeyGuideDeepLink,
} from '../../shared/types/navigation';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

// Compile-time helpers: these type-check the canonical nested/aliased routes.
const openCapabilities = (navigation: RootNav) =>
  navigation.navigate('MainTabs', {screen: 'Capabilities'});

const openVisualAgentTools = (navigation: RootNav) =>
  navigation.navigate('VisualAgentTools', {initialPreset: 'openclaw'});

const openVisualAgentToolsBlank = (navigation: RootNav) =>
  navigation.navigate('VisualAgentTools');

const openLegacyOpenClaw = (navigation: RootNav) =>
  navigation.navigate('OpenClaw');

const openApiKeyGuide = (navigation: RootNav) =>
  navigation.navigate('APIKeyGuide', {presetId: 'zhipu_glm', mode: 'preset'});

const openApiKeyGuideAll = (navigation: RootNav) =>
  navigation.navigate('APIKeyGuide');

const openEditModel = (navigation: RootNav) =>
  navigation.navigate('EditModel', {bindingId: 'binding-1', list: 'unified'});

test('Capabilities is a nested MainTabs route', () => {
  expect(openCapabilities).toBeDefined();
});

test('VisualAgentTools is a canonical root route with an openclaw alias preset', () => {
  expect(openVisualAgentTools).toBeDefined();
  expect(openVisualAgentToolsBlank).toBeDefined();
  expect(openLegacyOpenClaw).toBeDefined();
});

test('APIKeyGuide takes canonical {presetId,mode} or no params', () => {
  expect(openApiKeyGuide).toBeDefined();
  expect(openApiKeyGuideAll).toBeDefined();
});

test('EditModel is keyed by canonical bindingId', () => {
  expect(openEditModel).toBeDefined();
});

describe('legacy deep-link parser', () => {
  it('maps legacy provider ids to canonical presets exactly once', () => {
    expect(mapLegacyProviderIdToPreset('zhipu')).toBe('zhipu_glm');
    expect(mapLegacyProviderIdToPreset('moonshot')).toBe('moonshot_kimi');
  });

  it('passes canonical preset ids through', () => {
    expect(mapLegacyProviderIdToPreset('openai')).toBe('openai');
    expect(mapLegacyProviderIdToPreset('zhipu_glm')).toBe('zhipu_glm');
  });

  it('rejects unknown provider ids so they never enter Screen state', () => {
    expect(mapLegacyProviderIdToPreset('totally-unknown')).toBeNull();
  });

  it('normalizes a legacy providerId deep link to canonical params', () => {
    expect(normalizeApiKeyGuideDeepLink({providerId: 'zhipu'})).toEqual({
      presetId: 'zhipu_glm',
    });
    expect(normalizeApiKeyGuideDeepLink({providerId: 'moonshot'})).toEqual({
      presetId: 'moonshot_kimi',
    });
  });

  it('drops unknown deep-link params instead of guessing', () => {
    expect(normalizeApiKeyGuideDeepLink({providerId: 'nope'})).toBeUndefined();
    expect(normalizeApiKeyGuideDeepLink(undefined)).toBeUndefined();
  });

  it('preserves already-canonical params', () => {
    expect(
      normalizeApiKeyGuideDeepLink({presetId: 'openai', mode: 'preset'}),
    ).toEqual({presetId: 'openai', mode: 'preset'});
  });
});
