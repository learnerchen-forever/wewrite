// ai-generate-modal.ts — Dialog for LLM generation of Obsidian-compatible
// Mermaid diagrams and math formulas. The user describes what they want; the
// selected note text is passed along as context; the result is inserted at the
// cursor position.
//
// Two things the dialog adds on top of a text box and a button:
//
//  * **A shape choice.** Pinning the diagram type (or the inline/display form
//    of a formula) removes the single biggest source of wrong-answer retries —
//    the model guessing a different shape than the one the user had in mind.
//  * **A check result.** The generated code is validated locally, and the
//    conclusion is shown next to the result. "Renders clean" and "could not be
//    parsed — check before inserting" are very different things to hand a user,
//    and only one of them should be inserted blind.

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { t } from '../i18n';
import type { GenerateProblem } from '../ai/generate-engine';
import { MERMAID_DIAGRAM_TYPES, type MermaidIssueCode } from '../ai/mermaid-output';

export type AIGenerateMode = 'mermaid' | 'math';

/** What the dialog asks the engine for. */
export interface GenerateRequest {
  /** Mermaid: '' lets the model choose the diagram type. */
  diagramType: string;
  /** Math: block or inline form. */
  mathDisplay: 'display' | 'inline';
}

export interface GenerateOutcome {
  code: string;
  problems: GenerateProblem[];
}

/** i18n key per validation issue, so the status line reads naturally. */
const ISSUE_KEYS: Record<MermaidIssueCode, string> = {
  'empty': 'modal.generate.issue_empty',
  'fence-left': 'modal.generate.issue_fence',
  'unknown-first-line': 'modal.generate.issue_first_line',
  'unbalanced-quote': 'modal.generate.issue_quote',
  'unbalanced-block': 'modal.generate.issue_block',
  'end-as-node': 'modal.generate.issue_end_node',
};

export class AIGenerateModal extends WeWriteModal {
  private descEl!: HTMLTextAreaElement;
  private generateBtn!: HTMLButtonElement;
  private resultSection!: HTMLElement;
  private resultEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private insertBtn!: HTMLButtonElement;
  private regenerateBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private typeSelect?: HTMLSelectElement;
  private formSelect?: HTMLSelectElement;
  private busy = false;
  private hasResult = false;
  private disposed = false;

  constructor(
    app: App,
    private mode: AIGenerateMode,
    private initialDescription: string,
    private hasSelection: boolean,
    private generate: (description: string, request: GenerateRequest) => Promise<GenerateOutcome>,
    private onInsert: (code: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wewrite-ai-generate-modal');

    this.titleEl.setText(this.mode === 'mermaid'
      ? t('modal.generate.title_mermaid')
      : t('modal.generate.title_math'));

    contentEl.createDiv({ text: t('modal.generate.description_label'), cls: 'wewrite-generate-label' });
    this.descEl = contentEl.createEl('textarea', {
      cls: 'wewrite-generate-desc',
      attr: {
        rows: '4',
        placeholder: this.mode === 'mermaid'
          ? t('modal.generate.placeholder_mermaid')
          : t('modal.generate.placeholder_math'),
      },
    });
    this.descEl.value = this.initialDescription;

    const options = contentEl.createDiv({ cls: 'wewrite-generate-options' });
    if (this.mode === 'mermaid') this.buildTypePicker(options);
    else this.buildFormPicker(options);
    options.createDiv({
      text: this.mode === 'mermaid' ? t('modal.generate.type_hint') : t('modal.generate.form_hint'),
      cls: 'wewrite-generate-hint',
    });

    if (this.hasSelection) {
      contentEl.createDiv({ text: t('modal.generate.selection_hint'), cls: 'wewrite-generate-hint' });
    }

    const topActions = contentEl.createDiv({ cls: 'wewrite-generate-actions' });
    this.generateBtn = topActions.createEl('button', { text: t('modal.generate.generate'), cls: 'mod-cta wewrite-generate-btn' });
    const cancelBtn = topActions.createEl('button', { text: t('misc.cancel'), cls: 'wewrite-generate-btn' });
    this.generateBtn.addEventListener('click', () => void this.run());
    cancelBtn.addEventListener('click', () => this.close());
    // Ctrl/Cmd+Enter triggers generation from the textarea.
    this.descEl.addEventListener('keydown', (evt) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
        evt.preventDefault();
        void this.run();
      }
    });

    // Result section (hidden until the first generation).
    this.resultSection = contentEl.createDiv({ cls: 'wewrite-generate-result-section' });
    this.resultSection.removeClass('is-shown');
    this.resultSection.createDiv({ text: t('modal.generate.result'), cls: 'wewrite-generate-label' });
    this.statusEl = this.resultSection.createDiv({ cls: 'wewrite-generate-status' });
    this.resultEl = this.resultSection.createEl('textarea', {
      cls: 'wewrite-generate-result',
      attr: { rows: '8', spellcheck: 'false' },
    });
    const resultActions = this.resultSection.createDiv({ cls: 'wewrite-generate-actions' });
    this.copyBtn = resultActions.createEl('button', { text: t('modal.generate.copy'), cls: 'wewrite-generate-btn' });
    this.regenerateBtn = resultActions.createEl('button', { text: t('modal.generate.regenerate'), cls: 'wewrite-generate-btn' });
    this.insertBtn = resultActions.createEl('button', { text: t('modal.generate.insert'), cls: 'mod-cta wewrite-generate-btn' });

    this.copyBtn.addEventListener('click', () => this.copyResult());
    this.regenerateBtn.addEventListener('click', () => void this.run());
    this.insertBtn.addEventListener('click', () => this.insert());

    this.setResultEnabled(false);
  }

  /** Mermaid: which kind of diagram to produce. '' = let the model choose. */
  private buildTypePicker(parent: HTMLElement): void {
    parent.createDiv({ text: t('modal.generate.type_label'), cls: 'wewrite-generate-label' });
    this.typeSelect = parent.createEl('select', { cls: 'wewrite-generate-select' });
    this.typeSelect.createEl('option', { text: t('modal.generate.type_auto'), value: '' });
    for (const type of MERMAID_DIAGRAM_TYPES) {
      this.typeSelect.createEl('option', { text: type, value: type });
    }
  }

  /** Math: block formula or inline math. */
  private buildFormPicker(parent: HTMLElement): void {
    parent.createDiv({ text: t('modal.generate.form_label'), cls: 'wewrite-generate-label' });
    this.formSelect = parent.createEl('select', { cls: 'wewrite-generate-select' });
    this.formSelect.createEl('option', { text: t('modal.generate.form_display'), value: 'display' });
    this.formSelect.createEl('option', { text: t('modal.generate.form_inline'), value: 'inline' });
  }

  private request(): GenerateRequest {
    return {
      diagramType: this.typeSelect?.value ?? '',
      mathDisplay: (this.formSelect?.value === 'inline' ? 'inline' : 'display'),
    };
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    const description = this.descEl.value.trim();
    if (!description) {
      new Notice(this.mode === 'mermaid'
        ? t('modal.generate.need_description_mermaid')
        : t('modal.generate.need_description_math'));
      return;
    }
    this.busy = true;
    this.hasResult = false;
    this.generateBtn.disabled = true;
    this.generateBtn.setText(t('modal.generate.generating'));
    this.regenerateBtn.disabled = true;
    this.resultSection.addClass('is-shown');
    this.statusEl.setText(t('modal.generate.checking_pending'));
    this.statusEl.removeClass('is-warning');
    this.resultEl.value = t('modal.generate.generating');
    this.setResultEnabled(false);

    try {
      const outcome = await this.generate(description, this.request());
      if (this.disposed) return;
      if (!outcome.code) {
        // An engine that found nothing to insert reports why; only a silent
        // empty answer falls back to the generic message.
        if (outcome.problems.length > 0) this.renderProblems(outcome.problems);
        else this.statusEl.setText(t('modal.generate.empty_result'));
        return;
      }
      this.resultEl.value = outcome.code;
      this.hasResult = true;
      this.renderProblems(outcome.problems);
    } catch (err) {
      if (this.disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.resultEl.value = '';
      this.statusEl.setText(t('notice.ai_call_failed', { error: msg }));
      this.statusEl.addClass('is-warning');
    } finally {
      if (!this.disposed) {
        this.busy = false;
        this.generateBtn.disabled = false;
        this.generateBtn.setText(t('modal.generate.generate'));
        this.regenerateBtn.disabled = false;
        this.setResultEnabled(this.hasResult);
      }
    }
  }

  /**
   * Show the local check result.
   *
   * A clean run is stated explicitly rather than left blank: the difference
   * between "checked and fine" and "not checked" matters when the code is
   * about to be inserted into a note.
   */
  private renderProblems(problems: GenerateProblem[]): void {
    this.statusEl.removeClass('is-warning');
    if (problems.length === 0) {
      this.statusEl.setText(t(this.mode === 'mermaid'
        ? 'modal.generate.check_ok_mermaid'
        : 'modal.generate.check_ok_math'));
      return;
    }
    this.statusEl.addClass('is-warning');
    const lines = problems.map((problem) => problemText(problem));
    this.statusEl.setText(`${t('modal.generate.check_failed')} ${lines.join(t('modal.generate.check_separator'))}`);
  }

  /** Copy and insert act on the textarea, so manual edits are kept. */
  private current(): string {
    return this.resultEl.value.trim();
  }

  private insert(): void {
    const code = this.current();
    if (!code) return;
    this.onInsert(code);
    this.close();
  }

  private copyResult(): void {
    const code = this.current();
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => {
      new Notice(t('notice.ai_generated_copied'));
    });
  }

  private setResultEnabled(enabled: boolean): void {
    this.insertBtn.disabled = !enabled;
    this.copyBtn.disabled = !enabled;
    this.resultEl.disabled = !enabled;
  }

  onClose(): void {
    this.disposed = true;
    const { contentEl } = this;
    contentEl.empty();
  }
}

/** Localised one-line description of a failed check. */
function problemText(problem: GenerateProblem): string {
  if (problem.kind === 'math') return t('modal.generate.issue_math', { message: problem.message });
  const { code, line, detail } = problem.issue;
  const where = line ? t('modal.generate.issue_line', { line: String(line) }) : '';
  const message = `${t(ISSUE_KEYS[code] ?? 'modal.generate.issue_unknown')}${where}`;
  return detail ? `${message} — ${detail}` : message;
}
