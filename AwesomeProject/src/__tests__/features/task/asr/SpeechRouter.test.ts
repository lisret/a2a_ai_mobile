import {
  startUtterance,
  stopUtterance,
  RouterEvent,
} from '../../../../features/task/asr/SpeechRouter';
import {resolveAsrPackId, getAsrDirUri} from '../../../../features/task/asr/AsrModelStore';
import {startListening, stopListening, AsrEvent} from '../../../../features/task/asr/SherpaAsr';

jest.mock('../../../../features/task/asr/AsrModelStore');
jest.mock('../../../../features/task/asr/SherpaAsr');

const mockResolve = resolveAsrPackId as jest.MockedFunction<typeof resolveAsrPackId>;
const mockDir = getAsrDirUri as jest.MockedFunction<typeof getAsrDirUri>;
const mockStart = startListening as jest.MockedFunction<typeof startListening>;
const mockStop = stopListening as jest.MockedFunction<typeof stopListening>;

let onEventOf: Array<(e: AsrEvent) => void> = [];

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

beforeEach(() => {
  jest.clearAllMocks();
  onEventOf = [];
  mockDir.mockImplementation(async (id: 'builtin' | 'upgrade') => `/data/asr/${id}`);
  mockStop.mockResolvedValue(undefined);
  mockStart.mockImplementation(async opts => {
    onEventOf.push(opts.onEvent);
  });
});

afterEach(async () => {
  await stopUtterance();
});

it('routes to the upgrade engine when the pack is ready', async () => {
  mockResolve.mockResolvedValue('upgrade');
  const events: RouterEvent[] = [];
  await startUtterance(e => events.push(e));

  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart.mock.calls[0][0]).toMatchObject({
    packId: 'upgrade',
    modelDir: '/data/asr/upgrade',
  });

  onEventOf[0]({type: 'final', text: 'ni hao', packId: 'upgrade'});
  expect(events).toContainEqual({
    type: 'final',
    text: 'ni hao',
    engine: 'upgrade',
  });
});

it('falls back to builtin when upgrade fails before any audio', async () => {
  mockResolve.mockResolvedValue('upgrade');
  const events: RouterEvent[] = [];
  await startUtterance(e => events.push(e));

  onEventOf[0]({type: 'error', code: 'engine_failed'});
  await flush();

  expect(mockStop).toHaveBeenCalled();
  expect(mockStart).toHaveBeenCalledTimes(2);
  expect(mockStart.mock.calls[1][0]).toMatchObject({packId: 'builtin'});

  onEventOf[1]({type: 'final', text: 'hi', packId: 'builtin'});
  expect(events).toContainEqual({type: 'final', text: 'hi', engine: 'builtin'});
});

it('does not hot-switch once audio has started', async () => {
  mockResolve.mockResolvedValue('upgrade');
  const events: RouterEvent[] = [];
  await startUtterance(e => events.push(e));

  onEventOf[0]({type: 'partial', text: 'n'});
  onEventOf[0]({type: 'error', code: 'engine_failed'});
  await flush();

  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(events).toContainEqual({
    type: 'error',
    code: 'engine_failed',
    engine: 'upgrade',
  });
});

it('goes straight to builtin when upgrade is not ready', async () => {
  mockResolve.mockResolvedValue('builtin');
  const events: RouterEvent[] = [];
  await startUtterance(e => events.push(e));

  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart.mock.calls[0][0]).toMatchObject({packId: 'builtin'});

  onEventOf[0]({type: 'error', code: 'engine_failed'});
  await flush();
  // builtin has no further fallback engine.
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(events).toContainEqual({
    type: 'error',
    code: 'engine_failed',
    engine: 'builtin',
  });
});
