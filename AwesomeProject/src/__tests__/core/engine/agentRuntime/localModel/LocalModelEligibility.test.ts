import {
  evaluateStaticEligibility,
  parseNativeEligibility,
  type DeviceFacts,
} from '../../../../../core/engine/agentRuntime/localModel/LocalModelEligibility';

const GB = (value: number) => value * 1024 ** 3;

describe('local model static eligibility', () => {
  it.each([
    [
      {
        apiLevel: 25,
        abi: 'arm64-v8a',
        totalRamBytes: GB(8),
        freeStorageBytes: GB(4),
      },
      'unsupported',
    ],
    [
      {
        apiLevel: 26,
        abi: 'x86_64',
        totalRamBytes: GB(8),
        freeStorageBytes: GB(4),
      },
      'unsupported',
    ],
    [
      {
        apiLevel: 26,
        abi: 'arm64-v8a',
        totalRamBytes: GB(4),
        freeStorageBytes: GB(4),
      },
      'unsupported',
    ],
    [
      {
        apiLevel: 26,
        abi: 'arm64-v8a',
        totalRamBytes: GB(8),
        freeStorageBytes: GB(2),
      },
      'unsupported',
    ],
  ] as const)('maps hard constraints to %s', (facts, state) => {
    expect(evaluateStaticEligibility(facts).state).toBe(state);
  });

  it('allows an ARM64 Android 8+ device with sufficient RAM and storage', () => {
    const facts: DeviceFacts = {
      apiLevel: 26,
      abi: 'arm64-v8a',
      totalRamBytes: GB(6),
      freeStorageBytes: GB(3),
    };

    expect(evaluateStaticEligibility(facts)).toEqual({state: 'needs_download'});
  });
});

describe('native eligibility DTO parsing', () => {
  const nativeDto = {
    state: 'ready',
    checkedAtEpochMs: 123,
    fingerprint: 'device-fingerprint',
  };

  it('preserves a valid native DTO', () => {
    expect(parseNativeEligibility(nativeDto)).toEqual(nativeDto);
  });

  it('normalizes nullable native optional fields to absent', () => {
    expect(
      parseNativeEligibility({...nativeDto, fingerprint: null, reason: null}),
    ).toEqual({
      state: 'ready',
      checkedAtEpochMs: 123,
    });
  });

  it('rejects unknown native states instead of coercing them', () => {
    expect(() =>
      parseNativeEligibility({...nativeDto, state: 'surprise'}),
    ).toThrow('Unknown local model eligibility state');
  });

  it.each([-1, 1.5, Infinity, NaN])(
    'rejects an invalid checked time of %s',
    checkedAtEpochMs => {
      expect(() =>
        parseNativeEligibility({...nativeDto, checkedAtEpochMs}),
      ).toThrow('checkedAtEpochMs');
    },
  );
});

describe('local model native bridge contract', () => {
  it('forwards every no-UI operation with its exact arguments', async () => {
    const nativeEligibility = {
      state: 'ready',
      checkedAtEpochMs: 123,
      fingerprint: null,
      reason: null,
    };
    const eligibility = {state: 'ready', checkedAtEpochMs: 123};
    const nativeDownload = {
      state: 'downloading',
      downloadedBytes: 0,
      totalBytes: 0,
      reason: null,
    };
    const download = {state: 'downloading', downloadedBytes: 0, totalBytes: 0};
    const nativeModule = {
      getEligibility: jest.fn().mockResolvedValue(nativeEligibility),
      startDownload: jest.fn().mockResolvedValue(nativeDownload),
      cancelDownload: jest
        .fn()
        .mockResolvedValue({...nativeDownload, state: 'cancelled'}),
      verifyAndSelfTest: jest.fn().mockResolvedValue(nativeEligibility),
      invalidateAfterRuntimeFailure: jest
        .fn()
        .mockResolvedValue({...nativeEligibility, state: 'failed'}),
    };
    const urls = {
      modelUrl: 'https://example.test/model.gguf',
      mmprojUrl: 'https://example.test/mmproj.gguf',
    };

    jest.resetModules();
    jest.doMock('react-native', () => ({
      NativeModules: {LocalModelEligibility: nativeModule},
    }));
    const bridge = require('../../../../../core/engine/agentRuntime/localModel/LocalModelBridge');

    await expect(bridge.getLocalModelEligibility('minicpm-v')).resolves.toEqual(
      eligibility,
    );
    await expect(
      bridge.startLocalModelDownload('minicpm-v', urls),
    ).resolves.toEqual(download);
    await expect(bridge.cancelLocalModelDownload('minicpm-v')).resolves.toEqual(
      {...download, state: 'cancelled'},
    );
    await expect(
      bridge.verifyAndSelfTestLocalModel('minicpm-v'),
    ).resolves.toEqual(eligibility);
    await expect(
      bridge.invalidateLocalModelAfterRuntimeFailure(
        'native_runtime_unavailable',
      ),
    ).resolves.toEqual({...eligibility, state: 'failed'});

    expect(nativeModule.getEligibility).toHaveBeenCalledWith('minicpm-v');
    expect(nativeModule.startDownload).toHaveBeenCalledWith('minicpm-v', urls);
    expect(nativeModule.cancelDownload).toHaveBeenCalledWith('minicpm-v');
    expect(nativeModule.verifyAndSelfTest).toHaveBeenCalledWith('minicpm-v');
    expect(nativeModule.invalidateAfterRuntimeFailure).toHaveBeenCalledWith(
      'native_runtime_unavailable',
    );
  });
});
