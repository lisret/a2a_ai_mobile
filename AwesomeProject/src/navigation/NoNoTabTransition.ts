export const TAB_TRANSITION = {
  incomingPercent: 28,
  outgoingPercent: 12,
  durationMs: 280,
} as const;

export type NoNoTabTransitionState = {
  activeIndex: number;
  fromIndex: number | null;
  toIndex: number | null;
  direction: -1 | 0 | 1;
  generation: number;
  transitioning: boolean;
};

export function getTabDirection(from: number, to: number): -1 | 0 | 1 {
  if (to > from) {
    return 1;
  }
  if (to < from) {
    return -1;
  }
  return 0;
}

export function createInitialTabTransition(index: number): NoNoTabTransitionState {
  return {
    activeIndex: index,
    fromIndex: null,
    toIndex: null,
    direction: 0,
    generation: 0,
    transitioning: false,
  };
}

export function beginTabTransition(
  state: NoNoTabTransitionState,
  targetIndex: number,
): NoNoTabTransitionState {
  const source =
    state.transitioning && state.toIndex !== null ? state.toIndex : state.activeIndex;
  if (source === targetIndex) {
    return {
      ...state,
      activeIndex: source,
      fromIndex: null,
      toIndex: null,
      direction: 0,
      transitioning: false,
    };
  }
  return {
    activeIndex: source,
    fromIndex: source,
    toIndex: targetIndex,
    direction: getTabDirection(source, targetIndex),
    generation: state.generation + 1,
    transitioning: true,
  };
}

export function finishTabTransition(
  state: NoNoTabTransitionState,
  generation: number,
): NoNoTabTransitionState {
  if (state.generation !== generation) {
    return state;
  }
  return {
    ...state,
    activeIndex: state.toIndex ?? state.activeIndex,
    fromIndex: null,
    toIndex: null,
    direction: 0,
    transitioning: false,
  };
}
