/** 
 * Procesing the image data for a valid WeChat MP article for upload.
 * 
 */
import { $t } from 'src/lang/i18n';
import { fetchImageBlob } from 'src/utils/utils';
import { WechatClient } from './../wechat-api/wechat-client';
import WeWritePlugin from 'src/main';
import { log } from 'console';
import { validateAndConvertImage } from 'src/utils/image-utils';
function imageFileName(mime:string){
    const type = mime.split('/')[1]
    return `image-${new Date().getTime()}.${type}`
}
export function svgToPng(svgData: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = img.width * dpr;
            canvas.height = img.height * dpr;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error($t('render.faild-canvas-context')));
                return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error($t('render.failed-to-convert-canvas-to-blob')));
                }
            }, 'image/png');
        };

        img.onerror = (error) => {
            reject(error);
        };

         const encoder = new TextEncoder();
         const uint8Array = encoder.encode(svgData);
         const latin1String = String.fromCharCode.apply(null, uint8Array);
         img.src = `data:image/svg+xml;base64,${btoa(latin1String)}`;
    });
}

function dataURLtoBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(';base64,');
	console.log('parts:', parts);
	
    const contentType = parts[0].split(':')[1];
	console.log('contentType', contentType);
	
    const raw = window.atob(parts[1]);
	console.log('raw:', raw);
    const rawLength = raw.length;

    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
	log('uInt8Array byteLength:', uInt8Array.byteLength);
    return new Blob([uInt8Array], { type: contentType });
}
export function getCanvasBlob(canvas: HTMLCanvasElement) {
    const pngDataUrl = canvas.toDataURL('image/png');
    const pngBlob = dataURLtoBlob(pngDataUrl);
    return pngBlob;
}

export async function uploadSVGs(root: HTMLElement, wechatClient: WechatClient){
    const svgs: SVGSVGElement[] = []
    root.querySelectorAll('svg').forEach(svg => {
        svgs.push(svg)
    })

    const uploadPromises = svgs.map(async (svg) => {
        const svgString = svg.outerHTML;
        if (svgString.length < 10000) {
            return
        }
        await svgToPng(svgString).then(async blob => {
            // 验证并转换图片格式
            const validatedBlob = await validateAndConvertImage(blob);
            await wechatClient.uploadMaterial(validatedBlob, imageFileName(validatedBlob.type)).then(res => {
                if (res){
                    svg.outerHTML = `<img src="${res.url}" />`
                }else{
                    console.error(`upload svg failed.`);
                }
            })
        })
    })
	
    await Promise.all(uploadPromises)
}
export async function uploadCanvas(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
    const canvases: HTMLCanvasElement[] = []
    
    root.querySelectorAll('canvas').forEach (canvas => {
        canvases.push(canvas)
    })
    
    const uploadPromises = canvases.map(async (canvas) => {
        const blob = getCanvasBlob(canvas);
        // 验证并转换图片格式
        const validatedBlob = await validateAndConvertImage(blob);
        await wechatClient.uploadMaterial(validatedBlob, imageFileName(validatedBlob.type)).then(res => {
            if (res){
                canvas.outerHTML = `<img src="${res.url}" />`
            }else{
            }
        })
    })
    await Promise.all(uploadPromises)
}

export async function uploadURLImage(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
    const images: HTMLImageElement[] = []
    
    root.querySelectorAll('img').forEach (img => {
        images.push(img)
    })
    
    const uploadPromises = images.map(async (img) => {
        let blob:Blob|undefined 
        if (img.src.includes('://mmbiz.qpic.cn/')){
            return;
        }
        else if (img.src.startsWith('data:image/')){
            blob = dataURLtoBlob(img.src);
        }else{
            // blob = await fetch(img.src).then(res => res.blob());
            blob = await fetchImageBlob(img.src)
            // try {
            //     const response = await requestUrl(img.src);
            //     if (!response.arrayBuffer) {
            //         console.error(`Failed to fetch image from ${img.src}`);
            //         return;
            //     }
            //     blob = new Blob([response.arrayBuffer]);
            // } catch (error) {
            //     console.error(`Error fetching image from ${img.src}:`, error);
            //     return;
            // }
        }
        
        if (blob === undefined){
            return
            
        }else{
            // 验证并转换图片格式
            const validatedBlob = await validateAndConvertImage(blob);
            await wechatClient.uploadMaterial(validatedBlob, imageFileName(validatedBlob.type)).then(res => {
                if (res){
                    img.src = res.url
                }else{
                    console.error(`upload image failed.`);
                    
                }
            })
        }
    })
    await Promise.all(uploadPromises)
}
// export async function uploadURLBackgroundImage(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
//     const bgEls: Map<string, HTMLElement>  = new Map()
//     root.querySelectorAll('*').forEach(el => {
// 		const style = window.getComputedStyle(el);
// 		const bg = style.getPropertyValue('background-image');
// 		console.log('uploadURLBGImage=>', bg);
// 		if (bg && bg !== 'none') {
// 			const match = bg.match(/url\(["']?(.*?)["']?\)/);
// 			if (match && match[1]) {
// 				bgEls.set(match[1], el as HTMLElement);
// 			}
// 		}
	
// 	});
//     console.log('-----------------------------------')
//     const uploadPromises = bgEls.forEach((async (el, src) => {
// 		log('uploadURLBGImage eachEls =>', src, el);
//         let blob:Blob|undefined 
//         if (src.includes('://mmbiz.qpic.cn/')){
//             return;
//         }
//         else if (src.startsWith('data:image/')){
// 			console.log('src=>', src);
			
//             blob = dataURLtoBlob(src);
//         }else{
//             // blob = await fetch(img.src).then(res => res.blob());
//             blob = await fetchImageBlob(src)
//         }
        
//         if (blob === undefined){
//             console.error(`upload image failed. blob is undefined.`);
//             return
            
//         }else{
// 			log('uploading blob...', blob.size, blob.type)
//             await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
//                 if (res){
//                     el.style.setProperty("background-image", `url("${res.url}")`)
//                 }else{
//                     console.error(`upload image failed.`);
                    
//                 }
//             })
//         }
//     }))
//     // await Promise.all(uploadPromises)
// }
export async function uploadURLVideo(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
    const videos: HTMLVideoElement[] = []
    
    root.querySelectorAll('video').forEach (video => {
        videos.push(video)
    })
    
    const uploadPromises = videos.map(async (video) => {
        let blob:Blob|undefined 
        if (video.src.includes('://mmbiz.qpic.cn/')){
            return;
        }
        else if (video.src.startsWith('data:image/')){
            blob = dataURLtoBlob(video.src);
        }else{
            blob = await fetchImageBlob(video.src)
        }
        
        if (blob === undefined){
            return
            
        }else{
			
            // 注意：视频文件不进行图片格式转换
            await wechatClient.uploadMaterial(blob, imageFileName(blob.type), 'video').then(async res => {
                if (res){
                    const video_info = await wechatClient.getMaterialById(res.media_id)
                    video.src = video_info.url
                }else{
                    console.error(`upload video failed.`);
                    
                }
            })
        }
    })
    await Promise.all(uploadPromises)
}
