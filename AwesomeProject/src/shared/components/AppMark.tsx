import React from 'react';
import {View, StyleSheet} from 'react-native';

interface AppMarkProps {
  size?: number;
}

export const AppMark: React.FC<AppMarkProps> = ({size = 48}) => {
  const glyph = size * 0.36;
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
        },
      ]}>
      <View
        style={[
          styles.blobTop,
          {width: size * 0.66, height: size * 0.66, right: -size * 0.22, top: -size * 0.18},
        ]}
      />
      <View
        style={[
          styles.blobBottom,
          {width: size * 0.43, height: size * 0.43, left: -size * 0.14, bottom: -size * 0.1},
        ]}
      />
      <View
        style={[
          styles.glyph,
          {
            width: glyph,
            height: glyph,
            left: size * 0.32,
            top: size * 0.32,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mark: {
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    backgroundColor: '#4e47ab',
    shadowColor: '#373185',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 6,
  },
  blobTop: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#8b81ff',
  },
  blobBottom: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#ff9b79',
  },
  glyph: {
    position: 'absolute',
    zIndex: 1,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    transform: [{rotate: '45deg'}],
  },
});
