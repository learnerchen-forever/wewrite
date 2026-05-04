/**
 * a dialog modal to confirm the delete action
 * 
*/

import { Modal } from 'obsidian';
import { $t } from 'src/lang/i18n';
import WeWritePlugin from 'src/main';
import { MaterialItem } from '../wechat-api/wechat-types';

export class ConfirmDeleteModal extends Modal {
    plugin: WeWritePlugin;
    item: MaterialItem;
    callback: (item: MaterialItem) => Promise<boolean | undefined>
    constructor(plugin: WeWritePlugin, item: MaterialItem, callback: (item: MaterialItem) => Promise<boolean | undefined>) {
        super(plugin.app);
        this.plugin = plugin;
        this.item = item
        this.callback = callback
    }

    update(item: MaterialItem, callback: (item: MaterialItem) => Promise<boolean | undefined>) {
        this.item = item
        this.callback = callback
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('confirm-pulbish-dialog-content')

        contentEl.createEl('h3', { text:$t('modals.delete.title')});
        const content = contentEl.createDiv({ cls: 'description' })
        content.createEl('p', { text: $t('modals.delete.message') });
        content.createEl('p', { text: $t('modals.caution') +' '+ $t('modals.delete.warning'), cls: 'warning' });
        content.createEl('p', { text: $t('modals.delete.action')});
        
        const toolbar = contentEl.createDiv({ cls: 'confirm-pulbish-dialog-tool-bar' })
        const confirmButton = toolbar.createEl('button', { 
            text: $t('modals.confirm'),
            cls: "danger-button"
        });
        const cancelButton = toolbar.createEl('button', { 
            text: $t('modals.cancel')
        });

        confirmButton.addEventListener('click', async () => {
            await this.delete();
            this.close();
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
    async delete() {
        if (this.callback) {
            await this.callback(this.item)
        }
    }
}