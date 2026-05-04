/** view template for different types of material */
import { ButtonComponent, ItemView, WorkspaceLeaf } from "obsidian";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { WeChatMPAccountSwitcher } from "src/settings/account-switcher";
import { MaterialPanel } from "./material-panel";

export const VIEW_TYPE_MP_MATERIAL = "mp-material";

export const MediaTypeIcon = new Map([
  ['image', 'image'],
  ['voice', 'file-audio'],
  ['video', 'film'],
  ['news', 'newspaper'],
  ['draft', 'text-select']
]);

export const MediaTypeNames = new Map([
  ['image', $t('views.material-view.image')],
  ['voice', $t('views.material-view.voice')],
  ['video', $t('views.material-view.video')],
  ['news', $t('views.material-view.news')],
  ['draft', $t('views.material-view.draft')]
]);

export class MaterialView extends ItemView {
  private readonly plugin: WeWritePlugin;
  constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_MP_MATERIAL;
  }

  getDisplayText() {
    return $t('views.materials.wechat-materials')
  }

  getIcon() {
    return "package";
  }

  async onOpen() {
    this.redraw();
    if (this.plugin.settings!.selectedMPAccount !== undefined) {
      this.plugin.assetsManager!.loadMaterial(this.plugin.settings!.selectedMPAccount)
    }
  }

  async onClose() { }

  public readonly redraw = (): void => {
    const rootEl = createDiv({ cls: 'nav-folder mod-root' });
    const accountEl = new WeChatMPAccountSwitcher(this.plugin, rootEl)
    accountEl.setName($t('views.materials.account-prefix'))

    // Create tab container
    const tabContainer = rootEl.createDiv({ cls: 'wewrite-material-view-tabs' });
    const tabHeader = tabContainer.createDiv({ cls: 'wewrite-material-view-tab-header' });
    const tabContent = tabContainer.createDiv({ cls: 'wewrite-material-view-tab-content' });

    // Get material panels from plugin and sort newest first
    const panels = this.plugin.assetsManager!.getMaterialPanels()
      .map(material => new MaterialPanel(
        this.plugin,
        tabContent,
        MediaTypeNames.get(material.type) ?? material.name,
        material.type
      ))

    // Create tabs
    panels.forEach(panel => {
      new ButtonComponent(tabHeader)
        .setIcon(MediaTypeIcon.get(panel.type) ?? 'package')
        .setTooltip(panel.name)
        .onClick(() => {
          panels.forEach(p => p.containerEl.toggle(p === panel));
        })
        .setClass("wewrite-material-view-tab");
    });

    panels.forEach(panel => {
      panel.containerEl.hide();
    });
    // Show first panel by default
    panels[0].containerEl.show();

    this.contentEl.setChildrenInPlace([rootEl]);
    this.contentEl.setCssProps({
      'padding': '0',
      'margin': '0',
    });

    new ButtonComponent(tabHeader)
      .setIcon('school')
      .setTooltip($t('views.materials.open-mp-page'))
      .setClass("wewrite-material-view-tab")
      .onClick(() => {
        window.open('https://mp.weixin.qq.com/', '_blank');
      })
  };
}
