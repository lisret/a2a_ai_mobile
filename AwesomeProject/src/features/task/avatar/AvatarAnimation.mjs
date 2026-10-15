import {createPetDirector} from './AvatarPet.mjs';

/** Owns one model's clip playback. THREE is supplied by the local renderer. */
export function createAvatarAnimation(
  THREE,
  root,
  clips,
  {
    reducedMotion = false,
    autonomous = false,
    random = Math.random,
    onIntentRequest = () => {},
  } = {},
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
    'wink',
    'surprised',
    'shy',
    'laugh',
    'stretch',
    'peek',
    'spin',
    'dance',
  ]);
  let current = null;
  let currentMood = null;
  let requestedMood = null;
  let disposed = false;
  let breathTime = 0;
  const eyeMaterials = new Map();
  const pet =
    autonomous && root.getObjectByName('NoNoDetached')
      ? createPetDirector({random})
      : null;
  const wings = [],
    eyes = [];
  let automaticAction = false,
    automaticAge = 0,
    interactionHeld = false;
  let intentElapsed = 0,
    nextIntentAt = 20;
  let blinkRemaining = 2.5 + random() * 4.5,
    blinkAge = -1;
  let breathBlend = 0;
  if (pet)
    root.traverse(object => {
      if (/^(Upper|Lower)Wing(Inlay)?(Left|Right)Pivot$/.test(object.name)) {
        wings.push({
          object,
          open: object.quaternion.clone(),
          upper: object.name.startsWith('Upper'),
          left: object.name.endsWith('LeftPivot'),
        });
      }
      if (/^Eye(Left|Right)$/.test(object.name))
        eyes.push({object, scale: object.scale.clone()});
    });
  if (root.getObjectByName('NoNoDetached')) {
    root.traverse(object => {
      if (/^Eye(Left|Right)$/.test(object.name) && object.material?.color) {
        eyeMaterials.set(object.material, object.material.color.clone());
      }
    });
  }
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
    if (event.action === current) {
      automaticAction = false;
      if (pet) requestedMood = 'idle';
      play(fallback);
    }
  };
  mixer.addEventListener('finished', finished);
  play(fallback);
  return {
    setMood(mood) {
      if (disposed || requestedMood === mood) return;
      requestedMood = mood;
      automaticAction = false;
      if (pet && mood !== 'idle') pet.interact(mood);
      play(reducedMotion ? fallback : mood);
    },
    interact() {
      if (!pet || disposed) return;
      pet.interact();
      if (automaticAction) {
        automaticAction = false;
        play(fallback);
      }
    },
    setInteractionHeld(value) {
      interactionHeld = Boolean(value);
      if (interactionHeld) this.interact();
    },
    setTemperament(value) {
      return !disposed && Boolean(pet?.setTemperament(value));
    },
    setReducedMotion(value) {
      if (disposed || reducedMotion === Boolean(value)) return;
      reducedMotion = Boolean(value);
      automaticAction = false;
      if (reducedMotion) {
        mixer.stopAllAction();
        current = null;
        play(fallback);
        mixer.update(0);
        eyeMaterials.forEach((color, material) => material.color.copy(color));
      } else {
        play(requestedMood || fallback);
      }
    },
    update(delta) {
      if (!disposed && !reducedMotion && Number.isFinite(delta) && delta > 0) {
        delta = pet ? Math.min(delta, 0.1) : delta;
        mixer.update(delta);
        breathTime += delta;
        if (pet) {
          const available =
            !interactionHeld && (!requestedMood || requestedMood === 'idle');
          automaticAge += delta;
          if (
            automaticAction &&
            automaticAge >= (current?.getClip().duration || 4.8)
          ) {
            automaticAction = false;
            play(fallback);
          }
          const ready = available && currentMood === fallback;
          const action = pet.update(delta, ready, !available);
          if (ready) intentElapsed += delta;
          if (ready && intentElapsed >= nextIntentAt) {
            nextIntentAt = intentElapsed + 120;
            onIntentRequest(pet.context);
          }
          if (action && actions.has(action)) {
            automaticAction = true;
            automaticAge = 0;
            play(action);
          }
          const idle = currentMood === fallback;
          breathBlend +=
            ((idle ? 1 : 0) - breathBlend) * Math.min(1, delta * 5);
          if (idle) {
            current.setEffectiveTimeScale(
              1 + 0.12 * Math.sin(breathTime * 0.17),
            );
            const phase =
              (breathTime * Math.PI * 2) / 4.8 +
              0.16 * Math.sin(breathTime * 0.23);
            for (const {object, open, upper, left} of wings) {
              const pulse =
                (1 - Math.cos(phase + (upper ? 0 : 0.7) + (left ? 0 : 0.12))) /
                2;
              const degrees =
                (4.8 + 1.2 * Math.sin(breathTime * 0.19)) * pulse * breathBlend;
              object.quaternion
                .identity()
                .slerp(open, 1 - degrees / (upper ? 95 : 80));
            }
            blinkRemaining -= delta;
            if (blinkRemaining <= 0 && blinkAge < 0) blinkAge = 0;
            if (blinkAge >= 0) blinkAge += delta;
            const blink =
              blinkAge >= 0 && blinkAge < 0.22
                ? Math.sin((Math.PI * blinkAge) / 0.22)
                : 0;
            for (const {object, scale} of eyes)
              object.scale.z = scale.z * (1 - 0.91 * blink);
            if (blinkAge >= 0.22) {
              blinkAge = -1;
              blinkRemaining = 2.5 + random() * 4.5;
            }
          }
        }
        const brightness =
          0.94 + 0.06 * Math.sin((breathTime * Math.PI * 2) / 4.8);
        eyeMaterials.forEach((color, material) =>
          material.color.copy(color).multiplyScalar(brightness),
        );
      }
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
      eyeMaterials.forEach((color, material) => material.color.copy(color));
      eyeMaterials.clear();
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      current = null;
    },
  };
}
