// icon-registry.ts — Register WeWrite custom SVG icons with Obsidian's addIcon().
//
// All icons follow the WeWrite design spec confirmed by the user:
//   24 grid · 2px round-cap stroke · currentColor · no fill · no accent badge.
// The SVG sources live in src/resources/icons/ (bundled as text by esbuild,
// loader: { '.svg': 'text' }). Icon ids are the file names without the
// extension, e.g. 'wewrite-news' — usable directly in setIcon()/getIcon().

import { addIcon } from 'obsidian';

import wewriteAccount from '../resources/icons/wewrite-account.svg';
import wewriteAiGenerate from '../resources/icons/wewrite-ai-generate.svg';
import wewriteCancel from '../resources/icons/wewrite-cancel.svg';
import wewriteCode from '../resources/icons/wewrite-code.svg';
import wewriteCompose from '../resources/icons/wewrite-compose.svg';
import wewriteCopy from '../resources/icons/wewrite-copy.svg';
import wewriteCover from '../resources/icons/wewrite-cover.svg';
import wewriteCrop from '../resources/icons/wewrite-crop.svg';
import wewriteDevice from '../resources/icons/wewrite-device.svg';
import wewriteDigest from '../resources/icons/wewrite-digest.svg';
import wewriteDraft from '../resources/icons/wewrite-draft.svg';
import wewriteGallery from '../resources/icons/wewrite-gallery.svg';
import wewriteLink from '../resources/icons/wewrite-link.svg';
import wewriteMath from '../resources/icons/wewrite-math.svg';
import wewriteMaterial from '../resources/icons/wewrite-material.svg';
import wewriteMultiselect from '../resources/icons/wewrite-multiselect.svg';
import wewriteNewTheme from '../resources/icons/wewrite-new-theme.svg';
import wewriteNews from '../resources/icons/wewrite-news.svg';
import wewriteNewspic from '../resources/icons/wewrite-newspic.svg';
import wewritePanel from '../resources/icons/wewrite-panel.svg';
import wewriteProofread from '../resources/icons/wewrite-proofread.svg';
import wewritePublish from '../resources/icons/wewrite-publish.svg';
import wewriteRedo from '../resources/icons/wewrite-redo.svg';
import wewriteRefresh from '../resources/icons/wewrite-refresh.svg';
import wewriteSave from '../resources/icons/wewrite-save.svg';
import wewriteSelectAll from '../resources/icons/wewrite-select-all.svg';
import wewriteSettings from '../resources/icons/wewrite-settings.svg';
import wewriteSync from '../resources/icons/wewrite-sync.svg';
import wewriteSynonyms from '../resources/icons/wewrite-synonyms.svg';
import wewriteTheme from '../resources/icons/wewrite-theme.svg';
import wewriteTranslate from '../resources/icons/wewrite-translate.svg';
import wewriteTrash from '../resources/icons/wewrite-trash.svg';
import wewriteUndo from '../resources/icons/wewrite-undo.svg';
import wewriteZoom from '../resources/icons/wewrite-zoom.svg';

const WEWRITE_ICONS: Record<string, string> = {
	'wewrite-account': wewriteAccount,
	'wewrite-ai-generate': wewriteAiGenerate,
	'wewrite-cancel': wewriteCancel,
	'wewrite-code': wewriteCode,
	'wewrite-compose': wewriteCompose,
	'wewrite-copy': wewriteCopy,
	'wewrite-cover': wewriteCover,
	'wewrite-crop': wewriteCrop,
	'wewrite-device': wewriteDevice,
	'wewrite-digest': wewriteDigest,
	'wewrite-draft': wewriteDraft,
	'wewrite-gallery': wewriteGallery,
	'wewrite-link': wewriteLink,
	'wewrite-math': wewriteMath,
	'wewrite-material': wewriteMaterial,
	'wewrite-multiselect': wewriteMultiselect,
	'wewrite-new-theme': wewriteNewTheme,
	'wewrite-news': wewriteNews,
	'wewrite-newspic': wewriteNewspic,
	'wewrite-panel': wewritePanel,
	'wewrite-proofread': wewriteProofread,
	'wewrite-publish': wewritePublish,
	'wewrite-redo': wewriteRedo,
	'wewrite-refresh': wewriteRefresh,
	'wewrite-save': wewriteSave,
	'wewrite-select-all': wewriteSelectAll,
	'wewrite-settings': wewriteSettings,
	'wewrite-sync': wewriteSync,
	'wewrite-synonyms': wewriteSynonyms,
	'wewrite-theme': wewriteTheme,
	'wewrite-translate': wewriteTranslate,
	'wewrite-trash': wewriteTrash,
	'wewrite-undo': wewriteUndo,
	'wewrite-zoom': wewriteZoom,
};

/** Register all WeWrite custom icons. Call once during plugin onload(). */
export function registerWewriteIcons(): void {
	for (const [id, svg] of Object.entries(WEWRITE_ICONS)) {
		addIcon(id, svg);
	}
}
