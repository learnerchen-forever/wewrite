// table-decoration-edit-modal.ts — Decoration editor for tables
//
// Mirrors the blockquote decoration editor: built-ins are read-only ("另存为副本"
// to fork), custom decorations can be renamed / re-parametrized / re-styled per
// part, and the live preview renders a sample table against the current theme.

import { App, Modal, Notice } from 'obsidian';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { TableDecoration, TableDecorationParts } from '../core/table-decoration-types';
import { renderTablePreview } from '../renderer/table-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';

export interface TableDecorationEditOptions {
	/** Existing decoration, or null to create a new one. */
	decoration: TableDecoration | null;
	/** Current effective param values (theme overrides merged over defaults). */
	initialValues?: Record<string, string>;
	/** Built-in templates are read-only until copied. */
	builtinReadonly: boolean;
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	onSave: (decoration: TableDecoration) => void;
}

const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select'] as const;

const PART_DEFS: { key: keyof TableDecorationParts }[] = [
	{ key: 'table' },
	{ key: 'th' },
	{ key: 'td' },
	{ key: 'firstCol' },
	{ key: 'zebra' },
];

/** Lazy part labels/hints so language hot-switch is honored on open. */
function partLabel(key: keyof TableDecorationParts): string {
	switch (key) {
		case 'table': return t('deco_edit.part_table_label');
		case 'th': return t('deco_edit.part_th_label');
		case 'td': return t('deco_edit.part_td_label');
		case 'firstCol': return t('deco_edit.part_first_col_label');
		case 'zebra': return t('deco_edit.part_zebra_label');
	}
}
function partHint(key: keyof TableDecorationParts): string {
	switch (key) {
		case 'table': return t('deco_edit.part_table_hint');
		case 'th': return t('deco_edit.part_th_hint');
		case 'td': return t('deco_edit.part_td_hint');
		case 'firstCol': return t('deco_edit.part_first_col_hint');
		case 'zebra': return t('deco_edit.part_zebra_hint');
	}
}

export class TableDecorationEditModal extends Modal {
	private options: TableDecorationEditOptions;
	private nameValue: string;
	private params: Record<string, DecorationParam> = {};
	private parts: TableDecorationParts = {};
	private paramsListEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, options: TableDecorationEditOptions) {
		super(app);
		this.options = options;
		this.nameValue = options.decoration?.name || '';
		if (options.decoration) {
			this.params = JSON.parse(JSON.stringify(options.decoration.params));
			this.parts = JSON.parse(JSON.stringify(options.decoration.parts || {}));
			// Show the current effective values (theme overrides) instead of
			// the built-in defaults; a copied decoration inherits them.
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
		contentEl.addClass('wewrite-table-deco-modal');

		const isBuiltin = this.options.builtinReadonly;
		const isNew = !this.options.decoration;
		contentEl.createEl('h3', {
			text: isNew ? t('deco_edit.new_table_title') : `${t('deco_edit.edit_table_title')} — ${this.options.decoration!.name}`,
		});

		// Name
		const nameWrap = contentEl.createDiv();
		nameWrap.createSpan({ text: t('deco_edit.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', value: this.nameValue });
		nameInput.style.cssText = 'width:100%;margin-top:4px;box-sizing:border-box';
		nameInput.disabled = isBuiltin;
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		// Params
		const paramsWrap = contentEl.createDiv();
		paramsWrap.style.marginTop = '12px';
		paramsWrap.createEl('h4', { text: t('deco_edit.params_label') }).style.cssText = 'margin:0 0 6px;font-size:13px';
		this.paramsListEl = paramsWrap.createDiv();
		this.renderParamsList();

		// Per-part CSS (custom decorations only)
		if (!isBuiltin) {
			const partsWrap = contentEl.createDiv();
			partsWrap.style.marginTop = '12px';
			partsWrap.createEl('h4', { text: t('deco_edit.parts_optional') }).style.cssText = 'margin:0 0 6px;font-size:13px';
			for (const part of PART_DEFS) {
				const label = partsWrap.createEl('div', { text: `${partLabel(part.key)} — ${partHint(part.key)}`, cls: 'setting-item-description' });
				label.style.cssText = 'font-size:11px;line-height:1.5';
				const textarea = partsWrap.createEl('textarea', { attr: { rows: '2', spellcheck: 'false' } });
				textarea.style.cssText = 'width:100%;font-family:var(--font-monospace);font-size:11px;box-sizing:border-box;margin-bottom:4px';
				textarea.value = this.parts[part.key] || '';
				textarea.addEventListener('input', () => {
					this.parts = { ...this.parts, [part.key]: textarea.value };
					this.schedulePreview();
				});
			}
		}

		// Preview
		const previewTitle = contentEl.createEl('h4', { text: t('deco_edit.preview_label') });
		previewTitle.style.cssText = 'margin:12px 0 6px;font-size:13px';
		this.previewEl = contentEl.createDiv();
		this.previewEl.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:4px;padding:8px;background:#ffffff;color:#333333;min-height:40px;overflow-x:auto';

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
				this.schedulePreview();
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

	private schedulePreview(): void {
		if (this.previewTimer) clearTimeout(this.previewTimer);
		this.previewTimer = setTimeout(() => this.updatePreview(), 200);
	}

	private updatePreview(): void {
		if (!this.previewEl) return;
		const params: Record<string, string> = {};
		for (const [k, v] of Object.entries(this.params)) {
			params[k] = v.default;
		}
		const decoration: TableDecoration = {
			id: '__preview__',
			name: t('deco_edit.preview_label'),
			description: '',
			builtin: false,
			params: {},
			parts: this.parts,
			family: 'card',
		};
		this.previewEl.innerHTML = renderTablePreview(this.options.basePreset, decoration, params);
	}

	private save(asCopy: boolean): void {
		const name = this.nameValue.trim() || t('deco_edit.default_name_table');
		const baseId = this.options.decoration?.id && !this.options.builtinReadonly && !asCopy
			? this.options.decoration.id
			: `custom_${Date.now().toString(36)}`;
		const decoration: TableDecoration = {
			id: baseId,
			name: asCopy ? `${name} 副本` : name,
			description: t('deco_edit.custom_desc'),
			builtin: false,
			params: { ...this.params },
			parts: this.parts,
			family: 'card',
		};
		this.options.onSave(decoration);
		this.close();
	}

	onClose(): void {
		if (this.previewTimer) clearTimeout(this.previewTimer);
	}
}
