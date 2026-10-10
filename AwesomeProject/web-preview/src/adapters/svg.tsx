import React, {forwardRef} from 'react';
const component = (tag: string) =>
  forwardRef<any, any>(({children, ...props}, ref) =>
    React.createElement(tag, {...props, ref}, children),
  );
export default component('svg');
export const Svg = component('svg');
export const Path = component('path');
export const Circle = component('circle');
export const Rect = component('rect');
export const Ellipse = component('ellipse');
export const Line = component('line');
export const Polyline = component('polyline');
export const Polygon = component('polygon');
export const G = component('g');
export const Defs = component('defs');
export const LinearGradient = component('linearGradient');
export const Stop = component('stop');
export const ClipPath = component('clipPath');
export const Mask = component('mask');
