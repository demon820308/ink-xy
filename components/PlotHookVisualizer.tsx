import React, { useState, useMemo } from "react";

interface HookItem {
  id: string;
  startChapter: number;
  type: string;
  status: string;
  lastAdvanced: number;
  expectedPayoff: string;
  payoffTiming: string;
  dependsOn: string[];
  volume: string;
  core: boolean;
  halfLife: number;
  promoted: boolean;
  notes: string;
  rawLineIndex: number; // to reconstruct markdown exactly
}

interface PlotHookVisualizerProps {
  editContent: string;
  onChange: (newVal: string) => void;
  /** Actual chapter count from the book's chapters/index.json, used as floor for currentChapter */
  totalChapters?: number;
}

// Normalized status check
const RESOLVED_STATUSES = [/^(resolved|closed|done|已回收|已解决)$/i];
const DEFERRED_STATUSES = [/^(deferred|paused|hold|延后|延期|搁置|暂缓)$/i];
const PROGRESSING_STATUSES = [/^(progressing|advanced|重大推进|持续推进|进行中)$/i];

function getStatusType(status: string): "resolved" | "deferred" | "progressing" | "open" {
  const s = status.trim();
  if (RESOLVED_STATUSES.some(p => p.test(s))) return "resolved";
  if (DEFERRED_STATUSES.some(p => p.test(s))) return "deferred";
  if (PROGRESSING_STATUSES.some(p => p.test(s))) return "progressing";
  return "open";
}

export const PlotHookVisualizer: React.FC<PlotHookVisualizerProps> = ({ editContent, onChange, totalChapters }) => {
  const [activeTab, setActiveTab] = useState<"timeline" | "board">("timeline");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hoveredHookId, setHoveredHookId] = useState<string | null>(null);

  // Parse Markdown Table
  const parsedData = useMemo(() => {
    const lines = editContent.split("\n");
    const hooks: HookItem[] = [];
    let tableHeaderLineIdx = -1;
    let tableSeparatorLineIdx = -1;
    let headers: string[] = [];

    // Find the table boundaries
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line.startsWith("|") && line.endsWith("|")) {
        if (tableHeaderLineIdx === -1) {
          tableHeaderLineIdx = i;
          headers = line.split("|").slice(1, -1).map(h => h.trim().toLowerCase());
        } else if (tableSeparatorLineIdx === -1 && line.includes("---")) {
          tableSeparatorLineIdx = i;
        } else if (tableSeparatorLineIdx !== -1) {
          // Parse data row
          const cells = line.split("|").slice(1, -1).map(c => c.trim());
          if (cells.length > 0 && cells[0]) {
            const hook: Partial<HookItem> = { rawLineIndex: i };
            
            // Map header indexes
            headers.forEach((header, colIdx) => {
              const val = cells[colIdx] || "";
              
              if (header.includes("hook_id") || header.includes("id")) {
                hook.id = val;
              } else if (header.includes("起始章节") || header.includes("start_chapter") || header.includes("startchapter")) {
                hook.startChapter = parseInt(val, 10) || 1;
              } else if (header.includes("类型") || header.includes("type")) {
                hook.type = val;
              } else if (header.includes("状态") || header.includes("status")) {
                hook.status = val;
              } else if (header.includes("最近推进") || header.includes("last_advanced_chapter") || header.includes("lastadvanced")) {
                hook.lastAdvanced = parseInt(val, 10) || 0;
              } else if (header.includes("预期回收") || header.includes("expected_payoff") || header.includes("expectedpayoff")) {
                hook.expectedPayoff = val;
              } else if (header.includes("回收节奏") || header.includes("payoff_timing") || header.includes("payofftiming")) {
                hook.payoffTiming = val;
              } else if (header.includes("上游依赖") || header.includes("depends_on") || header.includes("dependson")) {
                // Parse dependency array (e.g., "[H01]", "H01,H02", "无")
                if (!val || val === "无" || val === "none") {
                  hook.dependsOn = [];
                } else {
                  hook.dependsOn = val
                    .replace(/[\[\]]/g, "")
                    .split(/[,，\s]+/)
                    .map(d => d.trim())
                    .filter(Boolean);
                }
              } else if (header.includes("回收卷") || header.includes("volume")) {
                hook.volume = val;
              } else if (header.includes("核心") || header.includes("core")) {
                hook.core = val === "是" || val.toLowerCase() === "true" || val === "yes";
              } else if (header.includes("半衰期") || header.includes("half_life") || header.includes("halflife")) {
                hook.halfLife = parseInt(val, 10) || 20;
              } else if (header.includes("升级") || header.includes("promoted")) {
                hook.promoted = val === "是" || val.toLowerCase() === "true" || val === "yes";
              } else if (header.includes("备注") || header.includes("notes") || header.includes("remark")) {
                hook.notes = val;
              }
            });

            // Fill default values for fields not mapped
            hook.id = hook.id || `H${hooks.length + 1}`;
            hook.startChapter = hook.startChapter || 1;
            hook.type = hook.type || "主线";
            hook.status = hook.status || "未开启";
            hook.lastAdvanced = hook.lastAdvanced || 0;
            hook.expectedPayoff = hook.expectedPayoff || "暂无";
            hook.payoffTiming = hook.payoffTiming || "中程";
            hook.dependsOn = hook.dependsOn || [];
            hook.volume = hook.volume || "";
            hook.core = hook.core || false;
            hook.halfLife = hook.halfLife || 20;
            hook.promoted = hook.promoted || false;
            hook.notes = hook.notes || "";

            hooks.push(hook as HookItem);
          }
        }
      }
    }

    return { hooks, tableHeaderLineIdx, tableSeparatorLineIdx, headers };
  }, [editContent]);

  const { hooks, headers } = parsedData;

  // Compute Diagnostics
  const hookDiagnostics = useMemo(() => {
    const diagMap = new Map<string, { stale: boolean; blocked: boolean; missing: string[]; distance: number; blockedDistance: number }>();
    const byId = new Map<string, HookItem>();
    hooks.forEach(h => byId.set(h.id, h));

    // Dynamic current chapter detection: use the highest of:
    // 1. The actual chapter count passed from the book index (most reliable)
    // 2. The highest startChapter or lastAdvanced seen in the hooks table
    const hooksDerivedChapter = hooks.length > 0
      ? Math.max(...hooks.map(h => Math.max(h.startChapter, h.lastAdvanced)))
      : 0;
    const currentChapter = Math.max(1, totalChapters ?? 0, hooksDerivedChapter);

    hooks.forEach(hook => {
      const isRes = getStatusType(hook.status) === "resolved";
      const distance = Math.max(0, currentChapter - hook.startChapter);
      
      // 1. Stale detection (distance > halfLife)
      const stale = !isRes && hook.startChapter > 0 && distance > hook.halfLife;

      // 2. Blocked detection
      const missing: string[] = [];
      const upstreamReferenceChapters: number[] = [];

      hook.dependsOn.forEach(upstreamId => {
        const upstream = byId.get(upstreamId);
        if (!upstream) {
          missing.push(upstreamId);
          upstreamReferenceChapters.push(hook.startChapter);
        } else {
          const upRes = getStatusType(upstream.status) === "resolved";
          const upPlanted = upstream.startChapter > 0 && upstream.startChapter <= currentChapter;
          if (!upPlanted || !upRes) {
            missing.push(upstreamId);
            upstreamReferenceChapters.push(upPlanted ? upstream.startChapter : hook.startChapter);
          }
        }
      });

      const blocked = missing.length > 0 && !isRes;
      let blockedDistance = 0;
      if (blocked && upstreamReferenceChapters.length > 0) {
        const earliestReference = Math.min(...upstreamReferenceChapters);
        blockedDistance = Math.max(0, currentChapter - earliestReference);
      }

      diagMap.set(hook.id, {
        stale,
        blocked,
        missing,
        distance,
        blockedDistance
      });
    });

    return { diagMap, currentChapter };
  }, [hooks]);

  const { diagMap, currentChapter } = hookDiagnostics;

  // Update a single hook's status back to Markdown
  const handleUpdateStatus = (hookId: string, newStatus: string) => {
    const lines = editContent.split("\n");
    const targetHook = hooks.find(h => h.id === hookId);
    if (!targetHook) return;

    // Find the header column index for '状态'
    const statusColIdx = headers.findIndex(h => h.includes("状态") || h.includes("status"));
    if (statusColIdx === -1) return;

    const lineIdx = targetHook.rawLineIndex;
    const line = lines[lineIdx];
    if (!line) return;

    const cells = line.split("|");
    // cells[0] is empty, cells[1] is hook_id, etc.
    // The actual cell index is statusColIdx + 1
    cells[statusColIdx + 1] = ` ${newStatus} `;

    // Reconstruct last advanced chapter if marking as resolved
    const isRes = RESOLVED_STATUSES.some(p => p.test(newStatus));
    if (isRes) {
      const advancedColIdx = headers.findIndex(h => h.includes("最近推进") || h.includes("last_advanced_chapter") || h.includes("lastadvanced"));
      if (advancedColIdx !== -1) {
        cells[advancedColIdx + 1] = ` ${currentChapter} `;
      }
    }

    lines[lineIdx] = cells.join("|");
    onChange(lines.join("\n"));
  };

  // Timeline range calculation
  const timelineRange = useMemo(() => {
    const maxVal = Math.max(
      15,
      currentChapter + 5,
      ...hooks.map(h => {
        const expected = parseInt(h.expectedPayoff, 10);
        return Math.max(
          h.startChapter,
          h.lastAdvanced,
          isNaN(expected) ? 0 : expected,
          h.startChapter + (h.halfLife || 20)
        );
      })
    );
    // Pad to multiple of 5
    return Math.ceil(maxVal / 5) * 5;
  }, [hooks, currentChapter]);

  // Filtered hooks
  const filteredHooks = useMemo(() => {
    return hooks.filter(hook => {
      // 1. Search Query
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const matchId = hook.id.toLowerCase().includes(query);
        const matchNotes = hook.notes.toLowerCase().includes(query);
        const matchType = hook.type.toLowerCase().includes(query);
        if (!matchId && !matchNotes && !matchType) return false;
      }

      // 2. Status Filter
      if (statusFilter === "all") return true;
      const type = getStatusType(hook.status);
      if (statusFilter === "progressing" && type === "progressing") return true;
      if (statusFilter === "resolved" && type === "resolved") return true;
      if (statusFilter === "deferred" && type === "deferred") return true;
      if (statusFilter === "open" && type === "open") return true;

      return false;
    });
  }, [hooks, searchQuery, statusFilter]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-serif)",
        background: "var(--bg-panel)",
        color: "var(--text)",
        overflow: "hidden",
      }}
    >
      {/* Header and Controls */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>🔗</span> 剧情伏笔脉络墙
          </h2>
          <span style={{ fontSize: 11, padding: "3px 10px", background: "rgba(249, 115, 22, 0.08)", border: "1px solid rgba(249, 115, 22, 0.15)", borderRadius: 12, color: "var(--accent)", fontWeight: 600 }}>
            当前章节: {currentChapter}
          </span>
        </div>

        {/* Search & Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Search bar */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="快速搜索伏笔信息..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "6px 12px 6px 28px",
                fontSize: 11,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                outline: "none",
                width: 200,
                fontFamily: "var(--font-serif)",
                transition: "all 0.15s ease",
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
            />
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2.5"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>

          {/* Tab switches */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
            <button
              onClick={() => setActiveTab("timeline")}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                border: "none",
                cursor: "pointer",
                background: activeTab === "timeline" ? "var(--bg-selected)" : "var(--bg)",
                color: activeTab === "timeline" ? "var(--text)" : "var(--text-muted)",
                fontWeight: activeTab === "timeline" ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-serif)",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h10" />
              </svg>
              时间脉络线
            </button>
            <button
              onClick={() => setActiveTab("board")}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                border: "none",
                cursor: "pointer",
                background: activeTab === "board" ? "var(--bg-selected)" : "var(--bg)",
                color: activeTab === "board" ? "var(--text)" : "var(--text-muted)",
                fontWeight: activeTab === "board" ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-serif)",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18" />
              </svg>
              卡片看板
            </button>
          </div>
        </div>
      </div>

      {/* Main Panel Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === "timeline" ? (
          /* ========================================================================= */
          /* Timeline view (Beautified)                                                */
          /* ========================================================================= */
          <div style={{ flex: 1, overflow: "auto", padding: "24px 20px" }}>
            <div
              style={{
                minWidth: 800,
                background: "var(--bg)",
                borderRadius: 10,
                border: "1px solid var(--border)",
                boxShadow: "0 4px 24px rgba(0, 0, 0, 0.04)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Timeline Horizontal Ruler */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                }}
              >
                {/* Fixed Label side */}
                <div
                  style={{
                    width: 220,
                    padding: "14px 18px",
                    fontWeight: 700,
                    fontSize: 12,
                    borderRight: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    background: "var(--bg-panel)",
                  }}
                >
                  伏笔线索 (ID / 类型)
                </div>

                {/* Chapters Timeline Grid header */}
                <div style={{ flex: 1, display: "flex", position: "relative", height: 44 }}>
                  {/* Grid Lines backgrounds */}
                  {Array.from({ length: Math.ceil(timelineRange / 5) + 1 }).map((_, i) => {
                    const chapterNum = i * 5;
                    if (chapterNum > timelineRange) return null;
                    const leftPct = (chapterNum / timelineRange) * 100;
                    return (
                      <div
                        key={chapterNum}
                        style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          top: 0,
                          transform: "translateX(-50%)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          height: "100%",
                          justifyContent: "flex-end",
                          paddingBottom: 4,
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          Ch {chapterNum === 0 ? 1 : chapterNum}
                        </span>
                        <div style={{ width: 1, height: 5, background: "var(--border)", marginTop: 3 }} />
                      </div>
                    );
                  })}
                  
                  {/* Current Chapter Line Header Indicator */}
                  <div
                    style={{
                      position: "absolute",
                      left: `${(currentChapter / timelineRange) * 100}%`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: "#ef4444",
                      zIndex: 3,
                    }}
                  >
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#ef4444",
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "1px 4px",
                      borderRadius: 3,
                      whiteSpace: "nowrap",
                      boxShadow: "0 1px 4px rgba(239,68,68,0.3)"
                    }}>
                      当前章
                    </div>
                  </div>
                </div>
              </div>

              {/* Hook Rows */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {filteredHooks.length === 0 ? (
                  <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    暂无符合条件的剧情伏笔线索
                  </div>
                ) : (
                  filteredHooks.map((hook) => {
                    const diag = diagMap.get(hook.id) || { stale: false, blocked: false, distance: 0, blockedDistance: 0, missing: [] };
                    const isRes = getStatusType(hook.status) === "resolved";
                    const isHovered = hoveredHookId === hook.id;

                    // Determine bar start and end chapters
                    const start = Math.max(1, hook.startChapter);
                    const last = hook.lastAdvanced;
                    
                    // Parse numeric payoff or fallback to standard estimation
                    let end = start + 5;
                    const expectedNum = parseInt(hook.expectedPayoff, 10);
                    if (isRes && last > 0) {
                      end = last;
                    } else if (!isNaN(expectedNum) && expectedNum > 0) {
                      end = expectedNum;
                    } else {
                      end = start + (hook.halfLife || 20);
                    }
                    if (end < start) end = start + 1;

                    // Visual override to ensure pills always span at least 1 column visually, preventing "ugly tiny dot"
                    const displayEnd = Math.max(start + Math.max(1, Math.ceil(timelineRange * 0.08)), end);

                    // Ensure within timeline bounds
                    const startPct = Math.max(0, ((start - 1) / timelineRange) * 100);
                    const endPct = Math.max(startPct + 2, (Math.min(timelineRange, displayEnd - 1) / timelineRange) * 100);
                    const widthPct = endPct - startPct;

                    // Color Gradients
                    let barBackground = "linear-gradient(90deg, #3b82f6, #4f46e5)"; // Active/Progressing: Premium Blue Gradient
                    let barBorder = "1px solid rgba(59, 130, 246, 0.4)";
                    let statusLabel = hook.status;
                    
                    if (isRes) {
                      barBackground = "linear-gradient(90deg, #10b981, #059669)"; // Green gradient
                      barBorder = "1px solid rgba(16, 185, 129, 0.4)";
                    } else if (diag.stale) {
                      barBackground = "linear-gradient(90deg, #f59e0b, #d97706)"; // Amber gradient (stale)
                      barBorder = "1px solid rgba(245, 158, 11, 0.5)";
                      statusLabel = "已过期";
                    } else if (diag.blocked) {
                      barBackground = "linear-gradient(90deg, #ef4444, #b91c1c)"; // Red gradient (blocked)
                      barBorder = "1px solid rgba(239, 68, 68, 0.5)";
                      statusLabel = "受阻";
                    } else if (getStatusType(hook.status) === "open") {
                      barBackground = "linear-gradient(90deg, #64748b, #475569)"; // Slate gradient (open/unused)
                      barBorder = "1px dashed rgba(100, 116, 139, 0.5)";
                    } else if (getStatusType(hook.status) === "deferred") {
                      barBackground = "linear-gradient(90deg, #94a3b8, #64748b)"; // Muted slate (deferred)
                      barBorder = "1px solid rgba(148, 163, 184, 0.4)";
                    }

                    return (
                      <div
                        key={hook.id}
                        onMouseEnter={() => setHoveredHookId(hook.id)}
                        onMouseLeave={() => setHoveredHookId(null)}
                        style={{
                          display: "flex",
                          borderBottom: "1px solid var(--border)",
                          alignItems: "center",
                          height: 56,
                          background: isHovered ? "var(--bg-hover)" : "transparent",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {/* Hook Metadata Label */}
                        <div
                          style={{
                            width: 220,
                            padding: "0 18px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            borderRight: "1px solid var(--border)",
                            height: "100%",
                            overflow: "hidden",
                            background: isHovered ? "var(--bg-hover)" : "var(--bg-panel)",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "var(--font-mono)",
                                fontWeight: 700,
                                color: hook.core ? "var(--accent)" : "var(--text-muted)",
                                background: hook.core ? "rgba(249, 115, 22, 0.08)" : "rgba(100, 116, 139, 0.06)",
                                border: hook.core ? "1px solid rgba(249, 115, 22, 0.2)" : "1px solid rgba(100, 116, 139, 0.15)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              {hook.id}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700 }}>
                              {hook.type}
                            </span>
                          </div>
                          <span
                            title={hook.notes}
                            style={{
                              fontSize: 11,
                              color: "var(--text)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginTop: 4,
                              fontWeight: 500,
                            }}
                          >
                            {hook.notes || "(空描述)"}
                          </span>
                        </div>

                        {/* Interactive Timeline track */}
                        <div style={{ flex: 1, display: "flex", position: "relative", height: "100%", alignItems: "center" }}>
                          {/* Vertical Column Divider Lines */}
                          {Array.from({ length: Math.ceil(timelineRange / 5) }).map((_, idx) => (
                            <div
                              key={idx}
                              style={{
                                position: "absolute",
                                left: `${(idx * 5 / timelineRange) * 100}%`,
                                top: 0,
                                bottom: 0,
                                width: 1,
                                borderLeft: "1px dashed var(--border)",
                                pointerEvents: "none",
                              }}
                            />
                          ))}

                          {/* Hook Lifespan Bar */}
                          <div
                            style={{
                              position: "absolute",
                              left: `${startPct}%`,
                              width: `${widthPct}%`,
                              height: 20,
                              background: barBackground,
                              border: barBorder,
                              borderRadius: 10,
                              display: "flex",
                              alignItems: "center",
                              padding: "0 10px",
                              fontSize: 9,
                              color: "#fff",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: isHovered 
                                ? "0 4px 12px rgba(0, 0, 0, 0.15)" 
                                : "0 2px 6px rgba(0, 0, 0, 0.04)",
                              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                              zIndex: isHovered ? 4 : 1,
                              transform: isHovered ? "scaleY(1.1)" : "none",
                            }}
                            title={`【${hook.id}】${hook.notes}\n状态: ${hook.status}\n起点章节: 第 ${start} 章\n预期回收: ${hook.expectedPayoff}\n依赖上游: ${hook.dependsOn.length > 0 ? hook.dependsOn.join(", ") : "无"}`}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                              {isRes && <span>✓</span>}
                              {!isRes && diag.stale && <span>⚠️</span>}
                              {!isRes && diag.blocked && <span>🔒</span>}
                              {statusLabel} (Ch {start} → {isRes ? last : hook.expectedPayoff})
                            </span>
                          </div>

                          {/* Current Chapter Line Vertical Overlay */}
                          <div
                            style={{
                              position: "absolute",
                              left: `${(currentChapter / timelineRange) * 100}%`,
                              top: 0,
                              bottom: 0,
                              width: 2,
                              background: "rgba(239, 68, 68, 0.15)",
                              borderLeft: "1px dashed #ef4444",
                              pointerEvents: "none",
                              zIndex: 2,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* Kanban Card Board view (Beautified)                                       */
          /* ========================================================================= */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Status filtering bar */}
            <div
              style={{
                padding: "10px 24px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg)",
                display: "flex",
                gap: 8,
                flexShrink: 0,
              }}
            >
              {[
                { key: "all", label: "全部" },
                { key: "progressing", label: "进行中 ⚡" },
                { key: "open", label: "未开启 ⏳" },
                { key: "deferred", label: "已延后 ↩️" },
                { key: "resolved", label: "已闭环 🟢" },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setStatusFilter(filter.key)}
                  style={{
                    padding: "5px 14px",
                    fontSize: 11,
                    borderRadius: 6,
                    border: statusFilter === filter.key ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: statusFilter === filter.key ? "rgba(249, 115, 22, 0.08)" : "var(--bg-panel)",
                    color: statusFilter === filter.key ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontWeight: statusFilter === filter.key ? 600 : 500,
                    fontFamily: "var(--font-serif)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Cards Grid Grid */}
            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                  gap: 20,
                }}
              >
                {filteredHooks.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--text-muted)", padding: 60, fontSize: 13 }}>
                    暂无符合条件的剧情伏笔卡片
                  </div>
                ) : (
                  filteredHooks.map((hook) => {
                    const diag = diagMap.get(hook.id) || { stale: false, blocked: false, distance: 0, blockedDistance: 0, missing: [] };
                    const isRes = getStatusType(hook.status) === "resolved";

                    // Borders and shadows based on diagnostic states
                    let cardBorder = "1px solid var(--border)";
                    let statusColor = "var(--text-muted)";
                    let statusBg = "var(--bg-panel)";
                    let topIndicatorColor = "var(--border)";
                    
                    if (isRes) {
                      cardBorder = "1px solid rgba(16, 185, 129, 0.3)";
                      statusColor = "#10b981";
                      statusBg = "rgba(16, 185, 129, 0.08)";
                      topIndicatorColor = "#10b981";
                    } else if (diag.stale) {
                      cardBorder = "1px solid rgba(245, 158, 11, 0.35)";
                      statusColor = "#d97706";
                      statusBg = "rgba(245, 158, 11, 0.08)";
                      topIndicatorColor = "#f59e0b";
                    } else if (diag.blocked) {
                      cardBorder = "1px solid rgba(239, 68, 68, 0.3)";
                      statusColor = "#ef4444";
                      statusBg = "rgba(239, 68, 68, 0.08)";
                      topIndicatorColor = "#ef4444";
                    } else if (getStatusType(hook.status) === "progressing") {
                      cardBorder = "1px solid rgba(59, 130, 246, 0.3)";
                      statusColor = "#3b82f6";
                      statusBg = "rgba(59, 130, 246, 0.08)";
                      topIndicatorColor = "#3b82f6";
                    }

                    return (
                      <div
                        key={hook.id}
                        style={{
                          background: "var(--bg)",
                          border: cardBorder,
                          borderRadius: 8,
                          position: "relative",
                          overflow: "hidden",
                          padding: "20px 16px 16px 16px",
                          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.02), 0 2px 4px rgba(0, 0, 0, 0.02)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: 200,
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "none";
                          e.currentTarget.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.02), 0 2px 4px rgba(0, 0, 0, 0.02)";
                        }}
                      >
                        {/* Status color bar top */}
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: topIndicatorColor }} />

                        <div>
                          {/* Card Header */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>
                                {hook.id}
                              </span>
                              {hook.core && (
                                <span style={{ fontSize: 8, padding: "1px 4px", background: "rgba(249,115,22,0.1)", color: "var(--accent)", borderRadius: 3, fontWeight: 700 }}>
                                  核心主线
                                </span>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: 9,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: statusBg,
                                color: statusColor,
                                fontWeight: 700,
                              }}
                            >
                              {hook.status}
                            </span>
                          </div>

                          {/* Hook notes */}
                          <p style={{ margin: "0 0 14px 0", fontSize: 12, lineHeight: "1.6", color: "var(--text)", minHeight: 48, fontWeight: 500 }}>
                            {hook.notes || "(暂无备注)"}
                          </p>

                          {/* Detail fields */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 10, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>起始章节:</span>
                              <strong style={{ color: "var(--text)" }}>第 {hook.startChapter} 章</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>类型 / 节奏:</span>
                              <strong style={{ color: "var(--text)" }}>{hook.type} | {hook.payoffTiming}</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>预期回收 / 半衰期:</span>
                              <strong style={{ color: "var(--text)" }}>{hook.expectedPayoff} | {hook.halfLife}章</strong>
                            </div>
                            {hook.dependsOn.length > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>前置依赖:</span>
                                <strong style={{ color: "var(--accent)" }}>{hook.dependsOn.join(", ")}</strong>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Diagnostics & Quick Actions */}
                        <div>
                          {/* Diagnostics Alerts */}
                          {!isRes && (diag.stale || diag.blocked) && (
                            <div style={{ fontSize: 9, padding: "5px 8px", borderRadius: 4, background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.08)", color: "#ef4444", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              <span style={{ fontWeight: 600 }}>
                                {diag.stale && `陈旧负债(距=${diag.distance}章) `}
                                {diag.blocked && `前置被锁(阻断中) `}
                              </span>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div style={{ display: "flex", gap: 6 }}>
                            {isRes ? (
                              <button
                                onClick={() => handleUpdateStatus(hook.id, "进行中")}
                                style={{
                                  flex: 1,
                                  padding: "5px 8px",
                                  fontSize: 10,
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  background: "var(--bg-panel)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text)",
                                  fontWeight: 600,
                                  fontFamily: "var(--font-serif)",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                              >
                                ↩️ 撤销回收
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(hook.id, "已回收")}
                                  style={{
                                    flex: 1,
                                    padding: "5px 8px",
                                    fontSize: 10,
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    background: "rgba(16, 185, 129, 0.08)",
                                    border: "1px solid rgba(16, 185, 129, 0.3)",
                                    color: "#10b981",
                                    fontWeight: 600,
                                    fontFamily: "var(--font-serif)",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)";
                                    e.currentTarget.style.borderColor = "#10b981";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "rgba(16, 185, 129, 0.08)";
                                    e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.3)";
                                  }}
                                >
                                  ✅ 标为已回收
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(hook.id, getStatusType(hook.status) === "deferred" ? "未开启" : "已延后")}
                                  style={{
                                    padding: "5px 8px",
                                    fontSize: 10,
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    background: "var(--bg-panel)",
                                    border: "1px solid var(--border)",
                                    color: "var(--text-muted)",
                                    fontFamily: "var(--font-serif)",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--text-dim)"}
                                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                                >
                                  {getStatusType(hook.status) === "deferred" ? "激活" : "延后"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
