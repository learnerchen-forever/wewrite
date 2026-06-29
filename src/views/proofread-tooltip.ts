// Proofreading tooltip — floating popup on hover over decorated error ranges

import type { Correction } from '../ai/proofread-engine';
import { t } from '../i18n';

export interface TooltipAction {
  onAccept?: (correction: Correction) => void;
  onIgnore?: (correction: Correction) => void;
  onIgnoreAll?: (correction: Correction) => void;
}

/** Create and show a proofreading tooltip at the given position */
export function showProofreadTooltip(
  correction: Correction,
  position: { x: number; y: number },
  actions: TooltipAction,
): HTMLElement {
  // Remove existing tooltip
  hideProofreadTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'ww-proofread-tooltip';
  tooltip.style.left = `${position.x}px`;
  tooltip.style.top = `${position.y + 20}px`;

  const severityLabels: Record<string, string> = {
    major: t('proofread.severity_major'),
    minor: t('proofread.severity_minor'),
    style: t('proofread.severity_style'),
  };

  // Header with severity dot
  const header = tooltip.createDiv({ cls: 'ww-proofread-tooltip-header' });
  header.createSpan({ cls: `ww-proofread-tooltip-severity ${correction.severity}` });
  header.createSpan({ text: severityLabels[correction.severity] || t('proofread.severity_default') });

  // Original → Suggestion
  tooltip.createDiv({ cls: 'ww-proofread-tooltip-original', text: `"${correction.original}"` });
  tooltip.createDiv({ cls: 'ww-proofread-tooltip-suggestion', text: `→ "${correction.suggestion}"` });

  // LLM description
  if (correction.description) {
    tooltip.createDiv({ cls: 'ww-proofread-tooltip-desc', text: correction.description });
  }

  // Action buttons
  const actionBar = tooltip.createDiv({ cls: 'ww-proofread-tooltip-actions' });

  const acceptBtn = actionBar.createEl('button', { cls: 'ww-proofread-tooltip-btn accept', text: t('misc.accept') });
  acceptBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.onAccept?.(correction);
    hideProofreadTooltip();
  });

  const ignoreBtn = actionBar.createEl('button', { cls: 'ww-proofread-tooltip-btn', text: t('misc.ignore') });
  ignoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.onIgnore?.(correction);
    hideProofreadTooltip();
  });

  document.body.appendChild(tooltip);

  // Clamp to viewport
  const rect = tooltip.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    tooltip.style.left = `${window.innerWidth - rect.width - 16}px`;
  }
  if (rect.bottom > window.innerHeight) {
    tooltip.style.top = `${position.y - rect.height - 10}px`;
  }

  // Click outside to dismiss
  setTimeout(() => {
    document.addEventListener('click', dismissOnClickOutside);
  }, 0);

  return tooltip;
}

function dismissOnClickOutside(e: MouseEvent): void {
  const tooltip = document.querySelector('.ww-proofread-tooltip');
  if (tooltip && !tooltip.contains(e.target as Node)) {
    hideProofreadTooltip();
  }
}

/** Remove any visible proofreading tooltip */
export function hideProofreadTooltip(): void {
  document.removeEventListener('click', dismissOnClickOutside);
  const existing = document.querySelector('.ww-proofread-tooltip');
  if (existing) existing.remove();
}
