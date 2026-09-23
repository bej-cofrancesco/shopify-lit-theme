let scrollLockCount = 0;
let previousOverflow = '';
let savedFocus: HTMLElement | null = null;

export function lockBodyScroll(): void {
  if (scrollLockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

export function unlockBodyScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
}

export function saveFocus(): void {
  savedFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function restoreFocus(): void {
  savedFocus?.focus({ preventScroll: true });
  savedFocus = null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapFocus(root: HTMLElement): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('inert') && el.offsetParent !== null,
    );
    if (!nodes.length) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

export function focusFirst(root: HTMLElement): void {
  const el = root.querySelector<HTMLElement>(FOCUSABLE);
  el?.focus({ preventScroll: true });
}
