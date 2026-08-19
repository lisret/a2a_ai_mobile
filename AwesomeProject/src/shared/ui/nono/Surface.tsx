import React, {type ReactNode} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {NONO_COLORS, NONO_RADII} from './tokens';

interface SurfaceProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  ink?: boolean;
}

export const Surface: React.FC<SurfaceProps> = ({
  children,
  style,
  testID,
  accessibilityLabel,
  ink = false,
}) => {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[styles.surface, ink && styles.ink, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  surface: {
    padding: 15,
    borderRadius: NONO_RADII.md,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  ink: {
    backgroundColor: NONO_COLORS.ink,
    borderColor: NONO_COLORS.ink,
  },
});
