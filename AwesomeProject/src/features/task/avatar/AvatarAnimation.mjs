/** Owns one model's clip playback. THREE is supplied by the local renderer. */
export function createAvatarAnimation(
  THREE,
  root,
  clips,
  {reducedMotion = false} = {},
) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(
    clips.map(clip => [clip.name, mixer.clipAction(clip)]),
  );
  const fallback = actions.has('idle') ? 'idle' : clips[0]?.name;
  const oneShots = new Set([
    'confirm',
    'success',
    'error',
    'wave',
    'happy',
    'curious',
  ]);
  let current = null;
  let currentMood = null;
  let requestedMood = null;
  let disposed = false;
  function play(name) {
    const resolved = actions.has(name) ? name : fallback;
    const next = actions.get(resolved);
    if (!next || next === current) return;
    const previous = current;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.setLoop(
      oneShots.has(resolved) ? THREE.LoopOnce : THREE.LoopRepeat,
      oneShots.has(resolved) ? 1 : Infinity,
    );
    next.clampWhenFinished = oneShots.has(resolved);
    next.play();
    if (previous) {
      previous.fadeOut(0.22);
      next.fadeIn(0.22);
    }
    current = next;
    currentMood = resolved;
  }
  const finished = event => {
    if (event.action === current) play(fallback);
  };
  mixer.addEventListener('finished', finished);
  play(fallback);
  return {
    setMood(mood) {
      if (disposed || requestedMood === mood) return;
      requestedMood = mood;
      play(reducedMotion ? fallback : mood);
    },
    update(delta) {
      if (!disposed && !reducedMotion && delta > 0) mixer.update(delta);
    },
    get currentMood() {
      return currentMood;
    },
    get currentTime() {
      return current?.time || 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.removeEventListener('finished', finished);
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      current = null;
    },
  };
}
