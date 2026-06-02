# InkOS 功能盘点 — 已用 vs 未用

> 更新时间：2026-06-02  
> 基于 `e:/ink-xY/inkos/packages/cli/src/` 全量命令文件分析

---

## ✅ 已集成到 ink-xY 的命令

| 命令 | ink-xY 对应功能 | 触发位置 |
|---|---|---|
| `inkos init` | 一键初始化工作区 | 侧边栏「一键开启创作宇宙」按钮 |
| `inkos book create` | 创建书籍 | 侧边栏书籍创建流程 |
| `inkos write next` | ✍️ 智能续写 | 编辑器底部工具栏 |
| `inkos write sync` | 🔄 同步设定 | 编辑器底部工具栏 |
| `inkos write rewrite --force` | 章节冲突回滚 | 内部逻辑（409 冲突确认后触发） |
| `inkos audit` | 🔍 防崩审计 | 编辑器底部工具栏 |
| `inkos revise` | 🪄 AI 修正 | 编辑器底部工具栏 / 续写后自动触发 |
| `inkos plan chapter` | 📝 规划意图 | 编辑器底部工具栏 |
| `inkos status` | 工作区状态检测 | 侧边栏初始化检测（后台） |
| `inkos doctor` | 环境诊断 | API 路由（后台） |

---

## ❌ 尚未集成的命令

### 🔴 高价值 — 强烈建议集成

#### `inkos review list / approve / reject`
- **功能**：章节审核流程。列出所有 `ready-for-review` / `audit-failed` 状态的章节，支持：
  - `approve` — 批准章节，将状态 commit 为 `approved`
  - `approve-all` — 批量批准所有待审章节
  - `reject [--reason]` — 拒绝章节，**自动 rollback 故事状态到该章之前**，同时废弃所有依赖该章的后续章节
  - `reject --keep-subsequent` — 仅标记拒绝，不 rollback（谨慎使用）
- **集成建议**：在侧边栏书籍列表或编辑器 header 加「📋 章节管理」面板，显示各章状态徽章并提供批准/拒绝按钮
- **价值**：⭐⭐⭐⭐⭐

---

#### `inkos import chapters --from <path>`
- **功能**：把已有的旧章节文本（`.md`/`.txt` 文件夹，或单个大文件自动分章）批量导入书籍，系统会逆向重建所有 `story/` 真相文件（角色矩阵、摘要、状态快照），完成后可无缝续写
  - 支持 `--resume-from <n>` 断点续传
  - 支持 `--series` 模式（同宇宙不同故事线）
- **集成建议**：在工作区初始化流程中增加「📥 导入旧稿」选项，允许用户拖拽或选择文件夹
- **价值**：⭐⭐⭐⭐⭐

---

#### `inkos export [--format txt|md|epub] [--approved-only]`
- **功能**：将书籍所有章节合并导出为单一 file
  - 支持 `txt` / `md` / `epub` 三种格式
  - `--approved-only` 只导出已审核章节，保证发布质量
  - 输出文件名默认为 `{bookId}_export.{format}`
- **集成建议**：在侧边栏书籍卡片上增加「📤 导出书稿」按钮，提供格式选择下拉菜单
- **价值**：⭐⭐⭐⭐⭐

---

#### `inkos consolidate`
- **功能**：当书写得很长（通常 50+ 章后），把旧章节摘要归档为卷级摘要（`volume_summaries.md`），详细摘要移入 `summaries_archive/`。防止上下文窗口爆满导致 AI 遗忘远期伏笔
- **集成建议**：在侧边栏增加提示（当章节数 > 50 时显示「⚠️ 建议运行摘要压缩」），一键触发
- **价值**：⭐⭐⭐⭐

---

### 🟡 中价值 — 建议考虑集成

#### `inkos style analyze / style import`
- **功能**：
  - `analyze <file>` — 分析参考文本，提取文风指纹（平均句长、段落密度、词汇多样性 TTR、修辞特征等）
  - `import <file> [book-id]` — 把参考文本的文风注入书籍，LLM 生成 `style_guide.md`，此后续写会模仿该文风
- **集成建议**：在书籍设置中增加「✏️ 文风导入」功能，允许上传参考样文
- **价值**：⭐⭐⭐⭐

---

#### `inkos draft`
- **功能**：草稿模式续写（`writeDraft`）。与 `write next` 的区别：**跳过审计和修正步骤**，速度优先，适合快速出草稿后再手动打磨
  - 支持 `--context <text>` 传入创意引导
  - 支持 `--words <n>` 控制字数
- **集成建议**：在「✍️ 智能续写」按钮旁增加「⚡ 快速草稿」模式切换
- **价值**：⭐⭐⭐

---

#### `inkos fanfic init / show / refresh`
- **功能**：同人创作专用流程
  - `init --title <title> --from <source>` — 导入原著素材（小说文本/角色 wiki），AI 解析正典后建立同人书
  - 支持四种同人模式：`canon`（正典续写）/ `au`（平行宇宙）/ `ooc`（角色崩坏）/ `cp`（配对同人）
  - `refresh --from <new-source>` — 更新原著素材重建正典
- **集成建议**：在书籍创建流程中增加「同人创作」模式选项
- **价值**：⭐⭐⭐

---

#### `inkos import canon --from <parent-book-id>`
- **功能**：从一部书导入世界观/人物正典到另一部书，用于写同一宇宙的衍生作品（共享世界观，独立故事线）
- **集成建议**：在书籍设置中增加「导入正典」功能
- **价值**：⭐⭐⭐

---

### 🟢 低价值 / 专业边缘功能

| 命令 | 功能 | 价值 |
|---|---|---|
| `inkos short run` | 短篇流水线 — 全自动生成 12-18 章短篇小说（女频短篇为主），支持封面图生成 | ⭐⭐ |
| `inkos radar scan` | 市场雷达 — AI 扫描当前高潜力平台/类型/创作方向 | ⭐⭐ |
| `inkos detect` | AIGC 检测 — 对章节打 AI 味评分，需额外配置检测 API | ⭐⭐ |
| `inkos compose chapter` | 另一种章节生成模式（与 `write` 流程差异需进一步研究） | ⭐ |
| `inkos genre` | 类型配置管理 | ⭐ |
| `inkos eval` | 质量评估 | ⭐ |
| `inkos analytics` | 数据统计分析 | ⭐ |

---

## 推荐集成优先级

```
P0（最高优先）
  ├── export          → 写完能导出 epub，用户最直接需求
  ├── review          → 章节状态管理，配合防崩审计形成完整闭环
  └── import chapters → 让用户能迁移旧稿，关键的"迁入"功能

P1（次高优先）
  ├── consolidate     → 长篇写作必备，防止 AI 上下文退化
  └── style import    → 文风克隆，差异化卖点

P2（按需）
  ├── draft           → 快速草稿模式
  ├── fanfic          → 同人创作市场
  └── import canon    → 衍生宇宙写作
```
