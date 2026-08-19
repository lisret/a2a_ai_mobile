import {act, renderHook, waitFor} from '@testing-library/react-native';
import {AccessibilityInfo} from 'react-native';
import {useReducedMotion} from '../../shared/ui/nono/useReducedMotion';

test('reads, subscribes, updates and removes the reduced-motion listener', async () => {
  const remove = jest.fn();
  let listener: ((value: boolean) => void) | undefined;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_, next) => {
    listener = next as (value: boolean) => void;
    return {remove} as never;
  });
  const hook = renderHook(() => useReducedMotion());
  await waitFor(() => expect(hook.result.current).toBe(true));
  act(() => listener?.(false));
  expect(hook.result.current).toBe(false);
  hook.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
