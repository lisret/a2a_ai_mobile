/**
 * SherpaAsr — 纯 JNI 的离线识别 JS 包装。识别全程在 Sherpa-ONNX 里跑，
 * 不接触 `android.speech.SpeechRecognizer`，也不发任何云端请求。
 *
 * native 端把识别结果通过 `SherpaAsrEvent` 事件推上来，这里转成受控的
 * {@link AsrEvent} 再交给调用方。
 */
import {NativeEventEmitter, NativeModules} from 'react-native';

export type AsrPackId = 'builtin' | 'upgrade';

export type AsrEvent =
  | {type: 'partial'; text: string}
  | {type: 'final'; text: string; packId: AsrPackId}
  | {type: 'error'; code: 'no_permission' | 'engine_failed'};

export interface StartListeningOptions {
  packId: AsrPackId;
  modelDir: string;
  onEvent: (event: AsrEvent) => void;
}

const EVENT_NAME = 'SherpaAsrEvent';
const PACK_IDS: readonly AsrPackId[] = ['builtin', 'upgrade'];

let subscription: {remove: () => void} | null = null;

function requireNative(): {
  start: (packId: AsrPackId, modelDir: string) => Promise<void>;
  stop: () => Promise<void>;
} {
  const native = NativeModules.SherpaAsrModule;
  if (native === undefined || native === null) {
    throw new Error('sherpa_asr_unavailable');
  }
  return native;
}

function toAsrEvent(raw: {[key: string]: unknown}): AsrEvent {
  switch (raw.type) {
    case 'partial':
      return {type: 'partial', text: String(raw.text ?? '')};
    case 'final':
      return {
        type: 'final',
        text: String(raw.text ?? ''),
        packId: raw.packId === 'upgrade' ? 'upgrade' : 'builtin',
      };
    case 'error':
      return {
        type: 'error',
        code: raw.code === 'no_permission' ? 'no_permission' : 'engine_failed',
      };
    default:
      return {type: 'error', code: 'engine_failed'};
  }
}

export async function startListening(opts: StartListeningOptions): Promise<void> {
  if (!PACK_IDS.includes(opts.packId)) {
    throw new Error('invalid_pack_id');
  }
  const native = requireNative();
  const emitter = new NativeEventEmitter(NativeModules.SherpaAsrModule);
  subscription?.remove();
  subscription = emitter.addListener(EVENT_NAME, raw => {
    opts.onEvent(toAsrEvent(raw ?? {}));
  });
  await native.start(opts.packId, opts.modelDir);
}

export async function stopListening(): Promise<void> {
  subscription?.remove();
  subscription = null;
  const native = NativeModules.SherpaAsrModule;
  if (native && typeof native.stop === 'function') {
    await native.stop();
  }
}
