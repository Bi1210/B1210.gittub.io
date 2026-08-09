/**
 * iOS-style edge swipe back gesture recognizer
 * 
 * Only captures gestures starting from the left edge (~28px threshold),
 * distinguishes horizontal swipe from vertical scroll, and emits progress
 * callbacks for interactive animation.
 */

export type EdgeGesturePhase = 'start' | 'move' | 'cancel' | 'end';
export type EdgeGestureHandler = (phase: EdgeGesturePhase, progress: number, velocityX: number) => void;

interface GestureState {
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  committed: boolean;
}

const EDGE_THRESHOLD = 28; // Only start from left edge
const MOVE_THRESHOLD = 10; // Min horizontal movement to capture
const COMMIT_THRESHOLD = 0.35; // Fraction of screen width to auto-commit
const VELOCITY_COMMIT_THRESHOLD = 0.4; // px/ms - fast swipe commits immediately

export const installEdgeBackGesture = (
  container: HTMLElement,
  canStart: () => boolean,
  handler: EdgeGestureHandler
): (() => void) => {
  const state: GestureState = {
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    committed: false,
  };

  const getProgress = (currentX: number): number => {
    const delta = Math.max(0, currentX - state.startX);
    return Math.min(1, delta / window.innerWidth);
  };

  const getVelocity = (currentX: number, currentTime: number): number => {
    const dt = currentTime - state.lastTime;
    if (dt === 0) return 0;
    return (currentX - state.lastX) / dt;
  };

  const onPointerDown = (e: PointerEvent) => {
    // Only touch/pen, not mouse
    if (e.pointerType === 'mouse') return;
    
    // Must start from left edge
    if (e.clientX > EDGE_THRESHOLD) return;

    // Check if page can handle back
    if (!canStart()) return;

    state.active = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.lastTime = e.timeStamp;
    state.committed = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!state.active) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    // If mostly vertical movement, cancel gesture (user is scrolling)
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > MOVE_THRESHOLD) {
      state.active = false;
      handler('cancel', 0, 0);
      return;
    }

    // If horizontal movement exceeds threshold, capture the gesture
    if (Math.abs(dx) > MOVE_THRESHOLD) {
      e.preventDefault();
      
      const progress = getProgress(e.clientX);
      const velocity = getVelocity(e.clientX, e.timeStamp);
      
      if (progress === 0 && velocity === 0) {
        // First captured move
        handler('start', 0, 0);
      } else {
        handler('move', progress, velocity);
      }

      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.lastTime = e.timeStamp;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!state.active) return;

    const progress = getProgress(e.clientX);
    const velocity = getVelocity(e.clientX, e.timeStamp);

    // Commit if swiped far enough or fast enough
    const shouldCommit = progress >= COMMIT_THRESHOLD || velocity >= VELOCITY_COMMIT_THRESHOLD;

    state.active = false;
    state.committed = shouldCommit;

    handler('end', progress, velocity);
  };

  const onPointerCancel = () => {
    if (!state.active) return;
    state.active = false;
    handler('cancel', 0, 0);
  };

  container.addEventListener('pointerdown', onPointerDown, { passive: true });
  container.addEventListener('pointermove', onPointerMove, { passive: false });
  container.addEventListener('pointerup', onPointerUp, { passive: true });
  container.addEventListener('pointercancel', onPointerCancel, { passive: true });

  return () => {
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointercancel', onPointerCancel);
  };
};
