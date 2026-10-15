import {NativeModules, Platform} from 'react-native';
import {lanMcpService} from '../../../../features/capability/services/lanMcp/LanMcpService';

const originalOS = Platform.OS;
const status = {running: false, endpoint: null, codeConfigured: false};
beforeEach(() => {
  Platform.OS = 'android';
  delete NativeModules.LanMcpModule;
});
afterAll(() => {
  Platform.OS = originalOS;
  delete NativeModules.LanMcpModule;
});

it('reports missing native integration and refuses to simulate a real service', async () => {
  expect(await lanMcpService.getStatus()).toMatchObject({
    supported: false,
    running: false,
    preview: false,
  });
  await expect(lanMcpService.startService()).rejects.toThrow('Android');
});

it('reports iOS as unsupported even if a native module is present', async () => {
  Platform.OS = 'ios';
  NativeModules.LanMcpModule = {getStatus: jest.fn()};
  expect(await lanMcpService.getStatus()).toMatchObject({
    supported: false,
    running: false,
  });
  expect(NativeModules.LanMcpModule.getStatus).not.toHaveBeenCalled();
});

it('validates code before sending it to native secure storage', async () => {
  NativeModules.LanMcpModule = {
    setConnectionCode: jest
      .fn()
      .mockResolvedValue({...status, codeConfigured: true}),
  };
  await expect(lanMcpService.setConnectionCode('bad code')).rejects.toThrow(
    '12',
  );
  expect(NativeModules.LanMcpModule.setConnectionCode).not.toHaveBeenCalled();
  await expect(
    lanMcpService.setConnectionCode('New_123456789'),
  ).resolves.toMatchObject({codeConfigured: true, preview: false});
});

it('preserves native startup errors instead of returning a running status', async () => {
  NativeModules.LanMcpModule = {
    startService: jest.fn().mockRejectedValue(new Error('WIFI_REQUIRED')),
  };
  await expect(lanMcpService.startService()).rejects.toThrow('WIFI_REQUIRED');
});
