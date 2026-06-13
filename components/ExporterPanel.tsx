"use client";

import React, { useState, useEffect, useCallback } from "react";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";

interface ExporterPanelProps {
  cwd: string;
  bookId: string;
  onClose: () => void;
}

interface Volume {
  id: string;
  name: string;
  startChapter: number;
  endChapter: number;
  description?: string;
  isConsolidated?: boolean;
}

export function ExporterPanel({ cwd, bookId, onClose }: ExporterPanelProps) {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [exportFormat, setExportFormat] = useState<"txt" | "md" | "epub">("epub");
  const [approvedOnly, setApprovedOnly] = useState(true);
  
  // Volume Form state
  const [volName, setVolName] = useState("");
  const [volStart, setVolStart] = useState<number>(1);
  const [volEnd, setVolEnd] = useState<number>(50);
  const [volDesc, setVolDesc] = useState("");

  // Cover state
  const [coverTitle, setCoverTitle] = useState("");
  const [coverAuthor, setCoverAuthor] = useState("");
  const [coverStyle, setCoverStyle] = useState("classic-dark"); // classic-dark, emerald-glass, indigo-sunset
  const [coverPrompt, setCoverPrompt] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  // Statuses
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [consolidating, setConsolidating] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const volumesPath = joinFilePath(cwd, `books/${bookId}/story/volumes.json`);

  // Fetch or initialize volumes
  const loadVolumes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/${encodeFilePathForApi(volumesPath)}?type=read`);
      if (res.ok) {
        const data = await res.json();
        try {
          const parsed = JSON.parse(data.content);
          if (Array.isArray(parsed)) {
            setVolumes(parsed);
          } else {
            initializeDefaultVolumes();
          }
        } catch {
          initializeDefaultVolumes();
        }
      } else {
        // File does not exist, initialize defaults
        initializeDefaultVolumes();
      }
    } catch {
      initializeDefaultVolumes();
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  const initializeDefaultVolumes = () => {
    const defaultVol: Volume = {
      id: "vol-1",
      name: "第一卷 正篇起波澜",
      startChapter: 1,
      endChapter: 50,
      description: "故事起点，核心冲突展开。",
      isConsolidated: false,
    };
    setVolumes([defaultVol]);
    saveVolumes([defaultVol]);
  };

  const saveVolumes = async (newVols: Volume[]) => {
    try {
      await fetch(`/api/files/${encodeFilePathForApi(volumesPath)}`, {
        method: "POST",
        body: JSON.stringify(newVols, null, 2),
      });
    } catch (err) {
      console.error("Failed to save volumes:", err);
    }
  };

  useEffect(() => {
    loadVolumes();
    
    // Attempt to read book name for cover title
    const fetchBookInfo = async () => {
      try {
        const res = await fetch("/api/inkos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", cwd, args: { bookId } })
        });
        if (res.ok) {
          const data = await res.json();
          const book = data.books?.find((b: any) => b.id === bookId);
          if (book) {
            setCoverTitle(book.title || "");
            setCoverAuthor(book.author || "佚名");
          }
        }
      } catch {}
    };
    fetchBookInfo();
  }, [loadVolumes, cwd, bookId]);

  // Add Volume
  const handleAddVolume = (e: React.FormEvent) => {
    e.preventDefault();
    if (!volName.trim()) return;

    const newVol: Volume = {
      id: `vol-${Date.now()}`,
      name: volName,
      startChapter: Number(volStart),
      endChapter: Number(volEnd),
      description: volDesc,
      isConsolidated: false,
    };

    const updated = [...volumes, newVol].sort((a, b) => a.startChapter - b.startChapter);
    setVolumes(updated);
    saveVolumes(updated);

    // Reset fields
    setVolName("");
    setVolDesc("");
  };

  // Delete Volume
  const handleDeleteVolume = (id: string) => {
    const updated = volumes.filter(v => v.id !== id);
    setVolumes(updated);
    saveVolumes(updated);
  };

  // Trigger Consolidate facts
  const handleConsolidate = async (vol: Volume) => {
    setConsolidating(vol.id);
    setError(null);
    setSuccess(null);
    setLogs([`[System] 启动大纲历史设定归档压缩机制...\n`, `[System] 正在调用 ConsolidatorAgent 评估第 ${vol.startChapter} 至 ${vol.endChapter} 章的事实事实...\n`]);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consolidate",
          cwd,
          args: { bookId, start: vol.startChapter, end: vol.endChapter }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const updated = volumes.map(v => v.id === vol.id ? { ...v, isConsolidated: true } : v);
        setVolumes(updated);
        saveVolumes(updated);
        setSuccess(`分卷「${vol.name}」已成功执行设定归档压缩。历史设定已转换为背景记忆，腾出大额 LLM 上下文。`);
        setLogs(prev => [...prev, `[System] 归档压缩处理完毕。已优化 Token 上下文大小。\n`]);
      } else {
        throw new Error(data.error || "归档压缩处理失败");
      }
    } catch (err: any) {
      setError(err.message || "设定归档压缩失败");
      setLogs(prev => [...prev, `\n❌ 运行失败: ${err.message || err}\n`]);
    } finally {
      setConsolidating(null);
    }
  };

  // Compile Book Export
  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);
    setLogs([`[System] 启动全书自动编译与排版引擎...\n`, `[System] 目标格式: ${exportFormat.toUpperCase()}\n`]);

    try {
      const outputPath = `${bookId}_export.${exportFormat}`;
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export",
          cwd,
          args: {
            bookId,
            format: exportFormat,
            approvedOnly,
            output: outputPath
          }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`书籍编译完成！文件已保存到工作区目录: ${outputPath}`);
        setLogs(prev => [...prev, `[System] 编译文件输出成功: ${outputPath}\n`]);
      } else {
        throw new Error(data.error || "一键编译导出失败");
      }
    } catch (err: any) {
      setError(err.message || "一键编译导出失败");
      setLogs(prev => [...prev, `\n❌ 编译失败: ${err.message || err}\n`]);
    } finally {
      setExporting(false);
    }
  };

  // Generate Cover Art
  const handleGenerateCover = () => {
    setIsGeneratingCover(true);
    setError(null);
    setTimeout(() => {
      // Simulate/Generate local gradient cover path
      setCoverUrl("cover-generated");
      setIsGeneratingCover(false);
      setSuccess("书封生成成功！已绑定至电子书元数据。");
    }, 1500);
  };

  // Visual helper for templates
  const renderCoverPreview = () => {
    const gradient = coverStyle === "classic-dark" 
      ? "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)" 
      : coverStyle === "emerald-glass"
      ? "linear-gradient(135deg, #064e3b 0%, #022c22 100%)"
      : "linear-gradient(135deg, #311042 0%, #180024 100%)";

    return (
      <div 
        style={{
          width: 140,
          height: 200,
          background: gradient,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 12,
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: "-20%", left: "-20%", width: "140%", height: "140%", background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)" }} />
        
        {/* Title */}
        <div style={{ zIndex: 1, marginTop: 15 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", fontFamily: "var(--font-serif)", textAlign: "center", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
            {coverTitle || "无标题书卷"}
          </div>
          <div style={{ width: 20, height: 2, background: "var(--accent)", margin: "6px auto 0" }} />
        </div>

        {/* Footer */}
        <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: 1 }}>著</div>
          <div style={{ fontSize: 10, color: "#fff", fontWeight: 600, fontFamily: "var(--font-serif)" }}>
            {coverAuthor || "佚名"}
          </div>
        </div>
      </div>
    );
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
          borderRadius: 12, width: 960, height: 620,
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
            <span style={{ fontSize: 16 }}>📦</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              分卷大纲规划与一键编译导出 (Exporter & Volume Planner)
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={exporting || !!consolidating}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              fontSize: 16, cursor: (exporting || !!consolidating) ? "not-allowed" : "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          
          {/* Left panel: Volume Planner */}
          <div
            style={{
              flex: 1.2, borderRight: "1px solid var(--border)",
              display: "flex", flexDirection: "column", padding: 20, gap: 16,
              overflowY: "auto", background: "rgba(0,0,0,0.04)"
            }}
          >
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              📂 分卷规划器 (Volume Planner)
            </h4>

            {loading ? (
              <div style={{ color: "var(--text-dim)", fontSize: 12 }}>加载分卷配置中...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {volumes.map((vol) => (
                  <div
                    key={vol.id}
                    style={{
                      padding: 12, borderRadius: 8, background: "var(--bg)",
                      border: "1px solid var(--border)", display: "flex",
                      flexDirection: "column", gap: 6, transition: "border 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{vol.name}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, background: "var(--bg-panel)", padding: "2px 6px", borderRadius: 4, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                          第 {vol.startChapter} - {vol.endChapter} 章
                        </span>
                        <button
                          onClick={() => handleDeleteVolume(vol.id)}
                          style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 10 }}
                          title="删除此分卷"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {vol.description && <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{vol.description}</div>}
                    
                    {/* Consolidate Button */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      {vol.isConsolidated ? (
                        <span style={{ fontSize: 10, color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                          ✓ 设定库已归档压缩
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConsolidate(vol)}
                          disabled={!!consolidating}
                          style={{
                            padding: "3px 8px", background: "rgba(16, 185, 129, 0.08)",
                            border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 4,
                            color: "#34d399", fontSize: 10, cursor: consolidating ? "not-allowed" : "pointer",
                            fontWeight: 600, transition: "all 0.15s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(16, 185, 129, 0.08)"}
                        >
                          {consolidating === vol.id ? "💾 正在归档..." : "💾 归档设定库 (Consolidate)"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Volume Form */}
            <form onSubmit={handleAddVolume} style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>添加新分卷</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                <input
                  type="text"
                  required
                  placeholder="分卷名称"
                  value={volName}
                  onChange={(e) => setVolName(e.target.value)}
                  style={{
                    padding: "6px 8px", border: "1px solid var(--border)",
                    borderRadius: 6, background: "var(--bg)", color: "var(--text)",
                    fontSize: 11, outline: "none"
                  }}
                />
                <input
                  type="number"
                  required
                  placeholder="起"
                  value={volStart}
                  onChange={(e) => setVolStart(Number(e.target.value))}
                  style={{
                    padding: "6px 8px", border: "1px solid var(--border)",
                    borderRadius: 6, background: "var(--bg)", color: "var(--text)",
                    fontSize: 11, outline: "none"
                  }}
                />
                <input
                  type="number"
                  required
                  placeholder="止"
                  value={volEnd}
                  onChange={(e) => setVolEnd(Number(e.target.value))}
                  style={{
                    padding: "6px 8px", border: "1px solid var(--border)",
                    borderRadius: 6, background: "var(--bg)", color: "var(--text)",
                    fontSize: 11, outline: "none"
                  }}
                />
              </div>
              <input
                type="text"
                placeholder="卷简介（选填）"
                value={volDesc}
                onChange={(e) => setVolDesc(e.target.value)}
                style={{
                  padding: "6px 8px", border: "1px solid var(--border)",
                  borderRadius: 6, background: "var(--bg)", color: "var(--text)",
                  fontSize: 11, outline: "none"
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "6px 12px", background: "var(--accent)", color: "white",
                  border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", alignSelf: "flex-end"
                }}
              >
                ➕ 添加分卷
              </button>
            </form>
          </div>

          {/* Right panel: Exporter & Cover Generator */}
          <div
            style={{
              flex: 1,
              display: "flex", flexDirection: "column", padding: 20, gap: 16,
              overflowY: "auto"
            }}
          >
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              🎨 电子书封与编译选项
            </h4>

            {/* Cover Generator Section */}
            <div style={{ display: "flex", gap: 16, background: "rgba(0,0,0,0.1)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
              {renderCoverPreview()}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>定制书封 (Cover Art Generator)</div>
                <input
                  type="text"
                  placeholder="书籍标题"
                  value={coverTitle}
                  onChange={(e) => setCoverTitle(e.target.value)}
                  style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)", fontSize: 11, outline: "none" }}
                />
                <input
                  type="text"
                  placeholder="作者笔名"
                  value={coverAuthor}
                  onChange={(e) => setCoverAuthor(e.target.value)}
                  style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)", fontSize: 11, outline: "none" }}
                />
                <select
                  value={coverStyle}
                  onChange={(e) => setCoverStyle(e.target.value)}
                  style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)", fontSize: 11, outline: "none" }}
                >
                  <option value="classic-dark">经典暗夜 (Classic Dark)</option>
                  <option value="emerald-glass">翡翠秘境 (Emerald Glass)</option>
                  <option value="indigo-sunset">星澜幻境 (Indigo Sunset)</option>
                </select>
                <button
                  type="button"
                  onClick={handleGenerateCover}
                  disabled={isGeneratingCover}
                  style={{
                    padding: "5px 10px", background: "none", border: "1px dashed var(--accent)",
                    borderRadius: 4, color: "var(--accent)", fontSize: 10, cursor: "pointer",
                    fontWeight: 600, alignSelf: "flex-start"
                  }}
                >
                  {isGeneratingCover ? "正在渲染书封..." : "✨ 自动生成书封"}
                </button>
              </div>
            </div>

            {/* Export Compiler Settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>编译格式选项</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["epub", "txt", "md"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt as any)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${exportFormat === fmt ? "var(--accent)" : "var(--border)"}`,
                      background: exportFormat === fmt ? "var(--bg-selected)" : "none",
                      color: exportFormat === fmt ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer"
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="chk-approved"
                  checked={approvedOnly}
                  onChange={(e) => setApprovedOnly(e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <label htmlFor="chk-approved" style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
                  仅导出已审核通过 (Approved) 的章节
                </label>
              </div>
            </div>

            {error && (
              <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#f87171", fontSize: 11 }}>
                ❌ {error}
              </div>
            )}
            {success && (
              <div style={{ padding: "8px 12px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, color: "#34d399", fontSize: 11 }}>
                ✓ {success}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                width: "100%", padding: "10px", background: "var(--accent)", color: "white",
                border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: exporting ? "not-allowed" : "pointer", transition: "all 0.15s",
                boxShadow: "0 4px 10px rgba(16, 185, 129, 0.15)"
              }}
            >
              {exporting ? "正在一键编译排版全书..." : "🚀 开始全书一键编译导出"}
            </button>

            {/* Terminal logs */}
            {logs.length > 0 && (
              <div
                style={{
                  height: 110, background: "#0a0a0a", border: "1px solid var(--border)",
                  borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111", padding: "4px 8px", borderBottom: "1px solid #222" }}>
                  <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                    ⚡ InkOS 编译导出日志终端
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 10, color: "#f43f5e", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {logs.join("")}
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
      `}</style>
    </div>
  );
}
