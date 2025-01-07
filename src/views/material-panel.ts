/**
 * the panel to show wechat materials
 */
import { Menu, Notice, setIcon } from "obsidian";
import WeWritePlugin from "src/main";
import { MaterialMeidaItem, MediaType } from "src/wechat-api/wechat-types";

interface REROUCE_ITEM {
  item:MaterialMeidaItem;
  el:HTMLElement;
}

export class MaterialPanel {
  public name: string;
  public containerEl: HTMLElement;
  public timestamp: number;
  private container: HTMLElement;
  private header: HTMLElement;
  private content: HTMLElement;
  private titleSpan: HTMLSpanElement;
  private totalSpan: HTMLSpanElement;
  // private toggleButton: HTMLElement;
  private refreshButton: HTMLElement;
  private _plugin: WeWritePlugin;
  public type: MediaType;
  private items: REROUCE_ITEM[] = [];

  constructor(plugin: WeWritePlugin, parent: HTMLElement, title: string, type: MediaType) {
    this._plugin = plugin;
    this.type = type;
    this.name = title;
    this.container = parent.createDiv({ cls: 'wewrite-material-panel-container' });
    this.containerEl = this.container;
    this.header = parent.createDiv({ cls: 'wewrite-material-panel-header' });
    this.refreshButton = this.header.createEl('i', { cls: 'refresh-material-button' });
    this.titleSpan = this.header.createSpan({ cls: 'wewrite-material-panel-title' });
    this.totalSpan = this.header.createSpan({ cls: 'wewrite-material-panel-total' });

    this.content = parent.createDiv({ cls: 'wewrite-material-panel-content' });
    // this.toggleButton = parent.createEl<'i'>('i', { cls: 'toggle-icon chevron-right ' });
    // setIcon(this.toggleButton, 'chevron-right')
    setIcon(this.refreshButton, 'folder-sync')


    this.titleSpan.textContent = title;
    this.totalSpan.textContent = '0';
    this.content.innerHTML = 'content';

    // this.header.appendChild(this.toggleButton);
    this.container.appendChild(this.header);
    this.container.appendChild(this.content);

    // this.toggleButton.addEventListener('click', () => this.toggleContent());
    this.refreshButton.addEventListener('click', () => this.refreshContent());
    this.initContent()
    
    this._plugin.messageService.registerListener(`clear-${this.type}-list`, ()=>{
      this.clearContent()
    })
    this._plugin.messageService.registerListener(`${this.type}-item-updated`, (item)=>{
      this.addItem(item)
    })
    this._plugin.messageService.registerListener(`${this.type}-item-deleted`, (item)=>{
      this.removeItem(item)
    })
    if (this.type === 'image'){
      this._plugin.messageService.registerListener(`image-used-updated`, (item)=>{
        this.updateItemUsed(item)
      })
    }
  }
  async refreshContent(): Promise<any> {
    this.content.innerHTML = '';
    this.items = []
    this.setTotal(0);

    if (this.type === 'draft') {

      return await this._plugin.assetsManager.getAllDrafts((item) => {
          this.addItem(item)
      }, this._plugin.settings.selectedAccount)
    }
    await this._plugin.assetsManager.getAllMaterialOfType(this.type, (item) => {
        this.addItem(item)
    }, this._plugin.settings.selectedAccount)
    //TODO: enable after all content 

  }
  showContextMenu(img: MaterialMeidaItem, event: MouseEvent) {
    const menu = new Menu();
    
    //if the item type is image/voice/video && it has not been used by any news or draft.
    menu.addItem((item) => {
        item.setTitle('delete image')
            .setIcon('eye')
            .setDisabled(img.used)
            .onClick(() => {
                new Notice(`删除图片: ${img.name}`);
            });
    });

    //if it is a image
    menu.addItem((item) => {
        item.setTitle('set as cover of current draft')
            .setIcon('image-plus')
            .onClick(() => {
                
            });
    });

    //if it is a draft
    menu.addItem((item) => {
        item.setTitle('Delete draft')
            .setIcon('delete')
            .onClick(async () => {
                console.log('to delete draft:', item)
            });
    });
    
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  // private toggleContent() {
  //   if (this.content.style.display === 'none') {
  //     this.content.style.display = 'block';
  //     setIcon(this.toggleButton, 'chevron-up')
  //   } else {
  //     this.content.style.display = 'none';
  //     setIcon(this.toggleButton, 'chevron-right')
  //   }
  // }

  public getElement(): HTMLElement {
    return this.container;
  }
  setTotal(total: number) {
    this.totalSpan.textContent = `[${total.toString()}]`;
  }
  setTitle(title: string) {
    this.titleSpan.textContent = title;
  }
  updateItems(items: []) {

  }
  clearContent(){
    this.items = [];
    this.content.innerHTML = '';
    this.setTotal(0);
    
  }
  addItem(item: any){
    const itemDiv = this.content.createDiv({ cls: 'wewrite-material-panel-item' });
    itemDiv.style.cursor = 'pointer';
    // Insert new items at the top
    // this.items.unshift({item:item, el:itemDiv});

    // if (this.content.firstChild) {
    //   this.content.insertBefore(itemDiv, this.content.firstChild);
    // } else {
    //   this.content.appendChild(itemDiv);
    // }
        // Insert new items at the top
    this.items.push({item:item, el:itemDiv});
    this.content.appendChild(itemDiv);
    

    if (this.type === 'draft' || this.type === 'news') {
        itemDiv.innerHTML = `<a href=${item.content.news_item[0].url}> ${item.content.news_item[0].title}</a>`
        itemDiv.addEventListener('click', () => { })
    }else if (this.type === 'image') {
        itemDiv.innerHTML = '<img src="' + item.url + '" alt="' + item.name + '" />'
        itemDiv.addEventListener('click', () => {
          //TODO 
        })
      }else{
        console.error(`other type has not been implemented.`);
        
      }
      this.setTotal(this.items.length)

      itemDiv.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.showContextMenu(item, event)
      })
  }
  updateItemUsed(item:any){
    const old_item = this.items.find((i)=>{
      return i.item.media_id === item.media_id
    })
    if (old_item !== undefined && old_item !== null) {
      old_item.item.used = item.used
    }else{
      this.addItem(item)
    }
  }
  removeItem(item: any) {
    const index = this.items.findIndex((i)=>{
      i.item.media_id === item.media_id
    })
    if (index !== -1) {
      this.items[index].el.parentElement?.removeChild(this.items[index].el) 
      this.items.splice(index, 1)
    }
    this.setTotal(this.items.length)
  }
  async initContent(): Promise<any> {
    this.content.innerHTML = '';
    this.setTotal(0);
    let total = 0;
    this.content.style.display = 'block';
    // setIcon(this.toggleButton, 'chevron-up')

    const items = this._plugin.assetsManager.assets.get(this.type)
    if (items === undefined || items === null) {
      return;
    }
    items.forEach((item: any) => {
      this.addItem(item)
    })
  }
}
