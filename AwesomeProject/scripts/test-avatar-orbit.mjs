import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatarOrbit} from '../src/features/task/avatar/AvatarOrbit.mjs';
function setup(options) {
  const events = {},
    captures = new Set();
  const canvas = {
    addEventListener(n, f) {
      events[n] = f;
    },
    removeEventListener(n) {
      delete events[n];
    },
    setPointerCapture(id) {
      captures.add(id);
    },
    hasPointerCapture(id) {
      return captures.has(id);
    },
    releasePointerCapture(id) {
      captures.delete(id);
    },
  };
  const orbit = createAvatarOrbit(canvas, options);
  const fire = (name, x = 0, y = 0, id = 1) =>
    events[name]({
      pointerId: id,
      clientX: x,
      clientY: y,
      button: 0,
      preventDefault() {},
    });
  return {orbit, events, captures, fire};
}
test('mouse/touch drag completes multiple full turns; capture cancellation preserves angle', () => {
  const {orbit, fire, captures} = setup();
  fire('pointerdown');
  fire('pointermove', 1200, 1000);
  assert.ok(orbit.yaw > Math.PI * 4);
  assert.equal(orbit.pitch, 0.65);
  const yaw = orbit.yaw;
  fire('pointermove', 500, 0, 2);
  assert.equal(orbit.yaw, yaw);
  fire('pointercancel', 1200, 1000);
  assert.equal(captures.size, 0);
  fire('pointermove', 0, 0);
  assert.equal(orbit.yaw, yaw);
  fire('pointerdown', 200, 100);
  fire('pointermove', 210, 100);
  assert.ok(Math.abs(orbit.yaw - yaw - 0.12) < 1e-8);
});
test('automatic rotation yields to drag; reset and keyboard remain available', () => {
  const {orbit, events, fire} = setup();
  orbit.setAutoRotate(true);
  orbit.update(0.05);
  assert.ok(orbit.yaw > 0);
  fire('pointerdown');
  assert.equal(orbit.automatic, false);
  fire('pointerup');
  events.keydown({key: 'Home', preventDefault() {}});
  assert.equal(orbit.yaw, 0);
  assert.equal(orbit.pitch, 0);
  events.keydown({key: 'ArrowRight', preventDefault() {}});
  assert.equal(orbit.yaw, Math.PI / 12);
  orbit.setRotation(NaN);
  assert.ok(Number.isFinite(orbit.yaw));
  orbit.dispose();
  assert.equal(Object.keys(events).length, 0);
});
test('reduced motion disables automatic movement but permits deliberate rotation', () => {
  const {orbit, fire} = setup({reducedMotion: true});
  assert.equal(orbit.setAutoRotate(true), false);
  orbit.update(1);
  assert.equal(orbit.yaw, 0);
  fire('pointerdown');
  fire('pointermove', 100, 0);
  assert.equal(orbit.yaw, 1.2);
  orbit.reset();
  assert.equal(orbit.yaw, 0);
});

test('tap activates companion but dragging or cancelling never does', () => {
  let taps = 0;
  const {fire} = setup({onTap: () => taps++});
  fire('pointerdown', 100, 100);
  fire('pointerup', 101, 101);
  assert.equal(taps, 1);
  fire('pointerdown', 100, 100);
  fire('pointermove', 130, 100);
  fire('pointermove', 100, 100);
  fire('pointerup', 100, 100);
  assert.equal(taps, 1);
  fire('pointerdown', 100, 100);
  fire('pointercancel', 100, 100);
  assert.equal(taps, 1);
});
