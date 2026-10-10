/** Shared mouse/touch/keyboard turntable; independent of skeletal animation. */
export function createAvatarOrbit(
  canvas,
  {reducedMotion = false, onTap = () => {}} = {},
) {
  let yaw = 0,
    pitch = 0,
    pointer = null,
    lastX = 0,
    lastY = 0,
    automatic = false,
    travel = 0;
  const clamp = value => Math.max(-0.65, Math.min(0.65, value));
  function release() {
    const id = pointer;
    pointer = null;
    if (id !== null && canvas.hasPointerCapture?.(id))
      canvas.releasePointerCapture(id);
  }
  function reset() {
    release();
    yaw = 0;
    pitch = 0;
    automatic = false;
  }
  const handlers = {
    pointerdown(event) {
      if (
        pointer !== null ||
        (event.button !== undefined && event.button !== 0)
      )
        return;
      automatic = false;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      travel = 0;
      canvas.setPointerCapture?.(pointer);
      canvas.focus?.({preventScroll: true});
      event.preventDefault();
    },
    pointermove(event) {
      if (pointer !== event.pointerId) return;
      travel += Math.hypot(event.clientX - lastX, event.clientY - lastY);
      yaw += (event.clientX - lastX) * 0.012;
      pitch = clamp(pitch + (event.clientY - lastY) * 0.008);
      lastX = event.clientX;
      lastY = event.clientY;
      event.preventDefault();
    },
    pointerup(event) {
      if (pointer !== event.pointerId) return;
      const tapped =
        travel + Math.hypot(event.clientX - lastX, event.clientY - lastY) < 8;
      release();
      if (tapped) onTap();
    },
    pointercancel(event) {
      if (pointer === event.pointerId) release();
    },
    lostpointercapture(event) {
      if (pointer === event.pointerId) pointer = null;
    },
    dblclick: reset,
    keydown(event) {
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      automatic = false;
      if (event.key === 'Home') reset();
      if (event.key === 'ArrowLeft') yaw -= Math.PI / 12;
      if (event.key === 'ArrowRight') yaw += Math.PI / 12;
      if (event.key === 'ArrowUp') pitch = clamp(pitch - 0.1);
      if (event.key === 'ArrowDown') pitch = clamp(pitch + 0.1);
    },
  };
  for (const [name, handler] of Object.entries(handlers))
    canvas.addEventListener(name, handler);
  return {
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get automatic() {
      return automatic;
    },
    setRotation(x, y = 0) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      release();
      automatic = false;
      yaw = x;
      pitch = clamp(y);
    },
    setAutoRotate(enabled) {
      automatic = Boolean(enabled) && !reducedMotion;
      return automatic;
    },
    update(delta) {
      if (automatic && pointer === null && delta > 0)
        yaw += Math.min(delta, 0.05) * 0.45;
    },
    reset,
    cancel() {
      release();
      automatic = false;
    },
    dispose() {
      release();
      for (const [name, handler] of Object.entries(handlers))
        canvas.removeEventListener(name, handler);
    },
  };
}
