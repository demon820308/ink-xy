"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ================================================================== */
/*  Types & Description Map                                            */
/* ================================================================== */

interface PromptMeta {
  name: string;
  category: string;
  language: string;
  isModified: boolean;
  size: number;
}

interface PromptDetail {
  name: string;
  content: string;
  defaultContent: string;
  isModified: boolean;
}

type TabKey = "edit" | "diff" | "default";

interface DiffLine {
  type: "equal" | "added" | "removed";
  text: string;
  lineNumOld: number | null;
  lineNumNew: number | null;
}

interface PromptHelpDoc {
  title: string;
  role: string;
  scenario: string;
  variables: string;
}

// 类别中文映射表
const CATEGORY_MAP: Record<string, string> = {
  All: "全部类别",
  Planner: "大纲策划 (Planner)",
  Writer: "智能写手 (Writer)",
  Auditor: "质量审计 (Auditor)",
  Architect: "设定架构 (Architect)",
  Analyzer: "章节分析 (Analyzer)",
  Observer: "观察评估 (Observer)",
  Detector: "AI痕迹检测 (Detector)",
  Polisher: "文本润色 (Polisher)",
  Settler: "角色置入 (Settler)",
  Reviser: "段落修改 (Reviser)",
  "Short Fiction": "短篇小说 (Short Fiction)",
  Fanfic: "同人导入 (Fanfic)",
  Foundation: "大纲审查 (Foundation)",
  Validator: "设定校验 (Validator)",
  Consolidator: "事实整合 (Consolidator)",
  Normalizer: "长度规整 (Normalizer)",
  "Draft Helper": "草稿助手 (Draft Helper)",
  Canon: "典籍提取 (Canon)",
  "Style Guide": "文风提取 (Style Guide)",
  Workbench: "聊天台 (Workbench)",
  Radar: "写作雷达 (Radar)",
  Other: "其他辅助",
  General: "通用模板"
};

// 详细的作用与变量说明卡片配置
const PROMPT_HELP_DOCS: Record<string, PromptHelpDoc> = {
  "planner_system_zh.md": {
    title: "大纲策划师核心系统指令 (中文)",
    role: "指导大纲策划 Agent 进行小说的题材定位、情节矛盾设计、核心爽点设置及大纲骨架的起草。",
    scenario: "在主界面点击'大纲策划'或创建新书策划时，大纲 Agent 执行的初始化系统提示词。",
    variables: "{{genre}} (题材), {{subgenre}} (子题材), {{dimList}} (维度规则列表)"
  },
  "planner_system_en.md": {
    title: "大纲策划师核心系统指令 (英文)",
    role: "英文书籍大纲策划核心系统提示词。",
    scenario: "策划英文版新书大纲时加载运行。",
    variables: "{{genre}}, {{subgenre}}, {{dimList}}"
  },
  "writer_system_zh.md": {
    title: "智能写手核心起草系统指令 (中文)",
    role: "定义 AI 写手的写作特色、叙事视角（第一/三人称）、段落长短控制、场景细节描写规范，是决定生成文章质量的灵魂指令。",
    scenario: "在章节编辑器中点击'自动起草下一章'或'AI续写'时，负责起草正文的写手 Agent 的底层系统 Prompt。",
    variables: "{{styleGuide}} (文风指南), {{chapterIntent}} (本章意图), {{context}} (前文情节上下文)"
  },
  "writer_system_en.md": {
    title: "智能写手核心起草系统指令 (英文)",
    role: "英文写手 Agent 核心系统提示词，规范英文写作风格与段落格式。",
    scenario: "起草或续写英文书籍章节时触发。",
    variables: "{{styleGuide}}, {{chapterIntent}}, {{context}}"
  },
  "auditor_system_zh.md": {
    title: "人设与事实质量审计核心指令 (中文)",
    role: "对比当前章节内容与'角色设定卡'、'世界观设定集'及'历史事实快照'，审计是否有违背设定、角色崩坏、地理逻辑矛盾等硬伤错误。",
    scenario: "在编辑器工具栏点击'人设防崩审计'按钮，或在后台执行写作自动合规审查时调用。",
    variables: "{{charCards}} (角色卡), {{worldLore}} (世界观), {{content}} (当前正文内容)"
  },
  "auditor_system_en.md": {
    title: "人设与事实质量审计核心指令 (英文)",
    role: "英文版人设防崩与一致性事实审计提示词。",
    scenario: "英文书籍正文人设一致性审计时触发。",
    variables: "{{charCards}}, {{worldLore}}, {{content}}"
  },
  "state_validator_system.md": {
    title: "设定与状态真理校验核心指令",
    role: "负责对章节产生的位置、道具、物理状态变化进行最终'真理校验'。以逻辑推理防止出现'死而复生'或'瞬间移动'等违背物理规律的硬伤。",
    scenario: "写手自动生成章节完成后，Validator 工具在后台进行数据比对校验时调用。",
    variables: "{{langInstruction}} (输出语种说明), {{stateDiff}} (状态事实差分数据)"
  },
  "detector_system_zh.md": {
    title: "AIGC 痕迹检测指令 (中文)",
    role: "分析文本中是否存在'AI腔'、空洞词汇以及不自然句式，提供润色和降低 AI 感的修改建议。",
    scenario: "在编辑器工具栏点击'AI痕迹检测'时触发。",
    variables: "{{content}} (待测文本正文)"
  },
  "polisher_system_zh.md": {
    title: "智能润色师核心指令 (中文)",
    role: "对章节正文进行文藻润色、情感张力强化、错别字修正及语句通顺化加工。",
    scenario: "执行章节精细润色或文风微调时触发。",
    variables: "{{style}} (风格要求), {{text}} (正文内容)"
  },
  "short_fiction/sf_writer_system.md": {
    title: "微型短篇写手核心系统指令",
    role: "针对微型/短篇小说（数千字完结）特化的写手指令。控制情节极速展开、快速铺垫冲突，并在有限篇幅内收线。",
    scenario: "短篇小说/微型故事自动起草时触发。",
    variables: "{{styleGuide}}, {{intent}}, {{context}}"
  }
};

/* ================================================================== */
/*  LCS-based Diff Algorithm                                           */
/* ================================================================== */

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const dp = computeLCS(oldLines, newLines);

  let i = oldLines.length;
  let j = newLines.length;
  const raw: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.push({
        type: "equal",
        text: oldLines[i - 1],
        lineNumOld: i,
        lineNumNew: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({
        type: "added",
        text: newLines[j - 1],
        lineNumOld: null,
        lineNumNew: j,
      });
      j--;
    } else {
      raw.push({
        type: "removed",
        text: oldLines[i - 1],
        lineNumOld: i,
        lineNumNew: null,
      });
      i--;
    }
  }

  raw.reverse();
  return raw;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);

  if (oldText === newText) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontStyle: "italic", fontSize: 13 }}>
        ✅ 当前文件内容与系统内置出厂版本完全一致，未检测到任何修改差异。
      </div>
    );
  }

  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === "added") added++;
    if (l.type === "removed") removed++;
  }

  return (
    <div>
      <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, background: "var(--bg-panel)" }}>
        <span style={{ color: "#16a34a", fontWeight: 600 }}>新增行: +{added}</span>
        <span style={{ color: "#dc2626", fontWeight: 600 }}>删除行: -{removed}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.65, overflowX: "auto" }}>
        {lines.map((line, idx) => {
          let bg = "transparent";
          let prefix = " ";
          let color = "var(--text)";
          let lineNumColor = "var(--text-dim)";
          if (line.type === "added") {
            bg = "rgba(22,163,74,0.10)";
            prefix = "+";
            color = "#15803d";
            lineNumColor = "#16a34a";
          } else if (line.type === "removed") {
            bg = "rgba(220,38,38,0.10)";
            prefix = "-";
            color = "#b91c1c";
            lineNumColor = "#dc2626";
          }
          return (
            <div key={idx} style={{ display: "flex", background: bg, padding: "0 12px", minHeight: 22 }}>
              <span style={{ width: 40, textAlign: "right", paddingRight: 8, color: lineNumColor, userSelect: "none", flexShrink: 0, fontSize: 12 }}>
                {line.lineNumOld ?? ""}
              </span>
              <span style={{ width: 40, textAlign: "right", paddingRight: 8, color: lineNumColor, userSelect: "none", flexShrink: 0, fontSize: 12 }}>
                {line.lineNumNew ?? ""}
              </span>
              <span style={{ width: 18, textAlign: "center", color: line.type === "equal" ? "var(--text-dim)" : color, fontWeight: line.type === "equal" ? 400 : 700, flexShrink: 0 }}>
                {prefix}
              </span>
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color, paddingLeft: 4 }}>
                {line.text || "\u00A0"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Isolated Prompt Editor (Prevents Parent Component Lag)            */
/* ================================================================== */

interface PromptEditorProps {
  detail: PromptDetail;
  safetyChecked: boolean;
  setSafetyChecked: (val: boolean) => void;
  onSave: (content: string) => Promise<boolean>;
  registerFlush: (flushFn: () => Promise<void>) => void;
}

function PromptEditor({
  detail,
  safetyChecked,
  setSafetyChecked,
  onSave,
  registerFlush,
}: PromptEditorProps) {
  const [localContent, setLocalContent] = useState(detail.content);
  const [saveStatus, setSaveStatus] = useState<"idle" | "typing" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localContentRef = useRef(localContent);
  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    setLocalContent(detail.content);
    setSaveStatus("idle");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, [detail]);

  const flushSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (saveStatus === "typing") {
      setSaveStatus("saving");
      const success = await onSaveRef.current(localContentRef.current);
      setSaveStatus(success ? "saved" : "error");
    }
  }, [saveStatus]);

  useEffect(() => {
    registerFlush(flushSave);
    return () => registerFlush(async () => {});
  }, [flushSave, registerFlush]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const handleChange = (val: string) => {
    setLocalContent(val);
    if (!safetyChecked) return;

    setSaveStatus("typing");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      const success = await onSaveRef.current(val);
      setSaveStatus(success ? "saved" : "error");
    }, 1000);
  };

  const statusLabel = useMemo(() => {
    switch (saveStatus) {
      case "typing": return { text: "● 正在编辑...", color: "#ea580c" };
      case "saving": return { text: "◌ 正在保存...", color: "var(--accent)" };
      case "saved": return { text: "✓ 已自动存盘", color: "#16a34a" };
      case "error": return { text: "❌ 保存失败", color: "#dc2626" };
      default: return null;
    }
  }, [saveStatus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "12px 20px",
        background: safetyChecked ? "rgba(22,163,74,0.06)" : "rgba(234,88,12,0.06)",
        borderBottom: `1px solid ${safetyChecked ? "rgba(22,163,74,0.2)" : "rgba(234,88,12,0.2)"}`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0
      }}>
        <input
          type="checkbox"
          id="safety-lock"
          checked={safetyChecked}
          onChange={(e) => setSafetyChecked(e.target.checked)}
          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent)" }}
        />
        <label htmlFor="safety-lock" style={{ fontSize: 13, cursor: "pointer", color: safetyChecked ? "var(--text)" : "#b45309", fontWeight: 600 }}>
          ⚠️ 我已知晓修改 Prompt 的极高风险，承诺对修改后的指令正确性负责
        </label>
        <span style={{ flex: 1 }} />
        {statusLabel && (
          <span style={{ fontSize: 12, fontWeight: 600, color: statusLabel.color, transition: "color 0.15s" }}>
            {statusLabel.text}
          </span>
        )}
      </div>

      <textarea
        value={localContent}
        onChange={(e) => handleChange(e.target.value)}
        disabled={!safetyChecked}
        spellCheck={false}
        placeholder="在此处输入自定义提示词模板..."
        style={{
          flex: 1, padding: 16, border: "none", outline: "none", resize: "none",
          fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.7,
          background: safetyChecked ? "var(--bg)" : "var(--bg-panel)", color: "var(--text)", opacity: safetyChecked ? 1 : 0.5
        }}
      />
    </div>
  );
}

/* ================================================================== */
/*  Admin Page Dashboard                                               */
/* ================================================================== */

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [langFilter, setLangFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("edit");
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flushFnRef = useRef<() => Promise<void>>(async () => {});
  const registerFlush = useCallback((fn: () => Promise<void>) => {
    flushFnRef.current = fn;
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prompts");
      const data = await res.json();
      if (data.success) setPrompts(data.prompts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchDetail = useCallback(async (name: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/prompts?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.success) {
        setDetail(data);
        setSafetyChecked(false);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) fetchDetail(selected);
  }, [selected, fetchDetail]);

  const categories = useMemo(() => {
    const set = new Set(prompts.map((p) => p.category));
    return ["All", ...Array.from(set).sort()];
  }, [prompts]);

  const filtered = useMemo(() => {
    let list = prompts;
    if (categoryFilter !== "All") list = list.filter((p) => p.category === categoryFilter);
    if (langFilter !== "all") list = list.filter((p) => p.language === langFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return list;
  }, [prompts, categoryFilter, langFilter, search]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleAutoSave = useCallback(async (content: string) => {
    if (!selected) return false;
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected, action: "save", content }),
      });
      const data = await res.json();
      if (data.success) {
        setPrompts((prev) =>
          prev.map((p) => (p.name === selected ? { ...p, isModified: content !== detail?.defaultContent } : p))
        );
        setDetail(prev => prev ? { ...prev, content, isModified: content !== prev.defaultContent } : null);
        return true;
      }
    } catch (e) {
      showToast(`❌ 自动保存出错: ${String(e)}`);
    }
    return false;
  }, [selected, detail, showToast]);

  const handleRestore = useCallback(async () => {
    if (!selected || !detail?.isModified) return;
    const confirmed = window.confirm(
      "⚠️ 确认要将该提示词模板还原为出厂设置吗？所有自定义修改将永久丢失且不可撤回。"
    );
    if (!confirmed) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected, action: "restore" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("↩️ 已成功恢复系统出厂内置值");
        await fetchDetail(selected);
        await fetchList();
      } else {
        showToast(`❌ 恢复失败: ${data.error}`);
      }
    } catch (e) {
      showToast(`❌ 恢复出错: ${String(e)}`);
    } finally {
      setRestoring(false);
    }
  }, [selected, detail, fetchDetail, fetchList, showToast]);

  const helpDoc = useMemo<PromptHelpDoc | null>(() => {
    if (!selected) return null;
    const baseName = selected.split("/").pop() || "";
    if (PROMPT_HELP_DOCS[baseName]) return PROMPT_HELP_DOCS[baseName];
    if (PROMPT_HELP_DOCS[selected]) return PROMPT_HELP_DOCS[selected];

    const meta = prompts.find((p) => p.name === selected);
    if (meta) {
      const catZh = CATEGORY_MAP[meta.category] || meta.category;
      return {
        title: `${meta.name} 辅助指令模板`,
        role: `服务于写手引擎的【${catZh}】子步骤，配合核心 Agent 规范大语言模型的输出表现。`,
        scenario: `由主引擎在执行【${catZh}】相关任务链路时自动装载运行。`,
        variables: "无特定大括号插值占位符，或参见模板正文。"
      };
    }
    return null;
  }, [selected, prompts]);

  return (
    <div style={{ display: "flex", height: "100dvh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-serif)" }}>
      {/* ====== LEFT SIDEBAR ====== */}
      <aside style={{ width: 320, minWidth: 320, borderRight: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--accent)", textDecoration: "none", marginBottom: 10, fontWeight: 500 }}>
            ← 返回工作台
          </a>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>⚙️ 提示词指令中心</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>物理路径: prompts/ — 共 {prompts.length} 个模板</p>
        </div>

        <div style={{ padding: "10px 16px", flexShrink: 0 }}>
          <input
            type="text"
            placeholder="🔍 搜索提示词名称或分类..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none" }}
          />
        </div>

        <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", fontSize: 13, cursor: "pointer", outline: "none" }}
          >
            {categories.map((c) => (<option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>))}
          </select>
        </div>

        <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
          <div style={{ display: "flex", width: "100%", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
            {(["all", "zh", "en", "neutral"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLangFilter(l)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: langFilter === l ? 600 : 400,
                  background: langFilter === l ? "var(--accent)" : "var(--bg)",
                  color: langFilter === l ? "#fff" : "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s"
                }}
              >
                {l === "all" ? "全部" : l === "neutral" ? "无后缀" : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
          {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>正在载入模板列表...</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>未找到匹配的模板。</div>}

          <style>{`
            .prompt-btn {
              display: block;
              width: 100%;
              text-align: left;
              padding: 10px 12px;
              margin-bottom: 4px;
              border-radius: 6px;
              border: none;
              cursor: pointer;
              background: transparent;
              color: var(--text);
              transition: background 0.12s;
            }
            .prompt-btn:hover {
              background: var(--bg-hover) !important;
            }
            .prompt-btn.active {
              background: var(--bg-selected) !important;
            }
          `}</style>

          {filtered.map((p) => {
            const isActive = selected === p.name;
            const baseName = p.name.split("/").pop() || "";

            let displayName = "";
            if (PROMPT_HELP_DOCS[baseName]) {
              displayName = PROMPT_HELP_DOCS[baseName].title;
            } else if (PROMPT_HELP_DOCS[p.name]) {
              displayName = PROMPT_HELP_DOCS[p.name].title;
            } else {
              const catZh = CATEGORY_MAP[p.category] || p.category;
              displayName = `${catZh}指令模板`;
            }

            return (
              <button
                key={p.name}
                onClick={async () => {
                  await flushFnRef.current();
                  setSelected(p.name);
                  setTab("edit");
                }}
                className={`prompt-btn ${isActive ? "active" : ""}`}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: 2 }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted)", wordBreak: "break-all" }}>
                  {p.name}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{CATEGORY_MAP[p.category] || p.category}</span>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>·</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{p.language === "neutral" ? "无语种" : p.language.toUpperCase()}</span>
                  <span style={{ flex: 1 }} />
                  {p.isModified ? (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "rgba(234,88,12,0.15)", color: "#ea580c" }}>已修改</span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 4, background: "var(--bg-subtle)", color: "var(--text-dim)" }}>默认内置</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ====== MAIN AREA ====== */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 48, opacity: 0.25 }}>📝</div>
            <div style={{ fontSize: 15, color: "var(--text-muted)" }}>请在左侧侧边栏选择一个 Agent 提示词指令模板进行操作。</div>
          </div>
        ) : detailLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>正在加载详情数据...</div>
        ) : detail ? (
          <>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}>{selected}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {detail.isModified ? <span style={{ color: "#ea580c" }}>⚠️ 该模板已被自定义修改，覆盖了原出厂设置。</span> : <span>✅ 该模板与出厂内置默认配置完全一致。</span>}
                </div>
              </div>
              {detail.isModified && (
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "#dc2626", cursor: restoring ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: restoring ? 0.5 : 1 }}
                >
                  {restoring ? "正在恢复..." : "↩️ 恢复系统默认"}
                </button>
              )}
            </div>

            {/* Instruction Help Doc Guide Card */}
            {helpDoc && (
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📘</span> {helpDoc.title}
                </div>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
                  <strong>🤖 角色与作用：</strong> {helpDoc.role}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  <strong>🎬 触发场景：</strong> {helpDoc.scenario}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono, monospace)" }}>
                  <strong>占位插值变量：</strong> <code style={{ background: "var(--bg-panel)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--border)" }}>{helpDoc.variables}</code>
                </div>
              </div>
            )}

            {/* Tabs (Swapped Order) */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", padding: "0 20px", flexShrink: 0 }}>
              {(
                [
                  { key: "edit" as const, label: "✏️ 自定义指令 (编辑)" },
                  { key: "diff" as const, label: "📊 版本差异比对 (Diff)" },
                  { key: "default" as const, label: "📄 出厂默认模板 (只读)" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={async () => {
                    await flushFnRef.current();
                    setTab(t.key);
                  }}
                  style={{
                    padding: "10px 16px", fontSize: 13, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
                    background: "transparent", border: "none", borderBottom: `2px solid ${tab === t.key ? "var(--accent)" : "transparent"}`, cursor: "pointer", transition: "color 0.15s, border-color 0.15s"
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
              {tab === "diff" && <DiffView oldText={detail.defaultContent} newText={detail.content} />}

              {tab === "edit" && (
                <PromptEditor
                  detail={detail}
                  safetyChecked={safetyChecked}
                  setSafetyChecked={setSafetyChecked}
                  onSave={handleAutoSave}
                  registerFlush={registerFlush}
                />
              )}

              {tab === "default" && (
                <div>
                  <div style={{ padding: "8px 20px", fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
                    📄 系统默认出厂只读备份（不可修改，用以作为自定义的比较基准）
                  </div>
                  <pre style={{ margin: 0, padding: 16, fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-muted)" }}>
                    {detail.defaultContent}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, padding: "10px 20px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
}
