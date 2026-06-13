"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Genre {
  id: string;
  name: string;
  source: "builtin" | "project";
  profile: {
    name: string;
    id: string;
    language: "zh" | "en";
    chapterTypes: string[];
    fatigueWords: string[];
    numericalSystem: boolean;
    powerScaling: boolean;
    eraResearch: boolean;
    pacingRule: string;
    satisfactionTypes: string[];
    auditDimensions: number[];
  };
  body: string;
  error?: string;
}

const DIMENSION_LABELS: Record<number, { zh: string; en: string }> = {
  1: { zh: "OOC检查", en: "OOC Check" },
  2: { zh: "时间线检查", en: "Timeline Check" },
  3: { zh: "设定冲突", en: "Lore Conflict Check" },
  4: { zh: "战力崩坏", en: "Power Scaling Check" },
  5: { zh: "数值检查", en: "Numerical Consistency Check" },
  6: { zh: "伏笔检查", en: "Hook Check" },
  7: { zh: "节奏检查", en: "Pacing Check" },
  8: { zh: "文风检查", en: "Style Check" },
  9: { zh: "信息越界", en: "Information Boundary Check" },
  10: { zh: "词汇疲劳", en: "Lexical Fatigue Check" },
  11: { zh: "利益链断裂", en: "Incentive Chain Check" },
  12: { zh: "年代考据", en: "Era Accuracy Check" },
  13: { zh: "配角降智", en: "Side Character Competence Check" },
  14: { zh: "配角工具人化", en: "Side Character Instrumentalization Check" },
  15: { zh: "爽点虚化", en: "Payoff Dilution Check" },
  16: { zh: "台词失真", en: "Dialogue Authenticity Check" },
  17: { zh: "流水账", en: "Chronicle Drift Check" },
  18: { zh: "知识库污染", en: "Knowledge Base Pollution Check" },
  19: { zh: "视角一致性", en: "POV Consistency Check" },
  20: { zh: "段落等长", en: "Paragraph Uniformity Check" },
  21: { zh: "套话密度", en: "Cliche Density Check" },
  22: { zh: "公式化转折", en: "Formulaic Twist Check" },
  23: { zh: "列表式结构", en: "List-like Structure Check" },
  24: { zh: "支线停滞", en: "Subplot Stagnation Check" },
  25: { zh: "弧线平坦", en: "Arc Flatline Check" },
  26: { zh: "节奏单调", en: "Pacing Monotony Check" },
  27: { zh: "敏感词检查", en: "Sensitive Content Check" },
  28: { zh: "正传事件冲突", en: "Mainline Canon Event Conflict" },
  29: { zh: "未来信息泄露", en: "Future Knowledge Leak Check" },
  30: { zh: "世界规则跨书一致性", en: "Cross-Book World Rule Check" },
  31: { zh: "番外伏笔隔离", en: "Spinoff Hook Isolation Check" },
  32: { zh: "读者期待管理", en: "Reader Expectation Check" },
  33: { zh: "章节备忘偏离", en: "Chapter Memo Drift Check" },
  34: { zh: "角色还原度", en: "Character Fidelity Check" },
  35: { zh: "世界规则遵守", en: "World Rule Compliance Check" },
  36: { zh: "关系动态", en: "Relationship Dynamics Check" },
  37: { zh: "正典事件一致性", en: "Canon Event Consistency Check" },
};

const DEFAULT_MARKDOWN_BODY = `## 题材禁忌

- 无逻辑的剧情暴走
- 反派强行降智配合主角
- 无视世界观的战力崩坏

## 语言铁律

- 人物独白必须口语化，禁止学术化、商业化分析词汇渗入叙事
- ✗"他迅速分析了目前的压力状况" → ✓"他擦了把冷汗，心里七上八下"

## 叙事指导

- 详细的起伏节奏指引与世界观渲染逻辑。
`;

function PillEditor({
  title,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = input.trim();
      if (val && !items.includes(val)) {
        onChange([...items, val]);
      }
      setInput("");
    }
  };

  const removeItem = (item: string) => {
    onChange(items.filter((x) => x !== item));
  };

  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
        {title}
      </label>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "6px 8px",
          background: "var(--bg)",
          minHeight: "40px",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          alignItems: "center",
        }}
      >
        {items.map((item) => (
          <span
            key={item}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              color: "var(--text)",
            }}
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              style={{
                border: "none",
                background: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                padding: 0,
                fontSize: "10px",
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "输入后回车添加"}
          style={{
            border: "none",
            background: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: "11px",
            flex: 1,
            minWidth: "100px",
          }}
        />
      </div>
    </div>
  );
}

export function GenresConfig({
  cwd,
  onClose,
  onGenresChanged,
}: {
  cwd: string;
  onClose: () => void;
  onGenresChanged?: () => void;
}) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [search, setSearch] = useState("");
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"settings" | "elements" | "dimensions" | "body">("settings");
  
  // Editing state
  const [isNew, setIsNew] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editLanguage, setEditLanguage] = useState<"zh" | "en">("zh");
  const [editNumericalSystem, setEditNumericalSystem] = useState(false);
  const [editPowerScaling, setEditPowerScaling] = useState(false);
  const [editEraResearch, setEditEraResearch] = useState(false);
  const [editPacingRule, setEditPacingRule] = useState("");
  const [editChapterTypes, setEditChapterTypes] = useState<string[]>([]);
  const [editFatigueWords, setEditFatigueWords] = useState<string[]>([]);
  const [editSatisfactionTypes, setEditSatisfactionTypes] = useState<string[]>([]);
  const [editAuditDimensions, setEditAuditDimensions] = useState<number[]>([]);
  const [editBody, setEditBody] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGenres = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/genres?cwd=${encodeURIComponent(cwd)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setGenres(data.genres || []);
        if (data.genres && data.genres.length > 0 && !selectedGenreId) {
          setSelectedGenreId(data.genres[0].id);
        }
      } else {
        setError(data.error || "获取题材列表失败");
      }
    } catch {
      setError("网络错误，加载题材失败");
    } finally {
      setLoading(false);
    }
  }, [cwd, selectedGenreId]);

  useEffect(() => {
    fetchGenres();
  }, [fetchGenres]);

  const handleSelectGenre = (genre: Genre) => {
    setIsNew(false);
    setSelectedGenreId(genre.id);
    setEditId(genre.profile.id);
    setEditName(genre.profile.name);
    setEditLanguage(genre.profile.language || "zh");
    setEditNumericalSystem(Boolean(genre.profile.numericalSystem));
    setEditPowerScaling(Boolean(genre.profile.powerScaling));
    setEditEraResearch(Boolean(genre.profile.eraResearch));
    setEditPacingRule(genre.profile.pacingRule || "");
    setEditChapterTypes(genre.profile.chapterTypes || []);
    setEditFatigueWords(genre.profile.fatigueWords || []);
    setEditSatisfactionTypes(genre.profile.satisfactionTypes || []);
    setEditAuditDimensions(genre.profile.auditDimensions || []);
    setEditBody(genre.body || "");
  };

  useEffect(() => {
    if (genres.length > 0 && selectedGenreId && !isNew) {
      const target = genres.find(g => g.id === selectedGenreId);
      if (target) {
        handleSelectGenre(target);
      }
    }
  }, [selectedGenreId, genres, isNew]);

  const handleCreateNew = () => {
    setIsNew(true);
    setSelectedGenreId(null);
    setEditId("my-genre");
    setEditName("自定义题材");
    setEditLanguage("zh");
    setEditNumericalSystem(false);
    setEditPowerScaling(false);
    setEditEraResearch(false);
    setEditPacingRule("");
    setEditChapterTypes(["剧情章", "过渡章"]);
    setEditFatigueWords(["震惊", "倒吸一口凉气"]);
    setEditSatisfactionTypes(["境界提升", "强敌败退"]);
    setEditAuditDimensions([1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 24, 25, 26]);
    setEditBody(DEFAULT_MARKDOWN_BODY);
    setActiveTab("settings");
  };

  const handleClone = () => {
    setIsNew(true);
    setSelectedGenreId(null);
    setEditId(`${editId}-copy`);
    setEditName(`${editName} (复制)`);
    // Preserve other settings
    setActiveTab("settings");
  };

  const handleSave = async () => {
    if (!editId.trim()) {
      alert("题材 ID 不能为空");
      return;
    }
    const cleanId = editId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (cleanId !== editId) {
      alert("题材 ID 只能包含字母、数字、下划线和连字符");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      id: editId,
      profile: {
        id: editId,
        name: editName,
        language: editLanguage,
        chapterTypes: editChapterTypes,
        fatigueWords: editFatigueWords,
        numericalSystem: editNumericalSystem,
        powerScaling: editPowerScaling,
        eraResearch: editEraResearch,
        pacingRule: editPacingRule,
        satisfactionTypes: editSatisfactionTypes,
        auditDimensions: editAuditDimensions,
      },
      body: editBody,
    };

    try {
      const res = await fetch(`/api/genres?cwd=${encodeURIComponent(cwd)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsNew(false);
        setSelectedGenreId(editId);
        await fetchGenres();
        onGenresChanged?.();
      } else {
        setError(data.error || "保存失败");
      }
    } catch (e) {
      setError("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) {
      setIsNew(false);
      if (genres.length > 0) {
        setSelectedGenreId(genres[0].id);
      }
      return;
    }

    const currentGenre = genres.find(g => g.id === selectedGenreId);
    if (!currentGenre) return;

    const isBuiltin = currentGenre.source === "builtin";
    const confirmMsg = isBuiltin
      ? "该题材为系统内置，当前尚未定制。只有覆盖保存后才能恢复默认。"
      : currentGenre.id === "other"
      ? "其它通用题材无法删除。"
      : `确定要${currentGenre.source === "project" && genres.some(g => g.id === currentGenre.id && g.source === "builtin") ? "恢复默认设置（删除项目覆盖）" : "删除该自定义题材"}吗？`;
    
    if (isBuiltin) {
      alert(confirmMsg);
      return;
    }

    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/genres/${currentGenre.id}?cwd=${encodeURIComponent(cwd)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedGenreId(null);
        await fetchGenres();
        onGenresChanged?.();
      } else {
        setError(data.error || "删除失败");
      }
    } catch (e) {
      setError("网络错误，删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const filteredGenres = genres.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.id.toLowerCase().includes(search.toLowerCase())
  );

  const toggleDimension = (id: number) => {
    if (editAuditDimensions.includes(id)) {
      setEditAuditDimensions(editAuditDimensions.filter(x => x !== id));
    } else {
      setEditAuditDimensions([...editAuditDimensions, id].sort((a, b) => a - b));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(15, 15, 15, 0.4)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          width: "92vw",
          maxWidth: "1150px",
          height: "82vh",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          display: "flex",
          overflow: "hidden",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "var(--text)",
        }}
      >
        {/* Left Side: Sidebar list */}
        <div
          style={{
            width: "300px",
            borderRight: "1px solid var(--border)",
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {/* Header & Add Button */}
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.5px" }}>题材列表</span>
              <button
                onClick={handleCreateNew}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ＋ 新建题材
              </button>
            </div>
            
            <input
              type="text"
              placeholder="搜索题材名称或 ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg-panel)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none",
              }}
            />
          </div>

          {/* List scroll panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {loading ? (
              <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "32px", fontSize: "12px" }}>加载中...</div>
            ) : filteredGenres.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "32px", fontSize: "12px" }}>没有找到题材</div>
            ) : (
              filteredGenres.map((g) => {
                const isSelected = selectedGenreId === g.id && !isNew;
                const isOverridden = g.source === "project" && genres.some(o => o.id === g.id && o.source === "builtin");
                return (
                  <div
                    key={`${g.id}-${g.source}`}
                    onClick={() => handleSelectGenre(g)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "6px",
                      background: isSelected ? "var(--bg-selected)" : "transparent",
                      border: isSelected ? "1px solid rgba(37,99,235,0.2)" : "1px solid transparent",
                      cursor: "pointer",
                      marginBottom: "4px",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", fontWeight: isSelected ? 600 : 500 }}>{g.name}</span>
                      <span
                        style={{
                          fontSize: "9px",
                          padding: "2px 5px",
                          borderRadius: "4px",
                          fontWeight: 600,
                          background: g.source === "project" ? "rgba(37,99,235,0.15)" : "var(--bg-hover)",
                          color: g.source === "project" ? "var(--accent)" : "var(--text-muted)",
                          border: `1px solid ${g.source === "project" ? "rgba(37,99,235,0.25)" : "var(--border)"}`,
                        }}
                      >
                        {g.source === "project" ? (isOverridden ? "项目自定义" : "项目专属") : "内置"}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                      {g.id} / {g.profile.language === "zh" ? "中文" : "English"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Editor Panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-panel)" }}>
          {/* Header Panel */}
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--bg)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                  {isNew ? "新建小说题材" : `${editName}`}
                </h2>
                {!isNew && (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "var(--bg-hover)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    ID: {editId}
                  </span>
                )}
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--text-dim)" }}>
                {isNew
                  ? "创建全新的写作模板并保存到项目中。"
                  : "修改题材的各项数值、疲劳词库、审计维度和禁忌守则。"}
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: (saving || loading) ? "wait" : "pointer",
                  opacity: (saving || loading) ? 0.7 : 1,
                }}
              >
                {saving ? "保存中..." : "保存题材"}
              </button>
              
              {!isNew && (
                <button
                  onClick={handleClone}
                  disabled={loading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  复制克隆
                </button>
              )}

              {(!isNew || genres.length > 0) && (
                <button
                  onClick={handleDelete}
                  disabled={deleting || loading || editId === "other"}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: editId === "other" ? "var(--text-dim)" : "#ef4444",
                    fontSize: "12px",
                    cursor: (deleting || loading || editId === "other") ? "not-allowed" : "pointer",
                    opacity: editId === "other" ? 0.5 : 1,
                  }}
                >
                  {deleting ? "清理中..." : isNew ? "取消" : "删除重置"}
                </button>
              )}

              <button
                onClick={onClose}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                关闭
              </button>
            </div>
          </div>

          {/* Sub Tab selection */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
              padding: "0 12px",
            }}
          >
            {[
              { id: "settings", label: "基本参数 (Parameters)" },
              { id: "elements", label: "写作要素 (Elements)" },
              { id: "dimensions", label: "审计维度 (Audit)" },
              { id: "body", label: "叙事导引 MD (Narrative Guide)" },
            ].map((tab) => {
              const isTabActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  style={{
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: isTabActive ? "2px solid var(--accent)" : "2px solid transparent",
                    color: isTabActive ? "var(--accent)" : "var(--text-muted)",
                    fontSize: "12px",
                    fontWeight: isTabActive ? 600 : 500,
                    cursor: "pointer",
                    outline: "none",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab contents scroll panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            {error && (
              <div
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#ef4444",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  marginBottom: "20px",
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* TAB 1: Basic Settings */}
            {activeTab === "settings" && (
              <div style={{ maxWidth: "680px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                      题材唯一 ID (字母/数字/连字符)
                    </label>
                    <input
                      type="text"
                      disabled={!isNew}
                      value={editId}
                      onChange={(e) => setEditId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: isNew ? "var(--bg)" : "var(--bg-hover)",
                        color: isNew ? "var(--text)" : "var(--text-muted)",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        outline: "none",
                        cursor: isNew ? "text" : "not-allowed",
                      }}
                      placeholder="e.g. urban, cyberpunk"
                    />
                  </div>
                  
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                      题材显示名称
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "var(--bg)",
                        color: "var(--text)",
                        fontSize: "12px",
                        outline: "none",
                      }}
                      placeholder="e.g. 都市异能, 赛博朋克"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                    默认创作语言
                  </label>
                  <select
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value as typeof editLanguage)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                      outline: "none",
                    }}
                  >
                    <option value="zh">中文 (Chinese)</option>
                    <option value="en">英文 (English)</option>
                  </select>
                </div>

                {/* Feature Toggles */}
                <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
                  <span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text)", marginBottom: "12px" }}>
                    引擎功能开关 (Engine Toggles)
                  </span>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={editNumericalSystem}
                        onChange={(e) => setEditNumericalSystem(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      <div>
                        <strong>数值账本与微观设定 (Numerical Ledger)</strong>
                        <span style={{ display: "block", fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                          启用后，系统自动初始化 `particle_ledger.md`。常用于网游升级、玄幻升级流等需要数据追踪的题材。
                        </span>
                      </div>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", cursor: "pointer", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                      <input
                        type="checkbox"
                        checked={editPowerScaling}
                        onChange={(e) => setEditPowerScaling(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      <div>
                        <strong>战力等级校验 (Power Scaling Check)</strong>
                        <span style={{ display: "block", fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                          是否启用战力上限和段位等级逻辑的防崩坏稽核。
                        </span>
                      </div>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", cursor: "pointer", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                      <input
                        type="checkbox"
                        checked={editEraResearch}
                        onChange={(e) => setEditEraResearch(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      <div>
                        <strong>时代与历史考据研究 (Era Research)</strong>
                        <span style={{ display: "block", fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                          用于都市重生、历史文等特定历史纪年作品。审计器会自动联网校验当年代的物价、历史地理及科技水平。
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                    节奏规则说明 (Pacing/Rhythm Rule)
                  </label>
                  <textarea
                    value={editPacingRule}
                    onChange={(e) => setEditPacingRule(e.target.value)}
                    style={{
                      width: "100%",
                      height: "60px",
                      padding: "8px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                      outline: "none",
                      resize: "vertical",
                    }}
                    placeholder="例如：每2-3章一个小回报，每10章一次实力境界重大突破"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Core Elements */}
            {activeTab === "elements" && (
              <div style={{ maxWidth: "750px" }}>
                <PillEditor
                  title="章节类型模板 (Chapter Types)"
                  items={editChapterTypes}
                  onChange={setEditChapterTypes}
                  placeholder="输入章节模板名称（如：过渡章、决战章、揭露章）后敲击回车或逗号"
                />
                
                <PillEditor
                  title="题材禁避疲劳词 (Fatigue Words)"
                  items={editFatigueWords}
                  onChange={setEditFatigueWords}
                  placeholder="输入AI高频词（如：倒吸冷气、赫然、面如死灰）后敲击回车或逗号"
                />

                <PillEditor
                  title="常用爽点/回报类别 (Satisfaction Types)"
                  items={editSatisfactionTypes}
                  onChange={setEditSatisfactionTypes}
                  placeholder="输入爽点机制（如：对手吃瘪、声望兑现、机缘揭示）后敲击回车或逗号"
                />
              </div>
            )}

            {/* TAB 3: Audit Dimensions Checkbox Grid */}
            {activeTab === "dimensions" && (
              <div>
                <div style={{ marginBottom: "16px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    审计维度规则集 (Auditing Dimensions)
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                    勾选对应题材在章节生成后需要开启的审计维度。其中 32(读者期待) 和 33(备忘偏离) 为系统通用维度，默认自动启用。
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {Object.entries(DIMENSION_LABELS)
                    .map(([idStr, labels]) => {
                      const id = Number(idStr);
                      // Dims 28-31 are spinoff specific, 34-37 are fanfic specific, 32-33 are universal
                      const isSpecial = id >= 28;
                      const isChecked = editAuditDimensions.includes(id) || id === 32 || id === 33;
                      const isDisabled = id === 32 || id === 33;
                      
                      return (
                        <div
                          key={id}
                          onClick={() => {
                            if (!isDisabled) toggleDimension(id);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: `1px solid ${isChecked ? "rgba(37,99,235,0.2)" : "var(--border)"}`,
                            background: isChecked ? "var(--bg-hover)" : "transparent",
                            cursor: isDisabled ? "default" : "pointer",
                            transition: "background 0.15s, border-color 0.15s",
                            opacity: isDisabled ? 0.75 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => {}} // click handler is on parent div
                            style={{ marginTop: "3px", cursor: isDisabled ? "default" : "pointer" }}
                          />
                          <div>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: isChecked ? "var(--accent)" : "var(--text)" }}>
                              {id}. {labels.zh}
                            </span>
                            <span style={{ display: "block", fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                              {labels.en} {isSpecial ? " (辅助/专属机制)" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* TAB 4: Rules Markdown Body Editor */}
            {activeTab === "body" && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "4px" }}>
                    编写指南、题材禁忌与语言铁律 Markdown
                  </label>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                    这是直接注入给大纲设计与续写智能体（Writer/Reflector）的提示词规范文本，支持使用标准 Markdown。
                  </span>
                </div>

                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{
                    width: "100%",
                    height: "380px",
                    padding: "12px 16px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    lineHeight: "1.6",
                    outline: "none",
                    resize: "vertical",
                  }}
                  placeholder="## 题材禁忌\n...\n\n## 语言铁律\n...\n"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
