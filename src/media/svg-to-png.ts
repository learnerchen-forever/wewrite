// SVG to PNG buffer conversion — reuses svgStringToPng from diagram-renderer.

import { svgStringToPng } from './diagram-renderer';

export async function svgToPngBuffer(svgString: string, scale = 2): Promise<ArrayBuffer> {
  return svgStringToPng(svgString, scale);
}
