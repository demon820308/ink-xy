"use client";

import { useState } from "react";
import { Emoji } from "./Emoji";

interface HelpModalProps {
  onClose: () => void;
}

interface GuideStep {
  title: string;
  content: React.ReactNode;
}

interface GuideSection {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  steps: GuideStep[];
}

export function HelpModal({ onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<string>("setup");
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

  const sections: GuideSection[] = [
    {
      id: "setup",
      icon: "🛠️",
      title: "第一步：工作区初始化",
      subtitle: "一键开启小说创作宇宙与模型配置",
      steps: [
        {
          title: "1. 一键开启创作宇宙 (Workspace Init)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                当你选定一个未初始化的空文件夹或已有稿件的目录后，侧边栏顶部会亮起 <strong>“未初始化的创作空间”</strong> 警告卡。
                点击 <strong style={{ color: "var(--accent)" }}>【一键开启创作宇宙】</strong> 按钮，系统将在后台执行 <code>inkos init</code>：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li>在项目根目录下生成 <code>story/</code>（真相数据库）和 <code>books/</code>（书籍目录）。</li>
                  <li>建立并注册 <code>inkos.json</code> 工作区参数配置文件。</li>
                  <li>检测完毕后，警告卡会自动消失，开启正式的小说管理界面。</li>
                </ul>
              </div>
              <div>
                <em>提示：初始化成功后，警告框会自动关闭并刷新文件树，此时即可创建第一本书籍。</em>
              </div>
            </div>
          ),
        },
        {
          title: "2. 大模型能力配置 (Models Config)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                点击右上角的 <strong>【配置模型】</strong> 按钮（芯片网格图标）。对于网文及严肃长篇创作，大模型的“分工协作”对产出质量有着决定性影响：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>起草与润色模型 (Drafting & Polishing)</strong>：
                    <br />
                    推荐使用生成速度较快、词汇库相对活泼、情节张力强且具备强大长上下文对齐能力的选择。例如：<code>Claude 3.5 Sonnet</code>、<code>DeepSeek-Chat (V3)</code>。
                  </li>
                  <li style={{ marginTop: 8 }}><strong>防崩审计模型 (Auditing)</strong>：
                    <br />
                    防崩溃审计需要极强的心智模型和严谨的指令遵循度，用于检测境界贬值、逻辑冲突等。强烈推荐配置高规格的推理大模型，如 <code>GPT-4o</code>、<code>Claude 3.5 Sonnet</code>。
                  </li>
                </ul>
              </div>
              <div>
                配置好 API Key 和 Proxy Base URL（如无代理则留空）后，点击 <strong>【保存设定】</strong> 即可即时生效。
              </div>
            </div>
          ),
        },
        {
          title: "3. 侧边栏新书配置卡显隐控制 (Sidebar Config Toggle)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                如果您已创建好书籍并希望获得更纯净的 Zen 写作体验，可以点击右上角设置 <strong>【系统全局设置】</strong> 齿轮：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li>开启/关闭 <strong>【显示“创建新小说书籍”卡片】</strong> 开关。</li>
                  <li>当您关闭该卡片时，侧边栏顶部的配置卡片会被隐藏，释放大量侧边栏可视空间，让目录树展示更清爽。</li>
                  <li><em>安全自愈保护：如果您的项目目前完全没有建立任何书籍，系统会自动强行显示该卡片，避免陷入无法开始首本书籍创作的逻辑死锁。</em></li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "4. AI 质量审计与检测指令配置 (Audit Prompt Config)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                点击右上角顶栏的 <strong>【AI 审计与检测指令】</strong> 按钮（盾牌图标），可调出底层 Agent 指令模版配置面板：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li>支持实时查看、编辑和一键恢复默认的<strong>质量审计指令 (Auditor)</strong>、<strong>AI味检测指令 (Detector)</strong> 及 <strong>状态真理校验指令 (State Validator)</strong>，支持中/英双语。</li>
                  <li><em>重要警告：编辑自定义指令时，请务必保留双大括号插值占位符（如 <code>{"{{genre}}"}</code>、<code>{"{{dimList}}"}</code>、<code>{"{{content}}"}</code> 等）。如果误删这些占位符，可能会导致大模型审计或检测分析时因缺少数据上下文而运行失败。</em></li>
                </ul>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "create",
      icon: "📥",
      title: "第二步：书籍管理、起草与导入",
      subtitle: "协同起草大纲人设、新建书籍与旧稿导入",
      steps: [
        {
          title: "1. AI 协同起草大纲人设 (AI Co-writers)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <strong>适用场景</strong>：当手头只有一些灵感碎片，还没有成型的小说大纲与角色人设时。
              </div>
              <div>
                <strong>操作流程</strong>：先不急于创建新书。在左侧侧边栏展开 <strong style={{ color: "var(--accent)" }}>【AI 写作伴侣 (Co-writers)】</strong> 面板，点击 <strong>+ Create</strong> 或选用内置写作姬：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>大纲策划师 (<Emoji char="📖" />)</strong>：共同脑暴、梳理剧情冲突与主线节奏，策划结果将在本地工作区生成 <code>架构.md</code>。</li>
                  <li><strong>人设雕琢师 (<Emoji char="🔮" />)</strong>：设定角色姓名、背景性格、专属对话口吻等，结果生成为 <code>人设.md</code>。</li>
                </ul>
              </div>
              <div>
                <em>提示：Gems 写作伴侣支持指定不同的底层大模型，并允许“关联知识库文件”注入绝对路径的设定参考，实现精准对齐。</em>
              </div>
            </div>
          ),
        },
        {
          title: "2. 新建书籍与框架继承 (Create Book)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                在左侧栏选择 <strong>【创建新书】</strong>，你需要配置书籍标题、风格题材、以及创意简报。
              </div>
              <div>
                <strong><Emoji char="💡" /> 极速架构合入与继承机制</strong>：
                如果在新建书籍前，你已在项目工作区目录下存有由 AI 写作伴侣起草保存的 <code>架构.md</code>（或 <code>novel_framework.md</code>）和 <code>人设.md</code>（或 <code>character_profiles.md</code>），系统会在建书时<strong>自动识别并读取</strong>它们，将人设与境界体系合入底层 Truth 数据库（<code>story/</code> 目录）。
              </div>
              <div>
                <em>提示：如果您后续需要调整书籍核心属性，可直接在文件树中点击打开 <code>book.json</code> 并启用【可视化视图】，即可在图形化表单中修改书籍标题、首发平台、写作状态、目标字数等参数。</em>
              </div>
            </div>
          ),
        },
        {
          title: "3. 批量导入已有旧章原稿",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                如果你想将以往在其他软件写好的小说（包含数十万字的历史章节）迁移到本站继续写，可以使用侧边栏工具栏的 <strong>【导入设定或旧章原稿】</strong> 按钮（向下的箭头）：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <strong>操作配置项</strong>：
                <ul style={{ paddingLeft: 18, margin: "6px 0", lineHeight: "1.7" }}>
                  <li><code>导入源路径 (From Path)</code>：选择包含旧稿 Markdown 或 TXT 文件的本地文件夹，或者单个合集大文本文件。</li>
                  <li><code>章节拆分正则 (Split Regex)</code>：系统默认以 <code>第[一二三四五六七八九十百千万\d]+章</code> 进行智能切割分章，你可以根据自己的分章规范修改正则。</li>
                  <li><code>断点续传 (Resume From)</code>：可设定从某章开始导入。</li>
                </ul>
              </div>
              <div>
                <strong>逆向提取引擎的工作流程</strong>：
                导入旧稿不仅仅是把文字搬运过来。导入后，AI 会自动按章节运行逆向同步流水线。它会读取你的历史章节正文，梳理世界观、人物性格特征、当前境界、并搜寻所有尚未解决的历史伏笔。最终在 <code>story/</code> 目录下自动搭建出人设矩阵、伏笔池和状态卡，完成逆向“补完”。
              </div>
            </div>
          ),
        },
        {
          title: "4. 继承前作/正典设定",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                如果是撰写同宇宙的系列第二部，在导入面板中选择 <strong>“导入正典设定”</strong>，指定前作的 Book ID，即可将前作的世界观、人物人设直接克隆到新书中作为参考正典，避免吃设定。
              </div>
            </div>
          ),
        },
        {
          title: "5. 智能角色卡转换器 (Character Card Converter)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                在 <strong>【角色人设】</strong> 面板中，点击右上角的 <strong>【<Emoji char="➕" /> 创建】</strong> 按钮，即可唤起角色人设卡转换器。
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <strong><Emoji char="💡" /> 核心功能与用处：</strong>
                <ul style={{ paddingLeft: 18, margin: "6px 0 0 0", lineHeight: "1.7" }}>
                  <li><strong>粘贴文本/文件智能解析</strong>：您可以直接粘贴大段散乱的草稿设定，或者上传 TXT/MD 文件，点击 <strong style={{ color: "var(--accent)" }}>【🪄 开始 AI 自动解析与提取】</strong>，AI 将自动分析提取人物的姓名、主要/次要级别（Tier）、核心标签（Core Tags）、矛盾反差（Contrast）以及人际关系网（Relationships）。</li>
                  <li style={{ marginTop: 6 }}><strong>自动冲突检测与去重</strong>：解析成功后，转换器会自动对比已存在的人物角色，直观标出哪些是“新角色”，哪些是“已重名角色（将自动跳过）”，保障库文件整洁。</li>
                  <li style={{ marginTop: 6 }}><strong>一键批量生成与索引重构</strong>：确认后，系统会一键为所有独特新角色建立标准卡片（写入 <code>story/roles/</code>），并自动刷新同步 <code>character_matrix.md</code> 兼容指针，免去手动建档、贴格式的繁琐工序。</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "6. 角色人设与书籍参数可视化表单编辑器 (Form Editors)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                为了降低作者管理底册（大纲与角色）的门槛，系统为 <code>book.json</code> 和角色卡 Markdown 文件提供了<strong>可视化表单编辑视图</strong>：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>角色卡表单编辑 (Character Card Editor)</strong>：
                    打开 <code>story/roles/</code> 目录下的任何角色卡文件，并在顶部状态栏旁切换为【可视化视图】。您可以直接在结构化表单中修改角色姓名、主次级别、核心标签、矛盾细节、人物小传和人际关系网，系统保存时会自动生成规范的 Markdown 格式与 YAML 前置信息，防止手动修改格式出错。
                  </li>
                  <li style={{ marginTop: 8 }}><strong>书籍核心参数编辑 (Book Settings Editor)</strong>：
                    打开任何书籍目录下的 <code>book.json</code> 配置文件并切换为【可视化视图】，即可在图形化表单中调整书籍的标题、首发平台、题材、写作状态以及目标字数指标，系统还会自动从 Inkos 引擎读取当前可用的题材列表供您选择。
                  </li>
                </ul>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "plan",
      icon: "📖",
      title: "第三步：蓝图细化",
      subtitle: "智能大纲细纲编译与蓝图强制控制",
      steps: [
        {
          title: "1. 一键规划蓝图",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                在写每章之前，点击章节底部的 <strong>【规划蓝图】</strong>。
                系统后台的多智能体大纲规划管线会启动。AI 会结合：
                <ol style={{ paddingLeft: 18, margin: "6px 0", lineHeight: "1.6" }}>
                  <li>当前书的大纲设定和卷纲。</li>
                  <li>前一章节的末尾内容（保持剧情绝对平滑过渡）。</li>
                  <li><code>pending_hooks.md</code> 中标记为“本章该兑现”或“急需解决”的悬念和伏笔。</li>
                  <li><code>current_state.md</code> 中存活的、且在当前场景的角色列表。</li>
                </ol>
                从而编译生成本章的 <strong>本章大纲细纲 (Outline)</strong> 以及 <strong>本章写作蓝图 (Blueprint)</strong>。
              </div>
            </div>
          ),
        },
        {
          title: "2. 蓝图调整与主线校验",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                规划出的细纲会在右侧报告面板展示。<strong>作为作者，您握有最高控制权：</strong>
              </div>
              <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 12, fontStyle: "italic", fontSize: 11 }}>
                例如：系统规划本章是日常过渡，而你决定强行加快节奏。你可以直接在报告的蓝图编辑框中添加：
                “本章插入刺客夜袭情节，主角被迫反击并暴露法宝，击退敌人后负伤撤退”。
              </div>
              <div>
                修改保存后，接下来的“智能续写”和“极速草稿”都将把此修改作为<strong>刚性控制参数</strong>输入，绝对不会偏离你的微调方向。
              </div>
            </div>
          ),
        },
        {
          title: "3. 安全二次规划确认 (Safety Re-planning Guard)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                当一章的写作蓝图已经存在时，如果您在章节管控中心再次点击 <strong>【规划第 X 章蓝图】</strong>，系统会弹出半透明毛玻璃的高清确认弹窗。
              </div>
              <div>
                系统会警告您已存在该章节的蓝图，继续规划将产生额外的 Token 消耗并可能覆盖您手动修改过的蓝图设定。您可以选择“确认重新规划”或“取消”，保障已有的心血不被意外覆盖。
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "write",
      icon: "✍️",
      title: "第四步：正文创作",
      subtitle: "高文采续写、草稿快跑与冲突回滚机制",
      steps: [
        {
          title: "1. 全局与局部智能续写/草稿 (Smart Continue & Quick Draft)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                系统提供了<strong>顶栏全局快捷按钮</strong>与<strong>编辑器底部控制按钮</strong>双重创作入口：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>动态目标章节（第N+1章）</strong>：按钮会自动检测您书籍当前的最新进度并渲染为 <code>智能续写第N+1章</code> / <code>极速草稿第N+1章</code>。在尚未创建任何首章正文时，全局按钮会自动隐藏避开干扰。</li>
                  <li style={{ marginTop: 6 }}><strong>非章节页面自动唤醒定位</strong>：如果您在看板、设置或空白标签页点击全局写作按钮，系统会自动为您<strong>静默定位并打开最新的一章</strong>，然后触发橙色的【确认执行此操作】系统确认框，省去繁琐的手动切页步骤。</li>
                  <li style={{ marginTop: 6 }}><strong>极速草稿 (快跑模式)</strong>：点击写作旁的小三角下拉箭头可自由切换为 <strong>【极速草稿】</strong>，支持在右侧输入“创意描述大纲”（如：“主角打碎花瓶，被师父责罚”）后快速出稿。</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "2. 写作前置安全门禁与拦截警告 (Safety Prerequisites)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                为了确保您的长篇设定不崩塌，在触发智能续写与极速草稿时，系统会自动进行<strong>前置状态审计拦截</strong>：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                如果当前章节未执行【大纲规划】、【防崩审计】及【同步设定】等步骤，其在章节看板或索引中的状态不是“已过审” (approved)，系统会弹窗发出警告拦截，并引导您先执行这些安全保障步骤。
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>智能规划提醒拦截与免检通道</strong>：当您触发续写或草稿时，系统会自动检测当前章节的蓝图状态：
                <ul style={{ paddingLeft: 18, margin: "6px 0", lineHeight: "1.7" }}>
                  <li>若该章<strong>尚未规划蓝图</strong>，系统弹出规划提醒弹窗，建议您先完成蓝图规划以获得最佳写作效果。</li>
                  <li>您可以选择 <strong>【先去规划】</strong> 跳转到蓝图规划，或选择 <strong>【跳过，直接写】</strong> 免检通道直接开始创作。</li>
                  <li><em>前置流程的这一严格质检逻辑同样能够防止模型因前序上下文未对账、未审计一致性而产生的“设定越狱”和境界战斗力坍塌。</em></li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "3. 空缺章节填补与逻辑冲突回滚",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                系统内置了智能的文件断层检测和回滚保护：
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><strong>空缺章节自动填补 (Auto-Healing)</strong>：若你在文件树中意外删除了某章（如第 4 章），在写第 5 章时，系统检测到章节空缺，会自动创建第 4 章占位草稿并向你报警，维持故事的时序连贯。</li>
                <li><strong>分支重写冲突阻断 (Conflict Warning)</strong>：若你回到前面（例如第 3 章）重新续写，而你的书库中已经存在后续的第 4、5、6 章。系统会弹出红色警告：
                  <br />
                  <span style={{ color: "#ef4444", fontWeight: 600 }}>“检测到书库中已存在后续章节。在第 3 章后重新起草，将自动废弃并物理覆盖后续所有章节。”</span>
                  <br />
                  一旦你确认强制重写，系统会在后台执行 `write rewrite --force`，自动将整个宇宙的状态快照完美回滚到第 3 章末尾，确保后续章节不会产生大面积逻辑污染。
                </li>
              </ul>
            </div>
          ),
        },
      ],
    },
    {
      id: "sync",
      icon: "🔁",
      title: "第五步：对账同步",
      subtitle: "更新真相账本以对抗AI长期遗忘",
      steps: [
        {
          title: "1. 设定同步的作用原理",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                网络小说创作极度依赖前后的呼应和设定的严密性。当你手动修改了章节正文后，大模型如果未能读取到你的修改，会在后续生成中产生吃设定现象。
              </div>
              <div>
                <strong>解决方案</strong>：完成手动编辑后，点击底部工具栏绿色的 <strong>【同步设定】</strong>。
                系统会在后台提取本章所有关键事件、状态演变，更新到 <code>story/</code> 账本中。
              </div>
            </div>
          ),
        },
        {
          title: "2. 四种核心账本与可视化剧情伏笔",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>状态卡 (<code>current_state.md</code>)</strong>：
                    更新当前章发生事件的简短摘要、所处宏观场景与时序，以及当前在场角色的存活状态。
                  </li>
                  <li style={{ marginTop: 6 }}><strong>资源数值账本 (<code>particle_ledger.md</code>)</strong>：
                    对于升级流或具有严密数值系统的网络小说（如修仙的灵力、网游的经验值、财富等），同步设定会自动对账并更新数值。若正文中主角购买法宝消耗了 100 灵石，账本中灵石会自动扣除，避免“主角的灵石花不完”等贬值硬伤。
                  </li>
                  <li style={{ marginTop: 6 }}><strong>角色情感关系与弧线 (<code>emotional_arcs.md</code>)</strong>：
                    记录在不同章节节点中，各个角色的情绪状态（例如：愤怒、悲伤、欣喜）、情绪触发事件、情感波动强度以及情感走势方向（如：上升、下降、波动）。这为 AI 在后续情节中把握角色行为逻辑和心路历程提供关键的记忆线索。
                  </li>
                  <li style={{ marginTop: 6 }}><strong>未兑现伏笔池 (<code>pending_hooks.md</code>)</strong>：
                    自动检索本章正文。如果主角在正文中埋下了伏笔（如“在角落种下了隐形种子”），伏笔池会自动记录该 Hook；若主角击杀了埋伏已久的强敌，伏笔池会自动将该伏笔标记为“已兑现并闭环”，防止烂尾。同步完成后，右侧面板会展示 <strong>可视化伏笔看板 (Hook Dashboard)</strong>，以色彩标签卡片形式展示所有待兑现 (pending)、已兑现 (resolved) 和已过期 (expired) 的伏笔。
                  </li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "3. 设定事实编辑与删除支持 (Fact Editing)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                同步完成后，右侧报告面板中的各设定事实条目支持<strong>单击直接编辑</strong>：
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><strong>单击事实文本</strong>：直接进入内联编辑模式，修改后按回车或点击外部自动保存。</li>
                <li><strong>关系条目编辑</strong>：每条人物关系右侧有铅笔图标，点击后展开编辑输入框。</li>
                <li><strong>删除条目</strong>：鼠标悬停时会出现红色删除按钮，点击后该条目从 <code>story/</code> 真相数据库中永久移除。</li>
              </ul>
            </div>
          ),
        },
        {
          title: "4. 时光机预览扩展与全局视图 (Timeline Preview)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                时光机面板支持更灵活的预览范围控制：
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><strong>预览未来章节</strong>：章节滑块最大值为当前最新章 +1，允许您预览下一章同步后的预期状态快照。</li>
                <li><strong>全局显示开关</strong>：开启 <strong>【显示全部 (Show All)】</strong> 后，时光机将展示所有章节的完整设定演变历史，而非仅显示当前章节的增量变化。</li>
              </ul>
            </div>
          ),
        },
        {
          title: "5. 角色情感曲线可视化 (Emotional Arc Visualizer)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                为了让作者对人物情绪起伏一目了然，系统支持将 <code>emotional_arcs.md</code> 中的表格数据自动转化为交互式图表：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>SVG 情绪波动折线图</strong>：直接在编辑器中点击打开 <code>emotional_arcs.md</code> 并开启顶部状态栏旁的【可视化视图】。系统会自动生成一张精美的 SVG 折线图表，将情感强度（1-10）和章节（Ch.X）分别映射为 Y 轴和 X 轴。</li>
                  <li><strong>角色聚焦过滤</strong>：您可以在图表顶部的下拉菜单中选择“全部角色”以综合观察所有角色在各章节的情感张力走向，也可以选择特定的主角，查看其个人专属的完整心路历程折线。</li>
                </ul>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "audit",
      icon: "🔍",
      title: "第六步：质量审计",
      subtitle: "连续性与人设冲突多智能体校验",
      steps: [
        {
          title: "1. 运行防崩审计",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                点击底部的蓝色按钮 <strong style={{ color: "#60a5fa" }}>【防崩审计】</strong>。
                系统将调用独立审计智能体扫描本章正文，与你的真相设定数据库进行精细核对。
              </div>
            </div>
          ),
        },
        {
          title: "2. 十二大核心防崩维度",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", lineHeight: "1.6" }}>
                  <div>• <strong>OOC 人设坍塌</strong>：性格突变或违反人设设定</div>
                  <div>• <strong>Mainline 大纲跑偏</strong>：偏离主线蓝图</div>
                  <div>• <strong>Timeline 时序冲突</strong>：剧情发生顺序错误</div>
                  <div>• <strong>Conflict 爽点虚化</strong>：承诺的情节点未爆开</div>
                  <div>• <strong>Hook 伏笔漏洞</strong>：挖坑未埋或未同步登记</div>
                  <div>• <strong>Power 战力崩坏</strong>：境界、装备数值异常膨胀</div>
                  <div>• <strong>Pacing 节奏失控</strong>：推进过慢或过渡过硬</div>
                  <div>• <strong>POV 视角混乱</strong>：第三人称与第一人称意外混淆</div>
                  <div>• <strong>Subplot 支线停滞</strong>：支线大面积闲置无推进</div>
                  <div>• <strong>Relationship 关系冲突</strong>：配角对主角态度转变不合理</div>
                  <div>• <strong>Incentive 利益链冲突</strong>：人物动机缺乏底层逻辑</div>
                  <div>• <strong>Canon 违反正典</strong>：同人创作中违背原著世界法则</div>
                </div>
              </div>
            </div>
          ),
        },
        {
          title: "3. 问题级别定义",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><strong style={{ color: "#ef4444" }}>Critical (严重致命)</strong>：人设大面积坍塌、核心设定冲突、大纲彻底跑偏。系统会拦截接下来的新章自动续写，必须修正此级别错误后方可继续。</li>
                <li><strong style={{ color: "#f97316" }}>Warning (警告)</strong>：局部战斗力描写略高、伏笔登记漏掉、小数值算错。建议微调以保持长篇故事线整洁。</li>
                <li><strong style={{ color: "var(--accent)" }}>Info (参考建议)</strong>：局部的行文措辞冗余、段落等长导致阅读疲劳、词汇丰富度建议。</li>
              </ul>
            </div>
          ),
        },
      ],
    },
    {
      id: "revise",
      icon: "🪄",
      title: "第七步：智能精修控制台",
      subtitle: "四大精修模式 + AI 特征检测，双栏对比掌控修改幅度",
      steps: [
        {
          title: "1. 开启智能精修控制台 (Revision Console)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                在章节编辑器底部工具栏，点击 <strong style={{ color: "#c084fc" }}>【开启 AI 智能精修】</strong> 按钮，编辑器下方会展开精修控制台面板。
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><code>选择精修模式</code>：提供四大精修工具，涵盖润色、纠偏、重写和祛AI腔。</li>
                <li><code>修改意图与指引 (Prompt Guidance)</code>：您可以直接在输入框中输入具体的修改意见或创作微调方向（例如：“增加对战斗场景的感官描写，突出刀光剑影”）。</li>
              </ul>
            </div>
          ),
        },
        {
          title: "2. 精修日志与双栏对比预览 (Logs & Split Preview)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                点击 <strong>【开启 AI 智能精修】</strong> 按钮，系统会启动多智能体精修管线。
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><strong>实时日志终端</strong>：右侧面板将智能切换为黑色终端，实时打印 InkOS 智能体的修改与审计细节。</li>
                <li><strong>双栏对比视图</strong>：精修完成后，界面展示双栏 Diff 对比器。左栏为原文本（红色删除线标记），右栏为精修后的文本（绿色高亮标记），两侧滚动条智能同步绑定，确保您能精细化核对每一个改动的字句。</li>
              </ul>
            </div>
          ),
        },
        {
          title: "3. 采纳或放弃修改 (Accept or Cancel)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                核对精修效果后，您拥有最高决定权。
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                <li><strong>采纳修改</strong>：点击左侧下方的 <strong>【采纳精修修改 (Accept)】</strong>，新生成的文本将完美替换编辑器中的对应草稿。</li>
                <li><strong>放弃修改</strong>：如果对精修不满意，可点击右上角或底部的 <strong>【取消 / 放弃】</strong>，系统不会对源文件做任何修改。</li>
              </ul>
            </div>
          ),
        },
        {
          title: "4. 四大精修模式详解 (The 4 Revision Modes)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong><Emoji char="✨" /> 润色抛光 (Polish)</strong>：
                    只改行文措辞和病句修饰，<strong>绝对不改变任何剧情事实与结论</strong>。适合成稿后的最后一轮语言精修。
                  </li>
                  <li style={{ marginTop: 6 }}><strong><Emoji char="⚠️" /> 定点纠偏 (Spot-Fix)</strong>：
                    专为纠错设计，系统会自动读取上一阶段「防崩审计」检出的剧情或人设冲突列表，并针对性生成局部替换补丁，未受影响的其余 99% 的文本原封不动保留，安全度极高。
                  </li>
                  <li style={{ marginTop: 6 }}><strong><Emoji char="🛡️" /> 祛AI腔 (Anti-Detect)</strong>：
                    针对网文机器味过浓的痛点，进行口语化重组与自然化重构，打破均等对称的长句段，清洗“仿佛、不禁、嘴角微微上扬”等高频 AI 疲劳词，让句式呼吸感更自然。
                  </li>
                  <li style={{ marginTop: 6 }}><strong><Emoji char="✍️" /> 剧情重写 (Rework)</strong>：
                    允许推倒整章的场景顺序和矛盾冲突进行重写。但依然受到 <code>story/</code> Truth 数据库大纲的刚性制约，无法违反已发生的历史设定。
                  </li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "5. 检测 AI 味 (Detect AI-ness)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <strong>定义与核心原则</strong>：
                只评估，<strong>绝对不修改任何正文</strong>。系统通过大模型或本地规则，深度解剖当前正文中的 AI 特征，并生成诊断报告。
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>LLM 大模型检测</strong>：从语义层面审查文字是否空洞、叙述腔调是否模板化，指明需要去 AI 味的具体句子和冗长句段。</li>
                  <li><strong>本地规则检测 (Offline)</strong>：完全基于本地算法，计算段落句长分布是否过于均等、排比结构是否冗余、以及套话转折词的出现频次（零耗费 Token）。</li>
                </ul>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "advanced",
      icon: "🚀",
      title: "第八步：高级辅助功能",
      subtitle: "文风克隆、长篇归档、同人创作与合规导出",
      steps: [
        {
          title: "1. 文风克隆工坊 (Style Clone Workshop)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                通过提取和分析统计你的文风特征，让 AI 续写和改写时的文笔高度贴合你本人的写作语气。
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <strong>实战技巧</strong>：
                <ol style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li>点击右上角顶栏的 <strong>【风格管理】</strong> 按钮（钢笔图标），打开文风管理面板。</li>
                  <li>粘贴你本人以往纯手写、且最满意的小说段落（强烈建议在 2000-5000 字之间，最好是包含对话、场景描写和日常叙述的综合片段）。</li>
                  <li>AI会进行文风特征提取并生成 <code>style_guide.md</code> 文风指南存入 <code>story/</code>。</li>
                  <li>在起草或续写弹窗中，文风偏好选择器将出现刚刚克隆的文风名称。选择该文风后，所有的智能续写和改写都将自动沿袭你的这一专属文风特色。</li>
                </ol>
              </div>
            </div>
          ),
        },
        {
          title: "2. 大纲摘要压缩归档 (Consolidate)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <strong>上下文窗口危机</strong>：
                当你的书写到 50 章或上百章之后，几近百万字的历史章节由于大模型上下文窗口限制，会导致 AI 忘记前期的伏笔和人设。
              </div>
              <div>
                <strong>操作方法</strong>：
                当系统检测到完结卷或历史章节过多时，左侧栏顶部会弹出 <strong>“建议进行大纲摘要压缩”</strong> 的小字卡片。点击 <strong>【一键压缩归档】</strong>。
              </div>
              <div>
                <strong>底层逻辑</strong>：
                系统会将已完结的所有章节摘要压缩归并为宏观的“卷级概要”存入 <code>volume_summaries.md</code>，并将明细摘要封存到 <code>summaries_archive/</code>。这样可以极大地精简大模型所需阅读的上下文，腾空 Token，同时保障大模型对几百章前埋下的暗线伏笔依然具备长效记忆。
              </div>
            </div>
          ),
        },
        {
          title: "3. 同人创作模式深度规则 (Fanfiction CP/AU/OOC)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                在新建书籍时开启“同人写作”模式，系统支持以下 4 种微调态度：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7", fontSize: 11 }}>
                  <li><strong>正典延续 (canon)</strong>：AI 强力对齐原著背景设定和人物结局，作为官方续写。</li>
                  <li><strong>平行宇宙 (au)</strong>：允许将人物放置在全新世界背景下，但保留核心性格和说话语癖。</li>
                  <li><strong>角色偏离 (ooc)</strong>：放开人设性格束缚，允许发生反差性发展。</li>
                  <li><strong>角色配对 (cp)</strong>：强力驱动两人互动，自动聚焦和放大情感线、羁绊线。</li>
                </ul>
              </div>
              <div>
                <strong><Emoji char="🎬" /> 刷新同人设定</strong>：
                在左侧栏点击“刷新设定”，填入原著的小说文本或人物百科绝对路径。AI会重新提炼原作的语癖（如标志性口头禅、句尾助词）以及人物特征，重新计算以供写作时随时使用。
              </div>
            </div>
          ),
        },
        {
          title: "4. 全自动短篇小说生成管线 (Short Novel Pipeline)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                侧边栏支持 <strong>【一键全自动生成短篇】</strong>：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                输入一段故事题材构想，并设定目标章节数（默认为 12 章） 和单章字数。
                系统将连续启动多智能体管线：自动生成故事大纲 ➜ 生成每章蓝图细化细纲 ➜ 连续全自动起草 12-18 章完整正文 ➜ 在后台自动生成对应的书籍精美封面。适合快速生成成套短篇小说。
              </div>
            </div>
          ),
        },
        {
          title: "5. 导出小说书稿 (Exporting Options)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                点击侧边栏顶部的 <strong>【导出小说书稿】</strong> 按钮（向上箭头图标）：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>输出格式</strong>：支持合并为单一的 <code>.txt</code>、<code>.md</code>，或导出为格式精美的 <code>.epub</code> 电子书格式。</li>
                  <li><strong>审核态过滤</strong>：勾选 <strong>“仅导出已审核通过章节”</strong>，系统会自动过滤掉尚未完成或被标记为审计失败的草稿，保障发布版本绝对合规安全。</li>
                </ul>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "hooks",
      icon: "🪝",
      title: "剧情伏笔",
      subtitle: "伏笔生命周期、债务防坍塌与预警解除机制",
      steps: [
        {
          title: "1. 伏笔账本与核心指标 (The Hook Ledger)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                剧情伏笔是贯穿小说创作周期的核心线索。系统在每次【对账同步】时，会自动在底层 Truth 数据库生成并同步 <code>story/pending_hooks.md</code> 文件。
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <strong>账本核心字段定义：</strong>
                <ul style={{ paddingLeft: 18, margin: "6px 0", lineHeight: "1.7" }}>
                  <li><code>起始章节 (Start Chapter)</code>：伏笔首次被埋下或登记的章节。</li>
                  <li><code>最近推进 (Last Advanced)</code>：该伏笔最近一次在正文中取得实质进展的章节。</li>
                  <li><code>回收节奏 (Payoff Timing)</code>：预期的回收时序，例如：<em>立即</em>（本章/下章）、<em>近期</em>（短线）、<em>中程</em>（卷中）、<em>慢烧</em>（长线）、<em>终局</em>（大结局）。它决定了系统对伏笔的超时判定阈值。</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "2. 活跃上限与伏笔债务警报 (Active Limit & Hook Debt)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                为了防止长篇网络小说因线索冗余或“光挖坑不填坑”导致大模型上下文对账超载，系统对活跃伏笔设置了严格的监控：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>活跃伏笔上限</strong>：系统建议上限为 <strong>12</strong> 个。若当前处于 <code>open</code> (未解决) 或 <code>progressing</code> (推进中) 状态的伏笔数超过 12 个，章节看板将触发“伏笔债务过高”警告。</li>
                  <li style={{ marginTop: 6 }}><strong>规避手段</strong>：新开伏笔时，尽量搭配回收旧伏笔。若部分伏笔已被解决，在 <code>pending_hooks.md</code> 表格中将其状态更新为 <code>resolved</code> 即可快速清减活跃债务。</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "3. 推进/回收压力区判定 (Payoff Pressure)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                当伏笔由于故事章节推移而满足特定条件时，系统会亮起“回收/推进压力”警报：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>逾期 (Overdue)</strong>：超出了回收节奏指定的章节间隔。例如“近期”回收的伏笔，其跨度超过 5 章仍未回收即为逾期。</li>
                  <li><strong>陈旧 (Stale)</strong>：非延后伏笔在连续 10 章内没有发生任何实质进展或提及。</li>
                  <li><strong>可回收 (Ready to Resolve)</strong>：伏笔生存时间已满足最早回收要求且具备推进活力，进入了可闭环状态。</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "4. 如何实质性消除伏笔警告 (Resolving Warnings)",
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                仅仅在章节正文中口头“提到（mention）”压力区伏笔是无法消除警告的。创作者必须采取以下三种方式之一真正进行处置（Disposition）：
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: "1.7" }}>
                  <li><strong>回收 (Resolve)</strong>：在正文中将事件交代闭环，同步后系统会将账本状态记为 <code>resolved</code>（已回收），该伏笔自动退出活跃统计。</li>
                  <li><strong>推进 (Advance)</strong>：在正文中推动线索发生重大改变，同步后更新伏笔的 <code>最近推进</code> 为当前章节。</li>
                  <li><strong>延后 (Defer)</strong>：若决定推迟解决，可手动在 <code>pending_hooks.md</code> 表格中将其状态改为 <code>deferred</code>（延后），或将其 <code>回收节奏</code> 调低（如从“近期”调为“中程”），系统会自动解除警告。</li>
                </ul>
              </div>
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(10, 10, 10, 0.4)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "flex-end", // Slide over from right
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={onClose}
    >
      {/* Drawer Body */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92%)",
          height: "100%",
          background: "var(--bg)",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          fontFamily: "var(--font-serif)",
          animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
            <Emoji char="📚" style={{ fontSize: 18 }} /> ink-xY小说实战创作手册
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              width: 26,
              height: 26,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "none";
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selection Row */}
        <div
          style={{
            display: "flex",
            flexWrap: "nowrap",
            overflowX: "auto",
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border)",
            padding: "6px 8px",
            gap: 3,
            flexShrink: 0,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {sections.map((sec) => {
            const isSelected = activeTab === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => {
                  setActiveTab(sec.id);
                  setExpandedStep(0); // reset expanded step to first step of new tab
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: isSelected ? "var(--bg-selected)" : "transparent",
                  color: isSelected ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 10.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <span><Emoji char={sec.icon} /></span>
                <span>{sec.title.split("：")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        {(() => {
          const currentSection = sections.find((s) => s.id === activeTab) || sections[0];
          return (
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {currentSection.title}
                </span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 8px 0", color: "var(--text)" }}>
                  {currentSection.subtitle}
                </h2>
                <div style={{ height: 2, width: 40, background: "var(--accent)", borderRadius: 1 }} />
              </div>

              {/* Steps Area */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {currentSection.steps.map((step, idx) => {
                  const isExpanded = expandedStep === idx;
                  return (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: isExpanded ? "var(--bg-panel)" : "transparent",
                        overflow: "hidden",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {/* Step Header */}
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : idx)}
                        style={{
                          width: "100%",
                          padding: "14px 18px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "var(--font-serif)",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: isExpanded ? "var(--accent)" : "var(--text)" }}>
                          {step.title}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Step Content */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: "0 18px 18px 18px",
                            fontSize: 12,
                            color: "var(--text-muted)",
                            lineHeight: "1.7",
                            borderTop: "1px solid rgba(255, 255, 255, 0.03)",
                          }}
                        >
                          {step.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-panel)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
            <Emoji char="💡" /> 提示：侧边栏支持导入旧稿、导出书稿、一键全自动生成短篇和设定归档。
          </span>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 600,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg)";
            }}
          >
            我懂了，开始创作
          </button>
        </div>
      </div>
    </div>
  );
}
