import React from 'react';
import {VisualAgentToolsScreen} from './VisualAgentToolsScreen';

// `OpenClaw` is a one-version compatibility alias. It owns no state and never
// reads a Facade directly: it simply renders the canonical
// `VisualAgentToolsScreen` pre-focused on the built-in `openclaw` tool. The next
// major release deletes this alias.
export const OpenClawScreen: React.FC = () => (
  <VisualAgentToolsScreen initialPreset="openclaw" />
);
