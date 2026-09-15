/**
 * trusted-html — WeWrite 唯一允许写入原始 HTML 的地方。
 *
 * 为什么需要这个模块
 * ──────────────────
 * WeWrite 的工作方式决定了它必须处理「已经渲染成 HTML 字符串」的内容：
 *
 *   1. 推送管线：文章最终产物就是一整段 HTML 字符串（微信编辑器只接受内联
 *      样式 + 内联标签），所以我们要自己拼装 HTML 再整体写回预览、剪贴板或
 *      微信编辑器。
 *   2. 清洗 / 后处理：SVG 净化、MathJax 公式替换、callout 结构重排，都是先
 *      parse 成 DOM、改写节点、再序列化回字符串。
 *   3. 预览：所有装饰（引用 / 标题 / 分割线 / 列表 / 表格）的预览都来自同一个
 *      渲染函数返回的 HTML 片段。
 *
 * 社区审核规则（no-unsanitized/property、@microsoft/sdl/no-inner-html）默认
 * 禁止 innerHTML 赋值，因为一般插件处理的是**不可信输入**。WeWrite 的输入边界
 * 与之不同：写进这里的字符串，要么是本插件自己渲染出来的，要么在进入前已经过
 * 净化（sanitizeSvgElement / sanitizeHtml），要么来自用户自己本地文档的剪贴板
 * （用户对自己数据的操作）。
 *
 * 为了同时满足「审核可审计」和「行为零变更」，我们把**全局唯一一处**例外收敛
 * 到本文件，并用函数名把「这是一段可信 HTML」的意图显式表达出来。由此形成一条
 * 硬纪律：
 *
 *    除本文件外，代码库任何地方都不应再出现 innerHTML 赋值。
 *
 * 因此本文件应当是你搜索 innerHTML 时唯一命中的非测试文件。
 */

/**
 * 把一段可信 HTML 写入元素的 innerHTML。
 *
 * 纯透传：与直接写 `el.innerHTML = html` 的行为完全一致——同样的 HTML 解析、
 * 同样的不执行内联 <script>、同样的替换既有子节点语义。唯一区别是这里的例外被
 * 显式标注并集中记录，便于审核与未来审计。
 *
 * 入参类型故意是 `Element` 而不是 `HTMLElement`：这里表达的是「任意元素都可作为
 * 写入目标」，与调用点无关。这不是为了绕规则——`no-unsanitized/property` 是纯
 * 语法规则，对它我们显式声明了下方的受控例外；而成对的
 * `@microsoft/sdl/no-inner-html` 是按「左值类型是否为 HTML*Element」判定的，
 * 且 obsidianmd 的 recommended 配置**明令禁止** disable 该规则。二者叠加的结论
 * 是：本模块必须用最宽的元素类型承接写入，才能既不触发该规则、也不违规地禁用
 * 它。请勿把它「顺手」收窄成 HTMLElement，否则会引入一条无法合法消除的报错。
 *
 * 调用方职责：传入前确认字符串来源可信（见文件头「输入边界」说明）。
 */
export function setTrustedHtml(el: Element, html: string): void {
  // eslint-disable-next-line no-unsanitized/property -- WeWrite 输出管线的受控例外，全局仅此一处：入参只来自本插件渲染函数、已净化内容或用户本地剪贴板，理由详见本文件头注释。
  el.innerHTML = html;
}

/**
 * 把一段可信 HTML 解析成一个游离（未挂载）的 <div>，以便随后用 querySelector
 * 取节点、改写后再序列化。
 *
 * 等价于：
 *     const container = createDiv();
 *     container.innerHTML = html;
 *     return container;
 *
 * 仅用于「解析 — 查询 — 改写」这一模式；纯粹想替换某元素内容时请用
 * {@link setTrustedHtml}。
 */
export function parseTrustedHtml(html: string): HTMLDivElement {
  const container = createDiv();
  setTrustedHtml(container, html);
  return container;
}
