import React, {type ReactNode} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {NONO_COLORS} from './tokens';

interface NoNoPageProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export const NoNoPage: React.FC<NoNoPageProps> = ({
  children,
  style,
  testID,
  accessibilityLabel,
}) => {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[styles.page, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: NONO_COLORS.pearl,
  },
});
