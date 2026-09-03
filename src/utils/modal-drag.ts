// modal-drag.ts — make Obsidian modals movable by their title bar.
//
// Obsidian's core does NOT move standard `Modal` dialogs (only the app window
// is OS-draggable). Plugins must implement the drag themselves. This helper
// attaches pointer-event handlers to the modal's native title bar
// (`modal.titleEl`) and applies a `translate` transform to the `.modal`
// element while dragging.
//
// Pointer capture routes every pointer event to the title element during the
// drag, so the modal follows the cursor even when it leaves the box — and all
// listeners live on `titleEl`, which is removed from the DOM when the modal
// closes, so nothing leaks.

import { App, Modal } from 'obsidian';

/**
 * Enable dragging for an existing modal by its title bar.
 * Safe to call once per modal (e.g. in the constructor).
 */
export function enableModalDrag(modal: Modal): void {
  const titleEl = modal.titleEl;
  const modalEl = modal.modalEl;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  titleEl.addClass('wewrite-modal-drag-handle');
  titleEl.style.cursor = 'grab';

  const onPointerDown = (evt: PointerEvent): void => {
    // Left button only for mouse; touch always ok.
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;
    // Never hijack interactive controls if one ever lands in the title bar.
    const target = evt.target as HTMLElement | null;
    if (target && target.closest('button, input, select, textarea, a')) return;

    const m = /^translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)$/.exec(modalEl.style.transform || '');
    baseX = m ? parseFloat(m[1]) : 0;
    baseY = m ? parseFloat(m[2]) : 0;
    startX = evt.clientX;
    startY = evt.clientY;
    dragging = true;
    // No transition while dragging, or the box lags behind the pointer.
    modalEl.style.transition = 'none';
    titleEl.style.cursor = 'grabbing';
    try { titleEl.setPointerCapture(evt.pointerId); } catch { /* ignore */ }
    evt.preventDefault();
  };

  const onPointerMove = (evt: PointerEvent): void => {
    if (!dragging) return;
    modalEl.style.transform = `translate(${baseX + evt.clientX - startX}px, ${baseY + evt.clientY - startY}px)`;
  };

  const onPointerEnd = (evt: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    titleEl.style.cursor = 'grab';
    modalEl.style.transition = '';
    try { titleEl.releasePointerCapture(evt.pointerId); } catch { /* ignore */ }
  };

  titleEl.addEventListener('pointerdown', onPointerDown);
  titleEl.addEventListener('pointermove', onPointerMove);
  titleEl.addEventListener('pointerup', onPointerEnd);
  titleEl.addEventListener('pointercancel', onPointerEnd);
}

/**
 * Base class for plugin modals: any subclass is draggable by its title bar.
 * Prefer this over `Modal` for all new dialogs.
 */
export class WeWriteModal extends Modal {
  constructor(app: App) {
    super(app);
    enableModalDrag(this);
  }

  /**
   * Modal#open() is typed void, but several subclasses resolve a result
   * asynchronously after opening and callers `await modal.open()`. Widening the
   * return type here (runtime behavior is unchanged) makes those Promise-based
   * overrides type-correct instead of a void-contract violation.
   */
  open(): unknown {
    return super.open();
  }
}
