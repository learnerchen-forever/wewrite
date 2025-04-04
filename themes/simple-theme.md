---
theme_name: 极简风格
---

# 背景文字
```css
.wewrite-article-content {
    --bg-color: #f5f5f5;
    --text-color: #333;
    --link-color: #0078e7;
    --link-hover-color: #0050a3;
    --blockquote-color: #666;
    --font-family: 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    --font-size: 16px;
}
```

# 正文样式
```css
.wewrite-article-content {
    --text-color: #333;
    --link-color: #0078e7;
    --link-hover-color: #0050a3;
    --blockquote-color: #666;
    --font-family: 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    --font-size: 16px;
    --line-height: 1.5;
    /* 缩进 */
    --text-indent: 2em;

}
```

# 标题样式
```css
.wewrite-article-content {
    /*标题颜色*/
    --h1-color: #333;
    --h2-color: #333;
    --h3-color: #333;
    --h4-color: #333;
    --h5-color: #333;
    --h6-color: #333;

/* 标题大小 */
    --h1-size: 2.5rem;
    --h2-size: 2rem;
    --h3-size: 1.75rem;
    --h4-size: 1.5rem;
    --h5-size: 1.25rem;
    --h6-size: 1rem;

    /*标题间距*/
    --h1-margin: 1.5rem 0 1rem;
    --h2-margin: 1.25rem 0 0.5rem;
    --h3-margin: 1rem 0 0.5rem;
    --h4-margin: 0.75rem 0 0.5rem;
    --h5-margin: 0.5rem 0 0.5rem;
    --h6-margin: 0.5rem 0 0.5rem;

    /*标题字体*/
    --h1-font-family: inherit;
    --h2-font-family: inherit;
    --h3-font-family: inherit;
    --h4-font-family: inherit;
    --h5-font-family: inherit;
    --h6-font-family: inherit;

    /*标题粗细*/
    --h1-font-weight: 600;
    --h2-font-weight: 600;
    --h3-font-weight: 600;
    --h4-font-weight: 600;
    --h5-font-weight: 600;
    --h6-font-weight: 600;
}
```

# 代码块样式
```css
.wewrite-article-content {
    --code-block-background-color: #f5f5f5;
    --code-block-color: #333;
    --code-block-border-color: #ddd;
    --code-block-font-family: 'Courier New', Courier, monospace;
    --code-block-font-size: 0.9rem; 
    --code-block-line-height: 1.5;
    --code-block-padding: 0.5rem;
    --code-block-border-radius: 0.25rem;
    --code-block-margin: 1rem 0;
    --code-block-border-width: 1px;
}
```
# 引用块样式
```css
.wewrite-article-content {
    --blockquote-background-color: #f5f5f5;
    --blockquote-color: #666;
    --blockquote-border-color: #ddd;
    --blockquote-border-width: 1px;
    --blockquote-border-style: solid;
    --blockquote-border-radius: 0.25rem;
    --blockquote-padding: 0.5rem;
    --blockquote-margin: 1rem 0;
    --blockquote-font-size: 1rem;
}
```

# 列表样式
```css
.wewrite-article-content {
    --ul-list-style-type: disc;
    --ol-list-style-type: decimal;
    --ul-list-margin: 0 0 0 1.5rem;
    --ol-list-margin: 0 0 0 1.5rem;
    --ul-list-padding: 0;
    --ol-list-padding: 0;
    --ul-list-item-margin: 0.5rem 0;
    --ol-list-item-margin: 0.5rem 0;
    --ul-list-item-font-size: 1rem;
    --ol-list-item-font-size: 1rem;
    --ul-list-item-font-weight: normal; 
}
```
# 表格样式
```css
.wewrite-article-content {
    --table-border-color: #ddd;
    --table-border-width: 1px;
    --table-border-style: solid;
    --table-border-radius: 0.25rem;
    --table-padding: 0.5rem;
    --table-margin: 1rem 0;
    --table-font-size: 1rem;
    --table-cell-vertical-align: middle;
    --table-cell-border-color: #ddd;
    --table-cell-border-width: 1px;
    --table-cell-border-style: solid;
    --table-cell-padding: 0.5rem;
    --table-cell-font-size: 1rem;
    --table-cell-font-weight: normal;
    --table-cell-text-align: left;
    --table-header-cell-background-color: #f5f5f5;
    --table-header-cell-color: #333;
    --table-header-cell-font-size: 1rem;
    --table-header-cell-font-weight: bold;
    --table-header-cell-text-align: left;
    --table-header-cell-border-color: #ddd;
    --table-header-cell-border-width: 1px;
    --table-header-cell-border-style: solid;
    --table-header-cell-padding: 0.5rem;
    --table-header-cell-border-bottom-width: 2px;
    --table-header-cell-border-bottom-style: solid;
    --table-header-cell-border-bottom-color: #333;
    --table-header-cell-border-bottom-radius: 0.25rem;
    --table-header-cell-border-bottom-radius-top: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom: 0.25rem;
    --table-header-cell-border-bottom-radius-left: 0.25rem;
    --table-header-cell-border-bottom-radius-right: 0.25rem;
    --table-header-cell-border-bottom-radius-top-left: 0.25rem;
    --table-header-cell-border-bottom-radius-top-right: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom-left: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom-right: 0.25rem;
    --table-header-cell-border-bottom-radius-top-left-top: 0.25rem;
    --table-header-cell-border-bottom-radius-top-left-bottom: 0.25rem;
    --table-header-cell-border-bottom-radius-top-right-top: 0.25rem;
    --table-header-cell-border-bottom-radius-top-right-bottom: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom-left-top: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom-left-bottom: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom-right-top: 0.25rem;
    --table-header-cell-border-bottom-radius-bottom-right-bottom: 0.25rem;
    --table-header-cell-border-bottom-radius-top-left-top-left: 0.25rem;
    --table-header-cell-border-bottom-radius-top-left-top-right: 0.25rem;
    --table-header-cell-border-bottom-radius-top-left-bottom-left: 0.25rem;

}
```
# 图片样式
```css
.wewrite-article-content {
    --img-max-width: 100%;
    --img-margin: 1rem 0;
    --img-border-radius: 0.25rem;
    --img-border-width: 0;
    --img-border-style: solid;
    --img-border-color: #ddd;
    --img-box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.1);
    --img-caption-color: #666;
    --img-caption-font-size: 0.8rem;
    --img-caption-font-style: italic;
    --img-caption-margin: 0.5rem 0 0;
    --img-caption-text-align: center;
    --img-caption-font-weight: normal;
    --img-caption-font-family: inherit;
    --img-caption-font-variant: normal;
    --img-caption-font-stretch: normal;
    --img-caption-font-style: normal;
}
```

# 粗体样式
```css
.wewrite-article-content {
    --bold-font-weight: bold;
    --bold-font-style: normal;
    --bold-font-variant: normal;
    --bold-font-stretch: normal;
    --bold-font-family: inherit;
    --bold-font-size: inherit;
    --bold-color: inherit;
    --bold-text-decoration: inherit;
    --bold-text-transform: inherit;
    --bold-line-height: inherit;
    --bold-letter-spacing: inherit;
    --bold-word-spacing: inherit;
    --bold-text-align: inherit;
    --bold-display: inline;
    --bold-vertical-align: baseline;
    --bold-margin: 0;
    --bold-padding: 0;
    --bold-background-color: transparent;
    --bold-border-color: transparent;

}
```
# 斜体样式
```css
.wewrite-article-content {
    --italic-font-weight: normal;
    --italic-font-style: italic;
    --italic-font-variant: normal;
    --italic-font-stretch: normal;
    --italic-font-family: inherit;
    --italic-font-size: inherit;
    --italic-color: inherit;
    --italic-text-decoration: inherit;
    --italic-text-transform: inherit;
    --italic-line-height: inherit;
    --italic-letter-spacing: inherit;
    --italic-word-spacing: inherit;
    --italic-text-align: inherit;
    --italic-display: inline;
    --italic-vertical-align: baseline;
    --italic-margin: 0;
    --italic-padding: 0;
}
```

# 下划线样式
```css
.wewrite-article-content {
    --underline-text-decoration: underline;
    --underline-text-decoration-color: inherit;
    --underline-text-decoration-style: solid;
    --underline-text-decoration-thickness: auto;
    --underline-text-decoration-skip-ink: auto;
    --underline-text-decoration-line: underline;
    --underline-text-decoration-position: auto;
    --underline-text-decoration-skip: edges;
    --underline-text-decoration-skip-spaces: auto;
    --underline-text-decoration-skip-edges: auto;
    
}
```
# 删除线样式
```css
.wewrite-article-content {
    --strikethrough-text-decoration: line-through;
    --strikethrough-text-decoration-color: inherit;
    --strikethrough-text-decoration-style: solid;
    --strikethrough-text-decoration-thickness: auto;
    --strikethrough-text-decoration-skip-ink: auto;
    --strikethrough-text-decoration-line: line-through;
    --strikethrough-text-decoration-position: auto;
    --strikethrough-text-decoration-skip: edges;
    --strikethrough-text-decoration-skip-spaces: auto;
    --strikethrough-text-decoration-skip-edges: auto;
    --strikethrough-text-decoration-skip-ink: auto;
    --strikethrough-text-decoration-skip-ink-spaces: auto;
    --strikethrough-text-decoration-skip-ink-edges: auto;
    --strikethrough-text-decoration-skip-ink-skip: auto;
    --strikethrough-text-decoration-skip-ink-skip-spaces: auto;
    --strikethrough-text-decoration-skip-ink-skip-edges: auto;
    --strikethrough-text-decoration-skip-ink-skip-ink: auto;
    --strikethrough-text-decoration-skip-ink-skip-ink-spaces: auto;
    --strikethrough-text-decoration-skip-ink-skip-ink-edges: auto;
    --strikethrough-text-decoration-skip-ink-skip-ink-skip: auto;
}
```

# icon样式
```css
.wewrite-article-content {
    --icon-size: 1rem;
    --icon-color: inherit;
}
```
# Admontion样式
```css
.wewrite-article-content {
    --admonition-details-icon: url("data:image/svg+xml;charset=utf-8,<svg xmlns='http: //www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z'/></svg>");
    --admonition-margin-top: 1.5rem;
    --admonition-margin-bottom: var(--admonition-margin-top);
    --admonition-margin-top-lp: 0px;
    --admonition-margin-bottom-lp: .75rem;
    --admonition-color: 233, 233,123;
}
```

# Table 样式
```css
.wewrite-article-content {
    /* Tables */
     --table-background: transparent;
     --table-border-width: 1px;
     --table-border-color: var(--background-modifier-border);
     --table-white-space: break-spaces;
     --table-header-background: var(--table-background);
     --table-header-background-hover: inherit;
     --table-header-border-width: var(--table-border-width);
     --table-header-border-color: var(--table-border-color);
     --table-header-font: inherit;
     --table-header-size: var(--table-text-size);
     --table-header-weight: calc(var(--font-weight) + var(--bold-modifier));
     --table-header-color: var(--text-normal);
     --table-line-height: var(--line-height-tight);
     --table-text-size: var(--font-text-size);
     --table-text-color: inherit;
     --table-column-min-width: 6ch;
     --table-column-max-width: none;
     --table-column-alt-background: var(--table-background);
     --table-column-first-border-width: var(--table-border-width);
     --table-column-last-border-width: var(--table-border-width);
     --table-row-background-hover: var(--table-background);
     --table-row-alt-background: var(--table-background);
     --table-row-alt-background-hover: var(--table-background);
     --table-row-last-border-width: var(--table-border-width);
     --table-selection: hsla(var(--color-accent-hsl), 0.1);
     --table-selection-blend-mode: var(--highlight-mix-blend-mode);
     --table-selection-border-color: var(--interactive-accent);
     --table-selection-border-width: 2px;
     --table-selection-border-radius: 4px;
     --table-cell-vertical-alignment: top;
     --table-drag-handle-background: transparent;
     --table-drag-handle-background-active: var(--table-selection-border-color);
     --table-drag-handle-color: var(--text-faint);
     --table-drag-handle-color-active: var(--text-on-accent);
     --table-add-button-background: transparent;
     --table-add-button-border-width: var(--table-border-width);
     --table-add-button-border-color: var(--background-modifier-border);
}
```

# Callout 样式
```css
.wewrite-article-content {
    /* Callouts */
     --callout-border-width: 0px;
     --callout-border-opacity: 0.25;
     --callout-padding: var(--size-4-3) var(--size-4-3) var(--size-4-3) var(--size-4-6);
     --callout-radius: var(--radius-s);
     --callout-blend-mode: var(--highlight-mix-blend-mode);
     --callout-title-color: inherit;
     --callout-title-padding: 0;
     --callout-title-size: inherit;
     --callout-title-weight: calc(var(--font-weight) + var(--bold-modifier));
     --callout-content-padding: 0;
     --callout-content-background: transparent;
     --callout-bug: var(--color-red-rgb);
     --callout-default: var(--color-blue-rgb);
     --callout-error: var(--color-red-rgb);
     --callout-example: var(--color-purple-rgb);
     --callout-fail: var(--color-red-rgb);
     --callout-important: var(--color-cyan-rgb);
     --callout-info: var(--color-blue-rgb);
     --callout-question: var(--color-orange-rgb);
     --callout-success: var(--color-green-rgb);
     --callout-summary: var(--color-cyan-rgb);
     --callout-tip: var(--color-cyan-rgb);
     --callout-todo: var(--color-blue-rgb);
     --callout-warning: var(--color-orange-rgb);
     --callout-quote: 158, 158, 158;
}
```

# code 样式
```css
.wewrite-article-content {
    /* Code */
     --code-white-space: pre-wrap;
     --code-radius: var(--radius-s);
     --code-size: var(--font-smaller);
     --code-background: var(--background-primary-alt);
     --code-normal: var(--text-muted);
     --code-comment: var(--text-faint);
     --code-function: var(--color-yellow);
     --code-important: var(--color-orange);
     --code-keyword: var(--color-pink);
     --code-operator: var(--color-red);
     --code-property: var(--color-cyan);
     --code-punctuation: var(--text-muted);
     --code-string: var(--color-green);
     --code-tag: var(--color-red);
     --code-value: var(--color-purple);
     /* Collapse icons */
     --collapse-icon-color: var(--text-faint);
     --collapse-icon-color-collapsed: var(--text-accent);

}
```
# icons 样式

```css
.wewrite-article-content {
    /* Icons */
     --icon-size: var(--icon-m);
     --icon-stroke: var(--icon-m-stroke-width);
     --icon-xs: 14px;
     --icon-s: 16px;
     --icon-m: 18px;
     --icon-l: 18px;
     --icon-xl: 32px;
     --icon-xs-stroke-width: 2px;
     --icon-s-stroke-width: 2px;
     --icon-m-stroke-width: 1.75px;
     --icon-l-stroke-width: 1.75px;
     --icon-xl-stroke-width: 1.25px;
     --icon-color: var(--text-muted);
     --icon-color-hover: var(--text-muted);
     --icon-color-active: var(--text-accent);
     --icon-color-focused: var(--text-normal);
     --icon-opacity: 0.85;
     --icon-opacity-hover: 1;
     --icon-opacity-active: 1;
     --clickable-icon-radius: var(--radius-s);
}
```

