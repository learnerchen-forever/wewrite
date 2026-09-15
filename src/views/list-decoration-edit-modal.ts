// list-decoration-edit-modal.ts — Template editor for list (ul/ol) decorations
//
// Mirrors the divider decoration editor: built-ins are read-only ("另存为副本"
// to fork), custom decorations can be renamed / re-templated / re-parametrized,
// and the live preview renders sample ol + ul against the current theme preset.
// A list decoration has two templates: the root (replaces the list, with
// {items}) and the per-item template (with {item} / {number} / {marker}).

import { App, Notice } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { deepClone } from '../utils/deep-clone';
import type { DecorationParam } from '../core/heading-decoration-types';
import type { ListDecoration } from '../core/list-decoration-types';
import { renderListPreview } from '../renderer/list-renderer';
import type { ThemePreset } from '../core/interfaces';
import { t } from '../i18n';
import { setTrustedHtml } from '../utils/trusted-html';

export interface ListDecorationEditOptions {
	/** 目标列表类型（有序/无序/任务），决定预览示例。 */
	kind: 'ordered' | 'unordered' | 'task';
	/** Existing decoration, or null to create a new one. */
	decoration: ListDecoration | null;
	/** Current effective param values (theme overrides merged over defaults). */
	initialValues?: Record<string, string>;
	/** Built-in templates are read-only until copied. */
	builtinReadonly: boolean;
	/** Current theme preset for the live preview. */
	basePreset: ThemePreset;
	onSave: (decoration: ListDecoration) => void;
}

const PARAM_TYPES = ['color', 'number', 'px', 'text', 'select', 'image'] as const;

export class ListDecorationEditModal extends WeWriteModal {
	private options: ListDecorationEditOptions;
	private templateValue: string;
	private itemTemplateValue: string;
	private nameValue: string;
	private params: Record<string, DecorationParam> = {};
	private paramsListEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private previewTimer: number | null = null;

	constructor(app: App, options: ListDecorationEditOptions) {
		super(app);
		this.options = options;
		this.templateValue = options.decoration?.template || '';
		this.itemTemplateValue = options.decoration?.itemTemplate || '';
		this.nameValue = options.decoration?.name || '';
		if (options.decoration) {
			this.params = deepClone(options.decoration.params);
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
		contentEl.addClass('wewrite-list-deco-modal', 'wewrite-deco-edit-modal');

		const isBuiltin = this.options.builtinReadonly;
		const isNew = !this.options.decoration;
		this.titleEl.setText(isNew ? t('deco_edit.new_list_title') : `${t('deco_edit.edit_list_title')} — ${this.options.decoration!.name}`);

		// Name
		const nameWrap = contentEl.createDiv();
		nameWrap.createSpan({ text: t('deco_edit.name_label'), cls: 'setting-item-description' });
		const nameInput = nameWrap.createEl('input', { type: 'text', value: this.nameValue });
		nameInput.addClass('wewrite-deco-name-input');
		nameInput.disabled = isBuiltin;
		nameInput.addEventListener('input', () => {
			this.nameValue = nameInput.value;
		});

		// Templates
		const hint = contentEl.createEl('p', { text: t('deco_edit.list_placeholder_hint'), cls: 'setting-item-description' });
		hint.addClass('wewrite-deco-hint');

		const rootLabel = contentEl.createDiv({ text: t('deco_edit.root_template'), cls: 'setting-item-description' });
		rootLabel.addClass('wewrite-deco-field-label');
		const textarea = contentEl.createEl('textarea', { attr: { rows: '4', spellcheck: 'false' } });
		textarea.addClass('wewrite-deco-template');
		textarea.value = this.templateValue;
		textarea.disabled = isBuiltin;
		textarea.addEventListener('input', () => {
			this.templateValue = textarea.value;
			this.syncParamsFromTemplate();
			this.renderParamsList();
			this.schedulePreview();
		});

		const itemLabel = contentEl.createDiv({ text: t('deco_edit.item_template'), cls: 'setting-item-description' });
		itemLabel.addClass('wewrite-deco-field-label');
		const itemTextarea = contentEl.createEl('textarea', { attr: { rows: '4', spellcheck: 'false' } });
		itemTextarea.addClass('wewrite-deco-template');
		itemTextarea.value = this.itemTemplateValue;
		itemTextarea.disabled = isBuiltin;
		itemTextarea.addEventListener('input', () => {
			this.itemTemplateValue = itemTextarea.value;
			this.syncParamsFromTemplate();
			this.renderParamsList();
			this.schedulePreview();
		});

		// Params
		const paramsWrap = contentEl.createDiv();
		paramsWrap.addClass('wewrite-deco-params-wrap');
		paramsWrap.createEl('h4', { text: t('deco_edit.params_label') }).addClass('wewrite-deco-params-title');
		this.paramsListEl = paramsWrap.createDiv();
		this.renderParamsList();
		if (!isBuiltin) {
			const addBtn = paramsWrap.createEl('button', { text: t('deco_edit.add_param') });
			addBtn.addClass('wewrite-deco-add-param');
			addBtn.addEventListener('click', () => {
				const key = `param${Object.keys(this.params).length + 1}`;
				this.params[key] = { type: 'text', label: key, default: '' };
				this.renderParamsList();
			});
		}

		// Preview
		const previewTitle = contentEl.createEl('h4', { text: t('deco_edit.list_preview_title') });
		previewTitle.addClass('wewrite-deco-preview-title');
		this.previewEl = contentEl.createDiv();
		this.previewEl.addClass('wewrite-deco-preview', 'wewrite-deco-preview-tall');

		// Buttons
		const btnRow = contentEl.createDiv();
		btnRow.addClass('wewrite-deco-actions');
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
			row.addClass('wewrite-deco-param-row');

			const keyInput = row.createEl('input', { type: 'text', value: key });
			keyInput.addClass('wewrite-deco-param-key');
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
			typeSelect.addClass('wewrite-deco-param-type');
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
			labelInput.addClass('wewrite-deco-param-label');
			labelInput.disabled = isBuiltin;
			labelInput.addEventListener('input', () => {
				this.params[key] = { ...this.params[key], label: labelInput.value || key };
			});

			const defaultInput = row.createEl('input', { type: 'text', value: param.default, placeholder: t('deco_edit.param_default_ph') });
			defaultInput.addClass('wewrite-deco-param-default');
			defaultInput.disabled = isBuiltin;
			defaultInput.addEventListener('input', () => {
				this.params[key] = { ...this.params[key], default: defaultInput.value };
			});

			if (!isBuiltin) {
				const delBtn = row.createEl('button', { text: '✕' });
				delBtn.addClass('wewrite-deco-param-del');
				delBtn.addEventListener('click', () => {
					delete this.params[key];
					this.renderParamsList();
				});
			}
		}
	}

	/** Ensure every {{param}} referenced in the templates has a definition. */
	private syncParamsFromTemplate(): void {
		const both = `${this.templateValue}\n${this.itemTemplateValue}`;
		for (const m of both.matchAll(/\{\{([\w-]+)\}\}/g)) {
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
		const template = this.templateValue.trim()
			|| '<{tag} style="margin:8px 0;padding-left:25px">{items}</{tag}>';
		const itemTemplate = this.itemTemplateValue.trim()
			|| '<li style="margin:5px 0;line-height:1.8">{item}</li>';
		const params: Record<string, string> = {};
		for (const [k, v] of Object.entries(this.params)) {
			params[k] = v.default;
		}
		setTrustedHtml(this.previewEl, renderListPreview(this.options.basePreset, this.options.kind, template, itemTemplate, params));
	}

	private save(asCopy: boolean): void {
		const template = this.templateValue.trim();
		const itemTemplate = this.itemTemplateValue.trim();
		if (!template || !itemTemplate) {
			new Notice(t('deco_edit.list_templates_empty'));
			return;
		}
		this.syncParamsFromTemplate();

		const name = this.nameValue.trim() || t('deco_edit.default_name_list');
		const baseId = this.options.decoration?.id && !this.options.builtinReadonly && !asCopy
			? this.options.decoration.id
			: `custom_${Date.now().toString(36)}`;
		const decoration: ListDecoration = {
			id: baseId,
			name: asCopy ? `${name} 副本` : name,
			description: t('deco_edit.custom_desc'),
			builtin: false,
			template,
			itemTemplate,
			params: { ...this.params },
			family: 'plain',
		};
		this.options.onSave(decoration);
		this.close();
	}

	onClose(): void {
		if (this.previewTimer) window.clearTimeout(this.previewTimer);
	}
}
