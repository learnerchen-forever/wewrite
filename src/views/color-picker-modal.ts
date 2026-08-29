// color-picker-modal.ts — one color editor for every platform.
//
// The native <input type="color"> dialog renders very differently across
// platforms (full editor on desktop, a minimal two-step dialog on Android, a
// compact system picker on iOS), so the theme editor opens this custom modal
// instead. It offers the PC-style editing model on every device:
//   - a saturation/value square + hue slider ("色轮" selection);
//   - RGB / HSL / HEX input modes, switched by tabs;
//   - a live preview chip + hex readout.
// The choice is applied on 确定 only; 取消 discards it.

import { App } from 'obsidian';
import { WeWriteModal } from '../utils/modal-drag';
import { hexToRgb, hslToHex, type HSL } from '../core/palette-engine';
import { t } from '../i18n';

export interface ColorPickerOptions {
	/** Initial color (any #rgb / #rrggbb; normalized on open). */
	initial: string;
	/** Optional dialog title; defaults to a localized "Pick a color". */
	title?: string;
	/** Fired once with the chosen #rrggbb when the user confirms. */
	onCommit: (hex: string) => void;
}

/** HSV model (h 0-360, s/v 0-100) — the square is S(x) × V(y), hue on the bar. */
interface HSV {
	h: number;
	s: number;
	v: number;
}

type ColorMode = 'rgb' | 'hsl' | 'hex';

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function normalizeHex(value: string): string {
	const m = value.trim().toLowerCase().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
	if (!m) return '';
	const hex = m[1];
	return '#' + (hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex);
}

function rgbToHsv(r: number, g: number, b: number): HSV {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		switch (max) {
			case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
			case gn: h = ((bn - rn) / d + 2) / 6; break;
			default: h = ((rn - gn) / d + 4) / 6; break;
		}
	}
	return {
		h: Math.round(h * 360),
		s: max === 0 ? 0 : Math.round((d / max) * 100),
		v: Math.round(max * 100),
	};
}

function hsvToHsl(hsv: HSV): HSL {
	const s = hsv.s / 100;
	const v = hsv.v / 100;
	const l = (v * (2 - s)) / 2;
	const hslS = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
	return { h: hsv.h, s: Math.round(hslS * 100), l: Math.round(l * 100) };
}

function hslToHsv(hsl: HSL): HSV {
	const s = hsl.s / 100;
	const l = hsl.l / 100;
	const v = l + s * Math.min(l, 1 - l);
	const hsvS = v === 0 ? 0 : 2 * (1 - l / v);
	return { h: hsl.h, s: Math.round(hsvS * 100), v: Math.round(v * 100) };
}

function hsvToHex(hsv: HSV): string {
	return hslToHex(hsvToHsl(hsv));
}



export class ColorPickerModal extends WeWriteModal {
	private readonly opts: ColorPickerOptions;
	private hsv: HSV;
	private dragging: 'sv' | 'hue' | null = null;
	private svWrap!: HTMLElement;
	private svDot!: HTMLElement;
	private hueBar!: HTMLElement;
	private hueDot!: HTMLElement;
	private preview!: HTMLElement;
	private hexReadout!: HTMLElement;
	private fieldsEl!: HTMLElement;
	private modeBtns: Record<ColorMode, HTMLButtonElement> | null = null;
	private rgbInputs: HTMLInputElement[] = [];
	private hslInputs: HTMLInputElement[] = [];
	private hexInput!: HTMLInputElement;

	constructor(app: App, opts: ColorPickerOptions) {
		super(app);
		this.opts = opts;
		const hex = normalizeHex(opts.initial) || '#000000';
		const { r, g, b } = hexToRgb(hex);
		this.hsv = rgbToHsv(r, g, b);
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.title || t('color_picker.title'));
		this.modalEl.addClass('wewrite-cp-modal');
		const c = this.contentEl;
		c.empty();
		c.addClass('wewrite-cp');

		const body = c.createDiv({ cls: 'wewrite-cp-body' });

		// Left: SV square + hue bar
		const left = body.createDiv({ cls: 'wewrite-cp-left' });
		this.svWrap = left.createDiv({ cls: 'wewrite-cp-svwrap' });
		this.svDot = this.svWrap.createDiv({ cls: 'wewrite-cp-svdot' });
		this.hueBar = left.createDiv({ cls: 'wewrite-cp-huewrap' });
		this.hueDot = this.hueBar.createDiv({ cls: 'wewrite-cp-huedot' });

		// Right: preview + hex readout, mode tabs, input fields
		const right = body.createDiv({ cls: 'wewrite-cp-right' });
		const previewRow = right.createDiv({ cls: 'wewrite-cp-previewrow' });
		this.preview = previewRow.createDiv({ cls: 'wewrite-cp-preview' });
		this.hexReadout = previewRow.createSpan({ cls: 'wewrite-cp-hexreadout' });

		const modes = right.createDiv({ cls: 'wewrite-cp-modes' });
		this.modeBtns = {
			rgb: this.buildModeBtn(modes, 'rgb'),
			hsl: this.buildModeBtn(modes, 'hsl'),
			hex: this.buildModeBtn(modes, 'hex'),
		};

		// Input fields (one group per mode, toggled by the tabs)
		this.fieldsEl = right.createDiv({ cls: 'wewrite-cp-fields' });
		this.buildRgbFields();
		this.buildHslFields();
		this.buildHexField();

		// Footer
		const footer = c.createDiv({ cls: 'wewrite-cp-footer' });
		const cancelBtn = footer.createEl('button', { text: t('misc.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
		const confirmBtn = footer.createEl('button', { text: t('misc.ok'), cls: 'mod-cta' });
		confirmBtn.addEventListener('click', () => {
			this.opts.onCommit(hsvToHex(this.hsv));
			this.close();
		});

		this.bindDrag(this.svWrap, 'sv');
		this.bindDrag(this.hueBar, 'hue');
		this.setMode('rgb');
		this.refresh();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private buildModeBtn(container: HTMLElement, mode: ColorMode): HTMLButtonElement {
		const btn = container.createEl('button', { text: t(`color_picker.mode_${mode}`), cls: 'wewrite-cp-modebtn' });
		btn.addEventListener('click', () => this.setMode(mode));
		return btn;
	}

	private setMode(mode: ColorMode): void {
		if (this.modeBtns) {
			for (const [key, btn] of Object.entries(this.modeBtns)) {
				btn.classList.toggle('wewrite-cp-modebtn-active', key === mode);
			}
		}
		this.fieldsEl.querySelectorAll<HTMLElement>('.wewrite-cp-fields-group').forEach((el) => {
			el.style.display = el.getAttribute('data-mode') === mode ? '' : 'none';
		});
	}

	private buildRgbFields(): void {
		const group = this.fieldsEl.createDiv({ cls: 'wewrite-cp-fields-group' });
		group.setAttribute('data-mode', 'rgb');
		const labels = [t('color_picker.red'), t('color_picker.green'), t('color_picker.blue')];
		for (const label of labels) {
			const row = group.createDiv({ cls: 'wewrite-cp-field' });
			row.createEl('label', { text: label });
			const input = row.createEl('input', { type: 'number' });
			input.min = '0';
			input.max = '255';
			input.step = '1';
			this.rgbInputs.push(input);
			input.addEventListener('change', () => {
				const values = this.rgbInputs.map((el) => clamp(Math.round(Number(el.value) || 0), 0, 255));
				this.hsv = rgbToHsv(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0);
				this.refresh();
			});
		}
	}

	private buildHslFields(): void {
		const group = this.fieldsEl.createDiv({ cls: 'wewrite-cp-fields-group' });
		group.setAttribute('data-mode', 'hsl');
		const defs: Array<[string, number]> = [
			[t('color_picker.hue'), 360],
			[t('color_picker.saturation'), 100],
			[t('color_picker.lightness'), 100],
		];
		for (const [label, max] of defs) {
			const row = group.createDiv({ cls: 'wewrite-cp-field' });
			row.createEl('label', { text: label });
			const input = row.createEl('input', { type: 'number' });
			input.min = '0';
			input.max = String(max);
			input.step = '1';
			this.hslInputs.push(input);
			input.addEventListener('change', () => {
				const values = this.hslInputs.map((el) => clamp(Math.round(Number(el.value) || 0), 0, 360));
				this.hsv = hslToHsv({
					h: values[0] ?? 0,
					s: Math.min(values[1] ?? 0, 100),
					l: Math.min(values[2] ?? 0, 100),
				});
				this.refresh();
			});
		}
	}

	private buildHexField(): void {
		const group = this.fieldsEl.createDiv({ cls: 'wewrite-cp-fields-group' });
		group.setAttribute('data-mode', 'hex');
		const row = group.createDiv({ cls: 'wewrite-cp-field' });
		row.createEl('label', { text: t('color_picker.hex') });
		this.hexInput = row.createEl('input', { type: 'text', placeholder: '#RRGGBB' });
		this.hexInput.addEventListener('change', () => {
			const hex = normalizeHex(this.hexInput.value);
			if (!hex) return;
			const { r, g, b } = hexToRgb(hex);
			this.hsv = rgbToHsv(r, g, b);
			this.refresh();
		});
		this.hexInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.hexInput.dispatchEvent(new Event('change'));
				this.hexInput.blur();
			}
		});
	}

	private bindDrag(el: HTMLElement, kind: 'sv' | 'hue'): void {
		el.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			this.dragging = kind;
			el.setPointerCapture(e.pointerId);
			this.updateFromPointer(kind, e);
		});
		el.addEventListener('pointermove', (e) => {
			if (this.dragging === kind) this.updateFromPointer(kind, e);
		});
		const end = (): void => {
			if (this.dragging === kind) this.dragging = null;
		};
		el.addEventListener('pointerup', end);
		el.addEventListener('pointercancel', end);
	}

	private updateFromPointer(kind: 'sv' | 'hue', e: PointerEvent): void {
		if (kind === 'sv') {
			const rect = this.svWrap.getBoundingClientRect();
			const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
			const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
			this.hsv = { h: this.hsv.h, s: Math.round(x * 100), v: Math.round((1 - y) * 100) };
		} else {
			const rect = this.hueBar.getBoundingClientRect();
			const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
			this.hsv = { h: Math.round(y * 360), s: this.hsv.s, v: this.hsv.v };
		}
		this.refresh();
	}

	private refresh(): void {
		const hex = hsvToHex(this.hsv);
		this.svWrap.style.background =
			`linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${this.hsv.h}, 100%, 50%))`;
		this.svDot.style.left = `${this.hsv.s}%`;
		this.svDot.style.top = `${100 - this.hsv.v}%`;
		this.hueDot.style.top = `${(this.hsv.h / 360) * 100}%`;
		this.preview.style.background = hex;
		this.hexReadout.setText(hex.toUpperCase());

		const { r, g, b } = hexToRgb(hex);
		const rgbVals = [r, g, b];
		this.rgbInputs.forEach((el, i) => {
			const v = String(rgbVals[i] ?? 0);
			if (el.value !== v) el.value = v;
		});
		const hsl = hsvToHsl(this.hsv);
		const hslVals = [hsl.h, hsl.s, hsl.l];
		this.hslInputs.forEach((el, i) => {
			const v = String(hslVals[i] ?? 0);
			if (el.value !== v) el.value = v;
		});
		if (this.hexInput && this.hexInput.value.toLowerCase() !== hex) {
			this.hexInput.value = hex;
		}
	}
}
