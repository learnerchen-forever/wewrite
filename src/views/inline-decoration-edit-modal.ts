// inline-decoration-edit-modal.ts — Template editor for inline decorations
//
// Built-in decorations are read-only ("另存为副本" to fork); custom decorations
// can be renamed, re-templated and have their params edited. A live preview
// renders the template against the current theme preset (as a bold run).

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { InlineDecoration } from '../core/inline-decoration-types';
import { renderInlinePreview } from '../renderer/inline-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';

export interface InlineDecorationEditOptions {
	/** Existing decoration, or null to create a new one. */
	decoration: InlineDecoration | null;
	/** Current effective param values (theme overrides merged over defaults). */
	initialValues?: Record<string, string>;
	/** Built-in templates are read-only until copied. */
	builtinReadonly: boolean;
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	onSave: (decoration: InlineDecoration) => void;
}

const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select', 'image'] as const;
const PLACEHOLDER_HINT =
	'{text} 内容 · {tag} 实际标签 (em/strong/code/a/span) · ${accent} ${text} ${textMuted} ${mono} ${bg} ${onAccent} · {{param}} 装饰参数';

export class InlineDecorationEditModal extends WeWriteModal {
	private options: InlineDecorationEditOptions;
	private templateValue: string;
	private nameValue: string;
	private params: Record<string, DecorationParam> = {};
	private paramsListEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;

	constructor(app: App, options: InlineDecorationEditOptions) {
		super(app);
		this.options = options;
		this.templateValue = options.decoration?.template || '';
		this.nameValue = options.decoration?.name || '';
		if (options.decoration) {
			this.params = JSON.parse(JSON.stringify(options.decoration.params));
			// Show the current effective values instead of the built-in
			// defaults; a copied decoration inherits them.
			if (options.initialValues) {
				for (const [key, value] of Object.entries(options.initialValues)) {
					if (this.params[key]) this.params[key] = { ...this.params[key], default: value };
				}
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('wewrite-inline-deco-modal');

		const isBuiltin = this.options.builtinReadonly;
		const isNew = !this.options.decoration;
		this.titleEl.setText(isNew ? t('deco_edit.new_title') : `${t('deco_edit.edit_title')} — ${this.options.decoration!.name}`);

		// Name
		const nameWrap = contentEl.createDiv();
		nameWrap.createSpan({ text: t('deco_edit.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', value: this.nameValue });
		nameInput.style.cssText = 'width:100%;margin-top:4px;box-sizing:border-box';
		nameInput.disabled = isBuiltin;
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		// Template
		const hint = contentEl.createEl('p', { text: PLACEHOLDER_HINT, cls: 'setting-item-description' });
		hint.style.cssText = 'font-size:11px;line-height:1.5';
		const textarea = contentEl.createEl('textarea', { attr: { rows: '8', spellcheck: 'false' } });
		textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:12px;box-sizing:border-box';
		textarea.value = this.templateValue;
		textarea.disabled = isBuiltin;
		textarea.addEventListener('input', () => {
			this.templateValue = textarea.value;
			this.syncParamsFromTemplate();
			this.renderParamsList();
			this.schedulePreview();
		});

		// Params
		const paramsWrap = contentEl.createDiv();
		paramsWrap.style.marginTop = '12px';
		paramsWrap.createEl('h4', { text: t('deco_edit.params_label') }).style.cssText = 'margin:0 0 6px;font-size:13px';
		this.paramsListEl = paramsWrap.createDiv();
		this.renderParamsList();
		if (!isBuiltin) {
			const addBtn = paramsWrap.createEl('button', { text: t('deco_edit.add_param') });
			addBtn.style.marginTop = '6px';
			addBtn.addEventListener('click', () => {
				const key = `param${Object.keys(this.params).length + 1}`;
				this.params[key] = { type: 'text', label: key, default: '' };
				this.renderParamsList();
			});
		}

		// Preview
		const previewTitle = contentEl.createEl('h4', { text: t('deco_edit.preview_label') });
		previewTitle.style.cssText = 'margin:12px 0 6px;font-size:13px';
		this.previewEl = contentEl.createDiv();
		this.previewEl.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:4px;padding:8px;background:#ffffff;color:#333333;min-height:40px';

		// Buttons
		const btnRow = contentEl.createDiv();
		btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px';
		btnRow.createEl('button', { text: t('misc.cancel') }).addEventListener('click', () => this.close());
		if (isBuiltin) {
			btnRow.createEl('button', { text: t('deco_edit.save_copy'), cls: 'mod-cta' }).addEventListener('click', () => this.save(true));
		} else {
			btnRow.createEl('button', { text: isNew ? t('deco_edit.create') : t('deco_edit.save'), cls: 'mod-cta' }).addEventListener('click', () => this.save(false));
		}

		this.schedulePreview();
	}

	private renderParamsList(): void {
		const el = this.paramsListEl;
		if (!el) return;
		el.empty();

		const isBuiltin = this.options.builtinReadonly;
		for (const [key, param] of Object.entries(this.params)) {
			const row = el.createDiv();
			row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0';

			const keyInput = row.createEl('input', { type: 'text', value: key });
			keyInput.style.cssText = 'width:84px;font-family:var(--font-monospace);font-size:11px;padding:1px 4px';
			keyInput.disabled = isBuiltin;
			keyInput.addEventListener('change', () => {
				const newKey = keyInput.value.trim() || key;
				if (newKey !== key && !this.params[newKey]) {
					this.params[newKey] = this.params[key];
					delete this.params[key];
					this.renderParamsList();
				} else {
					keyInput.value = key;
				}
			});

			const typeSelect = row.createEl('select');
			typeSelect.style.cssText = 'width:76px;font-size:11px';
			for (const t of PARAM_TYPES) {
				const opt = typeSelect.createEl('option', { text: t });
				opt.value = t;
				if (t === param.type) opt.selected = true;
			}
			typeSelect.disabled = isBuiltin;
			typeSelect.addEventListener('change', () => {
				this.params[key] = { ...this.params[key], type: typeSelect.value as DecorationParam['type'] };
			});

			const labelInput = row.createEl('input', { type: 'text', value: param.label, placeholder: t('deco_edit.param_label_ph') });
			labelInput.style.cssText = 'flex:1;min-width:60px;font-size:11px;padding:1px 4px';
			labelInput.disabled = isBuiltin;
			labelInput.addEventListener('input', () => {
				this.params[key] = { ...this.params[key], label: labelInput.value || key };
			});

			const defaultInput = row.createEl('input', { type: 'text', value: param.default, placeholder: t('deco_edit.param_default_ph') });
			defaultInput.style.cssText = 'width:110px;font-family:var(--font-monospace);font-size:11px;padding:1px 4px';
			defaultInput.disabled = isBuiltin;
			defaultInput.addEventListener('input', () => {
				this.params[key] = { ...this.params[key], default: defaultInput.value };
			});

			if (!isBuiltin) {
				const delBtn = row.createEl('button', { text: '✕' });
				delBtn.style.fontSize = '11px';
				delBtn.addEventListener('click', () => {
					delete this.params[key];
					this.renderParamsList();
				});
			}
		}
	}

	/** Ensure every {{param}} referenced in the template has a definition. */
	private syncParamsFromTemplate(): void {
		for (const m of this.templateValue.matchAll(/\{\{([\w-]+)\}\}/g)) {
			const key = m[1];
			if (!this.params[key]) {
				this.params[key] = { type: 'text', label: key, default: '' };
			}
		}
	}

	private schedulePreview(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
		this.previewTimer = window.setTimeout(() => this.updatePreview(), 200);
	}

	private updatePreview(): void {
		if (!this.previewEl) return;
		const template = this.templateValue.trim() || '<strong>{text}</strong>';
		const params: Record<string, string> = {};
		for (const [k, v] of Object.entries(this.params)) {
			params[k] = v.default;
		}
		this.previewEl.innerHTML = renderInlinePreview(this.options.basePreset, template, params);
	}

	private save(asCopy: boolean): void {
		const template = this.templateValue.trim();
		if (!template) {
			new Notice(t('deco_edit.template_empty'));
			return;
		}
		if (!template.includes('{text}')) {
			new Notice(t('deco_edit.template_text_required'));
			return;
		}
		this.syncParamsFromTemplate();

		const name = this.nameValue.trim() || t('deco_edit.default_name');
		const baseId = this.options.decoration?.id && !this.options.builtinReadonly && !asCopy
			? this.options.decoration.id
			: `custom_${Date.now().toString(36)}`;
		const decoration: InlineDecoration = {
			id: baseId,
			name: asCopy ? `${name} 副本` : name,
			description: t('deco_edit.custom_desc'),
			builtin: false,
			template,
			params: { ...this.params },
			family: 'composite',
		};
		this.options.onSave(decoration);
		this.close();
	}

	onClose(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
	}
}
