/**
 * MarkdownRender of obsidian. 
 * credits to author of export as image plugin
*/

import { App, Component, MarkdownRenderChild, MarkdownRenderer, MarkdownView } from "obsidian";
import domtoimage from './dom-to-image-more';
async function delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
export class ObsidianMarkdownRenderer {
    private static instance: ObsidianMarkdownRenderer;
    private path: string
    private el: HTMLElement
    private rendering: boolean = false
    private container: HTMLElement
    private view: Component
    mdv: MarkdownRenderChild;
    el1: HTMLDivElement;
    private constructor(private app: App) {
        this.app = app;
    }

    public static getInstance(app: App,) {
        if (!ObsidianMarkdownRenderer.instance) {
            ObsidianMarkdownRenderer.instance = new ObsidianMarkdownRenderer(app);
        }
        return ObsidianMarkdownRenderer.instance;
    }
    public async render(path: string, container: HTMLElement, view: Component) {
        if (path === undefined || !path || !path.toLowerCase().endsWith('.md')) {
            return;
        }
        this.container = container
        this.container.addClass('wewrite-markdown-render-container')
        this.view = view
        this.path = path

        if (this.el !== undefined && this.el) {
            this.el.remove()
        }
        this.rendering = true
        await this.loadComponents(view)
        this.el = createDiv()
        this.el1 = this.el.createDiv()
        this.mdv = new MarkdownRenderChild(this.el)
        this.path = path
        const markdown = await this.app.vault.adapter.read(path)
        await MarkdownRenderer.render(this.app, markdown, this.el1, path, this.app.workspace.getActiveViewOfType(MarkdownView)!
            || this.app.workspace.activeLeaf?.view
            || new MarkdownRenderChild(this.el)
        )

        this.container.appendChild(this.el)
        await delay(100);
        this.rendering = false
    }
    public queryElement(index: number, query: string) {
        if (this.el === undefined || !this.el) {
            return null
        }
        if (this.rendering) {
            return null
        }
        const nodes = this.el.querySelectorAll<HTMLElement>(query)
        if (nodes.length < index) {
            return null
        }
        return nodes[index]
    }
   
    public async domToImage(element: HTMLElement, p:any={}): Promise<string> {
        return await domtoimage.toPng(element, p)
    }

    private async loadComponents(view: Component) {
        type InternalComponent = Component & {
            _children: Component[];
            onload: () => void | Promise<void>;
        }

        const internalView = view as InternalComponent;

        // recursively call onload() on all children, depth-first
        const loadChildren = async (
            component: Component,
            visited: Set<Component> = new Set()
        ): Promise<void> => {
            if (visited.has(component)) {
                return;  // Skip if already visited
            }

            visited.add(component);

            const internalComponent = component as InternalComponent;

            if (internalComponent._children?.length) {
                for (const child of internalComponent._children) {
                    await loadChildren(child, visited);
                }
            }
            try {
                // relies on the Sheet plugin (advanced-table-xt) not to be minified
                if (component?.constructor?.name === 'SheetElement') {
                    await component.onload();
                }
            } catch (error) {
                console.error(`Error calling onload()`, error);
            }
        };
        await loadChildren(internalView);
    }
}
