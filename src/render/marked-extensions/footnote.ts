/**
 * marked extension for footnote
 * 
 * 
 * 
 */

import { MarkedExtension } from "marked";
import { WeWriteMarkedExtension } from "./extension";

export class Footnote extends WeWriteMarkedExtension {
    markedExtension(): MarkedExtension {
        return {
            extensions: [
                {
                    name: 'footnote',
                    level: 'block', // 或者 'block'，取决于你的需求
                    start: (src) => {
                        return src.match(/\[\^(\w+)\]:/)?.index;
                    },
                    tokenizer: (src, tokens) => {
                        const rule = /^\[\^(\w+)\]:\s*(.*)/;
                        const match = rule.exec(src);
                        if (match) {
                            const token = {
                                type: 'footnote',
                                raw: match[0], // 整个匹配的文本
                                id: match[1],  // 脚注的标识符
                                text: match[2], // 脚注的文本
                                tokens: []
                            };
                            return token;
                        }
                    },
                    renderer: (token) => {
                        if (token.type === 'footnote') {
                            return `<div id="footnote-${token.id}" class="footnote"><span class="footnote-id">【${token.id}】 </span>${token.text?token.text:''}</div>`;
                        }
                    }
                },
                {
                    name: 'footnoteMark',
                    level: 'inline', // 或者 'block'，取决于你的需求
                    start: (src) => {
                        return src.match(/\[\^(\w+)\]/)?.index;
                    },
                    tokenizer: (src, tokens) => {
                        const rule = /^\[\^(\w+)\]/;
                        const match = rule.exec(src);
                        if (match) {
                            const token = {
                                type: 'footnoteMark',
                                raw: match[0], // 整个匹配的文本
                                id: match[1],  // 脚注的标识符
                                tokens: []
                            };
                            return token;
                        }
                    },
                    renderer: (token) => {
                        if (token.type === 'footnoteMark') {
                            return `<a>${token.text?token.text:''}<sup>【${token.id}】</sup></a>`
                        }
                    }
                }
            ]
        }
    }
}