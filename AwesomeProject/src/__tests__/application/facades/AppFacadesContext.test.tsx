import React from 'react';
import {Text} from 'react-native';
import {render} from '@testing-library/react-native';
import {
  AppFacadesProvider,
  useAppFacades,
} from '../../../application/facades/AppFacadesContext';
import {projectVisualAgentToolOptions} from '../../../application/facades/createAppFacades';
import {createBuiltInVisualAgentToolRegistry} from '../../../connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

const Probe = () => {
  const facades = useAppFacades();
  return (
    <Text>
      {facades.visualAgentTools && facades.modelConfig ? 'injected' : 'missing'}
    </Text>
  );
};

describe('AppFacadesContext', () => {
  it('uses the test-owned facade graph', () => {
    const fake = {visualAgentTools: {}, modelConfig: {}} as AppFacades;
    expect(
      render(
        <AppFacadesProvider value={fake}>
          <Probe />
        </AppFacadesProvider>,
      ).getByText('injected'),
    ).toBeTruthy();
  });

  it('fails loudly outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('AppFacadesProvider is missing');
  });

  it('projects the exact canonical built-in manifests without widening capabilities', () => {
    const registry = createBuiltInVisualAgentToolRegistry();
    const options = projectVisualAgentToolOptions(registry, new Map());
    expect(
      options.map(({toolId, builtIn, maturity, capabilities}) => ({
        toolId,
        builtIn,
        maturity,
        capabilities,
      })),
    ).toEqual([
      {
        toolId: 'openclaw',
        builtIn: true,
        maturity: 'stable',
        capabilities: {
          imageInput: true,
          structuredAction: true,
          stream: true,
          cancel: true,
          approval: true,
          resume: true,
          steer: true,
          preferences: true,
        },
      },
      {
        toolId: 'codex',
        builtIn: true,
        maturity: 'beta',
        capabilities: {
          imageInput: true,
          structuredAction: true,
          stream: true,
          cancel: true,
          approval: true,
          resume: false,
          steer: true,
          preferences: false,
        },
      },
      {
        toolId: 'cursor',
        builtIn: true,
        maturity: 'beta',
        capabilities: {
          imageInput: true,
          structuredAction: true,
          stream: true,
          cancel: true,
          approval: true,
          resume: true,
          steer: true,
          preferences: false,
        },
      },
      {
        toolId: 'dsh',
        builtIn: true,
        maturity: 'experimental',
        capabilities: {
          imageInput: false,
          structuredAction: true,
          stream: true,
          cancel: true,
          approval: false,
          resume: false,
          steer: false,
          preferences: false,
        },
      },
      {
        toolId: 'hermes',
        builtIn: true,
        maturity: 'beta',
        capabilities: {
          imageInput: true,
          structuredAction: true,
          stream: true,
          cancel: true,
          approval: true,
          resume: true,
          steer: true,
          preferences: true,
        },
      },
    ]);
  });

  it('applies caller status while defaulting the rest to not_configured', () => {
    const registry = createBuiltInVisualAgentToolRegistry();
    const options = projectVisualAgentToolOptions(
      registry,
      new Map([['codex', {readiness: 'ready', configuredProfileCount: 2}]]),
    );
    const codex = options.find(option => option.toolId === 'codex');
    const cursor = options.find(option => option.toolId === 'cursor');
    expect(codex?.readiness).toBe('ready');
    expect(codex?.configuredProfileCount).toBe(2);
    expect(cursor?.readiness).toBe('not_configured');
    expect(cursor?.configuredProfileCount).toBe(0);
  });
});
