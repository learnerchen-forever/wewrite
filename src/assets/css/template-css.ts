export const combinedCss = `.admonition {
    margin-top: 1.5em;
    margin-bottom: 1.5em;
    box-shadow: 0 .2em .5em rgba(0,0,0, 0.1);
}

.admonition.no-title .admonition-content {
    margin-top: 0;
    margin-bottom: 0;
}

.admonition li.task-list-item.is-checked p {
    text-decoration: line-through;
}

.admonition.no-drop {
    box-shadow: none;
}

.admonition.no-drop>.admonition-title.no-title+.admonition-content,
.admonition.no-drop .admonition .admonition-title.no-title+.admonition-content {
    margin-top: 0;
    margin-bottom: 0;
}

.admonition.no-drop .admonition .admonition-content {
    border-right: .0625em solid rgba(233, 233,123, .2);
    border-bottom: .0625em solid rgba(233, 233,123, .2);
}

.admonition.no-drop .admonition .admonition-title.no-title+.admonition-content {
    border-top: .0625em solid rgba(233, 233,123, .2);
}

:is(.markdown-source-view.mod-cm6) .admonition .math-block>mjx-container,
:is(.markdown-reading-view) .admonition .math-block>mjx-container {
    display: block;
    text-align: center;
    padding: 1em;
}

:is(.markdown-reading-view) .admonition .math-block>mjx-container {
    padding: .0625em;
}

*:not(.is-live-preview) .admonition.no-content {
    display: none;
}

.admonition {
    margin-top: 0px;
    margin-bottom: .75em;
}

.admonition.no-content {
    opacity: .1;
}

.admonition-content p {
    line-height: inherit;
    margin: revert;
}

.admonition-content p br {
    display: initial;
}

.admonition-content p ul>li>ul {
    border-left: 2px;
    border-left-color: #ababab;
    border-left-style: solid;
}

.admonition-content:first-child {
    margin-top: .8em;
}

.admonition-content:last-child {
    margin-bottom: .8em;
}

.admonition-title.no-title {
    display: none;
}

.admonition-title:hover+.admonition-content .admonition-content-copy {
    opacity: .7;
}

.admonition-content,
.callout-content {
    position: relative;
}

.admonition-content-copy {
    color: #ababab;
    cursor: pointer;
    opacity: 0;
    position: absolute;
    margin: .375em;
    right: 0;
    top: 0;
    transition: .3s opacity ease-in;
}

.admonition-content-copy:hover {
    color: inherit;
}

.admonition:hover .admonition-content-copy,
.callout:hover .admonition-content-copy,
.admonition-content-copy:hover {
    opacity: 1;
}


.admonition-content ul,
.admonition-content ol {
    white-space: normal;
}

.admonition-title-icon,
.fa {
    height: 1.2em;
    width: 1.2em;
}
/* section */
.wewrite {
    min-width: 200px;
    max-width: 760px;
    padding: 1em 1em 1em 1em;
    font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji;
    word-break: break-word;
    line-height: 1.75;
    font-weight: 400;
    font-size: 16px;
    overflow-x: hidden;
    color: #333;
    margin:0px;

}
/* headings */
.wewrite h1,
.wewrite h2,
.wewrite h3,
.wewrite h4,
.wewrite h5,
.wewrite h6 {
  line-height: 1.5;
  margin-top: 20px;
  margin-bottom: 10px;
  padding-bottom: 5px;
}
.wewrite h1:first-child,
.wewrite h2:first-child,
.wewrite h3:first-child,
.wewrite h4:first-child,
.wewrite h5:first-child,
.wewrite h6:first-child {
  margin-top: 1.5em;
  margin-bottom: 1em;
}
.wewrite h1::before,
.wewrite h2::before,
.wewrite h3::before,
.wewrite h4::before,
.wewrite h5::before,
.wewrite h6::before {
  content: "#";
  display: inline-block;
  color: #3eaf7c;
  padding-right: 0.23em;
}
.wewrite h1 {
  position: relative;
  font-size: 2.5em;
  margin-bottom: 0.5em;
}
.wewrite h1::before {
  font-size: 1.5em;
}
.wewrite h2 {
  font-size: 2.2em;
  padding-bottom: 0.5em;
  /* border-bottom: 1px solid #ececec; */
}
.wewrite h3 {
  font-size: 1.5em;
  padding-bottom: 0;
}
.wewrite h4 {
  font-size: 1.25em;
}
.wewrite h5 {
  font-size: 1.15em;
}
.wewrite h6 {
  font-size: 1.05em;
  font-weight: 500;
}
/* @media (max-width: 720px) {
    .wewrite h1 {
      font-size: 24px;
    }
    .wewrite h2 {
      font-size: 20px;
    }
    .wewrite h3 {
      font-size: 18px;
    }
  } */
  
/* paragraph */
.wewrite p {
    line-height: inherit;
    margin-top: 22px;
    margin-bottom: 22px;
  }
  .wewrite strong {
    /* color: #3eaf7c; */
    font-weight: 600;
  }
  .wewrite img {
    max-width: 100%;
    border-radius: 2px;
    display: block;
    margin: auto;
    /* border: 3px solid rgba(62, 175, 124, 0.2); */
  }
  .wewrite hr {
    border-top: 1px solid #3eaf7c;
    border-bottom: none;
    border-left: none;
    border-right: none;
    margin-top: 2px;
    margin-bottom: 2px;
  }
  .wewrite .foot-links hr {
    margin-top: 2em;
    margin-bottom: 0.5em;
  }

  .wewrite a {
    font-weight: 500;
    text-decoration: none;
    color: #3eaf7c;
  }
  .wewrite a:hover,
  .wewrite a:active {
    border-bottom: 1.5px solid #3eaf7c;
  }
  .wewrite a:before {
    content: "⇲";
  }


/* table */
.table-container {
  display: flex;
  overflow: auto;
  padding:auto
}
.wewrite table {
    /* display: inline-block !important; */
    display: table;
    font-size: 12px;
    width: fit-content !important;
    /* border: solid 1px #3eaf7c; */
    margin: auto;
  }
  .wewrite thead {
    background: #3eaf7c!important;
    color: #fff;
    text-align: left;
  }
  .wewrite tr:nth-child(2n) {
    background-color: rgba(62, 175, 124, 0.2);
  }
  .wewrite th {
    background: #3eaf7c!important;
    color: #fff;
  }
  .wewrite th,
  .wewrite td {
    padding: 12px 7px;
    line-height: 24px;
  }
  .wewrite td {
    min-width: 120px;
  }

  /* blockquote */
  .wewrite blockquote {
    color: #666;
    padding: 1px 23px;
    margin: 22px 0;
    border-left: 0.5em solid rgba(62, 175, 124, 0.6);
    border-color: #42b983;
    background-color: #f8f8f8;
  }
  .wewrite blockquote::after {
    display: block;
    content: "";
  }
  .wewrite blockquote > p {
    margin: 10px 0;
  }

  /* summary */
  .wewrite details {
    border: none;
    outline: none;
    border-left: 4px solid #3eaf7c;
    padding-left: 10px;
    margin-left: 4px;
  }
  .wewrite details summary {
    cursor: pointer;
    border: none;
    outline: none;
    background: white;
    margin: 0px -17px;
  }
  .wewrite details summary::-webkit-details-marker {
    color: #3eaf7c;
  }
/* list */
.wewrite ol,
.wewrite ul {
  padding-left: 28px;
}
.wewrite ol li,
.wewrite ul li {
  margin-bottom: 0;
  list-style: inherit;
}
.wewrite ol li .task-list-item,
.wewrite ul li .task-list-item {
  list-style: none;
}
.wewrite ol li .task-list-item ul,
.wewrite ul li .task-list-item ul,
.wewrite ol li .task-list-item ol,
.wewrite ul li .task-list-item ol {
  margin-top: 0;
}
.wewrite ol ul,
.wewrite ul ul,
.wewrite ol ol,
.wewrite ul ol {
  margin-top: 3px;
}
.wewrite ol li {
  padding-left: 6px;
}
.wewrite ol li::marker {
  color: #3eaf7c;
}
.wewrite ul li::marker {
  color: #3eaf7c;
}

/* code section */
.wewrite code {
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
    word-break: break-word;
    overflow-x: auto;
  
    padding: 0.2em 0.5em;
    margin: 0;
    color: #3eaf7c;
    font-size: 1em;
    background-color: rgba(27, 31, 35, 0.05);
    border-radius: 3px;
  }
  .wewrite pre {
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
    overflow: auto;
    position: relative;
    line-height: 1.8em;
  }
  .wewrite pre > code {
    font-size: 1em;
    padding: 15px 12px;
    margin: 0;
    word-break: normal;
    display: block;
    overflow-x: auto;
    color: #333;
    background: #f8f8f8;
  }
  .wewrite .code-section {
    display: flex;
    background: #1E1E1E;
    color: #DCDCDC;
    border-radius: 3px;
  
    /*border: 2px solid #3eaf7c;*/
  }
  .wewrite .code-section pre::-webkit-scrollbar {
      width: 12px; /* 设置滚动条的宽度 */
  }
  
  /* 自定义滚动轨迹的样式 */
  .wewrite .code-section pre::-webkit-scrollbar-track {
      background: #f1f1f1; /* 设置滚动轨迹的背景颜色 */
  }
  
  /* 自定义滚动滑块的样式 */
  .wewrite .code-section pre::-webkit-scrollbar-thumb {
      background: #888; /* 设置滚动滑块的背景颜色 */
  }
  
  /* 当鼠标悬停在滚动滑块上时的样式 */
  .wewrite .code-section pre::-webkit-scrollbar-thumb:hover {
      background: #555; /* 设置鼠标悬停时滚动滑块的背景颜色 */
  }

  .wewrite .code-section pre {
    margin: 0;
    display: block;
    padding: 0.4em;
    overflow-x: auto;
  }
  .wewrite .code-section pre code {
    border: none;
    background: #f8f8f8;
    font-size: 1em;
    line-height: 1.8em;
    padding: 0 !important;
    margin: 0 !important;
    text-wrap: wrap;
  }
  .wewrite .code-section ul {
    flex-shrink: 0;
    counter-reset: line;
    margin: 0;
    padding: 1em 0.3em 1em 1em;
    border-right: solid 1px gray;
    white-space: normal;
    width: fit-content;
  }
  .wewrite .code-section ul > li {
    position: relative;
    margin: 0;
    padding: 0;
    display: list-item;
    text-align: right;
    line-height: 1.8em;
    font-size: 1em;
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
    padding: 0;
    list-style-type: none;
    text-wrap: nowrap;
  }
  .wewrite .code-section ul > li::marker {
    content: none;
  }

  /* code hljs */
  pre code.hljs {
    display: block;
    
    overflow-x: auto;
    padding: 1em
  }
  code.hljs {
    padding: 3px 5px;
    
  }
  /*
 * Visual Studio 2015 dark style
 * Author: Nicolas LLOBERA <nllobera@gmail.com>
 */
.hljs {
    background: #1E1E1E;
    color: #DCDCDC
    
  }
  .hljs-keyword,
  .hljs-literal,
  .hljs-symbol,
  .hljs-name {
    color: #569CD6
  }
  .hljs-link {
    color: #569CD6;
    text-decoration: underline
  }
  .hljs-built_in,
  .hljs-type {
    color: #4EC9B0
  }
  .hljs-number,
  .hljs-class {
    color: #B8D7A3
  }
  .hljs-string,
  .hljs-meta .hljs-string {
    color: #D69D85
  }
  .hljs-regexp,
  .hljs-template-tag {
    color: #9A5334
  }
  .hljs-subst,
  .hljs-function,
  .hljs-title,
  .hljs-params,
  .hljs-formula {
    color: #DCDCDC
  }
  .hljs-comment,
  .hljs-quote {
    color: #57A64A;
    font-style: italic
  }
  .hljs-doctag {
    color: #608B4E
  }
  .hljs-meta,
  .hljs-meta .hljs-keyword,
  .hljs-tag {
    color: #9B9B9B
  }
  .hljs-variable,
  .hljs-template-variable {
    color: #BD63C5
  }
  .hljs-attr,
  .hljs-attribute {
    color: #9CDCFE
  }
  .hljs-section {
    color: gold
  }
  .hljs-emphasis {
    font-style: italic
  }
  .hljs-strong {
    font-weight: bold
  }
  .hljs-code {
    font-family:'Monospace';
  }
  .hljs-bullet,
  .hljs-selector-tag,
  .hljs-selector-id,
  .hljs-selector-class,
  .hljs-selector-attr,
  .hljs-selector-pseudo {
    color: #D7BA7D
  }
  .hljs-addition {
    background-color: #144212;
    display: inline-block;
    width: 100%
  }
  .hljs-deletion {
    background-color: #600;
    display: inline-block;
    width: 100%
  }

  /* icon */
  
.obsidian-icon {
    font-size: inherit;
    display: inline-block;
    width: 2em !important;
    text-align: center;
    /* margin-right: -0.5em !important; */
  }
  
  p .obsidian-icon {
    width: 1.75em !important;
  }
  
  .obsidian-icon.react-icon > svg {
    vertical-align: middle;
    margin-bottom: 3px;
  }

  /* footnote */
  .wewrite .footnote-id{
    color: gray;
    margin-right:0.5em;

  }
  .wewrite .footnote{
    font-size: 0.9em;
    font-weight: 300;
    margin-left: 0.5em;
  }
  
/* Callout Styles */

.callout {
    overflow: hidden;
    border-style: solid;
    border-color: rgba(8, 109, 221, 0.25);
    border-width: 0px;
    border-radius: 4px;
    margin: 1em 0;
    background-color: rgba(8, 109, 221, 0.1);
    padding: 12px 12px 12px 24px;
}

.callout:not(.admonition).drop-shadow {
    box-shadow: 0 .2em .5em rgba(0, 0, 0, 0.3);
}

.callout:not(.admonition) .no-title {
    display: none;
}


@supports selector(:has(*)) {

    :has(.callout .callout-title .callout-title-inner:dir(rtl)),
    .callout:has(> .callout-title .callout-title-inner:dir(rtl)) {
        direction: rtl;
    }

    :has(.callout .callout-title .callout-title-inner:dir(rtl))>.callout-title,
    .callout:has(> .callout-title .callout-title-inner:dir(rtl))>.callout-title {
        direction: rtl;
        --direction: -1;
    }

    :has(.callout .callout-title .callout-title-inner:dir(rtl))>.callout-title .callout-icon svg.svg-icon,
    .callout:has(> .callout-title .callout-title-inner:dir(rtl))>.callout-title .callout-icon svg.svg-icon {
        transform: scale(-1, 1);
    }
}

.callout {
    background-color: rgba(8, 109, 221, 0.1);
    box-shadow: 0 .2em .5em rgba(0, 0, 0, 0.3);
}


.callout-icon {
    height: 1em;
}

.callout[data-callout="summary"] {
    background-color: rgba(0, 191, 188, 0.1);
}
.callout[data-callout="abstract"],
.callout[data-callout="tldr"] {
    background-color: rgba(0, 176, 255, 0.1);
}

.callout[data-callout="info"] {
    background-color: rgba(8, 109, 221, 0.1);
}

.callout[data-callout="todo"] {
    background-color: rgba(8, 109, 221, 0.1);
}

.callout[data-callout="important"] {
    background-color: rgba(8, 191, 188, 0.1);
}

.callout[data-callout="tip"],
.callout[data-callout="hint"] {
    background-color: rgba(8, 191, 188, 0.1);
}

.callout[data-callout="success"],
.callout[data-callout="check"],
.callout[data-callout="done"] {
    background-color: rgba(8, 185, 78, 0.1);

}

.callout[data-callout="question"],
.callout[data-callout="help"],
.callout[data-callout="faq"] {
    background-color: rgba(236, 117, 0, 0.1);
}

.callout[data-callout="warning"],
.callout[data-callout="caution"],
.callout[data-callout="attention"] {
    background-color: rgba(236, 117, 0, 0.1);
}

.callout[data-callout="failure"],
.callout[data-callout="fail"],
.callout[data-callout="missing"] {
    background-color: rgba(233, 49, 71, 0.1);
}

.callout[data-callout="danger"],
.callout[data-callout="error"] {
    background-color: rgba(233, 49, 71, 0.1);
}

.callout[data-callout="bug"] {
    background-color: rgba(233, 49, 71, 0.1);
}

.callout[data-callout="example"] {
    background-color: rgba(120, 82, 238, 0.1);
}

.callout[data-callout="quote"],
.callout[data-callout="cite"] {
    background-color: rgba(158, 158, 158, 0.1);
}

/* title start */
.callout.is-collapsible  {
    cursor: var(--cursor);
}


.callout-title {
    padding: 0;
    display: flex;
    gap: 4px;
    font-size: inherit;
    line-height: 1.3;
    align-items: flex-start;
    color: rgb(8, 109, 221);
}


.callout[data-callout="summary"] .callout-title  {
    color: rgb(0, 191, 188);
}
.callout[data-callout="abstract"] .callout-title ,
.callout[data-callout="tldr"] .callout-title {
    color: rgb(0, 176, 255);
}

.callout[data-callout="info"] .callout-title {
    color: rgb(8, 109, 221);
}

.callout[data-callout="todo"] .callout-title {
    color: rgb(8, 109, 221);
}

.callout[data-callout="important"] .callout-title {
    color: rgb(8, 191, 188);
}

.callout[data-callout="tip"] .callout-title ,
.callout[data-callout="hint"] .callout-title {
    color: rgb(8, 191, 188);
}

.callout[data-callout="success"] .callout-title ,
.callout[data-callout="check"] .callout-title ,
.callout[data-callout="done"] .callout-title {
    color: rgb(8, 185, 78);

}

.callout[data-callout="question"] .callout-title ,
.callout[data-callout="help"] .callout-title ,
.callout[data-callout="faq"] .callout-title {
    color: rgb(236, 117, 0);
}

.callout[data-callout="warning"] .callout-title ,
.callout[data-callout="caution"] .callout-title ,
.callout[data-callout="attention"] .callout-title {
    color: rgb(236, 117, 0);
}

.callout[data-callout="failure"] .callout-title ,
.callout[data-callout="fail"] .callout-title ,
.callout[data-callout="missing"] .callout-title {
    color: rgb(233, 49, 71);
}

.callout[data-callout="danger"]  .callout-title ,
.callout[data-callout="error"] .callout-title {
    color: rgb(233, 49, 71);
}

.callout[data-callout="bug"] .callout-title {
    color: rgb(233, 49, 71);
}

.callout[data-callout="example"] .callout-title {
    color: rgb(120, 82, 238);
}

.callout[data-callout="quote"] .callout-title ,
.callout[data-callout="cite"]  .callout-title {
    color: rgb(158, 158, 158);
}

/* title end */
.callout-content {
    overflow-x: auto;
    padding: 0; 
    background-color: transparent;
}

.callout-content .callout {
    margin-top: 20px;
}

.callout-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
}


.callout-icon::after {
    content: "\u200B";
}

.callout-title-inner {
    font-weight: 600; 
    color: inherit; 
}

.callout-fold {
    display: flex;
    align-items: center;
    padding-inline-end: 8px; 
}

.callout-fold::after {
    content: "\u200B";
}

.callout-fold .svg-icon {
    transition: transform 100ms ease-in-out;
}

.callout-fold.is-collapsed .svg-icon {
    transform: rotate(-1 * -1 * 90deg);
}


`;