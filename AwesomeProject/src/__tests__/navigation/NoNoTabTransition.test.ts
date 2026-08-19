import {
  beginTabTransition,
  createInitialTabTransition,
  finishTabTransition,
  getTabDirection,
  TAB_TRANSITION,
} from '../../navigation/NoNoTabTransition';

test('uses route index to determine direction and exact travel values', () => {
  expect(getTabDirection(0, 2)).toBe(1);
  expect(getTabDirection(3, 1)).toBe(-1);
  expect(TAB_TRANSITION.incomingPercent).toBe(28);
  expect(TAB_TRANSITION.outgoingPercent).toBe(12);
  expect(TAB_TRANSITION.durationMs).toBe(280);
});

test('ignores stale completion after rapid retargeting', () => {
  const first = beginTabTransition(createInitialTabTransition(0), 1);
  const second = beginTabTransition(first, 3);
  expect(finishTabTransition(second, first.generation)).toBe(second);
  expect(finishTabTransition(second, second.generation).activeIndex).toBe(3);
});
