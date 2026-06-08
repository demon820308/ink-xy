"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";

// Helper to check if a markdown table or file has only headers/titles without actual rows
function isMarkdownTableEmpty(content: string): boolean {
  if (!content) return true;
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  
  // Filter out headings and divider lines
  const tableRows = lines.filter(line => {
    // Ignore markdown titles/headings
    if (line.startsWith("#")) return false;
    // Ignore divider lines like |---| or :---:
    if (/^[|:\-\s]+$/.test(line.replace(/\|/g, ""))) return false;
    return true;
  });
  
  // The first remaining row is the table header row. Any data rows must be at index 1 or later.
  return tableRows.length <= 1;
}

interface ChapterMeta {
  number: number;
  title: string;
  status: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  auditIssues: string[];
  lengthWarnings: string[];
  hasPlan: boolean;
  hasIntent: boolean;
  hasSnapshot: boolean;
  reviewNote?: string;
  wordCountOverride?: number;
}

interface Props {
  bookId: string;
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
}

export function ChapterDashboard({ bookId, cwd, onOpenFile }: Props) {
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [nextChapter, setNextChapter] = useState<{ number: number; hasPlan: boolean; hasIntent: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Map of chapterNumber -> actionType (e.g. "audit" | "sync" | "plan" | "review-approve" | "review-reject")
  const [runningActions, setRunningActions] = useState<Record<number, string>>({});
  // Map of chapterNumber -> array of log strings
  const [logs, setLogs] = useState<Record<number, string[]>>({});
  // Set of expanded chapter numbers showing terminal console
  const [expandedConsoles, setExpandedConsoles] = useState<Set<number>>(new Set());

  // Drawer for single chapter detail report
  const [selectedChapter, setSelectedChapter] = useState<ChapterMeta | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Reject dialog
  const [rejectChapterNum, setRejectChapterNum] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Re-plan intent dialog
  const [planConfirmNum, setPlanConfirmNum] = useState<number | null>(null);

  // Planning progress modal state (chapter number)
  const [planningProgressNum, setPlanningProgressNum] = useState<number | null>(null);

  // Snapshot/Blueprint Explorer Modal state
  const [explorerChapterNum, setExplorerChapterNum] = useState<number | null>(null);
  const [explorerTab, setExplorerTab] = useState<"snapshot" | "blueprint">("snapshot");

  // File Preview states
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<{ name: string; path: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Auto-load default preview file when modal opens or tab changes
  useEffect(() => {
    if (explorerChapterNum === null) {
      setSelectedPreviewFile(null);
      return;
    }

    const padded = String(explorerChapterNum).padStart(4, "0");
    if (explorerTab === "snapshot") {
      const defaultPath = `${cwd}/books/${bookId}/story/snapshots/${explorerChapterNum}/current_state.md`;
      setSelectedPreviewFile({ name: "current_state.md", path: defaultPath });
    } else {
      const defaultPath = `${cwd}/books/${bookId}/story/runtime/chapter-${padded}.intent.md`;
      setSelectedPreviewFile({ name: `chapter-${padded}.intent.md`, path: defaultPath });
    }
  }, [explorerChapterNum, explorerTab, bookId, cwd]);

  // Fetch preview file content
  useEffect(() => {
    if (!selectedPreviewFile) {
      setPreviewContent("");
      setPreviewError(null);
      return;
    }

    let active = true;
    const loadContent = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const encoded = encodeFilePathForApi(selectedPreviewFile.path);
        const res = await fetch(`/api/files/${encoded}?type=read`);
        if (!res.ok) {
          throw new Error(`文件未找到 (HTTP ${res.status})。可能是该章节尚未执行同步/生成快照。`);
        }
        const data = await res.json();
        if (active) {
          if (data && typeof data.content === "string") {
            setPreviewContent(data.content);
          } else {
            throw new Error("无效的响应格式");
          }
        }
      } catch (err) {
        if (active) {
          console.error("Failed to load preview file:", err);
          setPreviewError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    };

    loadContent();
    return () => {
      active = false;
    };
  }, [selectedPreviewFile]);

  // Auto-scroll references for terminal logs
  const logContainerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dashboard",
          cwd,
          args: { bookId }
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setChapters(data.chapters || []);
        setNextChapter(data.nextChapter || null);
      } else {
        throw new Error(data.error || "获取看板数据失败");
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [bookId, cwd]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle external refresh events
  useEffect(() => {
    const handleRefresh = () => {
      fetchDashboardData(true);
    };
    window.addEventListener("refresh-explorer", handleRefresh);
    return () => {
      window.removeEventListener("refresh-explorer", handleRefresh);
    };
  }, [fetchDashboardData]);

  const checkFileExists = async (filePath: string) => {
    try {
      const res = await fetch(`/api/files/${encodeFilePathForApi(filePath)}?type=read`);
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleOpenOutline = useCallback(async () => {
    const pathsToCheck = [
      joinFilePath(cwd, `books/${bookId}/story/outline/volume_map.md`),
      joinFilePath(cwd, `books/${bookId}/story/volume_outline.md`),
      joinFilePath(cwd, `books/${bookId}/story/author_intent.md`),
    ];

    for (const p of pathsToCheck) {
      const exists = await checkFileExists(p);
      if (exists) {
        let filename = "volume_map.md";
        if (p.endsWith("volume_outline.md")) filename = "volume_outline.md";
        else if (p.endsWith("author_intent.md")) filename = "author_intent.md";
        onOpenFile(p, filename);
        return;
      }
    }
    alert("未找到大纲文件（建议先通过大纲策划师生成大纲，或确认书籍 story 目录已初始化）。");
  }, [cwd, bookId, onOpenFile]);

  const handleOpenCharacters = useCallback(() => {
    window.dispatchEvent(new CustomEvent("open-characters-graph", { detail: { bookId } }));
  }, [bookId]);

  const handleOpenHooks = useCallback(async () => {
    const p = joinFilePath(cwd, `books/${bookId}/story/pending_hooks.md`);
    const exists = await checkFileExists(p);
    if (exists) {
      onOpenFile(p, "pending_hooks.md");
    } else {
      alert("未找到伏笔池文件（请确认书籍 story 目录已初始化）。");
    }
  }, [cwd, bookId, onOpenFile]);


  // Auto scroll console logs to bottom
  const appendLog = useCallback((chNum: number, text: string) => {
    setLogs((prev) => {
      const current = prev[chNum] || [];
      return { ...prev, [chNum]: [...current, text] };
    });
    setTimeout(() => {
      const container = logContainerRefs.current[chNum];
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }, []);

  const clearLog = useCallback((chNum: number) => {
    setLogs((prev) => ({ ...prev, [chNum]: [] }));
  }, []);

  const toggleConsole = useCallback((chNum: number) => {
    setExpandedConsoles((prev) => {
      const next = new Set(prev);
      if (next.has(chNum)) next.delete(chNum);
      else next.add(chNum);
      return next;
    });
  }, []);

  // Run async CLI command via API stream reader
  const executeCommand = async (
    chNum: number,
    actionType: "audit" | "sync" | "plan",
    apiAction: "audit" | "write-sync" | "plan"
  ) => {
    if (runningActions[chNum]) return;
    
    setRunningActions((prev) => ({ ...prev, [chNum]: actionType }));
    clearLog(chNum);
    // Expand console to let user see stream logs
    setExpandedConsoles((prev) => {
      const next = new Set(prev);
      next.add(chNum);
      return next;
    });

    try {
      let relativeChapter = "";
      if (apiAction === "audit") {
        // Find filename
        const pad = String(chNum).padStart(4, "0");
        relativeChapter = `books/${bookId}/chapters/${pad}_`; // CLI will search by prefix
      }

      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: apiAction,
          cwd,
          args: {
            bookId,
            chapter: apiAction === "audit" ? relativeChapter : String(chNum),
            json: true
          }
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
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
              appendLog(chNum, chunk.data || "");
            }
          } catch {
            // ignore JSON parse failures of chunks
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "stdout" || chunk.type === "stderr") {
            appendLog(chNum, chunk.data || "");
          }
        } catch {}
      }

      appendLog(chNum, `\n🎉 执行完成。已成功刷新章节 ${chNum} 的数据结构。`);
      
      // Auto fold console after success
      setTimeout(() => {
        setExpandedConsoles((prev) => {
          const next = new Set(prev);
          next.delete(chNum);
          return next;
        });
      }, 3000);

    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      appendLog(chNum, `\n❌ 执行失败: ${errMsg}`);
    } finally {
      setRunningActions((prev) => {
        const next = { ...prev };
        delete next[chNum];
        return next;
      });
      // Refresh list to update status lights
      await fetchDashboardData(true);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    }
  };

  const handleApprove = async (chNum: number) => {
    if (runningActions[chNum]) return;
    setRunningActions((prev) => ({ ...prev, [chNum]: "review-approve" }));
    clearLog(chNum);
    toggleConsole(chNum);
    appendLog(chNum, `正在向系统提交批准请求，标记章节 ${chNum} 为已过审（将持久化提交快照状态）...`);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review-approve",
          cwd,
          args: { bookId, chapter: chNum, json: true }
        })
      });

      if (!res.ok) throw new Error(`HTTP 异常 ${res.status}`);
      if (!res.body) throw new Error("响应正文流为空");

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
              appendLog(chNum, chunk.data || "");
            }
          } catch {}
        }
      }

      appendLog(chNum, `\n✅ 审核成功！章节 ${chNum} 状态已变更为 [已过审]。`);
      setTimeout(() => {
        setExpandedConsoles((prev) => {
          const next = new Set(prev);
          next.delete(chNum);
          return next;
        });
      }, 2000);

    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      appendLog(chNum, `\n❌ 审核提交失败: ${errMsg}`);
    } finally {
      setRunningActions((prev) => {
        const next = { ...prev };
        delete next[chNum];
        return next;
      });
      await fetchDashboardData(true);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    }
  };

  const handleOpenRejectDialog = (chNum: number) => {
    setRejectChapterNum(chNum);
    setRejectReason("");
    setIsRejecting(false);
  };

  const handleConfirmReject = async () => {
    if (rejectChapterNum === null) return;
    setIsRejecting(true);
    
    const chNum = rejectChapterNum;
    setRunningActions((prev) => ({ ...prev, [chNum]: "review-reject" }));
    clearLog(chNum);
    toggleConsole(chNum);
    appendLog(chNum, `正在向系统提交驳回并版本回滚请求... (驳回第 ${chNum} 章，将自动删除后续所有章节并回滚设定真相库至第 ${chNum - 1} 章时)`);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review-reject",
          cwd,
          args: {
            bookId,
            chapter: chNum,
            reason: rejectReason.trim() || undefined,
            json: true
          }
        })
      });

      if (!res.ok) throw new Error(`HTTP 异常 ${res.status}`);
      if (!res.body) throw new Error("响应正文流为空");

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
              appendLog(chNum, chunk.data || "");
            }
          } catch {}
        }
      }

      appendLog(chNum, `\n✅ 驳回且状态回滚完成！`);
      
      // Close tabs for rolled back files
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
      setTimeout(() => {
        setExpandedConsoles((prev) => {
          const next = new Set(prev);
          next.delete(chNum);
          return next;
        });
      }, 2000);

    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      appendLog(chNum, `\n❌ 驳回执行失败: ${errMsg}`);
    } finally {
      setIsRejecting(false);
      setRejectChapterNum(null);
      setRunningActions((prev) => {
        const next = { ...prev };
        delete next[chNum];
        return next;
      });
      await fetchDashboardData(true);
    }
  };

  const handleOpenChapterFile = (chNum: number, title: string) => {
    // Open chapter editor tab in FileViewer
    const padded = String(chNum).padStart(4, "0");
    const formattedTitle = title.replace(/[/\\?%*:|"<>]/g, "").replace(/\s+/g, "_").slice(0, 50);
    const filename = `${padded}_${formattedTitle}.md`;
    const filePath = `${cwd}/books/${bookId}/chapters/${filename}`;
    onOpenFile(filePath, filename);
  };

  const filteredChapters = chapters.filter((c) => {
    const q = searchQuery.toLowerCase();
    return c.title.toLowerCase().includes(q) || String(c.number).includes(q);
  });

  // Calculate Metrics
  const totalChapters = chapters.length;
  const approvedChapters = chapters.filter((c) => c.status === "approved").length;
  const auditFailedChapters = chapters.filter((c) => c.status === "audit-failed").length;
  const degradedChapters = chapters.filter((c) => c.status === "state-degraded").length;
  const hasPlanChapters = chapters.filter((c) => c.hasPlan).length;

  const passRate = totalChapters > 0 ? Math.round((approvedChapters / totalChapters) * 100) : 100;
  const blueprintCoverage = totalChapters > 0 ? Math.round((hasPlanChapters / totalChapters) * 100) : 100;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-serif)",
        overflow: "hidden",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📊</span> 《{bookId}》 章节管控中心
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* 大纲 */}
          <button
            onClick={handleOpenOutline}
            style={{
              padding: "6px 12px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: 6,
              color: "#818cf8",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)";
              e.currentTarget.style.borderColor = "#818cf8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(99, 102, 241, 0.08)";
              e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
            }}
          >
            <span>📖</span> 大纲
          </button>
 
          {/* 角色 */}
          <button
            onClick={handleOpenCharacters}
            style={{
              padding: "6px 12px",
              background: "rgba(139, 92, 246, 0.08)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              borderRadius: 6,
              color: "#a78bfa",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)";
              e.currentTarget.style.borderColor = "#a78bfa";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(139, 92, 246, 0.08)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
            }}
          >
            <span>👤</span> 角色
          </button>
 
          {/* 伏笔 */}
          <button
            onClick={handleOpenHooks}
            style={{
              padding: "6px 12px",
              background: "rgba(249, 115, 22, 0.08)",
              border: "1px solid rgba(249, 115, 22, 0.3)",
              borderRadius: 6,
              color: "#f97316",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(249, 115, 22, 0.15)";
              e.currentTarget.style.borderColor = "#f97316";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(249, 115, 22, 0.08)";
              e.currentTarget.style.borderColor = "rgba(249, 115, 22, 0.3)";
            }}
          >
            <span>🔗</span> 伏笔
          </button>


          <input
            type="text"
            placeholder="搜索章节或标题..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "6px 12px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text)",
              width: 120,
              outline: "none",
            }}
          />
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>正在加载工作区大纲与章节快照，请稍候...</span>
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          <div style={{ padding: "16px 20px", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, color: "#ef4444" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 14 }}>⚠️ 加载失败</h3>
            <p style={{ fontSize: 13, margin: 0 }}>{error}</p>
            <p style={{ fontSize: 12, margin: "12px 0 0 0", color: "var(--text-muted)" }}>
              请确保您当前的工作区已初始化。可以在侧边栏点击「一键开启创作宇宙」进行初始化检测。
            </p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Summary Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: "20px 24px" }}>
            <div style={{ padding: 16, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>总章节数</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: "var(--text)" }}>{totalChapters} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-dim)" }}>章</span></div>
            </div>
            <div style={{ padding: 16, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>离线审计过审率</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: passRate >= 80 ? "#10b981" : "#eab308" }}>{passRate}%</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>已审核过审 {approvedChapters} 章</div>
            </div>
            <div style={{ padding: 16, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>异常章节</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: (auditFailedChapters + degradedChapters) > 0 ? "#ef4444" : "#10b981" }}>
                {auditFailedChapters + degradedChapters} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-dim)" }}>处</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>审计不合规 {auditFailedChapters} | 设定失步 {degradedChapters}</div>
            </div>
            <div style={{ padding: 16, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>大纲蓝图覆盖度</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: "#a855f7" }}>{blueprintCoverage}%</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>已规划蓝图 {hasPlanChapters} / {totalChapters} 章</div>
            </div>
          </div>

          {/* Chapter Table Container */}
          <div style={{ padding: "0 24px 24px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                flex: 1,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--bg-panel)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Table Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  background: "var(--bg-hover)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                <div style={{ width: "60px", flexShrink: 0 }}>章节</div>
                <div style={{ flex: 1, minWidth: 120 }}>章节名称</div>
                <div style={{ width: "90px", flexShrink: 0 }}>防崩审计</div>
                <div style={{ width: "90px", flexShrink: 0 }}>设定同步</div>
                <div style={{ width: "90px", flexShrink: 0 }}>写作蓝图</div>
                <div style={{ width: "170px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>审核决策</span>
                  <button
                    onClick={() => fetchDashboardData()}
                    disabled={loading}
                    title="重新扫描"
                    style={{
                      padding: "4px 8px",
                      background: "rgba(96, 165, 250, 0.08)",
                      border: "1px solid rgba(96, 165, 250, 0.3)",
                      borderRadius: 6,
                      color: "#60a5fa",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s ease",
                      marginRight: 4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(96, 165, 250, 0.15)";
                      e.currentTarget.style.borderColor = "#60a5fa";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(96, 165, 250, 0.08)";
                      e.currentTarget.style.borderColor = "rgba(96, 165, 250, 0.3)";
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
                      <path d="M23 4v6h-6" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Table Body */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredChapters.length === 0 ? (
                  <div style={{ padding: 48, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
                    没有找到符合条件的章节。
                  </div>
                ) : (
                  filteredChapters.map((ch) => {
                    const isAuditRunning = runningActions[ch.number] === "audit";
                    const isSyncRunning = runningActions[ch.number] === "sync";
                    const isAnyRunning = !!runningActions[ch.number];
                    
                    const isConsoleOpen = expandedConsoles.has(ch.number);
                    const chapterLogs = logs[ch.number] || [];

                    return (
                      <div
                        key={ch.number}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isConsoleOpen ? "rgba(255,255,255,0.01)" : "transparent"
                        }}
                      >
                        {/* Chapter Row */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "12px 16px",
                            fontSize: 12,
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isConsoleOpen) e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isConsoleOpen) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {/* Number */}
                          <div style={{ width: "60px", flexShrink: 0, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                            Ch.{ch.number}
                          </div>

                          {/* Title */}
                          <div style={{ flex: 1, minWidth: 120, paddingRight: 10 }}>
                            <span
                              onClick={() => handleOpenChapterFile(ch.number, ch.title)}
                              style={{
                                fontWeight: 600,
                                cursor: "pointer",
                                borderBottom: "1px dashed transparent",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "var(--accent)";
                                e.currentTarget.style.borderBottomColor = "var(--accent)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = "inherit";
                                e.currentTarget.style.borderBottomColor = "transparent";
                              }}
                              title="点击打开文件编辑器"
                            >
                              {ch.title}
                            </span>
                            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
                              <span>{ch.wordCount} 字 | {new Date(ch.updatedAt).toLocaleString("zh-CN")}</span>
                              {chapterLogs.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleConsole(ch.number);
                                  }}
                                  style={{
                                    padding: "2px 6px",
                                    fontSize: 9,
                                    background: isConsoleOpen ? "var(--bg-hover)" : "none",
                                    border: "1px solid var(--border)",
                                    borderRadius: 4,
                                    color: "var(--text-dim)",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 2
                                  }}
                                  title="切换日志显示"
                                >
                                  <span>🖥️</span>
                                  <span>{isConsoleOpen ? "收起日志" : "查看日志"}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Audit Status */}
                          <div style={{ width: "90px", flexShrink: 0 }}>
                            <span
                              onClick={() => {
                                const hasAudited = ch.status === "approved" || ch.status === "ready-for-review" || ch.status === "audit-failed";
                                if (hasAudited) {
                                  setSelectedChapter(ch);
                                  setIsDrawerOpen(true);
                                } else {
                                  executeCommand(ch.number, "audit", "audit");
                                }
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                background: 
                                  (ch.status === "approved" || ch.status === "ready-for-review") ? "rgba(16, 185, 129, 0.08)" :
                                  ch.status === "audit-failed" ? "rgba(239, 68, 68, 0.08)" :
                                  "var(--bg)",
                                color:
                                  (ch.status === "approved" || ch.status === "ready-for-review") ? "#10b981" :
                                  ch.status === "audit-failed" ? "#ef4444" :
                                  "var(--text-muted)",
                                border: `1px solid ${
                                  (ch.status === "approved" || ch.status === "ready-for-review") ? "#10b98133" :
                                  ch.status === "audit-failed" ? "#ef444433" :
                                  "var(--border)"
                                }`
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-1px)";
                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                                e.currentTarget.style.borderColor = (ch.status === "approved" || ch.status === "ready-for-review") ? "#10b98166" : ch.status === "audit-failed" ? "#ef444466" : "var(--accent)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "none";
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.borderColor = (ch.status === "approved" || ch.status === "ready-for-review") ? "#10b98133" : ch.status === "audit-failed" ? "#ef444433" : "var(--border)";
                              }}
                              title={
                                (ch.status === "approved" || ch.status === "ready-for-review" || ch.status === "audit-failed")
                                  ? "点击查看审计报告详情"
                                  : "点击执行防崩一致性审计"
                              }
                            >
                              <span style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: 
                                  (ch.status === "approved" || ch.status === "ready-for-review") ? "#10b981" :
                                  ch.status === "audit-failed" ? "#ef4444" :
                                  "#9ca3af"
                              }} />
                              {(ch.status === "approved" || ch.status === "ready-for-review") ? "审计通过" :
                               ch.status === "audit-failed" ? "审计未过" : "未审计"}
                            </span>
                          </div>

                          {/* Sync Status */}
                          <div style={{ width: "90px", flexShrink: 0 }}>
                            <span
                              onClick={() => {
                                if (ch.hasSnapshot && ch.status !== "state-degraded") {
                                  setExplorerChapterNum(ch.number);
                                  setExplorerTab("snapshot");
                                } else {
                                  executeCommand(ch.number, "sync", "write-sync");
                                }
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                background: ch.status === "state-degraded"
                                  ? "rgba(239, 68, 68, 0.08)"
                                  : (ch.hasSnapshot ? "rgba(16, 185, 129, 0.08)" : "var(--bg)"),
                                color: ch.status === "state-degraded"
                                  ? "#ef4444"
                                  : (ch.hasSnapshot ? "#10b981" : "var(--text-muted)"),
                                border: `1px solid ${ch.status === "state-degraded" ? "#ef444433" : (ch.hasSnapshot ? "#10b98133" : "var(--border)")}`
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-1px)";
                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                                e.currentTarget.style.borderColor = ch.status === "state-degraded" ? "#ef444466" : ch.hasSnapshot ? "#10b98166" : "var(--accent)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "none";
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.borderColor = ch.status === "state-degraded" ? "#ef444433" : ch.hasSnapshot ? "#10b98133" : "var(--border)";
                              }}
                              title={
                                (ch.hasSnapshot && ch.status !== "state-degraded")
                                  ? "点击查看设定同步快照"
                                  : "点击执行设定同步"
                              }
                            >
                              {ch.status === "state-degraded" ? "⚠️ 设定失步" : (ch.hasSnapshot ? "已同步" : "⚪ 未同步")}
                            </span>
                          </div>

                          {/* Blueprint Status */}
                          <div style={{ width: "90px", flexShrink: 0 }}>
                            <span
                              onClick={() => {
                                if (ch.hasPlan) {
                                  setExplorerChapterNum(ch.number);
                                  setExplorerTab("blueprint");
                                } else {
                                  executeCommand(ch.number, "plan", "plan");
                                }
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                background: ch.hasPlan ? "rgba(168, 85, 247, 0.08)" : "var(--bg)",
                                color: ch.hasPlan ? "#a855f7" : "var(--text-muted)",
                                border: `1px solid ${ch.hasPlan ? "#a855f733" : "var(--border)"}`
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-1px)";
                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                                e.currentTarget.style.borderColor = ch.hasPlan ? "#a855f766" : "var(--accent)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "none";
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.borderColor = ch.hasPlan ? "#a855f733" : "var(--border)";
                              }}
                              title={
                                ch.hasPlan
                                  ? "点击查看写作蓝图"
                                  : "点击生成写作蓝图"
                              }
                            >
                              {ch.hasPlan ? "🟢 已规划" : "⚪ 未规划"}
                            </span>
                          </div>

                          {/* Review Actions */}
                          <div style={{ width: "170px", flexShrink: 0 }}>
                            {ch.status !== "approved" ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    background: 
                                      ch.status === "ready-for-review" ? "rgba(234, 179, 8, 0.08)" :
                                      ch.status === "audit-failed" ? "rgba(239, 68, 68, 0.08)" :
                                      ch.status === "state-degraded" ? "rgba(239, 68, 68, 0.08)" :
                                      "var(--bg)",
                                    color:
                                      ch.status === "ready-for-review" ? "#eab308" :
                                      ch.status === "audit-failed" ? "#ef4444" :
                                      ch.status === "state-degraded" ? "#ef4444" :
                                      "var(--text-muted)",
                                    border: `1px solid ${
                                      ch.status === "ready-for-review" ? "#eab30833" :
                                      ch.status === "audit-failed" ? "#ef444433" :
                                      ch.status === "state-degraded" ? "#ef444433" :
                                      "var(--border)"
                                    }`
                                  }}
                                >
                                  {ch.status === "ready-for-review" ? "待审核" :
                                   ch.status === "audit-failed" ? "审计未过" :
                                   ch.status === "state-degraded" ? "设定失步" : "未审计"}
                                </span>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    onClick={() => handleApprove(ch.number)}
                                    disabled={isAnyRunning}
                                    style={{
                                      padding: "2px 6px",
                                      fontSize: 10,
                                      background: "rgba(16, 185, 129, 0.08)",
                                      border: "1px solid rgba(16, 185, 129, 0.3)",
                                      borderRadius: 4,
                                      color: "#10b981",
                                      fontWeight: 600,
                                      cursor: isAnyRunning ? "not-allowed" : "pointer"
                                    }}
                                    title="批准章节"
                                  >
                                    批准
                                  </button>
                                  <button
                                    onClick={() => handleOpenRejectDialog(ch.number)}
                                    disabled={isAnyRunning}
                                    style={{
                                      padding: "2px 6px",
                                      fontSize: 10,
                                      background: "rgba(239, 68, 68, 0.08)",
                                      border: "1px solid rgba(239, 68, 68, 0.3)",
                                      borderRadius: 4,
                                      color: "#ef4444",
                                      fontWeight: 600,
                                      cursor: isAnyRunning ? "not-allowed" : "pointer"
                                    }}
                                    title="驳回回滚章节"
                                  >
                                    驳回
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  background: "rgba(16, 185, 129, 0.08)",
                                  color: "#10b981",
                                  border: "1px solid #10b98133"
                                }}
                              >
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981" }} />
                                已过审
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Collapsible Console Logs Box */}
                        {isConsoleOpen && (
                          <div
                            style={{
                              background: "rgba(10, 10, 15, 0.95)",
                              borderTop: "1px solid var(--border)",
                              borderBottom: "1px solid var(--border)",
                              padding: "10px 16px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "rgba(16, 185, 129, 0.8)", fontWeight: 700 }}>
                                TERMINAL LOGS :: CHAPTER {ch.number} :: CLI OUTPUT
                              </span>
                              <button
                                onClick={() => toggleConsole(ch.number)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#ef4444",
                                  fontSize: 10,
                                  cursor: "pointer",
                                  fontWeight: 600
                                }}
                              >
                                收起日志 [✕]
                              </button>
                            </div>
                            <div
                              ref={(el) => { logContainerRefs.current[ch.number] = el; }}
                              style={{
                                maxHeight: "160px",
                                overflowY: "auto",
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: "#f3f4f6",
                                whiteSpace: "pre-wrap",
                                padding: "8px",
                                background: "#09090b",
                                border: "1px solid rgba(255,255,255,0.05)",
                                borderRadius: 5,
                                lineHeight: 1.5,
                              }}
                            >
                              {chapterLogs.length === 0 ? (
                                <span style={{ color: "var(--text-dim)" }}>正在启动 InkOS 引擎子进程...</span>
                              ) : (
                                chapterLogs.join("")
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Next Chapter Pre-Plan Panel */}
              {nextChapter && (
                <div
                  style={{
                    padding: "16px 20px",
                    background: "var(--bg-hover)",
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 16 }}>📖</span>
                    <div>
                      <strong style={{ color: "var(--text)" }}>下一章节写作规划：第 {nextChapter.number} 章</strong>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 10 }}>
                        {nextChapter.hasPlan 
                          ? "🟢 写作蓝图已就绪。" 
                          : "🔴 当前无规划蓝图"}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", gap: 8 }}>
                    {nextChapter.hasPlan && (
                      <button
                        onClick={() => {
                          const planPath = `${cwd}/books/${bookId}/story/runtime/chapter-${String(nextChapter.number).padStart(4, "0")}.intent.md`;
                          onOpenFile(planPath, `chapter-${String(nextChapter.number).padStart(4, "0")}.intent.md`);
                        }}
                        style={{
                          padding: "6px 12px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--text)",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        👁️ 查看第 {nextChapter.number} 章蓝图
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (runningActions[nextChapter.number] === "plan") {
                          setPlanningProgressNum(nextChapter.number);
                        } else if (nextChapter.hasPlan) {
                          setPlanConfirmNum(nextChapter.number);
                        } else {
                          executeCommand(nextChapter.number, "plan", "plan");
                          setPlanningProgressNum(nextChapter.number);
                        }
                      }}
                      disabled={!!runningActions[nextChapter.number] && runningActions[nextChapter.number] !== "plan"}
                      style={{
                        padding: "6px 14px",
                        background: "rgba(168, 85, 247, 0.08)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        borderRadius: 6,
                        color: "#c084fc",
                        cursor: "pointer",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      {runningActions[nextChapter.number] === "plan" ? "⏳ 规划中..." : `规划第 ${nextChapter.number} 章蓝图`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject & Rollback Confirmation Modal */}
      {rejectChapterNum !== null && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(10, 8, 8, 0.4)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            width: "480px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
            padding: "20px 24px",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠️</span> 确定驳回并执行回滚吗？
            </h3>
            
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 16 }}>
              您确定要驳回 <strong style={{ color: "var(--accent)" }}>第 {rejectChapterNum} 章</strong> 吗？
              <div style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.04)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                borderRadius: 6,
                color: "#f87171",
                fontSize: 12
              }}>
                **重要警告**：此驳回操作将自动**回滚系统设定到第 {rejectChapterNum - 1} 章**的快照点。
                在磁盘上，**第 {rejectChapterNum} 章及之后的所有后续章节草稿、运行时蓝图和修改快照均会被永久物理删除**以维持故事连贯性！
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>驳回原因 (可选):</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="在此输入驳回该章节的原因/修改意见..."
                style={{
                  height: "70px",
                  padding: "8px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 12,
                  fontFamily: "var(--font-serif)",
                  resize: "none",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setRejectChapterNum(null)}
                disabled={isRejecting}
                style={{
                  padding: "6px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={isRejecting}
                style={{
                  padding: "6px 14px",
                  background: "#ef4444",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 12
                }}
              >
                {isRejecting ? "正在回滚..." : "🚨 确定驳回并删除后续"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-plan Confirmation Modal */}
      {planConfirmNum !== null && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(10, 8, 8, 0.4)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            width: "440px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
            padding: "20px 24px",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "#eab308", display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠️</span> 确定重新规划章节蓝图吗？
            </h3>
            
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 20 }}>
              检测到您已为 <strong style={{ color: "var(--accent)" }}>第 {planConfirmNum} 章</strong> 生成了写作蓝图。
              <div style={{
                marginTop: 10,
                padding: "10px 14px",
                background: "rgba(234, 179, 8, 0.04)",
                border: "1px solid rgba(234, 179, 8, 0.15)",
                borderRadius: 6,
                color: "var(--text-muted)",
                fontSize: 12
              }}>
                若在此期间您未对大纲或前文设定进行重大调整，无需重复规划。
                <br /><br />
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>警告</span>：重新生成将会<strong>覆盖您可能已手动修改的蓝图内容</strong>，并消耗大模型 Token 额度。
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setPlanConfirmNum(null)}
                style={{
                  padding: "6px 14px",
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const chNum = planConfirmNum;
                  setPlanConfirmNum(null);
                  executeCommand(chNum, "plan", "plan");
                  setPlanningProgressNum(chNum);
                }}
                style={{
                  padding: "6px 16px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                确定重新规划
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Planning Progress Modal */}
      {planningProgressNum !== null && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(10, 8, 8, 0.45)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            width: "560px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>📖</span> 第 {planningProgressNum} 章大纲蓝图规划进度
              </h3>
              <button
                onClick={() => setPlanningProgressNum(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Status indicator */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--bg-hover)",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 12
            }}>
              {runningActions[planningProgressNum] === "plan" ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                  </svg>
                  <span style={{ color: "var(--text)" }}>正在由 InkOS 智能体分析设定并规划本章写作蓝图...</span>
                </>
              ) : (
                (() => {
                  const hasPlanFile = chapters.find(c => c.number === planningProgressNum)?.hasPlan || (nextChapter?.number === planningProgressNum && nextChapter.hasPlan);
                  const logStr = (logs[planningProgressNum] || []).join("");
                  if (logStr.includes("执行失败") || logStr.includes("Error") || logStr.includes("❌")) {
                    return (
                      <span style={{ color: "#ef4444" }}>❌ 规划执行失败，请检查下方日志错误</span>
                    );
                  } else if (hasPlanFile || logStr.includes("执行完成") || logStr.includes("🎉")) {
                    return (
                      <span style={{ color: "#10b981" }}>✅ 规划已成功完成！大纲蓝图就绪。</span>
                    );
                  } else {
                    return (
                      <span style={{ color: "var(--text-muted)" }}>规划任务处于就绪或未开始状态。</span>
                    );
                  }
                })()
              )}
            </div>

            {/* Terminal logs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>运行日志 (Terminal Output):</label>
              <div
                ref={(el) => {
                  if (el) logContainerRefs.current[planningProgressNum] = el;
                }}
                style={{
                  height: "260px",
                  overflowY: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#f3f4f6",
                  whiteSpace: "pre-wrap",
                  padding: "10px",
                  background: "#09090b",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 6,
                  lineHeight: 1.5,
                }}
              >
                {(logs[planningProgressNum] || []).length === 0 ? (
                  <span style={{ color: "var(--text-dim)" }}>正在启动 InkOS 引擎子进程...</span>
                ) : (
                  (logs[planningProgressNum] || []).join("")
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setPlanningProgressNum(null)}
                style={{
                  padding: "6px 14px",
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {runningActions[planningProgressNum] === "plan" ? "后台运行" : "关闭"}
              </button>
              
              {(() => {
                const hasPlanFile = chapters.find(c => c.number === planningProgressNum)?.hasPlan || (nextChapter?.number === planningProgressNum && nextChapter.hasPlan);
                if (hasPlanFile) {
                  return (
                    <button
                      onClick={() => {
                        const padded = String(planningProgressNum).padStart(4, "0");
                        const planPath = `${cwd}/books/${bookId}/story/runtime/chapter-${padded}.intent.md`;
                        onOpenFile(planPath, `chapter-${padded}.intent.md`);
                        setPlanningProgressNum(null);
                      }}
                      style={{
                        padding: "6px 16px",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 6,
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      👁️ 查看生成蓝图
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot & Blueprint Explorer Modal */}
      {explorerChapterNum !== null && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(10, 8, 8, 0.45)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            width: "min(92vw, 960px)",
            height: "75vh",
            maxHeight: "650px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            color: "var(--text)",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📂</span> 第 {explorerChapterNum} 章 快照与蓝图浏览器
                </h3>
                <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "4px 0 0 0" }}>
                  预览与对比当前章节的历史同步设定快照，或查看写作大纲与蓝图。
                </p>
              </div>
              <button
                onClick={() => setExplorerChapterNum(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </div>

            {/* Main Split Layout */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 20, minHeight: 0, marginBottom: 12 }}>
              
              {/* Left Column: File List */}
              <div style={{
                width: "270px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                borderRight: "1px solid var(--border)",
                paddingRight: 16,
                gap: 12,
                overflow: "hidden"
              }}>
                {/* Tabs */}
                <div style={{
                  display: "flex",
                  borderBottom: "1px solid var(--border)",
                  gap: 4,
                  flexShrink: 0
                }}>
                  <button
                    onClick={() => setExplorerTab("snapshot")}
                    style={{
                      flex: 1,
                      padding: "8px 0 10px 0",
                      background: "none",
                      border: "none",
                      borderBottom: explorerTab === "snapshot" ? "2px solid var(--accent)" : "2px solid transparent",
                      color: explorerTab === "snapshot" ? "var(--accent)" : "var(--text-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    🔁 同步快照
                  </button>
                  <button
                    onClick={() => setExplorerTab("blueprint")}
                    style={{
                      flex: 1,
                      padding: "8px 0 10px 0",
                      background: "none",
                      border: "none",
                      borderBottom: explorerTab === "blueprint" ? "2px solid var(--accent)" : "2px solid transparent",
                      color: explorerTab === "blueprint" ? "var(--accent)" : "var(--text-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    写作蓝图
                  </button>
                </div>

                {/* File Cards Container */}
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {explorerTab === "snapshot" ? (
                    <>
                      {[
                        { name: "current_state.md", label: "设定真理库总览", desc: "记录底层规则、地理人文及设定现状。" },
                        { name: "particle_ledger.md", label: "微观设定事物清单", desc: "梳理道具、特殊术语及微观物质设定。" },
                        { name: "pending_hooks.md", label: "待解悬念与未收伏笔", desc: "整理未解悬念、待收伏笔及线索。" },
                        { name: "chapter_summaries.md", label: "章节提要与历史剧情", desc: "已完成章节的详细梗概与剧情摘要。" },
                        { name: "subplot_board.md", label: "支线看板与情感线索", desc: "记录支线任务进展及剧情线走向。" },
                        { name: "emotional_arcs.md", label: "角色情感关系与弧度", desc: "展现角色间情感张力与心路历程。" },
                        { name: "character_matrix.md", label: "角色属性矩阵与出场", desc: "维护登场角色基本信息与最新状态。" }
                      ].map((file) => {
                        const filePath = `${cwd}/books/${bookId}/story/snapshots/${explorerChapterNum}/${file.name}`;
                        const isSelected = selectedPreviewFile?.name === file.name;
                        return (
                          <div
                            key={file.name}
                            onClick={() => setSelectedPreviewFile({ name: file.name, path: filePath })}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "8px 10px",
                              borderRadius: 6,
                              border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                              background: isSelected ? "rgba(96, 165, 250, 0.06)" : "var(--bg)",
                              cursor: "pointer",
                              transition: "all 0.15s"
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = "var(--bg-hover)";
                                e.currentTarget.style.transform = "translateX(2px)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = "var(--bg)";
                                e.currentTarget.style.transform = "none";
                              }
                            }}
                          >
                            <span style={{ fontSize: 16, marginRight: 8 }}>📄</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.label}</div>
                              <div style={{ fontSize: 9, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{file.name}</div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      {[
                        {
                          name: `chapter-${String(explorerChapterNum).padStart(4, "0")}.intent.md`,
                          label: "写作蓝图",
                          desc: "核心目的、叙事视角与期望冲突效果。"
                        },
                        {
                          name: `chapter-${String(explorerChapterNum).padStart(4, "0")}.plan.md`,
                          label: "写作执行计划",
                          desc: "拆解段落大纲、伏笔呼应与细化字数。"
                        }
                      ].map((file) => {
                        const filePath = `${cwd}/books/${bookId}/story/runtime/${file.name}`;
                        const isSelected = selectedPreviewFile?.name === file.name;
                        return (
                          <div
                            key={file.name}
                            onClick={() => setSelectedPreviewFile({ name: file.name, path: filePath })}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "8px 10px",
                              borderRadius: 6,
                              border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                              background: isSelected ? "rgba(168, 85, 247, 0.06)" : "var(--bg)",
                              cursor: "pointer",
                              transition: "all 0.15s"
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = "var(--bg-hover)";
                                e.currentTarget.style.transform = "translateX(2px)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = "var(--bg)";
                                e.currentTarget.style.transform = "none";
                              }
                            }}
                          >
                            <span style={{ fontSize: 16, marginRight: 8 }}>📖</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? "#a855f7" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.label}</div>
                              <div style={{ fontSize: 9, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{file.name}</div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Right Column: File Preview */}
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}>
                {selectedPreviewFile ? (
                  <>
                    {/* Preview Header */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--bg-panel)",
                      flexShrink: 0
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", display: "block" }}>
                          PREVIEWING FILE
                        </span>
                        <strong style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedPreviewFile.name}
                        </strong>
                      </div>
                      <button
                        onClick={() => {
                          onOpenFile(selectedPreviewFile.path, selectedPreviewFile.name);
                          setExplorerChapterNum(null);
                        }}
                        style={{
                          padding: "6px 12px",
                          background: "var(--accent)",
                          border: "none",
                          borderRadius: 6,
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 11,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4
                        }}
                        title="在主编辑器 Tab 中以全屏及编辑模式打开该文件"
                      >
                        <span>✍️</span> 在编辑器中打开
                      </button>
                    </div>

                    {/* Preview Content */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                      {previewLoading ? (
                        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                          </svg>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>正在从物理磁盘载入快照内容...</span>
                        </div>
                      ) : previewError ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{
                            padding: "16px",
                            background: "rgba(239, 68, 68, 0.04)",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                            borderRadius: 8,
                            color: "#f87171",
                            fontSize: 12,
                            lineHeight: 1.6
                          }}>
                            <h4 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 700 }}>⚠️ 快照/蓝图文件不存在</h4>
                            <p style={{ margin: "0 0 12px 0" }}>{previewError}</p>
                            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                              {explorerTab === "snapshot" ? (
                                <>
                                  建议前置操作：
                                  <br />
                                  1. 关闭此弹窗。
                                  <br />
                                  2. 点击当前章节的 **「未同步/设定失步」** 状态徽章以自动运行同步。
                                  <br />
                                  3. 同步完成后即可在此处预览快照设定。
                                </>
                              ) : (
                                <>
                                  建议前置操作：
                                  <br />
                                  1. 关闭此弹窗。
                                  <br />
                                  2. 点击当前章节的 **「未规划」** 状态徽章以自动运行大纲与蓝图规划。
                                  <br />
                                  3. 规划完成后即可在此处预览写作蓝图与写作计划。
                                </>
                              )}
                            </div>
                          </div>

                          {/* Contextual User Guidance for Optional/Dynamic Files */}
                          {selectedPreviewFile.name === "particle_ledger.md" && (
                            <div style={{
                              padding: "12px 14px",
                              background: "rgba(96, 165, 250, 0.05)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              borderRadius: 8,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.5
                            }}>
                              💡 **系统提示**：`particle_ledger.md`（微观设定事物账本）为**非必选属性**。只有带有数值系统（如升级流玄幻、系统网游等题材）的书籍在初始化时才会开启并生成该文件。如果您的作品是非数值/常规题材，此文件不生成属于正常设计，无需担心功能缺失。
                            </div>
                          )}
                          {selectedPreviewFile.name === "subplot_board.md" && (
                            <div style={{
                              padding: "12px 14px",
                              background: "rgba(96, 165, 250, 0.05)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              borderRadius: 8,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.5
                            }}>
                              💡 **系统提示**：`subplot_board.md`（支线进度看板）为**动态按需生成**。在小说开篇（如第 1 章）或剧情纯单主线发展时，AI 架构师不会预先初始化它。后续随着支线剧情的展开和多线故事的发展，写手引擎在后续章节中会自动按需生成并对其进行更新。
                            </div>
                          )}
                          {selectedPreviewFile.name === "emotional_arcs.md" && (
                            <div style={{
                              padding: "12px 14px",
                              background: "rgba(96, 165, 250, 0.05)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              borderRadius: 8,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.5
                            }}>
                              💡 **系统提示**：`emotional_arcs.md`（角色情感关系与弧度）由系统在故事发展过程中**动态分析生成**。如果当前章节不涉及多角色复杂互动或剧烈情感波折起伏，该快照点可能会跳过生成，直到后续产生情感变化时才会生成并同步。
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <div className="markdown-body markdown-file-preview" style={{ fontSize: 12, lineHeight: 1.6 }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {previewContent}
                            </ReactMarkdown>
                          </div>
                          {selectedPreviewFile.name === "emotional_arcs.md" && isMarkdownTableEmpty(previewContent) && (
                            <div style={{
                              padding: "12px 14px",
                              background: "rgba(96, 165, 250, 0.05)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              borderRadius: 8,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.5,
                              marginTop: 8
                            }}>
                              💡 **系统提示**：`emotional_arcs.md`（角色情感关系与弧度）目前仅包含表头模板。这是正常的。当您在后续章节的写作中，角色经历显著的情绪变化、多角色复杂互动或剧烈情感波折起伏时，写手引擎在完成该章节的「设定同步」后，会自动在此文件中追加并更新情感弧度数据记录。
                            </div>
                          )}
                          {selectedPreviewFile.name === "subplot_board.md" && isMarkdownTableEmpty(previewContent) && (
                            <div style={{
                              padding: "12px 14px",
                              background: "rgba(96, 165, 250, 0.05)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              borderRadius: 8,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.5,
                              marginTop: 8
                            }}>
                              💡 **系统提示**：`subplot_board.md`（支线进度看板）目前仅包含表头模板。这是正常的。当后续剧情中引入了支线故事或情感线索，并在章节管控中心执行「设定同步」后，写手引擎会自动在此生成并更新具体的支线与情感板块记录。
                            </div>
                          )}
                          {selectedPreviewFile.name === "particle_ledger.md" && isMarkdownTableEmpty(previewContent) && (
                            <div style={{
                              padding: "12px 14px",
                              background: "rgba(96, 165, 250, 0.05)",
                              border: "1px solid rgba(96, 165, 250, 0.2)",
                              borderRadius: 8,
                              color: "var(--text-muted)",
                              fontSize: 11,
                              lineHeight: 1.5,
                              marginTop: 8
                            }}>
                              💡 **系统提示**：`particle_ledger.md`（微观设定事物账本）目前仅包含表头模板。这是正常的。当后续章节的写作中出现新物品、法宝或特殊术语，且该书属于有数值/升级流系统的题材时，系统会在「设定同步」后在此记录并追踪对应设定。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12 }}>
                    请在左侧选择要预览的文件。
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
              <button
                onClick={() => setExplorerChapterNum(null)}
                style={{
                  padding: "6px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-muted)",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Chapter Report Details */}
      {/* Slide-over Drawer for Chapter Report Details */}
      {isDrawerOpen && selectedChapter && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1050,
          display: "flex",
          justifyContent: "flex-end",
          background: "rgba(0,0,0,0.2)",
          backdropFilter: "blur(2px)",
        }}>
          {/* Overlay click to close */}
          <div style={{ flex: 1 }} onClick={() => setIsDrawerOpen(false)} />
          
          {/* Drawer Content */}
          <div style={{
            width: "480px",
            height: "100%",
            background: "var(--bg-panel)",
            borderLeft: "1px solid var(--border)",
            boxShadow: "-10px 0 30px rgba(0,0,0,0.2)",
            display: "flex",
            flexDirection: "column",
            animation: "slideIn 0.25s ease-out"
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--bg-hover)"
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>章节详情报告 - Ch.{selectedChapter.number}</h3>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{selectedChapter.title}</span>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 16,
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Metadata list */}
              <div>
                <h4 style={{ margin: "0 0 10px 0", fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>基本元数据</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, background: "var(--bg)", padding: 12, borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}>
                  <div>
                    <span style={{ color: "var(--text-dim)" }}>章节字数：</span>
                    <strong style={{ color: "var(--text)" }}>{selectedChapter.wordCount} 字</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-dim)" }}>流程状态：</span>
                    <strong style={{ color: "var(--text)" }}>{selectedChapter.status}</strong>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: "var(--text-dim)" }}>创建时间：</span>
                    <span style={{ color: "var(--text)" }}>{new Date(selectedChapter.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: "var(--text-dim)" }}>最后修改：</span>
                    <span style={{ color: "var(--text)" }}>{new Date(selectedChapter.updatedAt).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
              </div>

              {/* Review notes if rejected */}
              {selectedChapter.reviewNote && (
                <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.03)", border: "1px dashed rgba(239,68,68,0.25)", borderRadius: 8 }}>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 12, color: "#ef4444" }}>🚩 历史驳回备注</h4>
                  <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5, color: "var(--text)" }}>{selectedChapter.reviewNote}</p>
                </div>
              )}

              {/* Length Warnings */}
              <div>
                <h4 style={{ margin: "0 0 10px 0", fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>📏 字数管控指标</h4>
                {selectedChapter.lengthWarnings && selectedChapter.lengthWarnings.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedChapter.lengthWarnings.map((warn, i) => (
                      <div key={i} style={{ padding: "10px 14px", background: "rgba(234,179,8,0.03)", borderLeft: "3px solid #eab308", border: "1px solid rgba(234,179,8,0.15)", borderRadius: 6, fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>
                        ⚠️ {warn}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#10b981", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)", padding: "10px 12px", borderRadius: 6 }}>
                    ✓ 字数控制处于健康范围内，未触发偏多/偏少警告。
                  </div>
                )}
              </div>

              {/* Audit Issues */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>🛡️ 防崩一致性审计</h4>
                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      executeCommand(selectedChapter.number, "audit", "audit");
                    }}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(59, 130, 246, 0.08)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: 6,
                      color: "#60a5fa",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}
                    title="重新执行防崩一致性审计"
                  >
                    <span>🔁</span> 重新审计
                  </button>
                </div>
                {selectedChapter.auditIssues && selectedChapter.auditIssues.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedChapter.auditIssues.map((issue, idx) => {
                      const match = issue.match(/^\[(critical|warning|info)\]\s*(.*)$/i);
                      const severity = match ? match[1].toLowerCase() : "info";
                      const text = match ? match[2] : issue;
                      const sevColor = severity === "critical" ? "#ef4444" : severity === "warning" ? "#eab308" : "#3b82f6";
                      return (
                        <div key={idx} style={{ padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderLeft: `3px solid ${sevColor}`, borderRadius: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: sevColor, textTransform: "uppercase" }}>
                              {severity === "critical" ? "严重错误" : severity === "warning" ? "潜在风险" : "风格建议"}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, margin: 0, color: "var(--text)", lineHeight: 1.6 }}>{text}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#10b981", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)", padding: "10px 12px", borderRadius: 6 }}>
                    ✓ 本章未发现任何设定连续性矛盾或逻辑硬伤。
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-hover)",
              display: "flex",
              justifyContent: "flex-end"
            }}>
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  handleOpenChapterFile(selectedChapter.number, selectedChapter.title);
                }}
                style={{
                  padding: "8px 16px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✍️ 进入正文编辑器
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
