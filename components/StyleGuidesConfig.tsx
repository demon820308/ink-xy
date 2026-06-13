"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { encodeFilePathForApi } from "@/lib/file-paths";
import ReactMarkdown from "react-markdown";

interface StyleGuidesConfigProps {
  cwd: string;
  bookId: string;
  onClose: () => void;
}

export function StyleGuidesConfig({ cwd, bookId, onClose }: StyleGuidesConfigProps) {
  const [styles, setStyles] = useState<string[]>([]);
  const [activeStyle, setActiveStyle] = useState<string>("default");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);

  // Form states
  const [importMode, setImportMode] = useState<"paste" | "file">("paste");
  const [newStyleName, setNewStyleName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  // Indicators / Sliders (Visual Tuning)
  const [clicheDensity, setClicheDensity] = useState(50);
  const [dialogueRatio, setDialogueRatio] = useState(45);
  const [proseOrnate, setProseOrnate] = useState(60);

  // Operation states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [styleContent, setStyleContent] = useState<string>("");
  const [savingTuning, setSavingTuning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slidersExpanded, setSlidersExpanded] = useState(true);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Scroll logs console
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Automatically clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Fetch available style guides
  const fetchStyles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "style-list",
          cwd,
          args: { bookId }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const list = data.styles || [];
        setStyles(list);
        if (data.active) {
          setActiveStyle(data.active);
        }
        setSelectedStyle((prev) => {
          if (prev !== null) return prev;
          return data.active || (list.length > 0 ? list[0] : null);
        });
      } else {
        setError(data.error || "获取写作风格列表失败");
      }
    } catch (err) {
      setError("网络错误，加载风格列表失败");
    } finally {
      setLoading(false);
    }
  }, [cwd, bookId]);

  useEffect(() => {
    fetchStyles();
  }, [fetchStyles]);

  // Load slider values and markdown text dynamically when selectedStyle changes
  useEffect(() => {
    if (selectedStyle !== null) {
      const loadStyleDetails = async () => {
        // 1. Load saved sliders
        try {
          const styleJsonPath = `${cwd}/books/${bookId}/story/styles/${selectedStyle}.json`;
          const res = await fetch(`/api/files/${encodeFilePathForApi(styleJsonPath)}?type=read&optional=true`);
          if (res.ok) {
            const data = await res.json();
            if (data.content) {
              const config = JSON.parse(data.content);
              if (config.proseOrnate !== undefined) setProseOrnate(config.proseOrnate);
              if (config.dialogueRatio !== undefined) setDialogueRatio(config.dialogueRatio);
              if (config.clicheDensity !== undefined) setClicheDensity(config.clicheDensity);
            } else {
              setProseOrnate(60);
              setDialogueRatio(45);
              setClicheDensity(50);
            }
          } else {
            setProseOrnate(60);
            setDialogueRatio(45);
            setClicheDensity(50);
          }
        } catch {
          setProseOrnate(60);
          setDialogueRatio(45);
          setClicheDensity(50);
        }

        // 2. Load markdown content
        try {
          const styleMdPath = `${cwd}/books/${bookId}/story/styles/${selectedStyle}.md`;
          const res = await fetch(`/api/files/${encodeFilePathForApi(styleMdPath)}?type=read&optional=true`);
          if (res.ok) {
            const data = await res.json();
            if (data.content) {
              let cleanMd = data.content;
              const tuneStartMarker = "<!-- STYLE_TUNE_START -->";
              const tuneEndMarker = "<!-- STYLE_TUNE_END -->";
              const startIndex = cleanMd.indexOf(tuneStartMarker);
              const endIndex = cleanMd.indexOf(tuneEndMarker);
              if (startIndex !== -1 && endIndex !== -1) {
                cleanMd = cleanMd.slice(endIndex + tuneEndMarker.length).trim();
              }
              setStyleContent(cleanMd);
            } else {
              // Fallback to active style guide if default.md is missing but active is default
              if (selectedStyle === "default") {
                const activeMdPath = `${cwd}/books/${bookId}/story/style_guide.md`;
                const activeMdRes = await fetch(`/api/files/${encodeFilePathForApi(activeMdPath)}?type=read&optional=true`);
                if (activeMdRes.ok) {
                  const activeMdData = await activeMdRes.json();
                  if (activeMdData && activeMdData.content) {
                    let cleanMd = activeMdData.content;
                    const tuneStartMarker = "<!-- STYLE_TUNE_START -->";
                    const tuneEndMarker = "<!-- STYLE_TUNE_END -->";
                    const startIndex = cleanMd.indexOf(tuneStartMarker);
                    const endIndex = cleanMd.indexOf(tuneEndMarker);
                    if (startIndex !== -1 && endIndex !== -1) {
                      cleanMd = cleanMd.slice(endIndex + tuneEndMarker.length).trim();
                    }
                    setStyleContent(cleanMd);
                    return;
                  }
                }
              }
              setStyleContent("暂无文风指南描述文本。");
            }
          } else {
            setStyleContent("暂无文风指南描述文本。");
          }
        } catch {
          setStyleContent("加载文风指南文本失败。");
        }
      };
      loadStyleDetails();
    } else {
      setStyleContent("");
    }
  }, [selectedStyle, cwd, bookId]);

  // Handle local file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    if (!newStyleName) {
      // Auto populate style name from filename
      setNewStyleName(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent(event.target?.result as string || "");
    };
    reader.readAsText(file);
  };

  // Switch active style
  const handleSwitchStyle = async (name: string) => {
    setSwitching(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Switch style
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "style-switch",
          cwd,
          args: { bookId, styleName: name }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // 2. Chain style-tune to apply parameters to the new active style
        await fetch("/api/inkos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "style-tune",
            cwd,
            args: {
              bookId,
              name,
              proseOrnate,
              dialogueRatio,
              clicheDensity
            }
          })
        });

        setActiveStyle(name);
        setSuccess(`成功切换激活文风为: ${name}。请重新规划蓝图。`);
      } else {
        setError(data.error || "切换风格失败");
      }
    } catch {
      setError("切换风格发生网络错误");
    } finally {
      setSwitching(false);
    }
  };

  // Delete style
  const handleDeleteStyle = async (name: string) => {
    if (!confirm(`确认要删除风格「${name}」吗？`)) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const stylePath = `${cwd}/books/${bookId}/story/styles/${name}.md`;
      const res = await fetch(`/api/files/${encodeFilePathForApi(stylePath)}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`成功删除风格: ${name}`);
        setSelectedStyle("default");
        fetchStyles();
      } else {
        setError(data.error || "删除风格失败");
      }
    } catch {
      setError("删除风格发生网络错误");
    } finally {
      setDeleting(false);
    }
  };

  // Save custom tuning parameters
  const handleSaveTuning = async () => {
    if (!selectedStyle) return;
    setSavingTuning(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "style-tune",
          cwd,
          args: {
            bookId,
            name: selectedStyle,
            proseOrnate,
            dialogueRatio,
            clicheDensity
          }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(selectedStyle === activeStyle 
          ? "微调参数已保存，并已实时应用到 AI 写作中！" 
          : "微调参数已成功保存。");
      } else {
        setError(data.error || "保存微调参数失败");
      }
    } catch {
      setError("保存微调参数发生网络错误");
    } finally {
      setSavingTuning(false);
    }
  };

  // Import style (runs style-import)
  const handleImportStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    const styleName = newStyleName.trim();
    if (!styleName) {
      setError("风格名称不能为空");
      return;
    }

    const content = importMode === "paste" ? pastedText : fileContent;
    if (!content.trim()) {
      setError("风格参考样本内容不能为空");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setLogs([`[System] 正在初始化样本分析，风格名称: "${styleName}"...\n`]);

    try {
      // 1. Write sample file using the files api in temp dir
      const tempPath = `${cwd}/Temp/style_sample_${Date.now()}.txt`;
      const fileRes = await fetch(`/api/files/${encodeFilePathForApi(tempPath)}`, {
        method: "POST",
        body: content,
      });

      if (!fileRes.ok) {
        throw new Error("保存临时风格样本文件失败");
      }

      const fileData = await fileRes.json();
      const resolvedPath = fileData.path;

      setLogs((prev) => [...prev, `[System] 参考文本已暂存到磁盘: ${resolvedPath}\n`, `[System] 启动 AIGC 写作风格逆向工程特征分析...\n`]);

      // 2. Call style-import async command
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "style-import",
          cwd,
          args: {
            bookId,
            from: resolvedPath,
            name: styleName
          }
        })
      });

      if (!res.ok) {
        throw new Error(`执行 style-import 发生异常，状态码 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("后端响应流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              if (chunk.success) {
                setSuccess(`风格「${styleName}」已成功学习并分析完成，保存在 story/styles/。`);
                setNewStyleName("");
                setPastedText("");
                setSelectedFileName(null);
                setFileContent("");
                setSelectedStyle(styleName);
                fetchStyles();
              } else {
                setError(chunk.error || "提取文风特征失败");
              }
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || "学习风格文风样本发生异常错误");
      setLogs((prev) => [...prev, `\n❌ 运行失败: ${err.message || err}\n`]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: 12, width: 820, height: 580,
          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "scaleIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>✒️</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              写作风格与文笔模仿管理 (Style Guides)
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              fontSize: 16, cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left Sidebar */}
          <div
            style={{
              width: 220, borderRight: "1px solid var(--border)",
              background: "rgba(0,0,0,0.08)", display: "flex",
              flexDirection: "column", padding: 12, gap: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>选择或学习文风</div>
            
            {loading ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: 8 }}>加载风格列表中...</div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                <div
                  onClick={() => setSelectedStyle("default")}
                  style={{
                    padding: "8px 12px", borderRadius: 6, fontSize: 12,
                    cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: selectedStyle === "default" ? "var(--bg-selected)" : "transparent",
                    border: `1px solid ${selectedStyle === "default" ? "var(--accent)" : "transparent"}`,
                    color: selectedStyle === "default" ? "var(--accent)" : "var(--text)",
                    fontWeight: selectedStyle === "default" ? 600 : 400,
                  }}
                >
                  <span>默认通用风格</span>
                  {activeStyle === "default" && <span style={{ fontSize: 10, background: "#10b981", color: "white", padding: "1px 4px", borderRadius: 3 }}>激活</span>}
                </div>

                {styles.filter((name) => name !== "default").map((name) => (
                  <div
                    key={name}
                    onClick={() => setSelectedStyle(name)}
                    style={{
                      padding: "8px 12px", borderRadius: 6, fontSize: 12,
                      cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: selectedStyle === name ? "var(--bg-selected)" : "transparent",
                      border: `1px solid ${selectedStyle === name ? "var(--accent)" : "transparent"}`,
                      color: selectedStyle === name ? "var(--accent)" : "var(--text)",
                      fontWeight: selectedStyle === name ? 600 : 400,
                    }}
                  >
                    <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{name}</span>
                    {activeStyle === name && <span style={{ fontSize: 10, background: "#10b981", color: "white", padding: "1px 4px", borderRadius: 3 }}>激活</span>}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setSelectedStyle(null)}
              style={{
                width: "100%", padding: "8px 12px", border: "1px dashed var(--border)",
                borderRadius: 6, background: "none", color: "var(--text)",
                fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
            >
              <span>➕</span> 学习新文风样本
            </button>
          </div>

          {/* Right Editor Area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 20 }}>
            {selectedStyle === null ? (
              /* Import Form */
              <form onSubmit={handleImportStyle} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>逆向学习新文风特征</h4>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>风格名称 (如 庆余年文笔, 古风武侠)</label>
                  <input
                    type="text"
                    required
                    value={newStyleName}
                    onChange={(e) => setNewStyleName(e.target.value)}
                    placeholder="输入文风别名"
                    style={{
                      padding: "8px 12px", border: "1px solid var(--border)",
                      borderRadius: 6, background: "var(--bg)", color: "var(--text)",
                      fontSize: 12, outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>样本输入模式</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setImportMode("paste")}
                      style={{
                        padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: `1px solid ${importMode === "paste" ? "var(--accent)" : "var(--border)"}`,
                        background: importMode === "paste" ? "var(--bg-selected)" : "none",
                        color: importMode === "paste" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      ✍️ 粘贴文字
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("file")}
                      style={{
                        padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: `1px solid ${importMode === "file" ? "var(--accent)" : "var(--border)"}`,
                        background: importMode === "file" ? "var(--bg-selected)" : "none",
                        color: importMode === "file" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      📁 上传文件
                    </button>
                  </div>
                </div>

                {importMode === "paste" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minHeight: 120 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>粘贴风格样章文本 (建议 2000-5000 字)</label>
                    <textarea
                      required
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="在这里粘贴一段符合该文风特征的章节或片段..."
                      style={{
                        flex: 1, padding: "8px 12px", border: "1px solid var(--border)",
                        borderRadius: 6, background: "var(--bg)", color: "var(--text)",
                        fontSize: 12, outline: "none", resize: "none", fontFamily: "var(--font-serif)",
                        lineHeight: "1.6",
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>选择本地样章文件 (.txt/.md)</label>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="file"
                        accept=".txt,.md"
                        id="style-file-upload"
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                      />
                      <label
                        htmlFor="style-file-upload"
                        style={{
                          padding: "10px 16px", background: "var(--bg)",
                          border: "1px dashed var(--border)", borderRadius: 6,
                          fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
                          transition: "all 0.15s", flex: 1, textAlign: "center",
                        }}
                      >
                        {selectedFileName ? `📁 已选择: ${selectedFileName}` : "点击选择本地文本样本"}
                      </label>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "8px 16px", background: "var(--accent)", color: "white",
                    border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer", transition: "all 0.15s",
                    alignSelf: "flex-end",
                  }}
                >
                  {submitting ? "正在深度提取特征..." : "💡 开始反向提取"}
                </button>
              </form>
            ) : (
              /* Selected Style Info & Tuning */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      风格包：{selectedStyle === "default" ? "系统默认通用风格" : selectedStyle}
                    </h4>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      类型: {selectedStyle === "default" ? "内置规则" : "自定义指纹"}
                    </span>
                  </div>
                  
                  <div style={{ display: "flex", gap: 8 }}>
                    {activeStyle === selectedStyle ? (
                      <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, background: "rgba(16,185,129,0.06)", padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.15)" }}>
                        ✓ 当前正在应用
                      </span>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleSwitchStyle(selectedStyle!)}
                          disabled={switching || deleting || savingTuning}
                          style={{
                            padding: "6px 14px", background: "var(--accent)", color: "white",
                            border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                            cursor: (switching || deleting || savingTuning) ? "not-allowed" : "pointer",
                          }}
                        >
                          {switching ? "正在激活..." : "🎯 激活此风格"}
                        </button>

                        {selectedStyle !== "default" && (
                          <button
                            type="button"
                            onClick={() => handleDeleteStyle(selectedStyle!)}
                            disabled={switching || deleting || savingTuning}
                            style={{
                              padding: "6px 14px", background: "none", color: "#f87171",
                              border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, fontSize: 12, fontWeight: 600,
                              cursor: (switching || deleting || savingTuning) ? "not-allowed" : "pointer",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                          >
                            {deleting ? "正在删除..." : "🗑️ 删除风格"}
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSaveTuning}
                      disabled={switching || deleting || savingTuning}
                      style={{
                        padding: "6px 14px", background: "none", color: "var(--accent)",
                        border: "1px solid var(--accent)", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        cursor: (switching || deleting || savingTuning) ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                        marginLeft: "auto",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-selected)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                    >
                      {savingTuning ? "正在保存..." : "💾 保存微调"}
                    </button>
                  </div>
                </div>

                <div className={`sliders-section ${slidersExpanded ? "expanded" : "collapsed"}`}>
                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />

                  {/* Swatches Sliders */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <h5 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>文笔特性调谐（可视化滑块）</h5>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text-muted)" }}>辞藻华丽度 (Ornateness)</span>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{proseOrnate}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={proseOrnate}
                        onChange={(e) => setProseOrnate(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--accent)" }}
                      />
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        影响成文词藻密度。低值趋于白描口语，高值使用大量华丽意象与精细景物描摹。
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text-muted)" }}>对话密集度 (Dialogue Ratio)</span>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{dialogueRatio}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={dialogueRatio}
                        onChange={(e) => setDialogueRatio(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--accent)" }}
                      />
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        高值将以快速人物对白推动叙事，低值将偏向大段独白、动作和内心戏描写。
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text-muted)" }}>修辞套话屏蔽度 (Cliché Filter)</span>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{clicheDensity}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={clicheDensity}
                        onChange={(e) => setClicheDensity(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--accent)" }}
                      />
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        高值会强化 Auditor 审计对网文陈词滥调（疲劳词）的拦截阈值，使文笔更有质感。
                      </span>
                    </div>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "10px 0 6px 0" }} />
                </div>

                {/* Markdown Preview */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                      📜 文风特征定性拆解指南
                    </span>
                    <button
                      type="button"
                      onClick={() => setSlidersExpanded(prev => !prev)}
                      style={{
                        background: "none", border: "none", color: "var(--accent)",
                        fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center",
                        gap: 4, padding: "2px 6px", borderRadius: 4, transition: "all 0.15s",
                        fontWeight: 600,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                    >
                      {slidersExpanded ? "🔍 隐藏参数放大阅读 ↗" : "⚙️ 显示调谐参数 ↙"}
                    </button>
                  </div>
                  <div
                    className="style-guide-preview"
                    style={{
                      flex: 1, overflowY: "auto", padding: 16,
                      background: "var(--bg)", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13,
                      lineHeight: "1.7", color: "var(--text)",
                    }}
                  >
                    {styleContent ? (
                      <ReactMarkdown>{styleContent}</ReactMarkdown>
                    ) : (
                      <div style={{ color: "var(--text-dim)", fontStyle: "italic", textAlign: "center", marginTop: 20 }}>
                        正在载入或暂无定性指南描述文本。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error / Success Alerts */}
            {error && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#f87171", fontSize: 11 }}>
                ❌ {error}
              </div>
            )}
            {success && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, color: "#34d399", fontSize: 11 }}>
                ✓ {success}
              </div>
            )}

            {/* Console Logs */}
            {logs.length > 0 && (
              <div
                style={{
                  marginTop: 12, height: 110, background: "#0a0a0a", border: "1px solid var(--border)",
                  borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111", padding: "4px 8px", borderBottom: "1px solid #222" }}>
                  <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                    ⚡ InkOS 特征提取终端
                  </span>
                  {submitting && <span style={{ fontSize: 9, color: "var(--accent)" }}>分析中...</span>}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: "#38bdf8", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {logs.join("")}
                  <div ref={consoleEndRef} />
                </div>
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
        .sliders-section {
          transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
          overflow: hidden;
        }
        .sliders-section.collapsed {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
        }
        .sliders-section.expanded {
          max-height: 300px;
          opacity: 1;
        }
        .style-guide-preview,
        .style-guide-preview * {
          color: var(--text) !important;
        }
        .style-guide-preview h1,
        .style-guide-preview h2,
        .style-guide-preview h3,
        .style-guide-preview h4 {
          margin-top: 18px;
          margin-bottom: 10px;
          font-weight: 700;
        }
        .style-guide-preview h2 {
          font-size: 14px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 4px;
        }
        .style-guide-preview p {
          margin-bottom: 12px;
        }
        .style-guide-preview ul,
        .style-guide-preview ol {
          padding-left: 20px;
          margin-bottom: 12px;
        }
        .style-guide-preview li {
          margin-bottom: 6px;
        }
        .style-guide-preview a {
          color: var(--accent) !important;
        }
      `}</style>
    </div>
  );
}
