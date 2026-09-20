/* 最小 PNG 解码（8bit、非隔行、颜色类型 0/2/3/4/6）。
 * 本机没有可用的图像库，而 node 自带 zlib —— 够用了。
 * 两个调用方：trace-ref.mjs（描摹位图）与 measure-svg.mjs（量 SVG 的真实墨迹盒）。
 */
import zlib from 'node:zlib';

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let plte = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error(`位深 ${depth} 不支持（只处理 8bit）`);
  if (interlace) throw new Error('隔行 PNG 不支持');
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!chans) throw new Error(`颜色类型 ${ctype} 不支持`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chans;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= chans ? cur[i - chans] : 0;
      const b = prev ? prev[i] : 0;
      const c = (prev && i >= chans) ? prev[i - chans] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`过滤器 ${filter} 不支持`);
      cur[i] = v & 255;
    }
  }
  return { w, h, ctype, chans, data: out, plte };
}

export function sampler(img) {
  const { w, chans, data, plte } = img;
  const ctype = img.ctype;
  return (x, y) => {
    const i = (y * w + x) * chans;
    if (ctype === 6) return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (ctype === 2) return [data[i], data[i + 1], data[i + 2], 255];
    if (ctype === 4) return [data[i], data[i], data[i], data[i + 1]];
    if (ctype === 0) return [data[i], data[i], data[i], 255];
    if (ctype === 3) { const k = data[i] * 3; return [plte[k], plte[k + 1], plte[k + 2], 255]; }
    throw new Error('ctype');
  };
}
