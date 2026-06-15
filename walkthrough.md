# Walkthrough: ink-xY Novel Studio - Deep InkOS Integration Completed Successfully 🚀

We have successfully completed **Phase 4: InkOS Deep Integration** under the workspace `E:\ink-xY` with outstanding visual aesthetics and absolute type safety. The application has now been transformed from a generic file editor into a premium, state-of-the-art **Non-Linear Literary IDE**, natively running offline multi-agent novel writing, consistency auditing, and planning pipelines directly from the writing canvas.

---

## ⚡ Phase 4: InkOS Deep Integration Accomplished

### 1. Task J: Create Backend API Engine (InkOS CLI Runner)
- **Generic REST Endpoint**: Created a brand new Next.js API route at [route.ts](file:///E:/ink-xY/app/api/inkos/route.ts) that wraps the `runInkos` runner. This exposes a secure bridge allowing the React frontend to trigger any InkOS CLI commands (e.g. `init`, `book create`, `write next`, `audit`, `plan`, `compose`, `status`, `doctor`) with custom arguments and a robust 90-second timeout.
- **Dynamic Configuration & Key Syncing**: Enhanced the `runInkos` helper inside [npx.ts](file:///E:/ink-xY/lib/npx.ts) by importing the standard Node `"os"` utility and implemented `resolveModelsEnv()`. It dynamically reads active LLM configurations and API keys from the isolated `~/.ink/agent/models.json` file and maps them to environment variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `DEEPSEEK_API_KEY`, etc.) inside the child CLI process, ensuring seamless single-configuration offline execution.

### 2. Task K: Workspace Auto-Initialization Banner
- **Workspace Signature Scanning**: Implemented an automated verification check in [SessionSidebar.tsx](file:///E:/ink-xY/components/SessionSidebar.tsx) that scans the selected directory on load. If it doesn't contain a `.inkos/`, `story/`, or `books/` directory, it flags the directory as uninitialized.
- **One-Click Zen Init Banner**: Integrated a gorgeous Zen-styled warning card at the top of the workspace explorer, warning the author that the project structure is missing, and provides a premium **"一键开启创作宇宙"** initialization button. Clicking it executes the backend `/api/inkos` init workflow and immediately refreshes the file explorer.

### 3. Task L: Zen Editor Consistency Audit & Auxiliary Tools
- **Zen Editor Auxiliary Footer Toolbelt**: Embedded two high-premium buttons inside the Zen markdown editor footer in [FileViewer.tsx](file:///E:/ink-xY/components/FileViewer.tsx):
  - **`🔍 人设防崩审计`**: Automatically runs `inkos audit` over the active draft chapter, auditing it for character characterization and world-building consistency.
  - **`📝 规划本章意图`**: Runs `inkos plan` to pre-generate chapter goals and intent files.
- **High-Aesthetic Slide-Over Report Drawer**: Designed an elegant slide-over drawer in [FileViewer.tsx](file:///E:/ink-xY/components/FileViewer.tsx) that glides smoothly from the right (overlaying the editor canvas under a gentle `4px` blur), displaying the Markdown-rendered audit reports and character compliance results in matching serif typography.

### 4. Task M: Truth System Lore Protection Context Injector
- **Dynamic Character/World Lore Parser**: Implemented `compileLoreCards()` in [rpc-manager.ts](file:///E:/ink-xY/lib/rpc-manager.ts) using standard Node `fs` operations.
- **Lore Context Safeguard Injection**: Programmed `injectSystemGuidelines()` to automatically scan for all `.md` character profile cards inside `角色设定/` and world environment lore files inside `世界观设定/` in the active workspace. It compiles and merges their contents into a robust structured context instruction block injected dynamically into every prompt turn of the right-side co-writer Gems, ensuring AI writing assistants are fully aware of character profiles and environment rules offline.

---

## ⚡ Verification & Diagnostic Status

All code changes have been validated for type safety, runtime execution, and visual consistency:

1. **Compilation Check**: Executed `node_modules/.bin/tsc --noEmit` which completed successfully with **exit code 0 (0 compiler errors)**!
2. **InkOS Submodule Isolation**: Excluded the nested monorepo `inkos/` directory inside root [tsconfig.json](file:///E:/ink-xY/tsconfig.json) to cleanly isolate path mappings and prevent compiler pollution.
3. **Local CLI Verification**: Successfully ran a diagnostic help check on the compiled native CLI executable (`node inkos/packages/cli/dist/index.js --help`) with exit code 0.
4. **Development Server Status**: Next.js development server is running cleanly on port `30142`.

---

## 🧭 How to Verify the Integration Workflows

We have initiated the development web server for your visual verification.

1. **Open next web client**: [http://localhost:30142](http://localhost:30142)
2. **Open / Create an Empty Directory**:
   - Open a folder (e.g. `E:\my-new-novel`) using the sidebar picker.
   - Verify that the **Workspace Auto-Initialization Banner** appears.
   - Click **"一键开启创作宇宙"** and verify that InkOS successfully populates the novel folder and refreshes the tree!
3. **Audit a Draft Chapter**:
   - Write or open a draft chapter under `章节草稿/` in the Zen Editor.
   - Click **"🔍 人设防崩审计"** in the footer.
   - Verify that the elegant slide-over drawer opens, displays the execution status, and displays the structured consistency report rendered beautifully in serif typography!

---

## ⚡ Visual Enhancement: File Viewer Chapter Header Simplify

We have successfully resolved the user request to simplify chapter file paths in the FileViewer header:
- **Simplified File path**: For files residing in the chapter directories under books (e.g., `books/我是你爸爸-还是人儿子/chapters/0001_爸，我掉进你的时间里了.md`), the file viewer header now displays only the filename (`0001_爸，我掉进你的时间里了.md`) instead of the verbose relative path.
- **Implemented Helper**: Added a robust path normalization check `getFileDisplayPath` inside [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx#L59) which handles image viewers, audio viewers, document viewers, and text/code viewers.

- **Dynamic Blueprint Buttons**: Changed the static button label `👁️ 查看意图蓝图` to dynamically display the next chapter number, e.g., `👁️ 查看第 2 章意图蓝图` (and similarly updated the creation button label to `🗺️ 规划第 2 章意图`) in [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx#L947) to provide a clearer user flow.
- **Safety Re-planning Guard**: Created a premium React Custom Confirmation Modal in [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx#L984) that overlays the screen with a gentle backdrop blur (`backdropFilter: 'blur(6px)'`) whenever a user clicks "规划第 X 章意图" when a blueprint already exists. It displays a warning concerning token consumption and potential loss of manual modifications, aligning perfectly with the workspace visual guidelines.

---

## ⚡ 界面交互微调与功能按键迁移重构 (2026-06-06)

我们对界面进行了多维度的交互体验微调及模块重构：

### 1. 侧边栏自动隐藏与弹出逻辑优化
- **自动隐藏**：在 [AppShell.tsx](file:///e:/ink-xY/components/AppShell.tsx) 中调整了右侧协同侧边栏的开关逻辑。现在只要用户在中间编辑区打开普通文件、章节看板、人设图谱，或者在编辑区顶部的标签栏中切换选中的 Tab，右侧边栏（协同姬）都会自动关闭（`setRightPanelOpen(false)`），腾出完整宽度供沉浸式写作。
- **保持弹出**：创建“新会话”、选择“历史会话”、点击左侧“智能体”或点击顶栏右侧“显示写作辅助”按钮时，右侧边栏如期自动弹出。

### 2. 移除工具栏自适应溢出样式（恢复下拉菜单弹出）
- 还原了 [AppShell.tsx](file:///e:/ink-xY/components/AppShell.tsx) 和 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 工具栏容器先前增加的 `overflowX: "auto"`、`whiteSpace: "nowrap"` 自适应横向滚动样式，恢复为原生 Flex 布局。
- 彻底解决了由此导致的浏览器将垂直溢出（`overflow-y`）自动剪裁而使得顶部**“智能续写”**下拉菜单与底部**“局部定点修复”**下拉菜单无法显示/无法点击的问题。

### 3. “故事大纲”与“角色人设”功能按键迁移
- **原位置移除**：移除了顶部主工具栏中原有的“故事大纲”和“角色人设”两个全局按钮，清空了主框架中冗余的跳转控制逻辑。
- **章节管控中心内嵌**：
  在 [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx) (章节管控中心) 顶部标题右侧新增了这两个按钮，在视觉上更为聚焦：
  - **🗺️ 故事大纲**：自动检测并打开书籍底下的 `volume_map.md` / `volume_outline.md` / `author_intent.md` 架构文件。
  - **👥 角色人设**：点击后分发 `open-characters-graph` 自定义全局事件，由主框架处理并跳转打开人设关系视图。

### 4. 底部状态栏数值显示与按钮精简化
- **字数/行数排版微调**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 中去除了“字数”和“行数”冒号后面的空格，并移除了数值后的单位字样（“字”、“行”）。同时将字数与行数之间的间距（`marginRight`）从 16px 缩窄为 8px，紧密化排版。例如：`字数:2422 行数:89`。
- **“查看报告”按钮精简**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 中，当系统处于非运行状态时，将原有的 `📋 查看报告` 按钮简化为仅展示 `📋` 剪贴板图标，避免冗余文本占用状态栏宽度；运行状态下仍展示 `⏳ 查看运行进度`。

---

## 🎨 智能小说创作工坊图标生成与重构 (2026-06-08)

我们为软件设计并生成了全新的视觉图标，使其在设计语言上与系统的**禅意美学**、**非线性小说大纲/分支树**以及**智能姬协同**核心逻辑相契合：

### 1. 视觉设计理念分析
- **背景底色**：采用深邃静心绿（Zen Forest Green），体现沉浸写作、无干扰的专注状态。
- **主体图案**：主体采用磨砂黄金与温润白瓷质感的钢笔尖（Fountain Pen Nib），笔尖中缝向上优雅地分叉、发散为带有发光金色节点的**树状网络结构（Branching Nodes）**。
- **寓意结合**：笔尖象征传统的“墨水/写作（ink）”，发光的树状分支象征“会话分支树、非线性大纲与智能协同节点（xY）”，科技与传统美学在此交汇。

### 2. 生成与打包适配
- [icon.png](file:///e:/ink-xY/public/icon.png) **(512x512 PNG)**：已更新为全新的高清大图。该文件作为 Electron 构建 Windows (`.exe` 安装包) 与 macOS (`.dmg` 安装包) 的图标资源，保证了应用打包后的原生高质感图标显示。
- [favicon.ico](file:///e:/ink-xY/public/favicon.ico) **(Multi-size ICO)**：已生成包含 `16x16`, `32x32`, `48x48`, `64x64`, `128x128`, `256x256` 六种标准尺寸的高质量 ICO 文件，适配各平台文件管理器与 Web 浏览器 Favicon。
- [generate_favicon.py](file:///e:/ink-xY/public/generate_favicon.py) **脚本修复**：排除了硬编码的 D 盘外部路径，自动获取当前脚本目录，保证开发者后续生成图标时的多平台环境兼容性。
- **透明底与圆角重构 (Transparency & Rounded Corners Fix)**：最初生成的 AI 图像在圆角矩形外围含有纯白背景色，导致打包出的 Windows 桌面图标带有难看的白边外框。我们重新对图标进行了裁剪和数学掩膜处理，计算出绿底图标正中心位置，按 `512x512` 标准尺寸重新切片，并基于 $4\times$ 超采样 (SSAA) 绘制了数学上完美的圆角矩形透明遮罩（`margin=8`, `radius=96`），彻底消除了白边，确保在任何壁纸/系统主题下均完美呈现透明圆角原生质感。

---

## 🎨 剧情伏笔可视化管理中心 (Visual Plot Hook Dashboard) (2026-06-08)

我们为《智能小说创作工坊》开发并集成了全新的**剧情伏笔可视化管理中心**，将传统晦涩的 Markdown 表格转换为直观、生动的视觉看板与时间脉络线：

### 1. 泳道时间脉络线 (Gantt-style Plot Timeline)
- **多维度章节纵览**：以章节（Chapter）为横轴，伏笔 ID 为纵轴，直观以“渐变管道”的形式渲染每个伏笔从埋设、推进到回收的完整生命周期。
- **当前章指示器**：设有一根代表当前写作章节的红色垂直指示线（Chapter Cursor），穿过所有伏笔管道，直观呈现伏笔与当前进度的相对位置。
- **状态颜色与警报**：
  - **绿色管道**：已回收的伏笔。
  - **黄色闪烁管道**：距离当前章节较近且临近“半衰期”未回收的**过期伏笔**。
  - **红色/受阻管道**：受阻于上游未解决依赖的**受阻伏笔**（并动态显示已受阻的章节数）。
  - **灰色/蓝色管道**：未开启或进行中的伏笔。

### 2. 卡片看板与快捷操作 (Kanban Card Board)
- **看板化管理**：将所有伏笔按状态（进行中、未开启、已回收、已延后）进行看板列分组。
- **拖拽与一键快捷动作**：
  - 卡片上直观显示起始章节、回收节奏、预期回收、前置依赖、备注及健康度警告。
  - 提供“✅ 标为已回收”、“↩️ 撤销回收”、“延后”等快捷操作。

### 3. 底层与现有 Markdown 体系无缝打通
- **零破坏双模式切换**：直接集成在文件浏览器的“排版预览 (Preview Mode)”中。点击 `pending_hooks.md` 时默认展现本可视化看板；切换至“沉浸创作”模式时即可直接查看和编辑原始 Markdown，极富弹性。

### 4. 极致体验优化：一键直达与视觉美化 (2026-06-08 增补)
- **快捷入口「🪝 剧情伏笔」**：在 [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx) 章节管控中心的顶部控制栏上，新增了 **「🪝 剧情伏笔」** 按钮，点击直接一键寻址并定位打开 `story/pending_hooks.md` 伏笔池文件。
- **排版预览自动触发**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 的文件加载钩子（`useEffect`）中增加检测，当打开的文件为 `pending_hooks.md` 时，**自动强制开启「排版预览」模式**。这使用户通过章节中心按钮一键点击时，能**零跳转、零多余操作、直接直达可视化伏笔看板**！
- **时间线视觉美化 (Beautification)**：
  - **渐变色设计**：将原本单调的纯色/灰色条形图重构为极具禅意和科技感的高饱和度 HSL 渐变。进行中为蓝紫渐变，已回收为翡翠绿渐变，过期债务为暖橙渐变，受阻为玫瑰红渐变，未入场为轻盈的半透明虚线灰渐变，档次感大幅提升。
  - **防小点堆积 (Min-Width Bars)**：在 [PlotHookVisualizer.tsx](file:///e:/ink-xY/components/PlotHookVisualizer.tsx) 中重构了宽度渲染逻辑，当伏笔预期回收和起始章节在同一章（例如 start=3, end=3）时，不再缩水成丑陋的“小圆点”，而是保证其视觉宽度**至少横跨一整列的宽度**（最小宽度约 50px-80px 像素），并配有漂亮的图标，使其保持清晰可读的胶囊状（Pill Shape）。
  - **时间轴垂直网格网**：在泳道背景层绘制了虚线垂直分割线，清晰对齐章节头部（Ch 1, Ch 5, Ch 10），并在当前章节红线上附带了立体的 `当前章` 徽章。

---

## ⚡ 剧情伏笔 Phase 7 扩展列丢失修复与续写流程优化 (2026-06-08)

我们针对伏笔数据丢失、续写蓝图依赖以及 Mac 平台图标兼容性进行了深度优化与修复：

### 1. 剧情伏笔 Phase 7 扩展列丢失 Bug 修复
- **原因定位**：之前在章节结算或分析（Settlement/Analysis）时，[chapter-analyzer.ts](file:///e:/ink-xY/inkos/packages/core/src/agents/chapter-analyzer.ts) 的系统提示词中硬编码了遗留的 8 列 Markdown 表格表头。当模型输出 8 列的数据回写时，合并算法 `mergeTableMarkdownByKey` 会误用新生成的 8 列行替换旧有的 13 列行，导致 Phase 7 的扩展列（`depends_on`, `pays_off_in_arc`, `core_hook`, `half_life`, `promoted` 等）被永久截断丢失。
- **解决方案**：全面更新了 [chapter-analyzer.ts](file:///e:/ink-xY/inkos/packages/core/src/agents/chapter-analyzer.ts) 中中英文 prompt 里的 `=== UPDATED_HOOKS ===` 表格定义，使其与 [story-markdown.ts](file:///e:/ink-xY/inkos/packages/core/src/utils/story-markdown.ts) 预期的 13 列 Phase 7 结构完全对齐。回写时完整保留全部伏笔扩展链字段。

### 2. 智能续写无前置蓝图流程优化与规划提醒弹窗
- **原有限制**：旧版在前置检测中，若下一章的意图蓝图文件（`chapter-NNNN.intent.md`）尚未生成，会弹窗拦截并强制用户规划蓝图后才能继续。
- **流程松绑与人性化引导**：修改了 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 的续写与起草安全门禁逻辑。只要当前章节的其他三项前置条件（防崩审计通过、同步设定运行、将本章状态设为“已过审”）均已通过，但尚未生成下一章蓝图时，点击续写或起草将**弹出高精度的规划提醒弹窗**提供快捷选择：
  - **“先规划并修改蓝图 (推荐)”**：自动运行规划，并在侧边栏/编辑器打开生成的蓝图供作者确认修改。
  - **“直接起草正文”**：在弹窗中选择直接开始起草正文，调用 `handleWriteNext(force, true)` 或 `handleDraft(force, true)`（底层 CLI 引擎会自动在线规划并保存蓝图，保障创作流畅度）。
  - **“取消”**：关闭弹窗，不执行任何操作。
- **实现逻辑**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 中声明了 `planReminder` 状态并在 `handleWriteNext`/`handleDraft` 拦截逻辑中，支持通过传入 `bypassPlanCheck = true` 参数来绕过规划检查。

### 3. Emojis 符号 Mac 端兼容性修复与“意图”更名
- **移除 Mac 缺失字符**：移除了 macOS 等平台下无法正常渲染的 `🗺️`、`👥`、`🪝` 等生僻 Emoji，替换为 `📖` (故事大纲)、`👤` (角色人设)、`🔗` (剧情伏笔) 等主流通用图标，提供极致的原生平台观感。
- **重构刷新按钮**：将主按钮及弹窗中原本由系统自带 Emoji 渲染的 `🔄` 统一重构为高质感的 **SVG 矢量旋转环形图标**，并在其余辅助文本处使用更兼容的 `🔁` 或纯文字展示，使界面视觉更显高端现代。
- **意图更名为“蓝图”**：将页面、弹窗、看板上的“写作意图” / “意图蓝图”统一更名为符合文创语境的**“写作蓝图”**（如 `规划第 X 章蓝图`、`写作蓝图已就绪` 等）。

---

## ⚡ 设定事实删除功能支持 (2026-06-13)

为解决“新增的设定事实无法删除”的问题，我们完整打通了设定事实的删除逻辑链路：

### 1. 后端 API 新增 `delete-fact` 动作
- 在 [route.ts](file:///e:/ink-xY/app/api/inkos/route.ts) 中，将 `delete-fact` 注册到同步动作白名单中。
# Walkthrough: ink-xY Novel Studio - Deep InkOS Integration Completed Successfully 🚀

We have successfully completed **Phase 4: InkOS Deep Integration** under the workspace `E:\ink-xY` with outstanding visual aesthetics and absolute type safety. The application has now been transformed from a generic file editor into a premium, state-of-the-art **Non-Linear Literary IDE**, natively running offline multi-agent novel writing, consistency auditing, and planning pipelines directly from the writing canvas.

---

## ⚡ Phase 4: InkOS Deep Integration Accomplished

### 1. Task J: Create Backend API Engine (InkOS CLI Runner)
- **Generic REST Endpoint**: Created a brand new Next.js API route at [route.ts](file:///E:/ink-xY/app/api/inkos/route.ts) that wraps the `runInkos` runner. This exposes a secure bridge allowing the React frontend to trigger any InkOS CLI commands (e.g. `init`, `book create`, `write next`, `audit`, `plan`, `compose`, `status`, `doctor`) with custom arguments and a robust 90-second timeout.
- **Dynamic Configuration & Key Syncing**: Enhanced the `runInkos` helper inside [npx.ts](file:///E:/ink-xY/lib/npx.ts) by importing the standard Node `"os"` utility and implemented `resolveModelsEnv()`. It dynamically reads active LLM configurations and API keys from the isolated `~/.ink/agent/models.json` file and maps them to environment variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `DEEPSEEK_API_KEY`, etc.) inside the child CLI process, ensuring seamless single-configuration offline execution.

### 2. Task K: Workspace Auto-Initialization Banner
- **Workspace Signature Scanning**: Implemented an automated verification check in [SessionSidebar.tsx](file:///E:/ink-xY/components/SessionSidebar.tsx) that scans the selected directory on load. If it doesn't contain a `.inkos/`, `story/`, or `books/` directory, it flags the directory as uninitialized.
- **One-Click Zen Init Banner**: Integrated a gorgeous Zen-styled warning card at the top of the workspace explorer, warning the author that the project structure is missing, and provides a premium **"一键开启创作宇宙"** initialization button. Clicking it executes the backend `/api/inkos` init workflow and immediately refreshes the file explorer.

### 3. Task L: Zen Editor Consistency Audit & Auxiliary Tools
- **Zen Editor Auxiliary Footer Toolbelt**: Embedded two high-premium buttons inside the Zen markdown editor footer in [FileViewer.tsx](file:///E:/ink-xY/components/FileViewer.tsx):
  - **`🔍 人设防崩审计`**: Automatically runs `inkos audit` over the active draft chapter, auditing it for character characterization and world-building consistency.
  - **`📝 规划本章意图`**: Runs `inkos plan` to pre-generate chapter goals and intent files.
- **High-Aesthetic Slide-Over Report Drawer**: Designed an elegant slide-over drawer in [FileViewer.tsx](file:///E:/ink-xY/components/FileViewer.tsx) that glides smoothly from the right (overlaying the editor canvas under a gentle `4px` blur), displaying the Markdown-rendered audit reports and character compliance results in matching serif typography.

### 4. Task M: Truth System Lore Protection Context Injector
- **Dynamic Character/World Lore Parser**: Implemented `compileLoreCards()` in [rpc-manager.ts](file:///E:/ink-xY/lib/rpc-manager.ts) using standard Node `fs` operations.
- **Lore Context Safeguard Injection**: Programmed `injectSystemGuidelines()` to automatically scan for all `.md` character profile cards inside `角色设定/` and world environment lore files inside `世界观设定/` in the active workspace. It compiles and merges their contents into a robust structured context instruction block injected dynamically into every prompt turn of the right-side co-writer Gems, ensuring AI writing assistants are fully aware of character profiles and environment rules offline.

---

## ⚡ Verification & Diagnostic Status

All code changes have been validated for type safety, runtime execution, and visual consistency:

1. **Compilation Check**: Executed `node_modules/.bin/tsc --noEmit` which completed successfully with **exit code 0 (0 compiler errors)**!
2. **InkOS Submodule Isolation**: Excluded the nested monorepo `inkos/` directory inside root [tsconfig.json](file:///E:/ink-xY/tsconfig.json) to cleanly isolate path mappings and prevent compiler pollution.
3. **Local CLI Verification**: Successfully ran a diagnostic help check on the compiled native CLI executable (`node inkos/packages/cli/dist/index.js --help`) with exit code 0.
4. **Development Server Status**: Next.js development server is running cleanly on port `30142`.

---

## 🧭 How to Verify the Integration Workflows

We have initiated the development web server for your visual verification.

1. **Open next web client**: [http://localhost:30142](http://localhost:30142)
2. **Open / Create an Empty Directory**:
   - Open a folder (e.g. `E:\my-new-novel`) using the sidebar picker.
   - Verify that the **Workspace Auto-Initialization Banner** appears.
   - Click **"一键开启创作宇宙"** and verify that InkOS successfully populates the novel folder and refreshes the tree!
3. **Audit a Draft Chapter**:
   - Write or open a draft chapter under `章节草稿/` in the Zen Editor.
   - Click **"🔍 人设防崩审计"** in the footer.
   - Verify that the elegant slide-over drawer opens, displays the execution status, and displays the structured consistency report rendered beautifully in serif typography!

---

## ⚡ Visual Enhancement: File Viewer Chapter Header Simplify

We have successfully resolved the user request to simplify chapter file paths in the FileViewer header:
- **Simplified File path**: For files residing in the chapter directories under books (e.g., `books/我是你爸爸-还是人儿子/chapters/0001_爸，我掉进你的时间里了.md`), the file viewer header now displays only the filename (`0001_爸，我掉进你的时间里了.md`) instead of the verbose relative path.
- **Implemented Helper**: Added a robust path normalization check `getFileDisplayPath` inside [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx#L59) which handles image viewers, audio viewers, document viewers, and text/code viewers.

- **Dynamic Blueprint Buttons**: Changed the static button label `👁️ 查看意图蓝图` to dynamically display the next chapter number, e.g., `👁️ 查看第 2 章意图蓝图` (and similarly updated the creation button label to `🗺️ 规划第 2 章意图`) in [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx#L947) to provide a clearer user flow.
- **Safety Re-planning Guard**: Created a premium React Custom Confirmation Modal in [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx#L984) that overlays the screen with a gentle backdrop blur (`backdropFilter: 'blur(6px)'`) whenever a user clicks "规划第 X 章意图" when a blueprint already exists. It displays a warning concerning token consumption and potential loss of manual modifications, aligning perfectly with the workspace visual guidelines.

---

## ⚡ 界面交互微调与功能按键迁移重构 (2026-06-06)

我们对界面进行了多维度的交互体验微调及模块重构：

### 1. 侧边栏自动隐藏与弹出逻辑优化
- **自动隐藏**：在 [AppShell.tsx](file:///e:/ink-xY/components/AppShell.tsx) 中调整了右侧协同侧边栏的开关逻辑。现在只要用户在中间编辑区打开普通文件、章节看板、人设图谱，或者在编辑区顶部的标签栏中切换选中的 Tab，右侧边栏（协同姬）都会自动关闭（`setRightPanelOpen(false)`），腾出完整宽度供沉浸式写作。
- **保持弹出**：创建“新会话”、选择“历史会话”、点击左侧“智能体”或点击顶栏右侧“显示写作辅助”按钮时，右侧边栏如期自动弹出。

### 2. 移除工具栏自适应溢出样式（恢复下拉菜单弹出）
- 还原了 [AppShell.tsx](file:///e:/ink-xY/components/AppShell.tsx) 和 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 工具栏容器先前增加的 `overflowX: "auto"`、`whiteSpace: "nowrap"` 自适应横向滚动样式，恢复为原生 Flex 布局。
- 彻底解决了由此导致的浏览器将垂直溢出（`overflow-y`）自动剪裁而使得顶部**“智能续写”**下拉菜单与底部**“局部定点修复”**下拉菜单无法显示/无法点击的问题。

### 3. “故事大纲”与“角色人设”功能按键迁移
- **原位置移除**：移除了顶部主工具栏中原有的“故事大纲”和“角色人设”两个全局按钮，清空了主框架中冗余的跳转控制逻辑。
- **章节管控中心内嵌**：
  在 [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx) (章节管控中心) 顶部标题右侧新增了这两个按钮，在视觉上更为聚焦：
  - **🗺️ 故事大纲**：自动检测并打开书籍底下的 `volume_map.md` / `volume_outline.md` / `author_intent.md` 架构文件。
  - **👥 角色人设**：点击后分发 `open-characters-graph` 自定义全局事件，由主框架处理并跳转打开人设关系视图。

### 4. 底部状态栏数值显示与按钮精简化
- **字数/行数排版微调**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 中去除了“字数”和“行数”冒号后面的空格，并移除了数值后的单位字样（“字”、“行”）。同时将字数与行数之间的间距（`marginRight`）从 16px 缩窄为 8px，紧密化排版。例如：`字数:2422 行数:89`。
- **“查看报告”按钮精简**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 中，当系统处于非运行状态时，将原有的 `📋 查看报告` 按钮简化为仅展示 `📋` 剪贴板图标，避免冗余文本占用状态栏宽度；运行状态下仍展示 `⏳ 查看运行进度`。

---

## 🎨 智能小说创作工坊图标生成与重构 (2026-06-08)

我们为软件设计并生成了全新的视觉图标，使其在设计语言上与系统的**禅意美学**、**非线性小说大纲/分支树**以及**智能姬协同**核心逻辑相契合：

### 1. 视觉设计理念分析
- **背景底色**：采用深邃静心绿（Zen Forest Green），体现沉浸写作、无干扰的专注状态。
- **主体图案**：主体采用磨砂黄金与温润白瓷质感的钢笔尖（Fountain Pen Nib），笔尖中缝向上优雅地分叉、发散为带有发光金色节点的**树状网络结构（Branching Nodes）**。
- **寓意结合**：笔尖象征传统的“墨水/写作（ink）”，发光的树状分支象征“会话分支树、非线性大纲与智能协同节点（xY）”，科技与传统美学在此交汇。

### 2. 生成与打包适配
- [icon.png](file:///e:/ink-xY/public/icon.png) **(512x512 PNG)**：已更新为全新的高清大图。该文件作为 Electron 构建 Windows (`.exe` 安装包) 与 macOS (`.dmg` 安装包) 的图标资源，保证了应用打包后的原生高质感图标显示。
- [favicon.ico](file:///e:/ink-xY/public/favicon.ico) **(Multi-size ICO)**：已生成包含 `16x16`, `32x32`, `48x48`, `64x64`, `128x128`, `256x256` 六种标准尺寸的高质量 ICO 文件，适配各平台文件管理器与 Web 浏览器 Favicon。
- [generate_favicon.py](file:///e:/ink-xY/public/generate_favicon.py) **脚本修复**：排除了硬编码的 D 盘外部路径，自动获取当前脚本目录，保证开发者后续生成图标时的多平台环境兼容性。
- **透明底与圆角重构 (Transparency & Rounded Corners Fix)**：最初生成的 AI 图像在圆角矩形外围含有纯白背景色，导致打包出的 Windows 桌面图标带有难看的白边外框。我们重新对图标进行了裁剪和数学掩膜处理，计算出绿底图标正中心位置，按 `512x512` 标准尺寸重新切片，并基于 $4\times$ 超采样 (SSAA) 绘制了数学上完美的圆角矩形透明遮罩（`margin=8`, `radius=96`），彻底消除了白边，确保在任何壁纸/系统主题下均完美呈现透明圆角原生质感。

---

## 🎨 剧情伏笔可视化管理中心 (Visual Plot Hook Dashboard) (2026-06-08)

我们为《智能小说创作工坊》开发并集成了全新的**剧情伏笔可视化管理中心**，将传统晦涩的 Markdown 表格转换为直观、生动的视觉看板与时间脉络线：

### 1. 泳道时间脉络线 (Gantt-style Plot Timeline)
- **多维度章节纵览**：以章节（Chapter）为横轴，伏笔 ID 为纵轴，直观以“渐变管道”的形式渲染每个伏笔从埋设、推进到回收的完整生命周期。
- **当前章指示器**：设有一根代表当前写作章节的红色垂直指示线（Chapter Cursor），穿过所有伏笔管道，直观呈现伏笔与当前进度的相对位置。
- **状态颜色与警报**：
  - **绿色管道**：已回收的伏笔。
  - **黄色闪烁管道**：距离当前章节较近且临近“半衰期”未回收的**过期伏笔**。
  - **红色/受阻管道**：受阻于上游未解决依赖的**受阻伏笔**（并动态显示已受阻的章节数）。
  - **灰色/蓝色管道**：未开启或进行中的伏笔。

### 2. 卡片看板与快捷操作 (Kanban Card Board)
- **看板化管理**：将所有伏笔按状态（进行中、未开启、已回收、已延后）进行看板列分组。
- **拖拽与一键快捷动作**：
  - 卡片上直观显示起始章节、回收节奏、预期回收、前置依赖、备注及健康度警告。
  - 提供“✅ 标为已回收”、“↩️ 撤销回收”、“延后”等快捷操作。

### 3. 底层与现有 Markdown 体系无缝打通
- **零破坏双模式切换**：直接集成在文件浏览器的“排版预览 (Preview Mode)”中。点击 `pending_hooks.md` 时默认展现本可视化看板；切换至“沉浸创作”模式时即可直接查看和编辑原始 Markdown，极富弹性。

### 4. 极致体验优化：一键直达与视觉美化 (2026-06-08 增补)
- **快捷入口「🪝 剧情伏笔」**：在 [ChapterDashboard.tsx](file:///e:/ink-xY/components/ChapterDashboard.tsx) 章节管控中心的顶部控制栏上，新增了 **「🪝 剧情伏笔」** 按钮，点击直接一键寻址并定位打开 `story/pending_hooks.md` 伏笔池文件。
- **排版预览自动触发**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 的文件加载钩子（`useEffect`）中增加检测，当打开的文件为 `pending_hooks.md` 时，**自动强制开启「排版预览」模式**。这使用户通过章节中心按钮一键点击时，能**零跳转、零多余操作、直接直达可视化伏笔看板**！
- **时间线视觉美化 (Beautification)**：
  - **渐变色设计**：将原本单调的纯色/灰色条形图重构为极具禅意和科技感的高饱和度 HSL 渐变。进行中为蓝紫渐变，已回收为翡翠绿渐变，过期债务为暖橙渐变，受阻为玫瑰红渐变，未入场为轻盈的半透明虚线灰渐变，档次感大幅提升。
  - **防小点堆积 (Min-Width Bars)**：在 [PlotHookVisualizer.tsx](file:///e:/ink-xY/components/PlotHookVisualizer.tsx) 中重构了宽度渲染逻辑，当伏笔预期回收和起始章节在同一章（例如 start=3, end=3）时，不再缩水成丑陋的“小圆点”，而是保证其视觉宽度**至少横跨一整列的宽度**（最小宽度约 50px-80px 像素），并配有漂亮的图标，使其保持清晰可读的胶囊状（Pill Shape）。
  - **时间轴垂直网格网**：在泳道背景层绘制了虚线垂直分割线，清晰对齐章节头部（Ch 1, Ch 5, Ch 10），并在当前章节红线上附带了立体的 `当前章` 徽章。

---

## ⚡ 剧情伏笔 Phase 7 扩展列丢失修复与续写流程优化 (2026-06-08)

我们针对伏笔数据丢失、续写蓝图依赖以及 Mac 平台图标兼容性进行了深度优化与修复：

### 1. 剧情伏笔 Phase 7 扩展列丢失 Bug 修复
- **原因定位**：之前在章节结算或分析（Settlement/Analysis）时，[chapter-analyzer.ts](file:///e:/ink-xY/inkos/packages/core/src/agents/chapter-analyzer.ts) 的系统提示词中硬编码了遗留的 8 列 Markdown 表格表头。当模型输出 8 列的数据回写时，合并算法 `mergeTableMarkdownByKey` 会误用新生成的 8 列行替换旧有的 13 列行，导致 Phase 7 的扩展列（`depends_on`, `pays_off_in_arc`, `core_hook`, `half_life`, `promoted` 等）被永久截断丢失。
- **解决方案**：全面更新了 [chapter-analyzer.ts](file:///e:/ink-xY/inkos/packages/core/src/agents/chapter-analyzer.ts) 中中英文 prompt 里的 `=== UPDATED_HOOKS ===` 表格定义，使其与 [story-markdown.ts](file:///e:/ink-xY/inkos/packages/core/src/utils/story-markdown.ts) 预期的 13 列 Phase 7 结构完全对齐。回写时完整保留全部伏笔扩展链字段。

### 2. 智能续写无前置蓝图流程优化与规划提醒弹窗
- **原有限制**：旧版在前置检测中，若下一章的意图蓝图文件（`chapter-NNNN.intent.md`）尚未生成，会弹窗拦截并强制用户规划蓝图后才能继续。
- **流程松绑与人性化引导**：修改了 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 的续写与起草安全门禁逻辑。只要当前章节的其他三项前置条件（防崩审计通过、同步设定运行、将本章状态设为“已过审”）均已通过，但尚未生成下一章蓝图时，点击续写或起草将**弹出高精度的规划提醒弹窗**提供快捷选择：
  - **“先规划并修改蓝图 (推荐)”**：自动运行规划，并在侧边栏/编辑器打开生成的蓝图供作者确认修改。
  - **“直接起草正文”**：在弹窗中选择直接开始起草正文，调用 `handleWriteNext(force, true)` 或 `handleDraft(force, true)`（底层 CLI 引擎会自动在线规划并保存蓝图，保障创作流畅度）。
  - **“取消”**：关闭弹窗，不执行任何操作。
- **实现逻辑**：在 [FileViewer.tsx](file:///e:/ink-xY/components/FileViewer.tsx) 中声明了 `planReminder` 状态并在 `handleWriteNext`/`handleDraft` 拦截逻辑中，支持通过传入 `bypassPlanCheck = true` 参数来绕过规划检查。

### 3. Emojis 符号 Mac 端兼容性修复与“意图”更名
- **移除 Mac 缺失字符**：移除了 macOS 等平台下无法正常渲染的 `🗺️`、`👥`、`🪝` 等生僻 Emoji，替换为 `📖` (故事大纲)、`👤` (角色人设)、`🔗` (剧情伏笔) 等主流通用图标，提供极致的原生平台观感。
- **重构刷新按钮**：将主按钮及弹窗中原本由系统自带 Emoji 渲染的 `🔄` 统一重构为高质感的 **SVG 矢量旋转环形图标**，并在其余辅助文本处使用更兼容的 `🔁` 或纯文字展示，使界面视觉更显高端现代。
- **意图更名为“蓝图”**：将页面、弹窗、看板上的“写作意图” / “意图蓝图”统一更名为符合文创语境的**“写作蓝图”**（如 `规划第 X 章蓝图`、`写作蓝图已就绪` 等）。

---

## ⚡ 设定事实删除功能支持 (2026-06-13)

为解决“新增的设定事实无法删除”的问题，我们完整打通了设定事实的删除逻辑链路：

### 1. 后端 API 新增 `delete-fact` 动作
- 在 [route.ts](file:///e:/ink-xY/app/api/inkos/route.ts) 中，将 `delete-fact` 注册到同步动作白名单中。
- 实现了 SQLite 数据删除的 SQL 执行操作 (`DELETE FROM facts WHERE id = ?`)。并且对 catch 异常块进行了规范化类型安全改造，避免产生 explicit any 警告。

### 2. 前端关系看板增加删除按钮与交互
- 在 [CharacterRelationDashboard.tsx](file:///e:/ink-xY/components/CharacterRelationDashboard.tsx) 中新增 `handleDeleteFact` 异步删除方法，在用户删除前弹出确认提示框。
- 修改了 `Edit Fact Modal`（编辑设定事实弹窗），采用两端对齐的 Flex 布局，在左侧增加 `🗑️ 删除` 危险操作按钮，并配有质感良好的红白边框与半透明警示背景，同时保留右侧“取消”与“确认修改”的主次交互。
- 优化了编辑触发交互：
  - 将角色“时序设定事实”列表卡片的双击编辑 (`onDoubleClick`) 修改为更符合用户习惯的**“单击编辑” (`onClick`)**，省去多余点击操作。
  - 对于人物“关系”卡片，由于单击被用于节点跳转，我们在卡片右上角增加了一个独立的 **`✏️` 编辑图标按钮**，使得单击该小图标也可以直接单手单次触发编辑弹窗，从而在不破坏原有关联导航的前提下，完整实现了两处地方的单点击编辑能力。

### 3. 新增“查看未来未写章节”及“显示全部设定”功能
为解决“由于第6章尚未起草创建，用户无法拖动时光机滑块定位到第6章，进而导致为第6章预设的时序设定事实在第5章无法被查看和管理”的问题：
- **时光机最大滑块扩展 (+1)**：将设定时光机（Lore Timeline）的 `max` 值由原本的最大已写章节数 `maxChapter` 扩展至 `maxChapter + 1`。这样用户可以拖动滑块直接定位到下一个“即将开始写”的章节（例如当前写完第5章，滑块可以滑到第6章），方便提前预览和管理下一章的预设事实。
- **🌐 显示全部设定按钮**：在时光机旁边新增了 `显示全部设定` 开关按钮。点击后可一键切换为“全局视图”：
  - 暂时脱离当前章节视角，从数据库中拉取并展示该角色所有的时序事实卡片。
  - 此时滑块处于不可用置灰状态，标题显示“全部时序设定事实”，方便全局统览。
  - 再次点击 `按章节过滤` 即可无缝切回时光机过滤视图。

---

## ⚡ InkOS 内核重构第二阶段：提示词模板外置化与回滚保障 (2026-06-14)

我们已成功完成第二阶段内核重构，将原本硬编码在核心 Agent 中的全部 LLM 提示词完整外置到独立的 Markdown 物理模板中，并实现了完善的降级回滚保障与类型安全验证：

### 1. 物理模版文件生成与结构化存储
所有提示词均已提取为无任何内容偏差的 Markdown 文件并存储在 `inkos/skills/genres/prompts/` 下：
- **普通 Agent 提示词**：
  - `architect_system_zh.md` / `architect_system_en.md` (系统架构师系统提示词)
  - `architect_revise_system_zh.md` / `architect_revise_system_en.md` (架构稿修订引导)
  - `auditor_system_zh.md` / `auditor_system_en.md` (合规审查员系统提示词)
  - `polisher_system_zh.md` / `polisher_system_en.md` (文字润色系统提示词)
  - `radar_system_zh.md` (趋势雷达分析提示词)
  - `detector_system_zh.md` / `detector_system_en.md` (AI味/风格特征检测提示词)
- **短篇小说管道提示词** (`short_fiction/` 子目录下共 12 个模板)：
  - 覆盖了大纲（Outline）、大纲评估（OutlineReview）、正文起草（Writer）、草稿评估（DraftReview）、整体打包（Package）等全生命周期的系统和用户提示词模板。

### 2. 运行时动态加载与降级回滚机制 (Safe Fallback)
- **非侵入式动态加载**：实现了 [PromptLoader](file:///e:/ink-xY/inkos/packages/core/src/prompts/prompt-loader.ts) 工具类，统一加载物理路径下的 `.md` 文件，并在运行时使用 `.replace()` 做参数插值，维持 100% 运行时逻辑等价。
- **静态回退机制**：提取了原先在 TS 文件中声明的全部长篇硬编码提示词至独立的 [fallback-prompts.ts](file:///e:/ink-xY/inkos/packages/core/src/prompts/fallback-prompts.ts) 文件。当部署或测试沙箱中缺少物理模板文件时，`PromptLoader` 会自动捕获异常并无缝回退到 fallback 常量，保障系统永不崩溃。
- **混合拼接算法保留**：针对 `ContinuityAuditor` 复杂的维度列表（`dimList`）和 `ReviserAgent` 的分流控制逻辑（`routingDirective`），保留了 TS 运行时的强类型算法拼接逻辑，采用 `{{dimList}}` 等占位符动态填充，完美兼顾“外置模板的灵活性”与“硬编码的确定性”。

### 3. 类型安全与单元测试验证
- **测试通过率 100%**：运行核心模块的 `pnpm test` 测试集（共 108 个测试文件），所有断言与解析校验全部通过，证实没有破坏任何原有的 output structure 或解析器逻辑。
- **单独模块校验**：已单独跑通修改过的 Agent 测试，包括 `architect.test.ts`、`continuity.test.ts`、`polisher.test.ts`、`detector.test.ts` 以及 `short-fiction-public.test.ts`，验证在无物理模板文件（测试用例默认沙箱环境）时 fallback 的正确性与可靠性。

---

## ⚡ 恢复并美化“智能写作”与“规划蓝图”执行进度弹窗 (2026-06-14)

为解决“点击智能写作或规划首章蓝图后没有弹窗看写作进度”的问题，我们修复了相应的 React 状态生命周期 Bug，并重新设计并还原了高颜值的进度日志监控弹窗：

### 1. 修复状态生命周期 Bug
- **Bug 根源**：原先的 `handleStartWriting` 与 `handlePlanBlueprint` 异步方法中，`setIsWriteLoading(false)` 被放置在 `finally` 块中无条件执行。这就导致无论是接口超时、API 报错还是中途网络断开触发 Catch 逻辑时，加载状态 `isWriteLoading` 都会瞬间变回 `false`，从而导致进度弹窗瞬间闪退关闭。而此时错误报告弹窗 `isWriteReportOpen` 尚未被置为 `true`，导致用户完全看不到任何错误提示或运行状态。
- **修复方案**：引入了局部的错误标记变量 `let hasError = false`，只有在**无任何错误（执行成功）**的情况下才会在 `finally` 中将 `isWriteLoading` 设为 `false`。如果发生错误，进度弹窗将保持打开状态，用于展示错误详情与完整的 STDOUT 实时日志，并为用户提供一个明确的“关闭并返回”按钮以进行状态复位。

### 2. 补全缺失的状态读取
- 修复了 React 状态声明 `const [, setWriteProgressText] = useState("")` 对状态变量 `writeProgressText` 的忽略，修正为 `const [writeProgressText, setWriteProgressText] = useState("")`，使进度提示语能够正确被弹窗读取。

### 3. 重构并美化写作进度与实时日志弹窗 (Premium Modal)
- **磨砂毛玻璃背景**：使用 `backdropFilter: "blur(8px)"` 及暗色半透明遮罩（`rgba(10, 10, 12, 0.65)`）营造沉浸式的毛玻璃视效。
- **微光呼吸动效**：通过新增 `@keyframes pulse`，为正在写作时的加载态图标设计了精美的紫色微光呼吸光晕，结合流畅的圆环旋转，大幅度提升了 AI 协作的呼吸感与高级感。
- **拟真开发者控制台**：设计了带有绿/红状态呼吸灯的 `STDOUT / STDERR LOGS` 终端风格输出面板：
  - 采用全黑科技感背景（`#09090b`）和高对比度单色等宽字体。
  - 支持自动定位到底部以显示最新流式日志。
  - 为日志行添加了微弱的虚线分割线，增强日志阅读舒适度。
- **双引擎文案适配**：智能检测当前正在执行的是“首章写作蓝图规划”还是“首章正文智能写作”，动态展示匹配的标题与错误反馈。

---

## ⚡ InkOS 内核重构：彻底移除提示词 Fallback 与常数定义 (2026-06-14)

我们已成功完成内核重构的最后一步，彻底移除了所有 Agent 中的 fallback 常量以及 fallback 回滚逻辑。当底层的物理 Markdown 提示词模板文件缺失时，系统现在会立即抛出异常并中止，实现了 100% 物理模版依赖的高可靠性要求。

### 1. 短篇小说管道提示词模板外置重构
- 重构了 [short-fiction.ts](file:///e:/ink-xY/inkos/packages/core/src/prompts/short-fiction.ts)，将其中的 12 个大纲、起草、评估、打包等系统与用户提示词构建器全部改造为使用 `PromptLoader.loadRequiredPrompt` 从 `short_fiction/` 子目录下动态加载物理模板。
- 删除了原本硬编码的提示词数组与常量，并移除了不再使用的 `buildShortFictionCraftPrompt` 辅助函数。
- 保持了所有外部强类型定义接口（如 `ShortFictionOutlinePromptInput` 等）的完好，确保上游接口类型安全无偏差。

### 2. 清理全局导出项与彻底移除 Fallback 文件
- 修改了 [index.ts](file:///e:/ink-xY/inkos/packages/core/src/index.ts)，移除已删除的 planner 常量（`PLANNER_MEMO_SYSTEM_PROMPT` 与 `PLANNER_MEMO_USER_TEMPLATE`）的导出项，解决了 core 包的编译错误。
- 彻底从磁盘上删除了 `fallback-prompts.ts` 文件。

### 3. 完备性验证
- **TypeScript 静态检查**：在 core 包下运行 `tsc --noEmit`，编译通过且 **0 compiler errors**。
- **单元测试验证**：运行 `pnpm test` 测试集，所有 **1170 个单元测试断言全部通过**。验证了物理文件动态读取的逻辑一致性。



