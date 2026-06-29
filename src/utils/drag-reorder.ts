// Generic drag-to-reorder for grid layouts
// Supports HTML5 Drag API (desktop) and touch events (mobile)

export interface DragReorderOptions {
  container: HTMLElement;
  /** Selector for draggable items within the container */
  itemSelector: string;
  /** Called after an item is dropped at a new position */
  onReorder: (oldIndex: number, newIndex: number) => void;
  /** Optional: CSS class added to the item being dragged */
  dragClass?: string;
  /** Optional: CSS class added to the drop target placeholder */
  dropTargetClass?: string;
}

export class DragReorder {
  private container: HTMLElement;
  private options: DragReorderOptions;
  private dragSrcIndex = -1;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartY = 0;
  private touchStartX = 0;
  private ghostEl: HTMLElement | null = null;

  constructor(options: DragReorderOptions) {
    this.container = options.container;
    this.options = options;
    this.bindEvents();
  }

  private getItems(): HTMLElement[] {
    return Array.from(this.container.querySelectorAll(this.options.itemSelector));
  }

  // ── Desktop: HTML5 Drag & Drop ──

  private bindEvents(): void {
    this.container.addEventListener('dragstart', this.onDragStart);
    this.container.addEventListener('dragover', this.onDragOver);
    this.container.addEventListener('drop', this.onDrop);
    this.container.addEventListener('dragend', this.onDragEnd);

    // Mobile: touch events with long-press detection
    this.container.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd);
  }

  private onDragStart = (e: DragEvent): void => {
    const item = (e.target as HTMLElement).closest(this.options.itemSelector) as HTMLElement | null;
    if (!item) return;

    this.dragSrcIndex = this.getItems().indexOf(item);
    item.classList.add(this.options.dragClass || 'drag-reorder-dragging');
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', String(this.dragSrcIndex));
  };

  private onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const target = (e.target as HTMLElement).closest(this.options.itemSelector) as HTMLElement | null;
    if (!target) return;

    // Remove drop target highlight from all items
    this.getItems().forEach(item => item.classList.remove(this.options.dropTargetClass || 'drag-reorder-target'));
    target.classList.add(this.options.dropTargetClass || 'drag-reorder-target');
  };

  private onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest(this.options.itemSelector) as HTMLElement | null;
    if (!target || this.dragSrcIndex < 0) return;

    const newIndex = this.getItems().indexOf(target);
    if (newIndex !== this.dragSrcIndex && newIndex >= 0) {
      this.options.onReorder(this.dragSrcIndex, newIndex);
    }
    this.cleanup();
  };

  private onDragEnd = (): void => {
    this.cleanup();
  };

  // ── Mobile: Touch with long-press ──

  private onTouchStart = (e: TouchEvent): void => {
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;

    const item = (e.target as HTMLElement).closest(this.options.itemSelector) as HTMLElement | null;
    if (!item) return;

    this.longPressTimer = setTimeout(() => {
      this.dragSrcIndex = this.getItems().indexOf(item);
      if (this.dragSrcIndex < 0) return;

      item.classList.add(this.options.dragClass || 'drag-reorder-dragging');
      // Create a ghost that follows the finger
      this.ghostEl = item.cloneNode(true) as HTMLElement;
      this.ghostEl.style.position = 'fixed';
      this.ghostEl.style.pointerEvents = 'none';
      this.ghostEl.style.zIndex = '9999';
      this.ghostEl.style.opacity = '0.85';
      this.ghostEl.style.width = item.offsetWidth + 'px';
      this.ghostEl.style.height = item.offsetHeight + 'px';
      this.ghostEl.style.left = (touch.clientX - item.offsetWidth / 2) + 'px';
      this.ghostEl.style.top = (touch.clientY - item.offsetHeight / 2) + 'px';
      document.body.appendChild(this.ghostEl);
    }, 300); // 300ms long-press threshold
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.longPressTimer) {
      // If finger moves significantly before long-press fires, cancel
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - this.touchStartX);
      const dy = Math.abs(touch.clientY - this.touchStartY);
      if (dx > 10 || dy > 10) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }

    if (this.ghostEl) {
      e.preventDefault();
      const touch = e.touches[0];
      this.ghostEl.style.left = (touch.clientX - this.ghostEl.offsetWidth / 2) + 'px';
      this.ghostEl.style.top = (touch.clientY - this.ghostEl.offsetHeight / 2) + 'px';

      // Highlight item under finger
      const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = elBelow?.closest(this.options.itemSelector) as HTMLElement | null;
      this.getItems().forEach(item => item.classList.remove(this.options.dropTargetClass || 'drag-reorder-target'));
      if (target) target.classList.add(this.options.dropTargetClass || 'drag-reorder-target');
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (this.ghostEl) {
      const touch = e.changedTouches[0];
      const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const target = elBelow?.closest(this.options.itemSelector) as HTMLElement | null;
      if (target && this.dragSrcIndex >= 0) {
        const newIndex = this.getItems().indexOf(target);
        if (newIndex !== this.dragSrcIndex && newIndex >= 0) {
          this.options.onReorder(this.dragSrcIndex, newIndex);
        }
      }
      this.ghostEl.remove();
      this.ghostEl = null;
      this.cleanup();
    }
  };

  private cleanup(): void {
    this.dragSrcIndex = -1;
    this.getItems().forEach(item => {
      item.classList.remove(this.options.dragClass || 'drag-reorder-dragging');
      item.classList.remove(this.options.dropTargetClass || 'drag-reorder-target');
    });
  }

  /** Remove all event listeners and clean up */
  destroy(): void {
    this.container.removeEventListener('dragstart', this.onDragStart);
    this.container.removeEventListener('dragover', this.onDragOver);
    this.container.removeEventListener('drop', this.onDrop);
    this.container.removeEventListener('dragend', this.onDragEnd);
    this.container.removeEventListener('touchstart', this.onTouchStart);
    this.container.removeEventListener('touchmove', this.onTouchMove);
    this.container.removeEventListener('touchend', this.onTouchEnd);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
  }
}
