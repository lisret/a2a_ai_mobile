import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {
  NONO_COLORS,
  NONO_MOTION,
  NoNoMark,
  PrimaryButton,
} from '../../shared/ui/nono';

test('exports the approved NoNo palette and motion values', () => {
  expect(NONO_COLORS).toEqual(
    expect.objectContaining({
      ink: '#1B1D30',
      pearl: '#F8F7F3',
      cloud: '#F1EFFA',
      violet: '#756BF0',
      mint: '#8DF4E2',
      coral: '#FF9B79',
    }),
  );
  expect(NONO_MOTION.tabMs).toBe(280);
  expect(NONO_MOTION.stackMs).toBe(320);
});

test.each(['idle', 'thinking', 'confirmation', 'success', 'failure'] as const)(
  'exposes an accessible robot state for %s',
  state => {
    const view = render(<NoNoMark state={state} />);
    expect(view.getByTestId(`nono-mark-${state}`)).toBeTruthy();
    expect(view.getByLabelText(`NoNo ${state}`)).toBeTruthy();
  },
);

test('disabled primary button does not dispatch', () => {
  const onPress = jest.fn();
  const view = render(<PrimaryButton label="开始执行" disabled onPress={onPress} />);
  fireEvent.press(view.getByRole('button', {name: '开始执行'}));
  expect(onPress).not.toHaveBeenCalled();
});
