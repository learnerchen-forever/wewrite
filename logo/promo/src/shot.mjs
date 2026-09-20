/* 无头 Chrome 截图助手。把调用参数从 shell 引号里解放出来，并统一 Chrome 的查找逻辑。
 *
 * 目录约定：所有 html/png 参数都是**相对 setOut() 设定的工作目录**的文件名。
 * 脚本自己决定临时文件放哪儿（通常是一个 .tmp 目录），产物再拷到交付目录。
 *
 * 用法：node shot.mjs <html> <png> [宽] [高] [dsf]
 *
 * 关于 --force-device-scale-factor：出印刷版靠的就是它（dsf=2 即 2 倍像素密度），
 * 不要改成「渲染小图再放大」—— 那是插值，不是分辨率。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

let OUT = process.cwd();

/** 设定 html/png 参数的解析基准目录（不存在则创建）。 */
export function setOut(dir) {
  OUT = dir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* 读回当前基准目录。OUT 是模块级状态，任何想临时切目录的量测工具都必须
 * 「存 → 切 → 用完切回」，否则会把主流程后续的 shot() 写到别的目录去。 */
export function getOut() { return OUT; }

export function chromePath() {
  for (const p of CANDIDATES) if (p && fs.existsSync(p)) return p;
  return null;
}

export function shot(html, png, w = 1200, h = 1600, dsf = 1, opts = {}) {
  const exe = chromePath();
  if (!exe) throw new Error('找不到 Chrome —— 截图是这套流程唯一的渲染器，没有它无法出图');
  fs.mkdirSync(OUT, { recursive: true });
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=' + dsf, `--window-size=${w},${h}`,
    `--screenshot=${path.join(OUT, png)}`, `file:///${path.join(OUT, html).replace(/\\/g, '/')}`];
  /* 透明底：量 SVG 真实墨迹盒时必须关掉白色底板，否则白底会被当成墨迹 */
  if (opts.transparent) args.splice(1, 0, '--default-background-color=00000000');
  const r = spawnSync(exe, args, { encoding: 'utf8' });
  if (r.error) throw r.error;
  const out = path.join(OUT, png);
  const kb = fs.existsSync(out) ? (fs.statSync(out).size / 1024).toFixed(0) : 0;
  console.log(`${png}  ${kb} kB   (${w}x${h} @${dsf}x)`);
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [, , html, png, w, h, dsf] = process.argv;
  shot(html, png, +(w || 1200), +(h || 1600), +(dsf || 1));
}
