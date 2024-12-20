import { mathjax } from 'mathjax-full/js/mathjax'
import { TeX } from 'mathjax-full/js/input/tex'
import { SVG } from 'mathjax-full/js/output/svg'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages'
import { LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html'
import { parse } from 'path'

const adaptor = new LiteAdaptor()
RegisterHTMLHandler(adaptor)

const mathjax_document = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: 'none' })
})

const mathjax_options = {
  em: 16,
  ex: 8,
  containerWidth: 1280,
//   display: true
}

export function parseMath(math: string): string {
    console.log(`math:`, math);
    
  const node = mathjax_document.convert(math, mathjax_options)
  console.log(`node`, node);
  
  return adaptor.innerHTML(node)
}

const inlineRule = /\$(.*)\$/g // /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/;
const blockRule = /\$\$(?!<\$\$)([\s\S]*?)\$\$/g;  // /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

export function parseHTML(html: string): string {
    console.log(`parseHTML: ${html}`)
    
    let matches = html.match(blockRule)
    if (matches) {
        matches.forEach(match => {
            console.log(`match block：${match}`);
            const math = match.replace(/\$/g, '')
            const svg = parseMath(math)
            html = html.replace(match, svg)
        })
    }
    
    matches = html.match(inlineRule)
    console.log(`matches: ${matches}`)
    if (matches) {
      matches.forEach(match => {
        console.log(`match inline：${match}`);
        
        const math = match.replace(/\$/g, '')
        const svg = parseMath(math)
        html = html.replace(match, svg)
      })
    }
    return html

  }

//   const svg = parseMath('a^2+b^2=c^2')
//   console.log(`svg: ${svg}`);
  