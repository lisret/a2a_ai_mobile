/** A local pet's attention, not a playlist. Time advances only while visible. */
const TEMPERAMENTS = ['calm', 'curious', 'playful', 'sleepy'];
const CHOICES = {
  calm: [
    ['wink', 5],
    ['curious', 3],
    ['peek', 2],
    ['stretch', 1],
  ],
  curious: [
    ['curious', 4],
    ['peek', 4],
    ['wink', 3],
    ['wave', 1],
  ],
  playful: [
    ['happy', 4],
    ['wave', 3],
    ['peek', 2],
    ['wink', 2],
    ['dance', 0.5],
    ['spin', 0.3],
  ],
  sleepy: [
    ['sleepy', 5],
    ['stretch', 2],
    ['wink', 1],
    ['peek', 0.5],
  ],
};
const GAPS = {
  calm: [10, 24],
  curious: [8, 18],
  playful: [6, 14],
  sleepy: [20, 40],
};
export function createPetDirector({random = Math.random} = {}) {
  let elapsed = 0,
    idleSeconds = 0,
    interacted = false;
  let lastAction = null,
    rareAt = -Infinity,
    hint = null,
    hintUntil = 0;
  const sample = () => Math.max(0, Math.min(0.999999, random()));
  const temperament = () => {
    if (interacted && idleSeconds < 25) return 'playful';
    if (hint && elapsed < hintUntil) return hint;
    if (idleSeconds > 150) return 'sleepy';
    return interacted && idleSeconds < 60 ? 'curious' : 'calm';
  };
  const gap = () => {
    const [min, max] = GAPS[temperament()];
    return min + sample() * (max - min);
  };
  let remaining = gap();
  return {
    update(delta, ready = true, engaged = false) {
      if (!Number.isFinite(delta) || delta <= 0) return null;
      const dt = Math.min(delta, 0.1); // Never catch up a suspended tab's backlog.
      elapsed += dt;
      idleSeconds = engaged ? 0 : idleSeconds + dt;
      if (!ready) return null;
      remaining -= dt;
      if (remaining > 0) return null;
      const choices = CHOICES[temperament()].filter(
        ([name]) =>
          name !== lastAction &&
          (!['spin', 'dance'].includes(name) || elapsed - rareAt >= 90),
      );
      let draw =
        sample() * choices.reduce((sum, [, weight]) => sum + weight, 0);
      const action =
        choices.find(([, weight]) => (draw -= weight) < 0)?.[0] || 'wink';
      lastAction = action;
      if (['spin', 'dance'].includes(action)) rareAt = elapsed;
      remaining = gap();
      return action;
    },
    interact(action = null) {
      idleSeconds = 0;
      interacted = true;
      hint = null;
      if (action) lastAction = action;
      remaining = 8 + sample() * 6;
    },
    setTemperament(value) {
      if (!TEMPERAMENTS.includes(value)) return false;
      hint = value;
      hintUntil = elapsed + 120;
      return true;
    },
    get context() {
      return {
        temperament: temperament(),
        idleSeconds: Math.floor(idleSeconds),
        lastAction,
      };
    },
  };
}
