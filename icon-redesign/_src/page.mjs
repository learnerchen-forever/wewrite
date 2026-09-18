// page.mjs — 读 data.json，产出可比对、可取舍的 index.html。
// 运行：node icon-redesign/_src/page.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));

/** 用来做混排测试的 Obsidian 原生图标（Lucide），看两套是否打架。 */
const NATIVE = [
  ['search', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'],
  ['plus', '<path d="M5 12h14"/><path d="M12 5v14"/>'],
  ['file-text', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>'],
  ['folder', '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'],
  ['trash-2', '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>'],
  ['chevron-right', '<path d="m9 18 6-6-6-6"/>'],
];

const svg = (inner) =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── 密排总览 ──
const stripOld = data.rows.map((r) => '<span class="iso" title="' + esc(r.id) + '">' + r.old + '</span>').join('');
const stripNew = data.rows.map((r) => '<span class="iso" title="' + esc(r.id) + '">' + r.next + '</span>').join('');
const mixNative = NATIVE.map(([n, p]) => '<span class="iso native" title="' + esc(n) + '">' + svg(p) + '</span>').join('');
const mixOurs = data.rows
  .filter((r) => ['wewrite-news', 'wewrite-publish', 'wewrite-theme', 'wewrite-material', 'wewrite-proofread', 'wewrite-ai-generate'].includes(r.id))
  .map((r) => '<span class="iso ours" title="' + esc(r.id) + '">' + r.next + '</span>')
  .join('');

// ── 分组明细 ──
const groups = [...new Set(data.rows.map((r) => r.group))];
const sections = groups
  .map((g) => {
    const list = data.rows.filter((r) => r.group === g);
    const body = list
      .map((r) => {
        const chip = r.changed;
        return (
          '<div class="row" data-changed="' + esc(chip) + '" data-id="' + esc(r.id) + '">' +
          '<label class="pick"><input type="checkbox" checked data-role="pick"><span></span></label>' +
          '<div class="meta"><b>' + esc(r.name) + '</b>' +
          '<code>' + esc(r.id) + '</code>' +
          '<span class="scope">' + esc(r.scope) + '</span></div>' +
          '<span class="iso cell old" title="旧">' + r.old + '</span>' +
          '<span class="iso cell new" title="新">' + r.next + '</span>' +
          '<span class="chip c-' + esc(chip) + '">' + esc(chip) + '</span>' +
          '<p class="note">' + esc(r.note) + '</p>' +
          '</div>'
        );
      })
      .join('');
    return '<h3 class="group">' + esc(g) + '<i>' + list.length + '</i></h3>' +
      '<div class="thead row"><span></span><span>图标 / 用途</span><span>旧</span><span>新</span><span>改动</span><span>为什么</span></div>' +
      body;
  })
  .join('');

// ── 内置图标借用 ──
const swaps = data.builtinSwaps
  .map(
    (s) =>
      '<div class="swap"><b>' + esc(s.where) + '</b>' +
      '<p><code>' + esc(s.now) + '</code><span class="arrow">→</span><code class="want">' + esc(s.want) + '</code></p>' +
      '<p class="note">' + esc(s.why) + '</p></div>'
  )
  .join('');

const tally = data.rows.reduce((a, r) => ((a[r.changed] = (a[r.changed] || 0) + 1), a), {});

const html = `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WeWrite 图标重设计 · 取舍表</title>
<style>
:root{
  --bg:#fff; --alt:#f5f6f8; --fg:#1f2328; --dim:#6b7280; --line:#e4e7eb;
  --accent:#4f46e5; --ok:#15803d; --warn:#b45309; --isz:24px;
  --mono:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;
}
html[data-theme=dark]{
  --bg:#1a1a1d; --alt:#26262c; --fg:#e7e7ec; --dim:#9b9ba5; --line:#3a3a43;
  --accent:#a5b4fc; --ok:#4ade80; --warn:#fbbf24;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
h1{font-size:20px;margin:0 0 6px}
h2{font-size:15px;margin:34px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3.group{font-size:13px;font-weight:600;color:var(--dim);margin:22px 0 8px;display:flex;gap:8px;align-items:center}
h3.group i{font-style:normal;font-weight:400;opacity:.6}
code{font-family:var(--mono);font-size:11.5px;color:var(--dim)}
p{margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:26px 22px 90px}
.lede{color:var(--dim);max-width:74ch}
.lede b{color:var(--fg)}

.bar{position:sticky;top:0;z-index:9;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
  padding:10px 0;margin:18px 0 6px;background:var(--bg);border-bottom:1px solid var(--line)}
.bar .sp{flex:1}
button,.seg button{font:inherit;font-size:12.5px;padding:5px 11px;border:1px solid var(--line);
  background:var(--alt);color:var(--fg);border-radius:7px;cursor:pointer}
button:hover{border-color:var(--accent);color:var(--accent)}
.seg{display:flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.seg button{border:0;border-radius:0;background:transparent}
.seg button+button{border-left:1px solid var(--line)}
.seg button[aria-pressed=true]{background:var(--accent);color:#fff}
.count{font-variant-numeric:tabular-nums;color:var(--dim);font-size:12.5px}

.iso{display:inline-flex;align-items:center;justify-content:center;background:var(--alt);
  border:1px solid var(--line);border-radius:8px;width:52px;height:52px;flex:none}
.iso svg{width:var(--isz);height:var(--isz);display:block;color:var(--fg)}
.strip{display:flex;flex-wrap:wrap;gap:7px}
.strip .iso{width:42px;height:42px;border-radius:9px}
.strip .iso.native{background:transparent;border-style:dashed;border-color:var(--accent);opacity:.85}
.strip .iso.ours{border-color:var(--accent)}
.striplabel{font-size:12px;color:var(--dim);margin:12px 0 6px}

.row{display:grid;grid-template-columns:34px minmax(150px,1.05fr) 56px 56px 58px minmax(200px,2.1fr);
  gap:14px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}
.thead{font-size:11.5px;color:var(--dim);letter-spacing:.03em;border-bottom:1px solid var(--line);
  padding-bottom:5px;position:sticky;top:53px;background:var(--bg);z-index:5}
.thead span:nth-child(3),.thead span:nth-child(4){text-align:center}
.row .iso.cell{width:44px;height:44px}
.row .iso.old{opacity:.75}
.meta{display:flex;flex-direction:column;gap:1px;min-width:0}
.meta b{font-weight:600;font-size:13.5px}
.scope{font-size:11.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.note{font-size:12.5px;color:var(--dim)}
.chip{font-size:11px;padding:1px 7px;border-radius:99px;text-align:center;justify-self:start;
  border:1px solid currentColor;white-space:nowrap}
.c-重画{color:var(--accent)} .c-调形{color:var(--warn)} .c-保留{color:var(--dim)}
.pick{display:inline-flex;cursor:pointer}
.pick input{position:absolute;opacity:0;width:0;height:0}
.pick span{width:18px;height:18px;border:1.5px solid var(--line);border-radius:5px;display:block;position:relative}
.pick input:checked+span{background:var(--accent);border-color:var(--accent)}
.pick input:checked+span::after{content:"";position:absolute;left:5px;top:1.5px;width:5px;height:9px;
  border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.pick input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
body[data-filter=redraw] .row[data-changed=保留]{display:none}
body[data-filter=changed] .row[data-changed=保留]{display:none}

.swaps{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.swap{border:1px solid var(--line);border-radius:9px;padding:11px 13px;background:var(--alt)}
.swap b{font-size:13px}
.swap p{margin-top:4px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.swap code.want{color:var(--ok)}
.arrow{color:var(--dim)}
.swap .note{display:block;color:var(--dim);font-size:12.5px}

.out{margin-top:14px;width:100%;min-height:120px;font-family:var(--mono);font-size:12px;
  padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--alt);color:var(--fg);resize:vertical}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);color:var(--dim);font-size:12.5px}
</style>
</head>
<body>
<div class="wrap">
<h1>WeWrite 图标重设计 · 取舍表</h1>
<p class="lede">母题：<b>笔与行</b>。Obsidian 的文本光标和笔尖本来就是同一个形状——一根 2px 圆头竖线，所以「写作」不必额外画一支笔。真正能落地成意境的是<b>行</b>：凡是出现文字的地方，都共用同一套字形（左边界一致、末行短一截收笔），这既是字迹，也正好是公众号排版里段末留白的样子。轮廓仍是各功能自己的隐喻，24 网格 / 2px 圆头 / currentColor / 无填充 一条不改，所以混排进 Obsidian 原生图标不会跳。</p>

<div class="bar">
  <span class="seg" id="size">
    <button data-sz="12">12</button><button data-sz="16">16</button><button data-sz="24" aria-pressed="true">24</button><button data-sz="32">32</button>
  </span>
  <span class="seg" id="theme">
    <button data-th="light" aria-pressed="true">明</button><button data-th="dark">暗</button>
  </span>
  <span class="seg" id="filter">
    <button data-f="all" aria-pressed="true">全部 ${data.rows.length}</button><button data-f="changed">只看动过的 ${data.rows.length - (tally['保留'] || 0)}</button>
  </span>
  <span class="sp"></span>
  <button id="allNew">全选新版</button>
  <button id="allOld">全选旧版</button>
  <button id="copy">复制我的取舍</button>
  <span class="count" id="count"></span>
</div>

<h2>密排总览</h2>
<p class="striplabel">旧版 ${data.rows.length} 枚（现在是通用隐喻直译，换成任何 Markdown 编辑器都成立）</p>
<div class="strip">${stripOld}</div>
<p class="striplabel">新版 ${data.rows.length} 枚（同一套字形，同一套呼吸）</p>
<div class="strip">${stripNew}</div>

<p class="striplabel">混排测试：虚线框是 Obsidian 原生图标（Lucide），实线框是新版。放一起看会不会跳。</p>
<div class="strip">${mixNative}${mixOurs}</div>

<h2>逐个取舍</h2>
<p class="lede" style="font-size:12.5px">改动 ${tally['重画'] || 0} 枚 · 调形 ${tally['调形'] || 0} 枚 · 保留 ${tally['保留'] || 0} 枚。取消勾选＝这枚沿用旧版。</p>
${sections}

<h2>顺带发现的 5 处「该用自绘图标却借了 Obsidian 内置的」</h2>
<p class="lede" style="font-size:12.5px">这些不在上面的 SVG 里，但同一场景混着两套语汇，比图标本身更显眼。建议一并替换：</p>
<div class="swaps">${swaps}</div>

<h2>我觉得还没完全解决的 3 件事</h2>
<p class="lede" style="font-size:12.5px">先说清楚，免得你事后发现：</p>
<div class="swaps">
  <div class="swap"><b>校对 vs 预览缩放：都是放大镜</b>
    <p class="note">校对是镜内一个勾，预览缩放是镜内一个加号。放到 16px 两者就只差一个笔画。它们平时不同屏（一个在推文预览工具条、一个在编辑器 AI 菜单），但如果你把这两个命令都钉到移动工具栏，就会并排出现。要彻底解决，其中一枚得换隐喻，我倾向换缩放（改成「上下箭头 + 横线」之类的百分比符号），但那会牺牲缩放图标本身的通用性。</p></div>
  <div class="swap"><b>封面合成：三个框在 16px 下偏密</b>
    <p class="note">「两块汇入一块」是准确的，但 24 网格里塞三个方块加两条斜线，缩到 16px 会有点糊。好在它只出现在封面合成按钮上，旁边有「合成封面」四个字兜底。要更干净可以砍成「一块 + 箭头 + 一块」。</p></div>
  <div class="swap"><b>保留了 10 枚没动</b>
    <p class="note">保存、撤销、重做、删除、翻译、设置、取消选择这几枚，通用符号本身就是零歧义的最优解——为了「统一」去改它们只会让用户多认一次。我的判断是别改，但你可以直接在上面把这几枚勾掉。</p></div>
</div>

<h2>取舍结果</h2>
<textarea class="out" id="out" readonly placeholder="点「复制我的取舍」，结果会出现在这里。"></textarea>

<footer>新图标源码：<code>icon-redesign/icons/*.svg</code>　·　原图标未改动：<code>src/resources/icons/*.svg</code>　·　定稿后把采用的文件覆盖过去即可，id 与文件名一一对应，无需改 <code>icon-registry.ts</code>。</footer>
</div>
<script>
var rows = Array.prototype.slice.call(document.querySelectorAll('.row[data-id]'));
function setPressed(seg, el){ Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b){ b.setAttribute('aria-pressed', String(b===el)); }); }
document.getElementById('size').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return;
  document.documentElement.style.setProperty('--isz', b.dataset.sz+'px'); setPressed(this,b); });
document.getElementById('theme').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return;
  document.documentElement.setAttribute('data-theme', b.dataset.th); setPressed(this,b); });
document.getElementById('filter').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return;
  document.body.setAttribute('data-filter', b.dataset.f==='changed' ? 'redraw' : 'all'); setPressed(this,b); });
function sync(){ var n=rows.filter(function(r){ return r.querySelector('input').checked; }).length;
  document.getElementById('count').textContent = '采用新版 ' + n + ' / 沿用旧版 ' + (rows.length-n); }
rows.forEach(function(r){ r.querySelector('input').addEventListener('change', sync); });
document.getElementById('allNew').addEventListener('click', function(){ rows.forEach(function(r){ r.querySelector('input').checked=true; }); sync(); });
document.getElementById('allOld').addEventListener('click', function(){ rows.forEach(function(r){ r.querySelector('input').checked=false; }); sync(); });
document.getElementById('copy').addEventListener('click', function(){
  var yes=[], no=[];
  rows.forEach(function(r){ (r.querySelector('input').checked ? yes : no).push(r.dataset.id); });
  var txt='采用新版（'+yes.length+'）\\n'+yes.join('\\n')+'\\n\\n沿用旧版（'+no.length+'）\\n'+(no.join('\\n')||'（无）');
  var out=document.getElementById('out'); out.value=txt; out.select();
  if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(function(){});
});
sync();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'icon-redesign', 'index.html'), html, 'utf8');
console.log('写入 icon-redesign/index.html  (' + (html.length / 1024).toFixed(1) + ' KB)');
