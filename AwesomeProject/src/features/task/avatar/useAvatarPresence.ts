import {useCallback, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, AppState} from 'react-native';
import type {NoNoMood} from '../../../shared/components/NoNoMascot';
import type {
  PetIntent,
  PetIntentContext,
} from '../../../application/facades/PetIntent';

export type RequestPetIntent = (
  context: PetIntentContext,
  signal: AbortSignal,
) => Promise<PetIntent | null>;
const TEMPERAMENTS = ['calm', 'curious', 'playful', 'sleepy'];
const ACTIONS: Record<NoNoMood, true> = {
  idle: true,
  thinking: true,
  success: true,
  error: true,
  confirm: true,
  listen: true,
  wave: true,
  happy: true,
  sleepy: true,
  curious: true,
  wink: true,
  surprised: true,
  shy: true,
  laugh: true,
  stretch: true,
  peek: true,
  unfold: true,
  fold: true,
  spin: true,
  dance: true,
};

/** Owns foreground lifetime and the abortable, low-frequency AI suggestion. */
export function useAvatarPresence({
  active,
  gltfUri,
  mood,
  reactionKey,
  requestPetIntent,
  applyIntent,
}: {
  active: boolean;
  gltfUri: string | null;
  mood: string;
  reactionKey: number;
  requestPetIntent?: RequestPetIntent;
  applyIntent(value: string): void;
}) {
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequest = useRef(-Infinity);
  const current = useRef({eligible: false, requestPetIntent, applyIntent});
  current.current = {
    eligible:
      active && foreground && !reducedMotion && !gltfUri && mood === 'idle',
    requestPetIntent,
    applyIntent,
  };
  const cancel = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);
  useEffect(() => {
    let mounted = true;
    let motionChanged = false;
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        current.current.eligible = false;
        cancel();
      }
      setForeground(state === 'active');
    });
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      value => {
        motionChanged = true;
        if (value) {
          current.current.eligible = false;
          cancel();
        }
        setReducedMotion(value);
      },
    );
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .then(value => {
        if (mounted && !motionChanged && value) setReducedMotion(true);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      current.current.eligible = false;
      cancel();
      app.remove();
      motion.remove();
    };
  }, [cancel]);
  useEffect(() => {
    cancel();
    return cancel;
  }, [
    active,
    foreground,
    reducedMotion,
    gltfUri,
    mood,
    reactionKey,
    requestPetIntent,
    cancel,
  ]);

  const request = useCallback(
    (value: unknown) => {
      const latest = current.current;
      if (
        !latest.eligible ||
        !latest.requestPetIntent ||
        pending.current ||
        Date.now() - lastRequest.current < 120000
      )
        return;
      if (!value || typeof value !== 'object') return;
      const raw = value as PetIntentContext;
      if (
        !TEMPERAMENTS.includes(raw.temperament) ||
        !Number.isFinite(raw.idleSeconds) ||
        raw.idleSeconds < 0 ||
        (raw.lastAction !== null &&
          !Object.prototype.hasOwnProperty.call(ACTIONS, raw.lastAction))
      )
        return;
      const context: PetIntentContext = {
        temperament: raw.temperament,
        idleSeconds: Math.min(3600, Math.floor(raw.idleSeconds)),
        lastAction: raw.lastAction,
      };
      const controller = new AbortController();
      pending.current = controller;
      lastRequest.current = Date.now();
      timeout.current = setTimeout(cancel, 10000);
      // Defer invocation so even a synchronously throwing provider falls back quietly.
      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) return null;
          return latest.requestPetIntent!(context, controller.signal);
        })
        .then(intent => {
          if (
            pending.current === controller &&
            !controller.signal.aborted &&
            current.current.eligible &&
            intent &&
            TEMPERAMENTS.includes(intent.temperament)
          ) {
            current.current.applyIntent(intent.temperament);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (pending.current === controller) cancel();
        });
    },
    [cancel],
  );
  return {active: active && foreground, reducedMotion, request, cancel};
}
