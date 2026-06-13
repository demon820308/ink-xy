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
   |  - 章节草稿/       |  - [ 📝 规划本章蓝图 ]      |  - 纠错校对师       |
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

### 3. ✍️ 全局与局部协同写作控制带 (Bilingual Writing & Control Toolbelt)
* **全局智能续写/草稿 split-button**：页面顶栏右侧新增了橙色双模式写作按钮，会自动根据您书籍的最新进度动态探测并展示为 `智能续写第N+1章` / `极速草稿第N+1章`。
* **非章节页面自动定位唤醒**：当在看板、设置或空白标签页直接点击全局按钮时，系统会**静默定位并自动在主编辑器中打开最新章节**，然后自动拉起精美的橙色「**确认执行此操作**」模态框，省去手动翻页。
* **写作前置安全门禁**：无论是全局还是局部点击续写/草稿，系统都会前置校验当前章节是否“已过审”。若尚未进行大纲规划、防崩审计和设定同步，系统会弹窗警告拦截，全力防御战斗力崩溃和人设吃设定。
* **实时人设防崩审计与蓝图规划**：在编辑章节草稿时，编辑器底部提供 **`🔍 人设防崩审计`**、**`📝 规划本章蓝图`** 及 **`🔄 同步设定`** 键。审计报告从右侧滑出，并支持一键 `🔄 重新审计` 展开行内控制台日志。支持安全二次规划确认弹窗。

### 4. 🪄 智能精修控制台 & 可视化对账 (Revision Console & Visual Ledger)
* **智能精修控制台**：支持四大精修模式：**✨ 润色抛光 (Polish)**、**⚠️ 定点纠偏 (Spot-Fix)**（专为解决审计冲突设计，仅做局部的 1 行行内精准替换）、**🛡️ 祛AI腔 (Anti-Detect)**（去 AI 味黄金指南，口语化自然化重构）及 **✍️ 剧情重写 (Rework)**。提供精修日志实时打印及**双栏滚动同步 Diff 对比器**，自由采纳或放弃修改。
* **可视化伏笔看板 (Hook Dashboard)**：同步设定后，右侧面板以彩色卡片形式直观展示待兑现 (pending)、已兑现 (resolved) 和已过期 (expired) 的剧情伏笔。
* **设定事实编辑与删除**：对账生成的设定事实条目支持**直接单击修改**，鼠标悬停时提供一键删除 (Delete) 操作，深度定制你的 `story/` 真相账本。
* **时光机预览扩展**：时光机滑块上限提升至 `maxChapter + 1`，支持全局显示开关，帮助作家全景透视后续剧情的逻辑走向。

### 5. 🛡️ 真理系统“设定上下文防线” (Truth System Context Injector)
* **动态背景设定提取**：在会话右侧与 AI Gems 写作姬交流时，系统会在后台**静默、深度扫描**当前工作区中 `角色设定/` 和 `世界观设定/` 文件夹下的所有人物卡片与世界背景 Markdown 文件。
* **智能上下文注入**：将所有的底层设定自动编译，作为最高优先级 Context（Truth Settings）无缝混入每次 AI 对话 turn 中。确保写作姬随时对主角的武器、性格、阵营和背景了如指掌，从源头彻底斩断“人设走样”与“剧情冲突”。

### 6. 👥 专属四大预设 Gems 写作姬
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
        H <-->|初始化 / 审计 / 蓝图生成| J[(小说本地工作区 CWD)]
        I <-->|提取 角色设定/ & 世界观设定/| J
        G <-->|读写草稿章节| J
    end

    style J fill:#f9f6f0,stroke:#8c6239,stroke-width:2px;
    style A fill:#e6eed6,stroke:#4a6b53,stroke-width:2px;
    style D fill:#f3e8ff,stroke:#8b5cf6,stroke-width:2px;
```

---

## 🧭 快速开始 (Quick Start)

### 📦 桌面端 (Standalone App)

#### ⚙️ 1. 前置依赖准备（重要）
为了能完整使用软件的所有高级功能（例如 Add Skill / 安装外部技能插件），您的系统需要安装并配置好 **Git**：
* **常见问题**：如果在添加 Skill 时遇到红色报错 `spawn git ENOENT`，说明您的电脑尚未安装 Git，或者 Git 路径未正确配置到系统的环境变量中。
* **配置步骤**：
  1. 前往 [Git 官方网站](https://git-scm.com/) 下载适用于 Windows 或 macOS 的最新版安装程序。
  2. 安装时，建议选择默认设置（特别注意确保勾选 *"Git from the command line and also from 3rd-party software"*，这会自动将 Git 自动添加至系统环境变量 `PATH` 中）。
  3. 安装完成后，务必完全退出并重启 Pi Agent xY 桌面客户端，以便软件重新加载最新的环境变量。

#### 🖥️ 2. Windows 安装与运行
1. 前往 GitHub Releases 下载最新生成的 `Pi Agent xY Desktop Setup.exe` 一键安装包。
2. 双击运行 `.exe` 文件，跟随向导完成一键安装。
3. 安装完成后，即可直接通过桌面快捷方式或开始菜单打开客户端。

#### 🍏 3. macOS 安装与运行 (重要)
1. 前往 GitHub Releases 下载 `.dmg` 安装包。
2. 双击打开并将应用拖拽至 `Applications` (应用程序) 目录中。
3. ⚠️ **macOS 提示“文件已损坏”或“身份不明的开发者”解决办法**：由于 standalone 桌面客户端未在 Apple 开发者账号进行官方代码签名，macOS Gatekeeper 安全体系可能会在首次打开应用时拦截，并弹出“软件已损坏，无法打开”或“无法验证开发者”等警告。
4. **极速解锁与绕过指令**：请打开您的 Mac 终端（Terminal），直接复制并执行以下命令（以清除 macOS 的隔离 quarantine 标识属性）：
   ```bash
   xattr -cr /Applications/ink-xY\ Novel\ Studio.app
   ```
   运行后，即可直接在 Launchpad 或 Applications 中双击秒开，完美运行！

#### 🛠️ 开发调试 (Dev Mode)
```bash
# 1. 编译本地 InkOS 子模块 (首次或代码更新后需要)
cd inkos && pnpm install && pnpm build && cd ..

# 2. 安装 Next.js 项目依赖
npm install

# 3. 并发启动 Next.js 本地微服务并自动唤起 Electron 主窗口
npm run electron:dev
```

#### 📦 生产打包 (Production Build)
```bash
# 自动编译 Next.js production 优化包并生成 Windows/macOS 原生安装程序
npm run electron:build
```

---

### 🌐 网页端 (Web UI)

#### 1. 免安装瞬时运行 (NPX)
```bash
npx @zwbigi/ink-xy@latest
```

#### 2. 全局安装使用
```bash
# 全局安装包
npm install -g @zwbigi/ink-xy

# 启动客户端
ink-xy
```
启动后自动在浏览器拉起工作台：`http://localhost:30142`

#### 3. 丰富命令行参数
```bash
ink-xy --port 8080               # 自定义启动端口
ink-xy --hostname 127.0.0.1      # 限制仅本机回环访问
ink-xy -p 8080 -H 127.0.0.1      # 参数组合使用

PORT=8080 ink-xy                 # 也支持环境变量注入
```

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
