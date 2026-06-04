# 🖋️ ink-xY Novel Studio — 智能协同写作空间

[![Next.js](https://img.shields.io/badge/Framework-Next.js%2015-blue?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![Electron](https://img.shields.io/badge/Desktop-Electron%20v42-663399?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![pnpm](https://img.shields.io/badge/Package_Manager-pnpm%209+-f69220?style=flat-square&logo=pnpm)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-AGPL--3.0-red?style=flat-square)](LICENSE)

> 🌌 **ink-xY Novel Studio** 是一款专为网络小说作家、独立编剧以及文学创作者量身定制的 **非线性沉浸式智能协同写作空间 (Literary IDE)**。
> 基于 Next.js 15 与 Electron 独立桌面客户端完美融合，秉承温润如纸的视觉底色、高雅文学排版、极简非线性大纲管理器，并深度整合了本地多智能体小说协作引擎 **`InkOS`**，实现真正意义上的“人机无缝共创”。

---

```
   +-----------------------------------------------------------------------+
   |                        ink-xY Literary Studio                         |
   +--------------------+----------------------------+---------------------+
   |  📁 大纲与设定目录   |  📝 Zen 沉浸创作画布         |  🔮 AI 创作伴侣 (Gems)|
   |  - 故事大纲.md     |  - Outfit/Lora 衬线排版    |  - 大纲策划师       |
   |  - 角色设定/       |  - 1.8倍行距，护眼底色      |  - 角色塑造师       |
   |  - 世界观设定/     |  - [ 🔍 人设防崩审计 ]      |  - 细节扩写师       |
   |  - 章节草稿/       |  - [ 📝 规划本章意图 ]      |  - 纠错校对师       |
   +--------------------+----------------------------+---------------------+
   |                      [ 🛡️ 真理设定上下文注入防线 ]                        |
   +-----------------------------------------------------------------------+
```

---

## 🎨 视觉与设计哲学 (Zen Aesthetic Mode)

* **禅意温润护眼肤色**：默认采用温润纸张黄（Soft Warm Beige）与深邃静心绿（Zen Forest Green）双色主题，有效降低长时间创作的视觉疲劳。
* **高雅文学衬线排版**：中文字体默认优化为优雅的宋体/楷体排版，英文采用 **Outfit** 与 **Lora** 衬线字体组合，间距宽松（Line-height 1.8），赋予文字以纸质墨水的呼吸感。
* **极简无干扰画布**：全平台移除所有属于程序员的技术性调试日志与极客控制台，将技术细节安全收纳于后端，把灵感与故事毫无保留地留给写作者。
* **安全防抖内存保护**：集成了前端 `1500ms` 本地大文件防抖保存（Debounced Save），防止在 AI 写入多达几万字的大纲或章节时产生频繁重绘卡顿，提供行云流水的打字体验。

---

## 🚀 核心闪光点 (Feature Highlights)

### 1. 🤖 深度整合 InkOS 多智能体写作引擎
内置本地多智能体小说辅助开发引擎 `InkOS`。前端通过极简的 **REST API 桥接层** 调度 `runInkos` 系统 Node 进程包装器，支持在后台快速、异步执行 `init`、`audit`、`plan`、`compose` 等多智能体分析任务。

### 2. 📚 15 类中英文小说题材 (Bilingual Genres Support)
系统预置了 15 类题材，分为**中文网文题材**与**英文原生题材**，不仅提供写作大纲指引，更是智能体进行“数值核对”、“战力分析”与“时代研究”的引擎开关：

| 题材 ID | 题材名称 | 默认语言 | 章节类型 (chapterTypes) | 数值系统 (numericalSystem) | 战力等级 (powerScaling) | 时代背景研究 (eraResearch) |
|---|---|---|---|:---:|:---:|:---:|
| `xuanhuan` | **玄幻奇幻** (Xuanhuan) | `zh` | 战斗章, 布局章, 过渡章, 回收章 | ✅ | ✅ | ❌ |
| `xianxia` | **仙侠修真** (Xianxia) | `zh` | 战斗章, 悟道章, 布局章, 过渡章, 回收章 | ✅ | ✅ | ❌ |
| `urban` | **都市异能** (Urban) | `zh` | 商战章, 社交章, 布局章, 过渡章, 回收章 | ❌ | ❌ | ✅ |
| `horror` | **悬疑恐怖** (Horror) | `zh` | 氛围章, 事件章, 揭示章, 过渡章, 回收章 | ❌ | ❌ | ❌ |
| `other` | **其它通用** (Other) | `zh` | 推进章, 布局章, 过渡章, 回收章 | ❌ | ❌ | ❌ |
| `litrpg` | **数据无限流/系统流** (LitRPG) | `en` | Progression, Setup, Transition, Payoff, Combat | ✅ | ✅ | ❌ |
| `progression` | **升级流奇幻** (Progression Fantasy) | `en` | Training, Breakthrough, Setup, Transition, Payoff | ❌ | ✅ | ❌ |
| `cozy` | **温馨奇幻** (Cozy Fantasy) | `en` | Slice-of-Life, Community, Setup, Transition, Payoff | ❌ | ❌ | ❌ |
| `cultivation` | **英文修真** (English Cultivation) | `en` | Training, Breakthrough, Combat, Setup, Transition, Payoff | ❌ | ✅ | ❌ |
| `dungeon-core` | **地下城核心流** (Dungeon Core) | `en` | Strategy, Adventurer POV, Setup, Transition, Payoff | ✅ | ❌ | ❌ |
| `isekai` | **异世界穿梭** (Isekai / Portal Fantasy) | `en` | Exploration, Adaptation, Setup, Transition, Payoff, Combat | ❌ | ✅ | ❌ |
| `romantasy` | **浪漫奇幻** (Romantasy) | `en` | Romance, Action, Setup, Transition, Payoff | ❌ | ❌ | ❌ |
| `sci-fi` | **科学幻想** (Science Fiction) | `en` | Exploration, Combat, Setup, Transition, Payoff | ❌ | ❌ | ✅ |
| `system-apocalypse` | **系统废土流** (System Apocalypse) | `en` | Survival, Combat, Setup, Transition, Payoff | ✅ | ✅ | ❌ |
| `tower-climber` | **爬塔闯关流** (Tower Climbing) | `en` | Floor Challenge, Progression, Setup, Transition, Payoff | ❌ | ✅ | ❌ |

此外，系统支持 **同人创作 (`fanfic`)** 专属初始化流程，支持 `canon` (正典延续)、`au` (平行宇宙)、`ooc` (角色偏离)、`cp` (角色配对) 四种独立模式，可自动解析原著素材文本。

### 3. 🔍 章节级“人设防崩审计”与“意图规划”工具带 (File Footer Toolbelt)
* **实时人设防崩审计**：在编辑章节草稿时，编辑器底部提供 **`🔍 人设防崩审计`** 键。点击后立即运行 `inkos audit` 扫描当前草稿，深度检测逻辑矛盾或人设走形（例如：死亡角色复活、主角性格突变、剧情前后冲突）。
* **章节写作意图规划**：底部提供 **`📝 规划本章意图`** 键。一键自动为即将动笔的章节预生成场景设定与写作大纲意图，确保每一章的起承转合都在掌控中。
* **毛玻璃右滑抽屉式报告 panel**：审计报告采用流畅的 CSS Transition 从右侧滑出，配有高雅的 `backdrop-blur: 4px` 毛玻璃遮罩，以衬线排版优雅呈现多智能体审计反馈。

### 4. 🛡️ 真理系统“设定上下文防线” (Truth System Context Injector)
* **动态背景设定提取**：在会话右侧与 AI Gems 写作姬交流时，系统会在后台**静默、深度扫描**当前工作区中 `角色设定/` 和 `世界观设定/` 文件夹下的所有人物卡片与世界背景 Markdown 文件。
* **智能上下文注入**：将所有的底层设定自动编译，作为最高优先级 Context（Truth Settings）无缝混入每次 AI 对话 turn 中。确保写作姬随时对主角的武器、性格、阵营和背景了如指掌，从源头彻底斩断“人设走样”与“剧情冲突”。

### 5. 👥 专属四大预设 Gems 写作姬
* **🧭 大纲策划师**：辅助宏观骨架搭建，把控章节起承转合与戏剧冲突。
* **👤 角色塑造师**：包装人物设定，打磨对话口吻，让配角同样立体。
* **✍️ 细节扩写师**：划词扩写，把动作、情绪、环境描写打磨得极具画面美感。
* **🔍 纠错校对师**：自动过滤章节中的错别字、病句与逻辑语病。

---

## 🏗️ 系统架构图 (System Architecture)

```mermaid
graph TD
    subgraph Browser (Electron / Next.js SPA)
        A[Zen Markdown Editor] <-->|自动保存 / 字数统计| B[Frontend State]
        C[Sidebar / Project Explorer] -->|选择工作区| B
        D[AI Co-writers Gems Panel] <-->|SSE 实时流 / 对话分支树| B
    end

    subgraph Next.js In-Process Server (Port 30142)
        B <-->|1. 接口桥接 POST /api/inkos| E[API Router]
        B <-->|3. SSE 对话 /api/agent/[id]| F[Agent RPC Manager]
        B <-->|读写目录 /api/files| G[File System Bridge]
    end

    subgraph Local Engine & Workspace
        E <-->|2. 执行 CLI 进程| H[runInkos - CLI Bundle Wrapper]
        F <-->|4. 扫描真理设定| I[compileLoreCards]
        H <-->|初始化 / 审计 / 意图生成| J[(小说本地工作区 CWD)]
        I <-->|提取 角色设定/ & 世界观设定/| J
        G <-->|读写草稿章节| J
    end

    style J fill:#f9f6f0,stroke:#8c6239,stroke-width:2px;
    style A fill:#e6eed6,stroke:#4a6b53,stroke-width:2px;
    style D fill:#f3e8ff,stroke:#8b5cf6,stroke-width:2px;
```

---

## 🧭 快速开始 (Quick Start)

### 1. 基础依赖准备
确保您的开发环境安装了 **Node.js v20+** 与 **pnpm**：

```bash
# 全局安装 pnpm (如果尚未安装)
npm install -g pnpm
```

### 2. 编译本地 InkOS 子模块
`ink-xY` 将 `InkOS` monorepo 仓库作为核心写作算力子包，存放于根目录下的 `inkos/` 中。启动前需要完成子包的本地构建：

```bash
# 进入 inkos 文件夹并安装依赖
cd inkos
pnpm install

# 执行 InkOS 引擎编译
pnpm build
cd ..
```

### 3. 运行本地开发服务器
回到 `ink-xY` 项目根目录，安装主项目依赖并启动 Web 开发服务器：

```bash
# 安装主项目依赖
npm install

# 启动 Next.js 极速开发服务（本地监听端口 30142）
npm run dev
```

### 4. 运行 Typecheck 与 Lint 校验
```bash
# 静态类型安全校验 (忽略 inkos 嵌套干扰)
node_modules/.bin/tsc --noEmit

# 运行代码规范检测
node_modules/.bin/eslint .
```

> [!WARNING]
> **绝对不要在开发期间运行 `next build`**。这会污染 `.next/` 生成文件，从而导致 `npm run dev` 运行异常。

---

## 🔒 隐私隔离与路径规范 (Privacy & Data Isolation)

为确保作家的灵感与创作数据绝对安全：

1. **零云端依赖**：所有的写作草稿、人设卡片、设定大纲均作为标准的 `.md` 纯文本存储在您的本地磁盘上。
2. **应用隔离存盘**：`ink-xY Novel Studio` 的应用主配置文件、Gems 对话历史和模型配置隔离存放在本地：
   * 📁 **`~/.ink/agent/`** (主配置目录)
   * ⚙️ **`~/.ink/agent/settings.json`** (偏好与默认模型设置)
   * 📇 **`~/.ink/agent/models.json`** (模型提供商与 API Key 配置)
3. **工作区目录建议**：推荐将您的小说工程放置在以 `ink-cwd-<日期或书名>` 命名的本地文件夹中，以自动通过系统的文件路由校验，防止 403 跨域目录访问拦截。

---

## 💡 开发建议与踩坑指南 (Key Traps & Tips)

### 1. 调试与 API Key 报错排查
如果右侧 AI 协作对话时弹红色的警告框，请点击侧边栏左下角的 ⚙️ 齿轮图标，检查您的 `models.json` 配置。
* **Key 的环境注入**：后端 `runInkos` 会自动解析 `models.json` 中的当前模型服务商设置，并实时以环境变量形式注入 CLI 进程（如自动映射出 `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` 等），无需重复在系统中配置环境变量。

### 2. 对话分支 Fork 原理
写到分水岭剧情时点击 **"Fork"** 按钮会生成一个全新的独立 `.jsonl` 历史副本，保存在 `~/.ink/agent/sessions/` 对应的会话哈希树下。
* **状态清除保护**：为了防止 Next.js 热重载导致的 Agent 会话串线，系统在 Fork 触发时会强行调用销毁机制并重构 session，以确保新故事线绝对纯净。
