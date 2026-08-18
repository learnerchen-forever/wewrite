// editor-highlight.ts — temporary range highlight in the CodeMirror editor.
//
// Obsidian's official `registerEditorExtension` API lets a plugin contribute a
// CodeMirror 6 StateField to every markdown editor. This field renders a
// background mark over a range whenever a StateEffect tells it to — used by
// the proofread modal to keep the current error highlighted in the note
// behind the dialog, and to clear it when the review finishes.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

/** Document range to highlight. */
export interface HighlightRange {
  from: number;
  to: number;
}

/** Highlight state: every correction range, plus the index of the one that
 *  is currently under review (rendered with an extra emphasis class). */
interface HighlightState {
  ranges: HighlightRange[];
  current: number;
}

const highlightEffect = StateEffect.define<HighlightState | null>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // Follow edits made while the highlight is active.
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(highlightEffect)) {
        const v = effect.value;
        if (!v || v.ranges.length === 0) {
          next = Decoration.none;
        } else {
          next = Decoration.set(
            v.ranges.map((r, i) =>
              Decoration.mark({
                class: i === v.current
                  ? 'wewrite-editor-highlight wewrite-editor-highlight-current'
                  : 'wewrite-editor-highlight',
              }).range(r.from, r.to),
            ),
          );
        }
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

/** Highlight document ranges in the given editor (null clears).
 *  @param ranges  All correction ranges; the one at `current` is emphasized.
 *  @param current  Index of the range currently under review. */
export function setEditorHighlight(
  editor: { cm?: EditorView } | undefined | null,
  ranges: HighlightRange[] | null,
  current = 0,
): void {
  const view = editor?.cm;
  if (!view) return;
  // Obsidian's registerEditorExtension only guarantees the field on editors
  // created after registration (e.g. reloading the plugin while a note is
  // already open leaves open editors without it). Append the config to this
  // view on demand so the highlight always has a field to render into.
  if (!view.state.field(highlightField, false)) {
    view.dispatch({ effects: StateEffect.appendConfig.of(editorHighlightExtension) });
  }
  const value: HighlightState | null =
    ranges && ranges.length > 0
      ? { ranges, current: Math.min(Math.max(0, current), ranges.length - 1) }
      : null;
  view.dispatch({ effects: highlightEffect.of(value) });
}
