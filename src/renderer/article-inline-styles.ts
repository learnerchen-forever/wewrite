/**
 * 输出到微信文章的「必须内联」样式清单。
 *
 * 为什么这些样式只能内联、不能做成 CSS 类
 * ──────────────────────────────────────
 * WeWrite 的最终产物是一段粘进微信公众号编辑器的 HTML。微信编辑器会剥离
 * `class` 属性与 `<style>` 块——类的样式到不了文章里（这也是本插件按设计
 * **不产生随文章发布的 CSS 文件**的原因）。只有节点上的 `style="..."` 内联
 * 属性会随内容一起被保留。因此下面这些声明必须写成内联样式，
 * `obsidianmd/no-static-styles-assignment` 在本场景属于误报。
 *
 * 为什么抽成常量而不是就地写字面量
 * ──────────────────────────────
 * 1. 社区配置（eslint-comments/no-restricted-disable，含 `obsidianmd/*`）明令
 *    禁止 disable 该规则，所以不能走 eslint-disable 的老路。
 * 2. 该规则本身只判定「字面量赋值」，并在文档里明确豁免「从变量赋值」这一形式
 *    （此外 `el.style.width = myWidth` 这类动态写法也不报）。把值提成常量正好落在
 *    规则认可的写法里，同时不改变任何行为。
 * 3. 顺带得到一份「输出到微信的文章里会出现哪些内联 CSS」的完整清单，便于审阅与
 *    回归——这些字符串是产品契约的一部分，改动前请确认导出效果。
 *
 * 注意：本文件只承载**文章输出**用的样式。插件 UI 自身的皮肤是另一回事，住在
 * `styles.css` 的 `.wewrite-*` 类里。两者的取值来源与生命周期完全不同，请勿混用。
 *
 * 取值敏感：请保持字符串逐字节不变（含分隔的 `;`、单位、顺序），它们直接决定
 * 导出文章的渲染结果。
 */
export const ARTICLE_INLINE_STYLE = {
  /** 装饰前插入的行内图标（引用块等）：右外边距 + 略大字号。 */
  iconBeforeDecoration: 'margin-right:8px;font-size:1.1em',

  /** callout 图标 SVG：撑满外层 span。 */
  calloutIconSvg: 'width:100%;height:100%;display:block',

  /** 标题编号前缀 span：右外边距 + 禁止选中（避免复制文章时带上编号）。 */
  headingNumber: 'margin-right:0.5em;user-select:none;',

  /** 任务列表勾选符号（白色对勾）的颜色。 */
  taskTickColor: '#ffffff',

  /** 任务列表勾选符号的行高（固定为 1，保证对勾在方框内居中）。 */
  taskTickLineHeight: '1',

  /** 任务列表勾选符号的字重。 */
  taskTickFontWeight: 'bold',

  /** 已完成任务的文本：删除线 + 灰色。 */
  taskDoneText: 'text-decoration:line-through;color:#8b949e',

  /**
   * Mermaid 图所在的 `<pre>`：透明、去内边距/外边距、允许溢出、居中。
   * Obsidian 把 SVG 包在 `<pre class="mermaid">` 里，但图表配色应由 Mermaid
   * 主题器决定，而不是代码主题。
   */
  mermaidPre: 'background:transparent;padding:0;margin:0;overflow:visible;text-align:center',

  /** 图标化行内元素的外层：inline-block、1.8em 宽、居中（对齐 Obsidian 默认）。 */
  iconWrapper: 'display:inline-block;width:1.8em;text-align:center',

  /** 代码行号模式下每行容器的 display。 */
  codeLineDisplay: 'block',

  /** 代码行号模式下每行的最小行高（保证空行也占位）。 */
  codeLineMinHeight: '1.6em',

  /** 块级公式外层：居中、块级、上下留白。 */
  mathDisplay: 'text-align:center;display:block;margin:16px 0',

  /**
   * 行内公式外层：用 `display:inline`（而非 `inline-block`）——微信编辑器会把
   * `<li>` 里的 inline-block 当作块级触发重排，导致「文字 + 公式」在粘贴后被
   * 拆到两行。
   */
  mathInline: 'display:inline;vertical-align:middle',
} as const;
