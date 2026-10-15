import React from 'react';
import {Text} from 'react-native-web';
import glyphs from '../../../node_modules/react-native-vector-icons/glyphmaps/FontAwesome.json';
export default function FontIcon({
  name,
  size = 20,
  color = '#000',
  style,
  ...props
}: any) {
  const code = (glyphs as Record<string, number>)[name];
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: 'FontAwesome',
          fontSize: size,
          color,
          fontWeight: 'normal',
          fontStyle: 'normal',
        },
        style,
      ]}>
      {code ? String.fromCodePoint(code) : '?'}
    </Text>
  );
}
