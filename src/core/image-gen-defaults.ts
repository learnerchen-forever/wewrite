// Shared defaults for AI image generation providers.
//
// Single source of truth so the settings UI, the settings schema migration and
// the API client all agree on the same model ids / endpoint templates.

/**
 * 阿里百炼 OpenAI-compatible 同步 API base URL 模板。
 * `{workspaceId}`（或 `{WorkspaceId}`）占位符会在调用时被替换为账号配置的
 * 业务空间 ID（万相 2.6 / 千问 3.0 必填）。
 */
export const ALI_MAAS_BASE_URL_TEMPLATE = 'https://{workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';

/**
 * 旧版 DashScope 异步任务端点（wanx2.x 文生图，已废弃）。
 * 仅用于识别存量账号并在加载时迁移到新的同步 API 模板。
 */
export const LEGACY_DASHSCOPE_ASYNC_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';

/** 万相 2.6 文生图模型（同步 images API）。 */
export const WAN_2_6_MODEL = 'wan2.6-t2i';
/** 旧版 wanx2.1 文生图模型（异步 API，已废弃）。 */
export const LEGACY_WANX_2_1_MODEL = 'wanx2.1-t2i-turbo';

/** 千问 3.0 文生图模型（chat.completions API）。 */
export const QWEN_IMAGE_MODEL_PRO = 'qwen-image-3.0-pro';
export const QWEN_IMAGE_MODEL_STD = 'qwen-image-3.0';

/** 字节 Seedream 5.0 模型（火山方舟 OpenAI 兼容 images API）。 */
export const SEEDREAM_5_0_PRO_MODEL = 'doubao-seedream-5-0-pro-260628';
export const SEEDREAM_5_0_LITE_MODEL = 'doubao-seedream-5-0-lite-260128';

/** 火山方舟 images/generations 端点。 */
export const ARK_IMAGES_GENERATIONS_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
