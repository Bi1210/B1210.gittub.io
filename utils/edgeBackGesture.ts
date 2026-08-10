/**
 * One global iOS-style left-edge back recognizer.
 *
 * Touch devices use Touch Events because iOS may cancel Pointer Events when
 * the browser decides that a diagonal gesture is vertical scrolling. Pointer
 * Events remain available for mouse/pen and non-touch browsers. Both inputs
 * share one state machine, so one physical gesture can settle only once.
 */
export type EdgeGesturePhase = 'start' | 'move' | 'cancel' | 'end';
export type EdgeGestureHandler = (phase: EdgeGesturePhase, progress: number, velocityX: number) => void;
type InputSource = 'pointer' | 'touch';
type Contact = { id: number; x: number; y: number };
type GestureState = {
  source: InputSource | null;
  tracking: boolean;
  capturing: boolean;
  pointerId: number | null;
  touchId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
};

const MOVE_THRESHOLD = 7;
const installed = new WeakMap<HTMLElement, () => void>();

const isExcludedTarget = (target: EventTarget | null): boolean => (
  target instanceof Element
  && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[data-edge-back-ignore="true"]'))
);

const eventTime = (stamp: number): number => (
  Number.isFinite(stamp) && stamp > 0 ? stamp : Date.now()
);

const findTouch = (
  event: TouchEvent,
  identifier: number | null,
  changedOnly = false,
): Contact | null => {
  if (identifier === null) return null;
  for (let i = 0; i < event.changedTouches.length; i += 1) {
    const touch = event.changedTouches.item(i);
    if (touch && touch.identifier === identifier) {
      return { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    }
  }
  if (changedOnly) return null;
  for (let i = 0; i < event.touches.length; i += 1) {
    const touch = event.touches.item(i);
    if (touch && touch.identifier === identifier) {
      return { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    }
  }
  return null;
};

export const installEdgeBackGesture = (
  container: HTMLElement,
  canStart: () => boolean,
  handler: EdgeGestureHandler,
): (() => void) => {
  installed.get(container)?.();

  const documentRef = container.ownerDocument;
  const windowRef = documentRef.defaultView || window;
  const touchEventsAvailable = 'ontouchstart' in windowRef
    || windowRef.navigator.maxTouchPoints > 0;
  const isNode = (value: EventTarget | null): value is Node => (
    value !== null && typeof (value as Node).nodeType === 'number'
  );
  const isInsideContainer = (target: EventTarget | null): boolean => (
    isNode(target) && container.contains(target)
  );
  const state: GestureState = {
    source: null,
    tracking: false,
    capturing: false,
    pointerId: null,
    touchId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
  };

  const edgeWidth = (): number => Math.max(72, Math.min(96, windowRef.innerWidth * 0.18));
  const resetState = (): void => {
    state.source = null;
    state.tracking = false;
    state.capturing = false;
    state.pointerId = null;
    state.touchId = null;
  };
  const cancel = (event?: Event): void => {
    if (!state.tracking) return;
    const wasCapturing = state.capturing;
    resetState();
    if (!wasCapturing) return;
    event?.stopPropagation();
    handler('cancel', 0, 0);
  };
  const matchesPointer = (event: PointerEvent): boolean => (
    state.source === 'pointer' && state.pointerId === event.pointerId
  );
  const matchesTouch = (contact: Contact | null): boolean => (
    state.source === 'touch' && contact !== null && state.touchId === contact.id
  );
  const progress = (x: number): number => Math.min(
    1,
    Math.max(0, (x - state.startX) / Math.max(1, windowRef.innerWidth)),
  );
  const velocity = (x: number, time: number): number => {
    const dt = time - state.lastTime;
    return dt > 0 ? (x - state.lastX) / dt : 0;
  };

  // 0 = keep tracking, 1 = rightward intent, -1 = definitely not back.
  // A modest vertical component is accepted intentionally; only an obvious
  // vertical scroll or a leftward drag is rejected before capture.
  const intent = (dx: number, dy: number): -1 | 0 | 1 => {
    const absDy = Math.abs(dy);
    if (Math.max(Math.abs(dx), absDy) < MOVE_THRESHOLD) return 0;
    if (dx < -4) return -1;
    if (dx < MOVE_THRESHOLD) return absDy > 18 ? -1 : 0;
    if (absDy > 24 && absDy > dx * 2.5) return -1;
    return 1;
  };

  const begin = (
    source: InputSource,
    id: number,
    x: number,
    y: number,
    target: EventTarget | null,
    time: number,
  ): void => {
    if (
      state.tracking
      || !isInsideContainer(target)
      || x > edgeWidth()
      || isExcludedTarget(target)
      || !canStart()
    ) return;
    state.source = source;
    state.tracking = true;
    state.capturing = false;
    state.pointerId = source === 'pointer' ? id : null;
    state.touchId = source === 'touch' ? id : null;
    state.startX = x;
    state.startY = y;
    state.lastX = x;
    state.lastTime = eventTime(time);
  };

  const captureMove = (event: Event, x: number, y: number, stamp: number): void => {
    if (!state.tracking) return;
    if (!state.capturing) {
      const decision = intent(x - state.startX, y - state.startY);
      if (decision < 0) {
        resetState();
        return;
      }
      if (decision === 0) return;
      state.capturing = true;
      handler('start', 0, 0);
      if (state.source === 'pointer' && state.pointerId !== null) {
        try { container.setPointerCapture(state.pointerId); } catch { /* iOS may reject capture */ }
      }
    }
    const time = eventTime(stamp);
    const currentVelocity = velocity(x, time);
    event.preventDefault();
    event.stopPropagation();
    handler('move', progress(x), currentVelocity);
    state.lastX = x;
    state.lastTime = time;
  };

  const finish = (event: Event, x: number, y: number, stamp: number): void => {
    if (!state.tracking) return;
    if (!state.capturing) {
      resetState();
      return;
    }
    const time = eventTime(stamp);
    const currentProgress = progress(x);
    const currentVelocity = velocity(x, time);
    resetState();
    event.preventDefault();
    event.stopPropagation();
    handler('end', currentProgress, currentVelocity);
  };

  const pointerDown = (event: PointerEvent): void => {
    // On iOS/Touch browsers, ignore the compatibility Pointer stream and let
    // the Touch stream own the contact. Mouse input is never a system swipe.
    if (event.pointerType === 'mouse') return;
    if (event.pointerType === 'touch' && touchEventsAvailable) return;
    if (event.isPrimary === false) return;
    begin('pointer', event.pointerId, event.clientX, event.clientY, event.target, event.timeStamp);
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!matchesPointer(event)) return;
    captureMove(event, event.clientX, event.clientY, event.timeStamp);
  };
  const pointerUp = (event: PointerEvent): void => {
    if (!matchesPointer(event)) return;
    finish(event, event.clientX, event.clientY, event.timeStamp);
  };
  const pointerCancel = (event: PointerEvent): void => {
    if (!matchesPointer(event)) return;
    cancel(event);
  };
  const touchStart = (event: TouchEvent): void => {
    if (event.touches.length > 1) {
      if (state.source === 'touch') cancel(event);
      return;
    }
    if (state.tracking) return;
    const touch = event.touches.item(0);
    if (!touch) return;
    begin('touch', touch.identifier, touch.clientX, touch.clientY, event.target, event.timeStamp);
  };
  const touchMove = (event: TouchEvent): void => {
    if (state.source !== 'touch') return;
    if (event.touches.length > 1) {
      cancel(event);
      return;
    }
    const touch = findTouch(event, state.touchId);
    if (matchesTouch(touch) && touch) captureMove(event, touch.x, touch.y, event.timeStamp);
  };
  const touchEnd = (event: TouchEvent): void => {
    if (state.source !== 'touch') return;
    const touch = findTouch(event, state.touchId, true);
    if (matchesTouch(touch) && touch) finish(event, touch.x, touch.y, event.timeStamp);
  };
  const touchCancel = (event: TouchEvent): void => {
    if (state.source === 'touch') cancel(event);
  };
  const lostPointerCapture = (event: PointerEvent): void => {
    if (matchesPointer(event)) cancel(event);
  };
  const cancelOnLifecycle = (): void => {
    if (state.tracking) cancel();
  };
  const cancelOnVisibility = (): void => {
    if (documentRef.visibilityState === 'hidden') cancel();
  };

  documentRef.addEventListener('pointerdown', pointerDown, { capture: true, passive: true });
  documentRef.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
  documentRef.addEventListener('pointerup', pointerUp, { capture: true, passive: false });
  documentRef.addEventListener('pointercancel', pointerCancel, { capture: true, passive: true });
  documentRef.addEventListener('touchstart', touchStart, { capture: true, passive: true });
  documentRef.addEventListener('touchmove', touchMove, { capture: true, passive: false });
  documentRef.addEventListener('touchend', touchEnd, { capture: true, passive: false });
  documentRef.addEventListener('touchcancel', touchCancel, { capture: true, passive: true });
  container.addEventListener('lostpointercapture', lostPointerCapture, { capture: true, passive: true });
  windowRef.addEventListener('blur', cancelOnLifecycle);
  windowRef.addEventListener('pagehide', cancelOnLifecycle);
  documentRef.addEventListener('visibilitychange', cancelOnVisibility);

  const cleanup = (): void => {
    documentRef.removeEventListener('pointerdown', pointerDown, true);
    documentRef.removeEventListener('pointermove', pointerMove, true);
    documentRef.removeEventListener('pointerup', pointerUp, true);
    documentRef.removeEventListener('pointercancel', pointerCancel, true);
    documentRef.removeEventListener('touchstart', touchStart, true);
    documentRef.removeEventListener('touchmove', touchMove, true);
    documentRef.removeEventListener('touchend', touchEnd, true);
    documentRef.removeEventListener('touchcancel', touchCancel, true);
    container.removeEventListener('lostpointercapture', lostPointerCapture, true);
    windowRef.removeEventListener('blur', cancelOnLifecycle);
    windowRef.removeEventListener('pagehide', cancelOnLifecycle);
    documentRef.removeEventListener('visibilitychange', cancelOnVisibility);
    cancel();
    if (installed.get(container) === cleanup) installed.delete(container);
  };
  installed.set(container, cleanup);
  return cleanup;
};
