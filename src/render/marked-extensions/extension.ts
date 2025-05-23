/**
 * This is the base class for all marked extensions. which will handle different types of markdown blocks
 * 
 * meanwhile, provide some common methods for all extensions, will interact with obsidian and vault
 * 
 * 
 *
 
 * 
 * @category Extensions
 */

import { Marked, MarkedExtension } from "marked";
import WeWritePlugin from "src/main";

// type RenderBLock = 'space'| 'code'| 'blockquote'| 'html'| 'heading'| 'hr'| 'list'| 'listitem'| 'checkbox'| 'paragraph'| 'table'| 'tablerow'| 'tablecell'
// type RenderInline = 'strong'| 'em'| 'codespan'| 'br'| 'del'| 'link'| 'image'| 'text'
// type TokenizerBlock =  'space'| 'code'| 'fences'| 'heading'| 'hr'| 'blockquote'| 'list'| 'html'| 'def'| 'table'| 'lheading'| 'paragraph'| 'text'
// type TokenizerInline =  'escape'| 'tag'| 'link'| 'reflink'| 'emStrong'| 'codespan'| 'br'| 'del'| 'autolink'| 'url'| 'inlineText'

export interface PreviewRender {
    updateElementByID(id:string, html:string):void;
    addElementByID(id:string, node:HTMLElement | string):void;
    articleProperties: Map<string, string>;

}

export abstract class WeWriteMarkedExtension {
    plugin: WeWritePlugin
    previewRender: PreviewRender
    marked: Marked
    constructor(plugin: WeWritePlugin, previewRender: PreviewRender, marked:Marked) {
        this.plugin = plugin;
        this.previewRender = previewRender
        this.marked = marked
    }
    async prepare() { return; }
    async postprocess(html:string) { return html; }
    async beforePublish() { }
    async cleanup() { return; }
    abstract markedExtension(): MarkedExtension
	public isPluginInstlled(pluginId:string) {
		const plugins = this.plugin.app.plugins.plugins;
        return Object.prototype.hasOwnProperty.call(plugins, pluginId);
	}
}
