// editor-highlight.ts — temporary range highlight in the CodeMirror editor.
//
// Obsidian's official `registerEditorExtension` API lets a plugin contribute a
// CodeMirror 6 StateField to every markdown editor. This field renders a
// background mark over a range whenever a StateEffect tells it to — used by
// the proofread modal to keep the current error highlighted in the note
// behind the dialog, and to clear it when the review finishes.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

/** Document range to highlight (or null to clear). */
export interface HighlightRange {
  from: number;
  to: number;
}

const highlightEffect = StateEffect.define<HighlightRange | null>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // Follow edits made while the highlight is active.
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(highlightEffect)) {
        next = effect.value
          ? Decoration.set([Decoration.mark({ class: 'wewrite-editor-highlight' }).range(effect.value.from, effect.value.to)])
          : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Register in onload: `this.registerEditorExtension(editorHighlightExtension)`. */
export const editorHighlightExtension = [highlightField];

/** Minimal structural accessor for the CM6 view on an Obsidian editor. */
export interface CMEditor {
  cm?: EditorView;
}

/** Highlight a document range in the given editor (null clears it). */
export function setEditorHighlight(editor: { cm?: EditorView } | undefined | null, range: HighlightRange | null): void {
  editor?.cm?.dispatch({ effects: highlightEffect.of(range) });
}
