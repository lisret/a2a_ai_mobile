/**
 * SpeechRouter — 决定一次点按用哪个离线引擎，并在必要时降级。
 *
 * 规则：
 *   1. `resolveAsrPackId()==='upgrade'` 先用 SenseVoice；若在出声之前就
 *      `engine_failed`（load 失败），同一次点按改用 Zipformer builtin。
 *   2. 一旦已经出声（partial/final），失败只结束本句，不热切引擎。
 *   3. 未就绪直接 builtin，builtin 没有下一级降级。
 *
 * 全程只走 Sherpa JNI，不碰任何系统语音服务。
 */
import {getAsrDirUri, resolveAsrPackId, AsrPackId} from './AsrModelStore';
import {AsrEvent, startListening, stopListening} from './SherpaAsr';

export type RouterEvent =
  | {type: 'partial'; text: string; engine: AsrPackId}
  | {type: 'final'; text: string; engine: AsrPackId}
  | {type: 'error'; code: 'no_permission' | 'engine_failed'; engine: AsrPackId};

let active = false;

export async function startUtterance(
  onEvent: (event: RouterEvent) => void,
): Promise<void> {
  if (active) {
    return;
  }
  active = true;
  const packId = await resolveAsrPackId();
  await launch(packId, onEvent, packId === 'upgrade');
}

export async function stopUtterance(): Promise<void> {
  if (!active) {
    return;
  }
  active = false;
  await stopListening();
}

async function launch(
  engine: AsrPackId,
  onEvent: (event: RouterEvent) => void,
  canFallback: boolean,
): Promise<void> {
  let sawAudio = false;

  const handle = (event: AsrEvent): void => {
    if (event.type === 'partial') {
      sawAudio = true;
      onEvent({type: 'partial', text: event.text, engine});
      return;
    }
    if (event.type === 'final') {
      sawAudio = true;
      active = false;
      onEvent({type: 'final', text: event.text, engine});
      return;
    }
    // event.type === 'error'
    if (event.code === 'engine_failed' && !sawAudio && canFallback) {
      void hotSwitchToBuiltin(onEvent);
      return;
    }
    active = false;
    onEvent({type: 'error', code: event.code, engine});
  };

  const modelDir = await getAsrDirUri(engine);
  try {
    await startListening({packId: engine, modelDir, onEvent: handle});
  } catch {
    if (canFallback) {
      await hotSwitchToBuiltin(onEvent);
    } else {
      active = false;
      onEvent({type: 'error', code: 'engine_failed', engine});
    }
  }
}

async function hotSwitchToBuiltin(
  onEvent: (event: RouterEvent) => void,
): Promise<void> {
  await stopListening();
  await launch('builtin', onEvent, false);
}
