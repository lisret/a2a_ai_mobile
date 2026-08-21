import React, {createContext, useContext} from 'react';
import type {AppFacades} from './UiRuntimeContracts';

// The composition seam is injectable and has no hidden fallback: the context
// starts as `null` so consuming outside a provider fails loudly instead of
// silently binding to a stray production graph.
const AppFacadesReactContext = createContext<AppFacades | null>(null);

export interface AppFacadesProviderProps {
  value: AppFacades;
  children: React.ReactNode;
}

export function AppFacadesProvider({
  value,
  children,
}: AppFacadesProviderProps): React.JSX.Element {
  return (
    <AppFacadesReactContext.Provider value={value}>
      {children}
    </AppFacadesReactContext.Provider>
  );
}

export function useAppFacades(): AppFacades {
  const facades = useContext(AppFacadesReactContext);
  if (facades === null) {
    throw new Error('AppFacadesProvider is missing');
  }
  return facades;
}
