// proofread-modal.ts — proofread review: the whole correction list, plus the
// correction under review.
//
// The review used to be a one-at-a-time wizard: a counter, one correction, and
// four buttons. That gives no overview (how many are left, of what kind), no
// bulk escape hatch (60 issues = 60 keypresses), and no way to fix a suggestion
// that is *almost* right. What it does now:
//
//   - a collapsible list of every correction, click to jump, current one marked
//   - severity colour by type, so "wording" is not painted the same red as a typo
//   - an editable suggestion box (edit, then accept)
//   - batch actions: accept/ignore every remaining correction of this type,
//     ignore the rest
//   - a closing summary with the accepted/ignored counts
//   - the shortcuts printed on screen, since they are invisible otherwise
//
// Corrections are held in **document** offsets and re-anchored from the current
// text on every edit, so an accept, an undo or a manual change cannot leave the
// list pointing at the wrong place.

import { App, type Editor, type EventRef } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { setEditorHighlight, type CMEditor } from '../utils/editor-highlight';
import {
  resolveCorrectionOffsets,
  type ProofCorrection,
  type ProofreadType,
} from '../ai/proofread-engine';
import { diffParts } from '../utils/text-diff';
import { t } from '../i18n';

/** Type → label and colour. Spelling/punctuation are hard errors, grammar is a
 *  probable mistake, wording is only a suggestion — the three severity levels
 *  the design doc asks for, and the reason they must not share one colour. */
const TYPE_LABELS: Record<ProofreadType, string> = {
  spelling: 'modal.proofread.type_spelling',
  grammar: 'modal.proofread.type_grammar',
  punctuation: 'modal.proofread.type_punctuation',
  wording: 'modal.proofread.type_wording',
  other: 'modal.proofread.type_other',
};

const TYPE_CLASS: Record<ProofreadType, string> = {
  spelling: 'is-spelling',
  punctuation: 'is-punctuation',
  grammar: 'is-grammar',
  wording: 'is-wording',
  other: 'is-other',
};

/**
 * How long the note may keep changing before the list is re-anchored.
 *
 * `editor-change` fires per keystroke and re-anchoring is a scan per
 * correction, so typing a sentence used to cost a full re-resolve per
 * character. Accepting a correction re-anchors immediately and does not wait
 * for this.
 */
const REANCHOR_DEBOUNCE_MS = 250;

/** Identity of a correction across re-anchoring, for the suggestion drafts. */
function draftKey(c: ProofCorrection): string {
  return `${c.type}\u0000${c.original}\u0000${c.suggestion}`;
}

export class ProofreadModal extends WeWriteModal {
  private index = 0;
  /** Corrections applied to the note during this review. */
  private accepted = 0;
  /** Corrections dismissed during this review. */
  private ignored = 0;
  /** Whether the correction list is expanded; kept across re-renders. */
  private listOpen = false;
  /** Edited-but-not-yet-accepted suggestions, keyed by {@link draftKey}. */
  private drafts = new Map<string, string>();
  /** Which correction the current DOM was built for — see {@link captureDraft}. */
  private renderedKey = '';
  private changeRef: EventRef | null = null;
  private reanchorTimer: number | null = null;
  private corrections: ProofCorrection[];

  constructor(
    app: App,
    private editor: Editor,
    corrections: ProofCorrection[],
    /** Document offset where the proofread text starts (0 = whole note, selection start otherwise). */
    baseOffset: number,
  ) {
    super(app);
    // Compact (bottom-sheet style) on phones so the note behind stays
    // visible while reviewing; centered dialog on desktop.
    this.modalEl.addClass('wewrite-proofread-modal');
    // Work in absolute document offsets from here on: the engine returns
    // offsets relative to the proofread text (selection or whole note).
    // Document-anchored positions re-anchor cleanly after edits (accept,
    // undo, redo, manual changes).
    this.corrections = corrections.map((c) => ({ ...c, start: c.start + baseOffset, end: c.end + baseOffset }));
    this.corrections.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  onOpen(): void {
    this.titleEl.setText(t('modal.proofread.title'));

    // Keyboard navigation (Word-style): ← → move, Enter accept. The handlers
    // skip the arrows while the suggestion box has the caret, or the user
    // could not move the cursor inside their own edit.
    this.scope.register([], 'ArrowLeft', (evt) => {
      if (isTextEntry(evt.target)) return;
      evt.preventDefault();
      this.step(-1);
    });
    this.scope.register([], 'ArrowRight', (evt) => {
      if (isTextEntry(evt.target)) return;
      evt.preventDefault();
      this.step(1);
    });
    this.scope.register([], 'Enter', (evt) => {
      // When a button is focused the browser already fires its click on
      // Enter — bail out to avoid accepting twice.
      const target = evt.target as HTMLElement | null;
      if (target?.tagName === 'BUTTON') return;
      // Shift+Enter stays a newline inside the suggestion box.
      if (isTextEntry(evt.target) && evt.shiftKey) return;
      evt.preventDefault();
      this.accept();
    });

    // Keep correction positions in sync while the modal is open: the user can
    // undo an accepted change or edit the note directly, which invalidates
    // every stored offset. Debounced — this fires per keystroke.
    this.changeRef = this.app.workspace.on('editor-change', (changedEditor) => {
      if (changedEditor !== this.editor) return;
      this.scheduleReanchor();
    });

    this.render();
  }

  // ── State ──

  /** Current correction, or null when the review is finished. */
  private current(): ProofCorrection | null {
    if (this.corrections.length === 0) return null;
    return this.corrections[Math.min(this.index, this.corrections.length - 1)];
  }

  /** Re-locate every correction in the current document text. Handles accept
   *  shifts, undo/redo and direct edits; unlocatable entries are dropped. */
  private reanchor(): void {
    this.corrections = resolveCorrectionOffsets(this.corrections, this.editor.getValue());
    if (this.corrections.length > 0 && this.index >= this.corrections.length) {
      this.index = this.corrections.length - 1;
    }
  }

  /** Coalesce the editor's per-keystroke notifications into one re-render. */
  private scheduleReanchor(): void {
    if (this.reanchorTimer !== null) window.clearTimeout(this.reanchorTimer);
    this.reanchorTimer = window.setTimeout(() => {
      this.reanchorTimer = null;
      // render() re-anchors itself.
      this.render();
    }, REANCHOR_DEBOUNCE_MS);
  }

  // ── Rendering ──

  private render(): void {
    // Whatever the user typed into the suggestion box belongs to the item that
    // is on screen right now; stash it before the body is torn down.
    this.captureDraft();
    // Re-anchor before showing anything: a debounced `editor-change` may not
    // have fired yet, and showing (or selecting, or replacing) a range that the
    // note has already moved past is exactly the failure this modal must not
    // have. Clicks are rare, so the scan costs nothing here — the debounce
    // exists for keystrokes, not for this.
    this.reanchor();

    this.contentEl.empty();
    this.contentEl.addClass('wewrite-proofread-modal');

    const current = this.current();
    if (!current) {
      this.renderedKey = '';
      this.renderFinished();
      setEditorHighlight(this.editor as unknown as CMEditor, null);
      return;
    }
    this.renderedKey = draftKey(current);

    this.renderHead();
    this.renderList();
    this.renderBody(current);
    this.renderButtons(current);
    this.contentEl.createDiv({ cls: 'wewrite-proofread-hint', text: t('modal.proofread.hint') });

    // Paint every remaining correction in the note, emphasizing the current
    // one; move the editor to it and select it.
    setEditorHighlight(
      this.editor as unknown as CMEditor,
      this.corrections.map((c) => ({ from: c.start, to: c.end })),
      this.index,
    );
    this.syncEditorToCorrection(current);
  }

  private renderHead(): void {
    const head = this.contentEl.createDiv({ cls: 'wewrite-proofread-head' });
    const progress = head.createDiv({ cls: 'wewrite-proofread-progress' });
    progress.createSpan({
      text: t('modal.proofread.progress', {
        current: String(this.index + 1),
        total: String(this.corrections.length),
      }),
    });
    if (this.accepted > 0 || this.ignored > 0) {
      progress.createSpan({
        cls: 'wewrite-proofread-stats',
        text: ` · ${t('modal.proofread.stats', {
          accepted: String(this.accepted),
          ignored: String(this.ignored),
        })}`,
      });
    }
  }

  /** The whole list, collapsible, current entry marked. */
  private renderList(): void {
    const details = this.contentEl.createEl('details', { cls: 'wewrite-proofread-list' });
    details.open = this.listOpen;
    details.addEventListener('toggle', () => { this.listOpen = details.open; });

    details.createEl('summary', {
      text: t('modal.proofread.list', { count: String(this.corrections.length) }),
    });

    const listEl = details.createDiv({ cls: 'wewrite-proofread-list-body' });
    this.corrections.forEach((c, i) => {
      const row = listEl.createDiv({ cls: `wewrite-proofread-list-item ${TYPE_CLASS[c.type]}` });
      if (i === this.index) row.addClass('is-current');
      row.createSpan({ cls: 'wewrite-proofread-badge', text: t(TYPE_LABELS[c.type]) });
      const entry = row.createSpan({ cls: 'wewrite-proofread-entry' });
      entry.createSpan({ cls: 'wewrite-proofread-entry-old', text: c.original });
      entry.createSpan({ cls: 'wewrite-proofread-entry-arrow', text: '→' });
      entry.createSpan({ cls: 'wewrite-proofread-entry-new', text: c.suggestion });
      row.addEventListener('click', () => this.jump(i));
    });

    // Only when the list is open — scrolling a collapsed <details> does nothing.
    if (this.listOpen) {
      listEl.querySelector<HTMLElement>('.is-current')?.scrollIntoView({ block: 'nearest' });
    }
  }

  private renderBody(current: ProofCorrection): void {
    const body = this.contentEl.createDiv({ cls: 'wewrite-proofread-body' });

    body.createDiv({
      cls: `wewrite-proofread-type ${TYPE_CLASS[current.type]}`,
      text: t(TYPE_LABELS[current.type]),
    });
    body.createDiv({
      cls: 'wewrite-proofread-desc',
      text: current.description || t('modal.proofread.no_description'),
    });

    this.renderContext(body, current);
    this.renderDiff(body, current);
    this.renderSuggestionInput(body, current);
  }

  /** The sentence around the current error, with the offending text marked —
   *  the note may be covered by the dialog (full-screen modals on phones), so
   *  the context has to be visible here. */
  private renderContext(parent: HTMLElement, c: ProofCorrection): void {
    const doc = this.editor.getValue();
    const bStart = Math.max(0, c.start - 40);
    const aEnd = Math.min(doc.length, c.end + 60);

    const contextEl = parent.createDiv({ cls: 'wewrite-proofread-context' });
    if (bStart > 0) contextEl.createSpan({ text: '…' });
    contextEl.createSpan({ text: doc.slice(bStart, c.start) });
    contextEl.createSpan({ text: c.original, cls: 'wewrite-proofread-context-hit' });
    contextEl.createSpan({ text: doc.slice(c.end, aEnd) });
    if (aEnd < doc.length) contextEl.createSpan({ text: '…' });
  }

  /** Original and suggestion with only the differing characters marked, so the
   *  change itself is visible instead of a whole-string strike-through. */
  private renderDiff(parent: HTMLElement, c: ProofCorrection): void {
    const parts = diffParts(c.original, c.suggestion);

    const originalEl = parent.createDiv({ cls: 'wewrite-proofread-field' });
    originalEl.createSpan({ text: t('modal.proofread.original'), cls: 'wewrite-proofread-label' });
    const originalText = originalEl.createSpan({ cls: 'wewrite-proofread-original-text' });
    originalText.createSpan({ text: parts.prefix });
    if (parts.before) originalText.createSpan({ text: parts.before, cls: 'is-changed' });
    originalText.createSpan({ text: parts.suffix });
  }

  private renderSuggestionInput(parent: HTMLElement, c: ProofCorrection): void {
    const field = parent.createDiv({ cls: 'wewrite-proofread-field' });
    field.createSpan({ text: t('modal.proofread.suggestion'), cls: 'wewrite-proofread-label' });
    field.createSpan({ text: t('modal.proofread.editable'), cls: 'wewrite-proofread-editable' });

    // The suggestion starts as a diff-highlighted preview rather than a text
    // input: a correction is accepted far more often than it is rewritten, and
    // a box under a preview of the same text only doubles the reading without
    // adding anything. Clicking the preview swaps it for a textarea.
    const key = draftKey(c);
    const text = this.drafts.get(key) ?? c.suggestion;
    const parts = diffParts(c.original, text);

    const preview = field.createDiv({ cls: 'wewrite-proofread-suggestion-text is-editable' });
    preview.createSpan({ text: parts.prefix });
    if (parts.after) preview.createSpan({ text: parts.after, cls: 'is-changed' });
    preview.createSpan({ text: parts.suffix });
    preview.addEventListener('click', () => this.beginEdit(preview));
  }

  /** Swap the suggestion preview for an editable textarea, keeping the text. */
  private beginEdit(preview: HTMLElement): void {
    if (preview.parentElement?.querySelector('textarea.wewrite-proofread-suggestion-input')) return;
    const input = createEl('textarea', {
      cls: 'wewrite-proofread-suggestion-input',
      attr: { rows: '2', spellcheck: 'false', 'aria-label': t('modal.proofread.suggestion') },
    });
    input.value = preview.textContent ?? '';
    preview.replaceWith(input);
    input.focus();
    // Caret at the end: the common case is appending to what is already there.
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private renderButtons(current: ProofCorrection): void {
    const buttons = this.contentEl.createDiv({ cls: 'wewrite-proofread-buttons' });
    const primary = buttons.createDiv({ cls: 'wewrite-proofread-buttons-row' });

    const prevBtn = primary.createEl('button', { text: t('modal.proofread.previous'), cls: 'wewrite-proofread-btn' });
    prevBtn.disabled = this.index <= 0;
    prevBtn.addEventListener('click', () => this.step(-1));

    const nextBtn = primary.createEl('button', { text: t('modal.proofread.next'), cls: 'wewrite-proofread-btn' });
    nextBtn.disabled = this.index >= this.corrections.length - 1;
    nextBtn.addEventListener('click', () => this.step(1));

    primary.createDiv({ cls: 'wewrite-proofread-spacer' });

    const ignoreBtn = primary.createEl('button', { text: t('modal.proofread.ignore'), cls: 'wewrite-proofread-btn' });
    ignoreBtn.addEventListener('click', () => this.ignore());

    const acceptBtn = primary.createEl('button', {
      text: t('modal.proofread.accept'),
      cls: 'wewrite-proofread-btn mod-cta',
    });
    acceptBtn.addEventListener('click', () => this.accept());

    // Bulk actions only earn their space once there is more than one item.
    if (this.corrections.length < 2) return;
    const bulk = buttons.createDiv({ cls: 'wewrite-proofread-buttons-row is-bulk' });
    const sameType = this.corrections.filter((c) => c.type === current.type).length;

    const acceptType = bulk.createEl('button', {
      cls: 'wewrite-proofread-btn is-bulk',
      text: t('modal.proofread.accept_type', { count: String(sameType) }),
    });
    acceptType.addEventListener('click', () => this.acceptOfType(current.type));

    const ignoreType = bulk.createEl('button', {
      cls: 'wewrite-proofread-btn is-bulk',
      text: t('modal.proofread.ignore_type', { count: String(sameType) }),
    });
    ignoreType.addEventListener('click', () => this.ignoreOfType(current.type));

    const ignoreRest = bulk.createEl('button', {
      cls: 'wewrite-proofread-btn is-bulk',
      text: t('modal.proofread.ignore_rest', { count: String(this.corrections.length) }),
    });
    ignoreRest.addEventListener('click', () => this.ignoreRest());
  }

  private renderFinished(): void {
    this.contentEl.createDiv({ cls: 'wewrite-proofread-progress', text: t('modal.proofread.done_all') });
    const body = this.contentEl.createDiv({ cls: 'wewrite-proofread-body' });

    if (this.accepted === 0 && this.ignored === 0) {
      body.createDiv({ cls: 'wewrite-proofread-finished', text: t('modal.proofread.finished') });
    } else {
      body.createDiv({ cls: 'wewrite-proofread-summary-title', text: t('modal.proofread.summary_title') });
      body.createDiv({
        cls: 'wewrite-proofread-summary',
        text: t('modal.proofread.summary', {
          accepted: String(this.accepted),
          ignored: String(this.ignored),
        }),
      });
      if (this.accepted > 0) {
        body.createDiv({ cls: 'wewrite-proofread-hint', text: t('modal.proofread.undo_hint') });
      }
    }

    const buttons = this.contentEl.createDiv({ cls: 'wewrite-proofread-buttons' });
    const row = buttons.createDiv({ cls: 'wewrite-proofread-buttons-row' });
    row.createEl('button', { text: t('modal.proofread.done'), cls: 'mod-cta' })
      .addEventListener('click', () => this.close());
  }

  // ── Actions ──

  /** Persist the suggestion box's current value. */
  private captureDraft(): void {
    // Stored against `renderedKey` — the item the DOM was actually built for,
    // not `current()`. Right after an accept the array has already shifted, so
    // `current()` is the *next* correction while the box still holds the
    // previous one's text; keying by the visible item keeps them apart.
    const input = this.contentEl.querySelector('textarea.wewrite-proofread-suggestion-input');
    if (this.renderedKey && input instanceof HTMLTextAreaElement) {
      this.drafts.set(this.renderedKey, input.value);
    }
  }

  /** Scroll the editor to a correction and select it. */
  private syncEditorToCorrection(c: ProofCorrection): void {
    const from = this.editor.offsetToPos(c.start);
    const to = this.editor.offsetToPos(c.end);
    this.editor.setSelection(from, to);
    this.editor.scrollIntoView({ from, to }, true);
  }

  private jump(index: number): void {
    if (index < 0 || index >= this.corrections.length || index === this.index) return;
    this.index = index;
    this.render();
  }

  private step(delta: number): void {
    this.jump(this.index + delta);
  }

  /** Replace one correction, then re-anchor the rest onto the new text. */
  private applyAt(index: number, replacement: string): void {
    const c = this.corrections[index];
    if (!c) return;
    // Splice before editing: an edit that contains its own original (e.g.
    // "b" → "bb") would otherwise be re-found by the re-anchor below.
    this.corrections.splice(index, 1);
    this.editor.replaceRange(replacement, this.editor.offsetToPos(c.start), this.editor.offsetToPos(c.end));
    this.accepted += 1;
    this.reanchor();
  }

  private accept(): void {
    const c = this.current();
    if (!c) return;
    // Only present when the user chose to edit; a rewritten value wins over the
    // model's, an emptied box falls back to it.
    const input = this.contentEl.querySelector('textarea.wewrite-proofread-suggestion-input');
    const typed = input instanceof HTMLTextAreaElement ? input.value : this.drafts.get(this.renderedKey);
    this.applyAt(this.index, typed?.trim() ? typed : c.suggestion);
    this.clampIndex();
    this.render();
  }

  private ignore(): void {
    if (this.corrections.length === 0) return;
    this.corrections.splice(this.index, 1);
    this.ignored += 1;
    this.clampIndex();
    this.render();
  }

  private acceptOfType(type: ProofreadType): void {
    // `applyAt` always removes one entry, so the list can only shrink.
    for (let guard = this.corrections.length; guard > 0; guard -= 1) {
      const index = this.corrections.findIndex((c) => c.type === type);
      if (index < 0) break;
      const c = this.corrections[index];
      const draft = this.drafts.get(draftKey(c));
      this.applyAt(index, draft?.trim() ? draft : c.suggestion);
    }
    this.clampIndex();
    this.render();
  }

  private ignoreOfType(type: ProofreadType): void {
    const before = this.corrections.length;
    this.corrections = this.corrections.filter((c) => c.type !== type);
    this.ignored += before - this.corrections.length;
    this.clampIndex();
    this.render();
  }

  private ignoreRest(): void {
    this.ignored += this.corrections.length;
    this.corrections = [];
    this.index = 0;
    this.render();
  }

  private clampIndex(): void {
    if (this.corrections.length === 0) this.index = 0;
    else if (this.index >= this.corrections.length) this.index = this.corrections.length - 1;
  }

  onClose(): void {
    if (this.reanchorTimer !== null) {
      window.clearTimeout(this.reanchorTimer);
      this.reanchorTimer = null;
    }
    if (this.changeRef) this.app.workspace.offref(this.changeRef);
    this.contentEl.empty();
    // Drop the temporary highlight when the review ends.
    setEditorHighlight(this.editor as unknown as CMEditor, null);
  }
}

/** True when a key event landed in a text field, where the arrow keys and
 *  plain Enter belong to the field, not to the dialog. */
function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}
