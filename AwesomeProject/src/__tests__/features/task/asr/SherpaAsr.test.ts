import * as fs from 'fs';
import * as path from 'path';

import {NativeEventEmitter, NativeModules} from 'react-native';

import {
  startListening,
  stopListening,
  AsrEvent,
} from '../../../../features/task/asr/SherpaAsr';

describe('SherpaAsr wrapper', () => {
  let captured: ((raw: unknown) => void) | undefined;
  const remove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    captured = undefined;
    NativeModules.SherpaAsrModule = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    jest
      .spyOn(NativeEventEmitter.prototype, 'addListener')
      .mockImplementation((_name: string, cb: (raw: unknown) => void) => {
        captured = cb;
        return {remove} as never;
      });
  });

  it('rejects an illegal packId before touching native', async () => {
    await expect(
      startListening({
        packId: 'bogus' as never,
        modelDir: '/data/asr',
        onEvent: jest.fn(),
      }),
    ).rejects.toThrow('invalid_pack_id');
    expect(NativeModules.SherpaAsrModule.start).not.toHaveBeenCalled();
  });

  it('starts native and maps events into AsrEvent', async () => {
    const events: AsrEvent[] = [];
    await startListening({
      packId: 'upgrade',
      modelDir: '/data/asr/upgrade',
      onEvent: e => events.push(e),
    });

    expect(NativeModules.SherpaAsrModule.start).toHaveBeenCalledWith(
      'upgrade',
      '/data/asr/upgrade',
    );

    captured!({type: 'partial', text: 'ni'});
    captured!({type: 'final', text: 'ni hao', packId: 'upgrade'});
    captured!({type: 'error', code: 'no_permission'});
    captured!({type: 'weird'});

    expect(events).toEqual([
      {type: 'partial', text: 'ni'},
      {type: 'final', text: 'ni hao', packId: 'upgrade'},
      {type: 'error', code: 'no_permission'},
      {type: 'error', code: 'engine_failed'},
    ]);
  });

  it('stops native and removes the subscription', async () => {
    await startListening({
      packId: 'builtin',
      modelDir: '/data/asr/builtin',
      onEvent: jest.fn(),
    });
    await stopListening();
    expect(remove).toHaveBeenCalled();
    expect(NativeModules.SherpaAsrModule.stop).toHaveBeenCalled();
  });
});

describe('SherpaAsrModule.kt native source', () => {
  const kt = fs.readFileSync(
    path.join(
      process.cwd(),
      'android/app/src/main/java/com/awesomeproject/bridge/SherpaAsrModule.kt',
    ),
    'utf8',
  );

  it('never uses the system SpeechRecognizer path', () => {
    expect(kt).not.toMatch(/SpeechRecognizer/);
    expect(kt).not.toMatch(/ACTION_RECOGNIZE_SPEECH/);
    expect(kt).not.toMatch(/jsdelivr|unpkg|cdnjs/);
  });
});
