"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
          <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "4px 0 0 0" }}>
            一站式监控防崩审计、设定同步及写作蓝图，防范故事逻辑与人设漂移。
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              width: 180,
              outline: "none",
            }}
          />
          <button
            onClick={() => fetchDashboardData()}
            disabled={loading}
            style={{
              padding: "6px 14px",
              background: "rgba(96, 165, 250, 0.08)",
              border: "1px solid rgba(96, 165, 250, 0.3)",
              borderRadius: 6,
              color: "#60a5fa",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🔄</span> 重新扫描
          </button>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, padding: "20px 24px" }}>
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
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>异常章节 (审计失败 / 状态漂移)</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: (auditFailedChapters + degradedChapters) > 0 ? "#ef4444" : "#10b981" }}>
                {auditFailedChapters + degradedChapters} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-dim)" }}>处</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>审计不合规 {auditFailedChapters} | 设定失步 {degradedChapters}</div>
            </div>
            <div style={{ padding: 16, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>大纲蓝图覆盖度</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: "#a855f7" }}>{blueprintCoverage}%</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>已规划意图 {hasPlanChapters} / {totalChapters} 章</div>
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
                <div style={{ flex: 1, minWidth: 150 }}>章节名称</div>
                <div style={{ width: "100px", flexShrink: 0 }}>防崩审计</div>
                <div style={{ width: "100px", flexShrink: 0 }}>设定同步</div>
                <div style={{ width: "100px", flexShrink: 0 }}>意图蓝图</div>
                <div style={{ width: "110px", flexShrink: 0 }}>审核决策</div>
                <div style={{ width: "230px", flexShrink: 0, textAlign: "right" }}>系统动作</div>
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
                          <div style={{ flex: 1, minWidth: 150, paddingRight: 10 }}>
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
                            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>
                              {ch.wordCount} 字 | {new Date(ch.updatedAt).toLocaleString("zh-CN")}
                            </div>
                          </div>

                          {/* Audit Status */}
                          <div style={{ width: "100px", flexShrink: 0 }}>
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
                                  ch.status === "approved" ? "rgba(16, 185, 129, 0.08)" :
                                  ch.status === "ready-for-review" ? "rgba(234, 179, 8, 0.08)" :
                                  ch.status === "audit-failed" ? "rgba(239, 68, 68, 0.08)" :
                                  "var(--bg)",
                                color:
                                  ch.status === "approved" ? "#10b981" :
                                  ch.status === "ready-for-review" ? "#eab308" :
                                  ch.status === "audit-failed" ? "#ef4444" :
                                  "var(--text-muted)",
                                border: `1px solid ${
                                  ch.status === "approved" ? "#10b98133" :
                                  ch.status === "ready-for-review" ? "#eab30833" :
                                  ch.status === "audit-failed" ? "#ef444433" :
                                  "var(--border)"
                                }`
                              }}
                            >
                              <span style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: 
                                  ch.status === "approved" ? "#10b981" :
                                  ch.status === "ready-for-review" ? "#eab308" :
                                  ch.status === "audit-failed" ? "#ef4444" :
                                  "#9ca3af"
                              }} />
                              {ch.status === "approved" ? "审计通过" :
                               ch.status === "ready-for-review" ? "待审核" :
                               ch.status === "audit-failed" ? "审计未过" : "未审计"}
                            </span>
                          </div>

                          {/* Sync Status */}
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                background: ch.status === "state-degraded"
                                  ? "rgba(239, 68, 68, 0.08)"
                                  : (ch.hasSnapshot ? "rgba(16, 185, 129, 0.08)" : "var(--bg)"),
                                color: ch.status === "state-degraded"
                                  ? "#ef4444"
                                  : (ch.hasSnapshot ? "#10b981" : "var(--text-muted)"),
                                border: `1px solid ${ch.status === "state-degraded" ? "#ef444433" : (ch.hasSnapshot ? "#10b98133" : "var(--border)")}`
                              }}
                            >
                              {ch.status === "state-degraded" ? "⚠️ 设定失步" : (ch.hasSnapshot ? "🔄 已同步" : "⚪ 未同步")}
                            </span>
                          </div>

                          {/* Blueprint Status */}
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                background: ch.hasPlan ? "rgba(168, 85, 247, 0.08)" : "var(--bg)",
                                color: ch.hasPlan ? "#a855f7" : "var(--text-muted)",
                                border: `1px solid ${ch.hasPlan ? "#a855f733" : "var(--border)"}`
                              }}
                            >
                              {ch.hasPlan ? "🗺️ 已规划" : "⚪ 未规划"}
                            </span>
                          </div>

                          {/* Review Actions */}
                          <div style={{ width: "110px", flexShrink: 0 }}>
                            {ch.status !== "approved" ? (
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
                            ) : (
                              <span style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
                                状态已锁定过审
                              </span>
                            )}
                          </div>

                          {/* Quick Actions */}
                          <div style={{ width: "230px", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 6 }}>
                            <button
                              onClick={() => {
                                setSelectedChapter(ch);
                                setIsDrawerOpen(true);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: 10,
                                background: "none",
                                border: "1px solid var(--border)",
                                borderRadius: 5,
                                color: "var(--text-muted)",
                                cursor: "pointer",
                              }}
                            >
                              📋 详情
                            </button>
                            
                            <button
                              onClick={() => executeCommand(ch.number, "audit", "audit")}
                              disabled={isAnyRunning}
                              style={{
                                padding: "4px 8px",
                                fontSize: 10,
                                background: "rgba(59, 130, 246, 0.08)",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                borderRadius: 5,
                                color: "#60a5fa",
                                fontWeight: 600,
                                cursor: isAnyRunning ? "not-allowed" : "pointer",
                              }}
                              title="运行防崩审计"
                            >
                              {isAuditRunning ? "⏳ 审计" : "🛡️ 审计"}
                            </button>

                            <button
                              onClick={() => executeCommand(ch.number, "sync", "write-sync")}
                              disabled={isAnyRunning}
                              style={{
                                padding: "4px 8px",
                                fontSize: 10,
                                background: "rgba(16, 185, 129, 0.08)",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                borderRadius: 5,
                                color: "#10b981",
                                fontWeight: 600,
                                cursor: isAnyRunning ? "not-allowed" : "pointer",
                              }}
                              title="同步故事设定"
                            >
                              {isSyncRunning ? "⏳ 同步" : "🔄 同步"}
                            </button>

                            {chapterLogs.length > 0 && (
                              <button
                                onClick={() => toggleConsole(ch.number)}
                                style={{
                                  padding: "4px",
                                  fontSize: 10,
                                  background: isConsoleOpen ? "var(--bg-hover)" : "none",
                                  border: "1px solid var(--border)",
                                  borderRadius: 5,
                                  color: "var(--text-dim)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center"
                                }}
                                title="切换日志显示"
                              >
                                🖥️
                              </button>
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
                    <span style={{ fontSize: 16 }}>🗺️</span>
                    <div>
                      <strong style={{ color: "var(--text)" }}>下一章节写作规划：第 {nextChapter.number} 章</strong>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 10 }}>
                        {nextChapter.hasPlan 
                          ? "🟢 意图蓝图已就绪。续写时将自动装载。" 
                          : "⚪ 当前无规划蓝图，系统将自动使用通用大纲生成。建议前置规划以微调目标。"}
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
                        👁️ 查看意图蓝图
                      </button>
                    )}
                    <button
                      onClick={() => executeCommand(nextChapter.number, "plan", "plan")}
                      disabled={!!runningActions[nextChapter.number]}
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
                      {runningActions[nextChapter.number] === "plan" ? "⏳ 规划中..." : "🗺️ 规划下一章意图"}
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
                <h4 style={{ margin: "0 0 10px 0", fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase" }}>🛡️ 防崩一致性审计</h4>
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
