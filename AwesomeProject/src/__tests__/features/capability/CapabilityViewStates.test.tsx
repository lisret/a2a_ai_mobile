import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {VisualAgentToolsScreen} from '../../../features/capability/screens/VisualAgentToolsScreen';
import {PrivacyScreen} from '../../../features/capability/screens/PrivacyScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {
  AppFacades,
  VisualAgentToolOptionViewState,
} from '../../../application/facades/UiRuntimeContracts';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
    useRoute: () => ({params: {}}),
    useFocusEffect: (cb: () => void | (() => void)) => {
      const React = require('react');
      React.useEffect(() => cb(), []);
    },
  };
});

jest.mock('@shared/components/PageLayout', () => {
  const React = require('react');
  const {View, Text} = require('react-native');
  return {
    PageLayout: ({title, children}: {title: string; children: React.ReactNode}) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        children,
      ),
  };
});

const canonicalAdapters: readonly VisualAgentToolOptionViewState[] = [
  {toolId: 'openclaw', builtIn: true, label: 'OpenClaw', readiness: 'disconnected', maturity: 'stable', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: true}, configuredProfileCount: 1},
  {toolId: 'codex', builtIn: true, label: 'Codex', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}, configuredProfileCount: 0},
  {toolId: 'cursor', builtIn: true, label: 'Cursor', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: false, preferences: false}, configuredProfileCount: 0},
  {toolId: 'dsh', builtIn: true, label: 'DSH (DeepSeek Harness)', readiness: 'not_configured', maturity: 'experimental', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: false, resume: false, steer: false, preferences: false}, configuredProfileCount: 0},
  {toolId: 'hermes', builtIn: true, label: 'Hermes', readiness: 'not_configured', maturity: 'beta', capabilities: {imageInput: true, structuredAction: true, stream: true, cancel: true, approval: true, resume: true, steer: true, preferences: false}, configuredProfileCount: 0},
];

function makeFacades(): AppFacades {
  return {
    visualAgentTools: {
      getViewState: jest.fn().mockResolvedValue({
        status: 'ready', revision: 4, enabled: true, activeProfileId: 'openclaw-1',
        adapters: canonicalAdapters,
        profiles: [{profileId: 'openclaw-1', toolId: 'openclaw', displayName: 'OpenClaw', enabled: true, endpointLabel: 'bridge.example', readiness: 'disconnected', maturity: 'stable', requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true}, capabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true}, runnable: false, blockers: [{code: 'visual_agent_not_ready', message: 'OpenClaw 未连接，操作会暂停'}]}],
        canOperate: false, blocker: {code: 'visual_agent_not_ready', message: 'OpenClaw 未连接，操作会暂停'},
      }),
      setEnabled: jest.fn(), saveProfile: jest.fn(), deleteProfile: jest.fn(), setActiveProfile: jest.fn(), refreshProfile: jest.fn(),
    },
    privacy: {
      getViewState: jest.fn().mockResolvedValue({
        status: 'ready', memoryEnabled: true, memoryLocation: 'device', canUseVisualAgentMemory: false,
        channels: [{id: 'local_vision', state: 'local', destinationLabel: '仅这台手机', fields: ['结构化观察']}],
        persistedDiagnosticFields: ['错误码', '耗时'],
      }),
      setMemoryEnabled: jest.fn(), setMemoryLocation: jest.fn(), forgetAllPreferences: jest.fn(),
    },
  } as unknown as AppFacades;
}

test('renders actual tool readiness/capabilities and privacy-channel states', async () => {
  const facades = makeFacades();
  const tools = render(<AppFacadesProvider value={facades}><VisualAgentToolsScreen /></AppFacadesProvider>);
  await waitFor(() => expect(tools.getByText('OpenClaw 未连接，操作会暂停')).toBeTruthy());
  expect(tools.getByText('审批：支持')).toBeTruthy();
  const privacy = render(<AppFacadesProvider value={facades}><PrivacyScreen /></AppFacadesProvider>);
  await waitFor(() => expect(privacy.getByText('结构化观察')).toBeTruthy());
});
