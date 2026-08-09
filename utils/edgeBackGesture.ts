/** Single global iOS-style left-edge swipe recognizer. */
export type EdgeGesturePhase = 'start' | 'move' | 'cancel' | 'end';
export type EdgeGestureHandler = (phase: EdgeGesturePhase, progress: number, velocityX: number) => void;
type State = { tracking: boolean; capturing: boolean; pointerId: number | null; startX: number; startY: number; lastX: number; lastTime: number };
const EDGE = 28, LOCK = 10;
const installed = new WeakMap<HTMLElement, () => void>();
const excluded = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[data-edge-back-ignore="true"]'));
export const installEdgeBackGesture = (container: HTMLElement, canStart: () => boolean, handler: EdgeGestureHandler): (() => void) => {
  installed.get(container)?.();
  const state: State = { tracking:false, capturing:false, pointerId:null, startX:0, startY:0, lastX:0, lastTime:0 };
  const reset=()=>{state.tracking=false;state.capturing=false;state.pointerId=null;};
  const matches=(e:PointerEvent)=>state.pointerId===null||e.pointerId===state.pointerId;
  const progress=(x:number)=>Math.min(1,Math.max(0,x-state.startX)/Math.max(1,window.innerWidth));
  const velocity=(x:number,t:number)=>{const dt=t-state.lastTime;return dt>0?(x-state.lastX)/dt:0;};
  const cancel=()=>{if(state.capturing)handler('cancel',0,0);reset();};
  const down=(e:PointerEvent)=>{if(e.pointerType==='mouse'||e.isPrimary===false||e.clientX>EDGE||excluded(e.target)||!canStart())return;state.tracking=true;state.capturing=false;state.pointerId=e.pointerId;state.startX=state.lastX=e.clientX;state.startY=e.clientY;state.lastTime=e.timeStamp;};
  const move=(e:PointerEvent)=>{if(!state.tracking||!matches(e))return;const dx=e.clientX-state.startX,dy=e.clientY-state.startY;if(!state.capturing){if(Math.abs(dx)<LOCK&&Math.abs(dy)<LOCK)return;if(dx<=0||Math.abs(dy)>Math.abs(dx)*1.15){reset();return;}state.capturing=true;handler('start',0,0);try{container.setPointerCapture(e.pointerId);}catch{}}e.preventDefault();handler('move',progress(e.clientX),velocity(e.clientX,e.timeStamp));state.lastX=e.clientX;state.lastTime=e.timeStamp;};
  const up=(e:PointerEvent)=>{if(!state.tracking||!matches(e))return;if(!state.capturing){reset();return;}e.preventDefault();const p=progress(e.clientX),v=velocity(e.clientX,e.timeStamp);reset();handler('end',p,v);};
  const cancelPointer=(e:PointerEvent)=>{if(state.tracking&&matches(e))cancel();};
  const blur=()=>{if(state.tracking)cancel();};
  container.addEventListener('pointerdown',down,{passive:true});container.addEventListener('pointermove',move,{passive:false});container.addEventListener('pointerup',up,{passive:false});container.addEventListener('pointercancel',cancelPointer,{passive:true});window.addEventListener('blur',blur);
  const cleanup=()=>{container.removeEventListener('pointerdown',down);container.removeEventListener('pointermove',move);container.removeEventListener('pointerup',up);container.removeEventListener('pointercancel',cancelPointer);window.removeEventListener('blur',blur);if(state.tracking)cancel();if(installed.get(container)===cleanup)installed.delete(container);};installed.set(container,cleanup);return cleanup;
};
