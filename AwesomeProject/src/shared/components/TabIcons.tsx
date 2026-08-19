import React from 'react';
import Svg, {Path, Circle} from 'react-native-svg';

interface TabIconProps {
  color: string;
  size?: number;
}

export const HomeIcon: React.FC<TabIconProps> = ({color, size = 20}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 10.8 12 3l9 7.8v9a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 19.8Z"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M9 21v-7h6v7" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ModelsIcon: React.FC<TabIconProps> = ({color, size = 20}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="m12 2 8 4.5v9L12 20l-8-4.5v-9Z"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="m4 6.5 8 4.5 8-4.5M12 11v9" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const HistoryIcon: React.FC<TabIconProps> = ({color, size = 20}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.9" />
    <Path d="M12 7v5l3.2 2" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SettingsIcon: React.FC<TabIconProps> = ({color, size = 20}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.9" />
    <Path
      d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.82 2.82-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.82-2.82.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.82-2.82.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.82 2.82-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 1 .3.2.7.3 1.1.3h.1v4h-.1c-.4 0-.8.1-1.1.3-.4.1-.8.4-1 .4Z"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
