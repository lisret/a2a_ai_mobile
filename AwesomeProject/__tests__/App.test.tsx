/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

jest.mock('../src/features/debug/services/DebugLogService', () => ({
  debugLogService: {
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('react-native-webview', () => 'WebView');

it('renders correctly', async () => {
  let root: renderer.ReactTestRenderer;

  await renderer.act(async () => {
    root = renderer.create(<App />);
  });

  expect(root!.toJSON()).not.toBeNull();

  await renderer.act(async () => {
    root!.unmount();
  });
});
