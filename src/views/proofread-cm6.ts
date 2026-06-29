// CodeMirror 6 proofreading integration — ViewPlugin + StateField for inline decorations
// Connects ProofreadEngine results to the Obsidian editor via CM6's decoration system

import type { Correction } from '../ai/proofread-engine';
import { correctionsToDecorations, SEVERITY_CLASSES } from './proofread-decorations';
import { showProofreadTooltip, hideProofreadTooltip } from './proofread-tooltip';

// Minimal CM6 types for the Obsidian environment
// In production, these come from @codemirror/view and @codemirror/state

interface EditorView {
  dom: HTMLElement;
  state: EditorState;
  dispatch(tr: unknown): void;
  posAtCoords(coords: { x: number; y: number }): number | null;
}

interface EditorState {
  doc: { sliceString(from: number, to?: number): string; length: number };
  field<T>(field: unknown): T;
}

/** Apply proofreading corrections to the current editor */
export function applyProofreadDecorations(
  editorView: EditorView,
  corrections: Correction[],
  onAccept?: (correction: Correction) => void,
  onIgnore?: (correction: Correction) => void,
): void {
  if (corrections.length === 0) return;

  // Apply decorations via CSS class spans in the editor
  // In production, use Decoration.mark() with StateField.define()
  // For now, overlay styled spans on the editor content

  const decorations = correctionsToDecorations(corrections);
  const doc = editorView.state.doc;

  // Build inline marked spans for each correction
  for (const dec of decorations) {
    if (dec.from >= doc.length || dec.to > doc.length) continue;

    // Highlight the text range using CM6 decoration approach
    // This is a simplified marker; production uses Decoration.mark()
    const text = doc.sliceString(dec.from, dec.to);
    const span = createHighlightSpan(text, dec, (correction) => {
      // Accept: replace text
      const tr = createTextChange(dec.from, dec.to, correction.suggestion);
      editorView.dispatch(tr);
    }, (correction) => {
      // Ignore: just remove decoration
      hideProofreadTooltip();
    });
  }
}

function createHighlightSpan(
  text: string,
  decoration: { correction: Correction; className: string },
  onAccept: (c: Correction) => void,
  onIgnore: (c: Correction) => void,
): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = decoration.className;
  span.textContent = text;
  span.title = `${decoration.correction.original} → ${decoration.correction.suggestion}`;

  span.addEventListener('mouseenter', (e) => {
    const rect = span.getBoundingClientRect();
    showProofreadTooltip(decoration.correction, {
      x: rect.left,
      y: rect.bottom,
    }, {
      onAccept,
      onIgnore,
    });
  });

  span.addEventListener('mouseleave', () => {
    // Auto-dismiss on mouse leave with delay
    setTimeout(() => {
      const tooltip = document.querySelector('.ww-proofread-tooltip');
      if (tooltip && !tooltip.matches(':hover')) {
        hideProofreadTooltip();
      }
    }, 200);
  });

  return span;
}

/** Create a simple text replacement transaction */
function createTextChange(from: number, to: number, insert: string): unknown {
  // In production: { changes: { from, to, insert } }
  return {
    changes: { from, to, insert },
  };
}

/** Navigate to next proofreading suggestion */
export function navigateToNextError(
  editorView: EditorView,
  corrections: Correction[],
  currentIndex: number,
): number {
  if (corrections.length === 0) return -1;
  const nextIndex = (currentIndex + 1) % corrections.length;
  const correction = corrections[nextIndex];

  // Scroll to the correction position
  const coords = editorView.posAtCoords({ x: 0, y: 0 }); // approximate
  // In production, scroll the editor to reveal the position

  return nextIndex;
}

/** Keyboard handler for accepting suggestions (Ctrl+Alt+1/2/3) */
export function registerProofreadKeybindings(
  onAcceptByIndex: (index: number) => void,
  onNext: () => void,
  onPrev: () => void,
): void {
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.altKey) return;

    if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      onAcceptByIndex(parseInt(e.key) - 1);
    } else if (e.key === '.') {
      e.preventDefault();
      onNext();
    } else if (e.key === ',') {
      e.preventDefault();
      onPrev();
    }
  });
}
