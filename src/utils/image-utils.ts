/**
 * 图片格式验证和转换工具
 */

/**
 * 检查图片格式是否被支持
 * @param mimeType MIME类型，如 'image/jpeg', 'image/png' 等
 * @returns 如果格式被支持返回 true，否则返回 false
 */
export function isSupportedImageFormat(mimeType: string): boolean {
    const supportedFormats = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp'
    ];
    return supportedFormats.includes(mimeType.toLowerCase());
}

/**
 * 将不支持的图片格式转换为JPEG格式
 * @param blob 原始图片Blob
 * @returns 转换后的JPEG格式Blob
 */
export async function convertToJpeg(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        // 如果已经是JPEG格式，直接返回
        if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') {
            resolve(blob);
            return;
        }

        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error('无法获取canvas上下文'));
            return;
        }

        img.onload = () => {
            try {
                // 设置canvas尺寸为图片尺寸
                canvas.width = img.width;
                canvas.height = img.height;

                // 将图片绘制到canvas上
                ctx.drawImage(img, 0, 0);

                // 转换为JPEG格式的blob
                canvas.toBlob(
                    (jpegBlob) => {
                        if (jpegBlob) {
                            resolve(jpegBlob);
                        } else {
                            reject(new Error('转换为JPEG格式失败'));
                        }
                    },
                    'image/jpeg',
                    0.9 // JPEG质量
                );
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = (error) => {
            reject(error);
        };

        // 创建图片URL并加载
        img.src = URL.createObjectURL(blob);
    });
}

/**
 * 验证并转换图片格式
 * @param blob 图片Blob
 * @returns 验证并转换后的Blob，如果是不支持的格式则转换为JPEG
 */
export async function validateAndConvertImage(blob: Blob): Promise<Blob> {
    if (isSupportedImageFormat(blob.type)) {
        return blob;
    }

    // 如果格式不支持，则转换为JPEG
    return await convertToJpeg(blob);
}

/**
 * 从文件名获取MIME类型
 * @param filename 文件名
 * @returns MIME类型
 */
export function getMimeTypeFromFilename(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop() || '';
    const mimeTypes: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
        'svg': 'image/svg+xml'
    };

    return mimeTypes[extension] || 'application/octet-stream';
}