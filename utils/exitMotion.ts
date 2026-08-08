/**
 * 为没有经过共享 Modal 的全屏页面补上退场动画。
 *
 * 许多旧页面使用 `setOpen(false)` 直接卸载全屏层，关闭时没有任何退场阶段。
 * 这里在点击按钮/遮罩前保存一个轻量 DOM 快照；如果这一层随后确实被卸载，
 * 快照会在 body 上淡出。没有卸载就不显示快照，因此不会干扰打开子页面、提交表单
 * 或普通按钮。Echoes 整棵树明确跳过，保持其 UI 独立。
 */

const EXIT_MS = 220;
const SNAPSHOT_CLASS = 'sully-exit-snapshot';

const asElement = (node: EventTarget | null): HTMLElement | null => {
  if (node instanceof HTMLElement) return node;
  if (node instanceof SVGElement) return node.parentElement;
  return null;
};

const isEchoesTree = (element: HTMLElement): boolean => Boolean(element.closest('.echoes-root'));

const isExcludedSurface = (element: HTMLElement): boolean => element.matches(
  '.sully-modal-overlay, .sully-exit-snapshot, .sully-app-layer, .sully-launcher-layer',
);

const looksLikeFullscreenSurface = (element: HTMLElement): boolean => {
  if (isExcludedSurface(element) || isEchoesTree(element)) return false;
  const style = window.getComputedStyle(element);
  if (style.position !== 'fixed' && style.position !== 'absolute') return false;
  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const coversMostOfViewport = rect.width >= viewportWidth * 0.78 && rect.height >= viewportHeight * 0.48;
  if (!coversMostOfViewport) return false;
  const className = typeof element.className === 'string' ? element.className : '';
  const hasOverlayShape = className.includes('inset-0')
    || className.includes('fixed')
    || className.includes('absolute')
    || (Number.parseInt(style.zIndex || '0', 10) || 0) >= 40;
  return hasOverlayShape;
};

const findSurface = (target: HTMLElement): HTMLElement | null => {
  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    if (isEchoesTree(current)) return null;
    if (current.dataset.sullyExitSurface === 'true') return current;
    if (looksLikeFullscreenSurface(current)) return current;
    current = current.parentElement;
  }
  return null;
};

const isCloseIntent = (target: HTMLElement, surface: HTMLElement): boolean => {
  if (target === surface) return true;
  const button = target.closest('button,[role="button"],a,[aria-label]') as HTMLElement | null;
  return Boolean(button);
};

const prepareSnapshot = (source: HTMLElement): HTMLElement => {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove('animate-fade-in', 'animate-slide-up', 'animate-slide-down', 'animate-pop-in');
  clone.classList.add(SNAPSHOT_CLASS);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  clone.setAttribute('aria-hidden', 'true');
  // 保留原表面的实际位置和尺寸；底部抽屉/半屏页面不能被拉伸成整屏。
  clone.style.position = 'fixed';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.style.zIndex = '2147483646';
  clone.style.pointerEvents = 'none';
  clone.style.transformOrigin = '50% 50%';
  return clone;
};

export const installExitMotion = (): (() => void) => {
  if (typeof document === 'undefined') return () => {};
  let pending: { source: HTMLElement; snapshot: HTMLElement; timer: number } | null = null;

  const cleanupPending = () => {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pending.snapshot.remove();
    pending = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    cleanupPending();
    const target = asElement(event.target);
    if (!target || isEchoesTree(target)) return;
    const surface = findSurface(target);
    if (!surface || !isCloseIntent(target, surface)) return;

    const snapshot = prepareSnapshot(surface);
    const timer = window.setTimeout(() => {
      if (!surface.isConnected) {
        document.body.appendChild(snapshot);
        window.setTimeout(() => snapshot.remove(), EXIT_MS + 40);
      } else {
        snapshot.remove();
      }
      if (pending?.snapshot === snapshot) pending = null;
    }, 32);
    pending = { source: surface, snapshot, timer };
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    cleanupPending();
    document.querySelectorAll(`.${SNAPSHOT_CLASS}`).forEach((node) => node.remove());
  };
};
