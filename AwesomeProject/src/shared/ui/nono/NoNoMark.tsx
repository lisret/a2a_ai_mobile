import React from 'react';
import {View} from 'react-native';
import Svg, {Circle, Rect} from 'react-native-svg';
import {NONO_COLORS} from './tokens';

export type NoNoMarkState = 'idle' | 'thinking' | 'confirmation' | 'success' | 'failure';

interface NoNoMarkProps {
  state?: NoNoMarkState;
  size?: number;
  testID?: string;
  accessibilityLabel?: string;
  style?: object;
}

const EYE: Record<NoNoMarkState, string> = {
  idle: NONO_COLORS.mint,
  thinking: NONO_COLORS.mint,
  confirmation: NONO_COLORS.coral,
  success: NONO_COLORS.mint,
  failure: NONO_COLORS.coral,
};

export const NoNoMark: React.FC<NoNoMarkProps> = ({
  state = 'idle',
  size = 48,
  testID,
  accessibilityLabel,
  style,
}) => {
  const eye = EYE[state];
  const thinking = state === 'thinking';
  const success = state === 'success';

  return (
    <View
      testID={testID ?? `nono-mark-${state}`}
      accessibilityLabel={accessibilityLabel ?? `NoNo ${state}`}
      style={style}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Rect x="6" y="8" width="36" height="32" rx="16" fill={NONO_COLORS.violet} />
        <Rect x="12" y="16" width="24" height="14" rx="8" fill={NONO_COLORS.ink} />
        <Rect
          x={thinking ? 16 : 17}
          y={success ? 21 : 19}
          width={thinking || success ? 6 : 3}
          height={thinking || success ? 5 : 8}
          rx="1.5"
          fill={success ? 'none' : eye}
          stroke={success ? eye : 'none'}
          strokeWidth={success ? 2 : 0}
        />
        <Rect
          x={thinking ? 26 : 28}
          y={success ? 21 : 19}
          width={thinking || success ? 6 : 3}
          height={thinking || success ? 5 : 8}
          rx="1.5"
          fill={success ? 'none' : eye}
          stroke={success ? eye : 'none'}
          strokeWidth={success ? 2 : 0}
        />
        <Circle cx="24" cy="36" r="1.4" fill={eye} />
      </Svg>
    </View>
  );
};
