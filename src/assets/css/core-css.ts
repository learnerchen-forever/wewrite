export const CORE_CSS = `
.wewrite-article-content {
    font-size: var(--font-size, 16px);
    line-height: var(--line-height, 1.5);
    font-family: var(--font-family, "Inter var", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");
    background-color: var(--background-primary, white);
    color: var(--text-color, black);
    word-break: break-word;
}

.wewrite-article-content h1 {
    color: var(--h1-color, black);
    font-size: var(--h1-font-size, 2.5rem);
    font-weight: var(--h1-font-weight, 700);
    margin: var(--h1-margin, 1.5rem 0 1rem);
    font-family: var(--h1-font-family, inherit);
}

.wewrite-article-content h2 {
    color: var(--h2-color, black);
    font-size: var(--h2-font-size, 1.5rem);
    font-weight: var(--h2-font-weight, 600);
    margin: var(--h2-margin, 1.5rem 0 1rem);
    font-family: var(--h2-font-family, inherit);
}

.wewrite-article-content h3 {
    color: var(--h3-color, black);
    font-size: var(--h3-font-size, 1.25rem);
    font-weight: var(--h3-font-weight, 500);
    margin: var(--h3-margin, 1.5rem 0 1rem);
    font-family: var(--h3-font-family, inherit);
}

.wewrite-article-content h4 {
    color: var(--h4-color, black);
    font-size: var(--h4-font-size, 1.1rem);
    font-weight: var(--h4-font-weight, 400);
    margin: var(--h4-margin, 1.5rem 0 1rem);
    font-family: var(--h4-font-family, inherit);
}

.wewrite-article-content h5 {
    color: var(--h5-color, black);
    font-size: var(--h5-font-size, 1.05rem);
    font-weight: var(--h5-font-weight, 300);
    margin: var(--h5-margin, 1.5rem 0 1rem);
    font-family: var(--h5-font-family, inherit);
}

.wewrite-article-content h6 {
    color: var(--h6-color, black);
    font-size: var(--h6-font-size, 1rem);
    font-weight: var(--h6-font-weight, 200);
    margin: var(--h6-margin, 1.5rem 0 1rem);
    font-family: var(--h6-font-family, inherit);
}

.wewrite-article-content .admonition {
    margin-top: var(--admonition-margin-top);
    margin-bottom: var(--admonition-margin-bottom);
    box-shadow: 0 0.2rem 0.5rem var(--background-modifier-box-shadow);

    &.no-title {
        .admonition-content {
            margin-top: 0;
            margin-bottom: 0;
        }
    }

    li {
        &.task-list-item {
            &.is-checked {
                p {
                    text-decoration: line-through;
                }
            }
        }
    }

    &.no-drop {
        box-shadow: none;

        &>.admonition-title {
            &.no-title {
                &+.admonition-content {
                    margin-top: 0;
                    margin-bottom: 0;
                }
            }
        }

        .admonition {
            .admonition-content {
                border-right: 0.0625rem solid rgba(var(--admonition-color), 0.2);
                border-bottom: 0.0625rem solid rgba(var(--admonition-color), 0.2);
            }

            .admonition-title {
                &.no-title {
                    &+.admonition-content {
                        border-top: 0.0625rem solid rgba(var(--admonition-color), 0.2);
                        margin-top: 0;
                        margin-bottom: 0;
                    }
                }
            }
        }
    }
}

.wewrite-article-content {
    .callout {
        --callout-color: var(--callout-default);
        --callout-icon: lucide-pencil;
    }

    .callout[data-callout="abstract"],
    .callout[data-callout="summary"],
    .callout[data-callout="tldr"] {
        --callout-color: var(--callout-summary);
        --callout-icon: lucide-clipboard-list;
    }

    .callout[data-callout="info"] {
        --callout-color: var(--callout-info);
        --callout-icon: lucide-info;
    }

    .callout[data-callout="todo"] {
        --callout-color: var(--callout-todo);
        --callout-icon: lucide-check-circle-2;
    }

    .callout[data-callout="important"] {
        --callout-color: var(--callout-important);
        --callout-icon: lucide-flame;
    }

    .callout[data-callout="tip"],
    .callout[data-callout="hint"] {
        --callout-color: var(--callout-tip);
        --callout-icon: lucide-flame;
    }

    .callout[data-callout="success"],
    .callout[data-callout="check"],
    .callout[data-callout="done"] {
        --callout-color: var(--callout-success);
        --callout-icon: lucide-check;
    }

    .callout[data-callout="question"],
    .callout[data-callout="help"],
    .callout[data-callout="faq"] {
        --callout-color: var(--callout-question);
        --callout-icon: help-circle;
    }

    .callout[data-callout="warning"],
    .callout[data-callout="caution"],
    .callout[data-callout="attention"] {
        --callout-color: var(--callout-warning);
        --callout-icon: lucide-alert-triangle;
    }

    .callout[data-callout="failure"],
    .callout[data-callout="fail"],
    .callout[data-callout="missing"] {
        --callout-color: var(--callout-fail);
        --callout-icon: lucide-x;
    }

    .callout[data-callout="danger"],
    .callout[data-callout="error"] {
        --callout-color: var(--callout-error);
        --callout-icon: lucide-zap;
    }

    .callout[data-callout="bug"] {
        --callout-color: var(--callout-bug);
        --callout-icon: lucide-bug;
    }

    .callout[data-callout="example"] {
        --callout-color: var(--callout-example);
        --callout-icon: lucide-list;
    }

    .callout[data-callout="quote"],
    .callout[data-callout="cite"] {
        --callout-color: var(--callout-quote);
        --callout-icon: quote-glyph;
    }

    .callout {
        overflow: hidden;
        border-style: solid;
        border-color: rgba(var(--callout-color), var(--callout-border-opacity));
        border-width: var(--callout-border-width);
        border-radius: var(--callout-radius);
        margin: 1em 0;
        mix-blend-mode: var(--callout-blend-mode);
        background-color: rgba(var(--callout-color), 0.1);
        padding: var(--callout-padding);
    }

    .callout.is-collapsible .callout-title {
        cursor: var(--cursor);
    }

    .callout-title {
        padding: var(--callout-title-padding);
        display: flex;
        gap: var(--size-4-1);
        font-size: var(--callout-title-size);
        color: rgb(var(--callout-color));
        line-height: var(--line-height-tight);
        align-items: flex-start;
    }

    .callout-content {
        overflow-x: auto;
        padding: var(--callout-content-padding);
        background-color: var(--callout-content-background);
    }

    .callout-content .callout {
        margin-top: 20px;
    }

    .callout-icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
    }

    .callout-icon .svg-icon {
        color: rgb(var(--callout-color));
    }

    .callout-icon::after {
        content: "\\200B";
    }

    .callout-title-inner {
        --font-weight: var(--callout-title-weight);
        font-weight: var(--font-weight);
        color: var(--callout-title-color);
    }

    .callout-fold {
        display: flex;
        align-items: center;
        padding-inline-end: var(--size-4-2);
    }

    .callout-fold::after {
        content: "\\200B";
    }

    .callout-fold .svg-icon {
        transition: transform 100ms ease-in-out;
    }

    .callout-fold.is-collapsed .svg-icon {
        transform: rotate(calc(var(--direction) * -1 * 90deg));
    }

    .markdown-source-view.mod-cm6 .callout {
        margin: 0;
    }

    .markdown-source-view.mod-cm6 .callout-content .callout {
        margin: 1em 0;
    }

}

.wewrite-article-content {
    .svg-inline--fa {
        display: inline-block;
        font-size: inherit;
        height: 1em;
        overflow: visible;
        vertical-align: -0.125em;
    }

    .fa-w-14 {
        width: 0.875em;
    }
    .obsidian-icon {
        display: inline-block;
        width: 1.75em;
    }
}

/* Tables */
.wewrite-article-content table {
    margin-block-start: var(--p-spacing);
    margin-block-end: var(--p-spacing);
}

.wewrite-article-content table {
    border-collapse: collapse;
    line-height: var(--table-line-height);
}

.wewrite-article-content td,

.wewrite-article-content th {
    padding: var(--size-2-2) var(--size-4-2);
    border: var(--table-border-width) solid var(--table-border-color);
    max-width: var(--table-column-max-width);
    min-width: var(--table-column-min-width);
    vertical-align: var(--table-cell-vertical-alignment);
}

.wewrite-article-content td {
    font-size: var(--table-text-size);
    color: var(--table-text-color);
}

.wewrite-article-content th {
    font-size: var(--table-header-size);
    font-weight: var(--table-header-weight);
    color: var(--table-header-color);
    font-family: var(--table-header-font);
    line-height: var(--line-height-tight);
}

.wewrite-article-content th,

.wewrite-article-content td {
    text-align: start;
}

.wewrite-article-content th[align="left"],

.wewrite-article-content td[align="left"] {
    text-align: start;
}

.wewrite-article-content th[align="center"],

.wewrite-article-content td[align="center"] {
    text-align: center;
}

.wewrite-article-content th[align="right"],

.wewrite-article-content td[align="right"] {
    text-align: end;
}

.wewrite-article-content thead>tr>th,

.wewrite-article-content tbody>tr>td {
    white-space: var(--table-white-space);
    text-overflow: ellipsis;
    overflow: hidden;
}

.wewrite-article-content tbody tr {
    background-color: var(--table-background);
}

@media (hover: hover) {

    .wewrite-article-content tbody tr:hover {
        background-color: var(--table-row-background-hover);
    }
}

.wewrite-article-content tbody tr:nth-child(odd) {
    background-color: var(--table-row-alt-background);
}

@media (hover: hover) {

    .wewrite-article-content tbody tr:nth-child(odd):hover {
        background-color: var(--table-row-alt-background-hover);
    }
}

.wewrite-article-content tbody tr>td:nth-child(2n+2) {
    background-color: var(--table-column-alt-background);
}

.wewrite-article-content tbody tr:last-child>td {
    border-bottom-width: var(--table-row-last-border-width);
}

.wewrite-article-content tbody tr>td:first-child {
    border-left-width: var(--table-column-first-border-width);
}

.wewrite-article-content tbody tr>td:last-child {
    border-right-width: var(--table-column-last-border-width);
}

.wewrite-article-content thead tr {
    background-color: var(--table-header-background);
}

@media (hover: hover) {

    .wewrite-article-content thead tr:hover {
        background-color: var(--table-header-background-hover);
    }
}

.wewrite-article-content thead tr>th {
    border-top-width: var(--table-header-border-width);
    border-color: var(--table-header-border-color);
}

.wewrite-article-content thead tr>th:nth-child(2n+2) {
    background-color: var(--table-column-alt-background);
}

.wewrite-article-content thead tr>th:first-child {
    border-left-width: var(--table-column-first-border-width);
}

.wewrite-article-content thead tr>th:last-child {
    border-right-width: var(--table-column-last-border-width);
}

/* admonitions */

/* code */
.wewrite-article-content {
    code {
        display: inline;
        color: var(--code-block-color, #333) 
        background: var(--code-block-background, #f8f8f8);
    }
    .code-section {
        display: flex;
        border: solid 1px rgba(187, 145, 248, 0.4);
    }
    .code-section pre {
        margin: 0;
        overflow-x: auto;
    }
    .code-section code {
        display: block;
        padding: 0.9em;
        font-size: 0.9em;
        line-height: 1.6em;
        text-wrap: nowrap;
    }
    .code-section ul {
        flex-shrink: 0;
        counter-reset: line;
        margin: 0;
        padding: 0.9em 0 0.9em 0.9em;
        white-space: normal;
        width: fit-content;
    }
    .code-section ul>li {
        position: relative;
        margin: 0;
        padding: 0;
        display: list-item;
        text-align: right;
        text-wrap: nowrap;
        line-height: 1.6em;
        font-size: 0.9em;
        font-family: Menlo-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
        padding: 0;
        list-style-type: none;
        color: rgb(255, 255, 255);
    }
    .code-section ul>li::marker {
        content: none;
    }
    pre code.hljs {
        display: block;
        overflow-x: auto;
        padding: 1em
    }
    code.hljs {
        padding: 3px 5px
    }
}
.wewrite-article-content {
    img {
        max-width: 100%;
    }
    .excalidraw-svg{
        max-width: 80%; 
        text-align: center;
    }
}

`