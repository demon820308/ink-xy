"use client";

import React, { useState, useEffect, useRef } from "react";
import { Emoji } from "./Emoji";

interface RevisionConsoleProps {
  cwd: string;
  bookId: string;
  filePath: string;
  currentContent: string;
  onAccept: (newContent: string) => void;
  onClose: () => void;
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  lineNo?: number;
}

// Simple line-by-line diff algorithm (Myers Diff implementation)
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;
  const max = m + n;
  const v = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
        x = v[k + 1 + max];
      } else {
        x = v[k - 1 + max] + 1;
      }
      let y = x - k;
      while (x < m && y < n && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[k + max] = x;
      if (x >= m && y >= n) {
        // backtrack
        const result: DiffLine[] = [];
        let cx = m, cy = n;
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd - 1];
          const pk = cx - cy;
          let prevK: number;
          if (pk === -dd || (pk !== dd && pv[pk - 1 + max] < pv[pk + 1 + max])) {
            prevK = pk + 1;
          } else {
            prevK = pk - 1;
          }
          const prevX = pv[prevK + max];
          const prevY = prevX - prevK;
          while (cx > prevX && cy > prevY) {
            cx--;
            cy--;
            result.unshift({ type: "unchanged", text: oldLines[cx], lineNo: cx + 1 });
          }
          if (dd > 0) {
            if (cx > prevX) {
              cx--;
              result.unshift({ type: "removed", text: oldLines[cx], lineNo: cx + 1 });
            } else {
              cy--;
              result.unshift({ type: "added", text: newLines[cy], lineNo: cy + 1 });
            }
          }
        }
        while (cx > 0 && cy > 0) {
          cx--;
          cy--;
          result.unshift({ type: "unchanged", text: oldLines[cx], lineNo: cx + 1 });
        }
        return result;
      }
    }
  }

  // Fallback
  return [
    ...oldLines.map((t, i) => ({ type: "removed" as const, text: t, lineNo: i + 1 })),
    ...newLines.map((t, i) => ({ type: "added" as const, text: t, lineNo: i + 1 })),
  ];
}

export function RevisionConsole({
  cwd,
  bookId,
  filePath,
  currentContent,
  onAccept,
  onClose,
}: RevisionConsoleProps) {
  const [mode, setMode] = useState<"polish" | "spot-fix" | "rework" | "anti-detect">("polish");
  const [brief, setBrief] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [originalContent, setOriginalContent] = useState(currentContent);
  const [revisedContent, setRevisedContent] = useState<string>("");
  const [diffLinesData, setDiffLinesData] = useState<DiffLine[]>([]);
  const [reverting, setReverting] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Parse chapter number
  const getChapterNumber = () => {
    const filename = filePath.split("/").pop() || "";
    const match = filename.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  };

  const handleStartRevision = async () => {
    setStatus("running");
    setLogs([`[System] 正在保存当前草稿并初始化智能精修流程...\n`]);
    setErrorMessage("");

    try {
      const chapter = getChapterNumber();

      // 1. Save current editor state to disk first so API revises the latest
      const encodedPath = encodeURIComponent(filePath);
      const saveRes = await fetch(`/api/files/${encodedPath}`, {
        method: "POST",
        body: currentContent,
      });
      if (!saveRes.ok) {
        throw new Error("同步保存当前修改文件失败，无法开始精修");
      }
      setOriginalContent(currentContent);

      setLogs((prev) => [...prev, `[System] 正在调用 InkOS API 执行 [${mode}] 修正动作...\n`]);

      // 2. Call revise action
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revise",
          cwd,
          args: { bookId, chapter, mode, brief },
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常，状态码 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("服务器未返回数据流");
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
              if (chunk.success === false) {
                throw new Error(chunk.error || "AIGC 智能精修处理失败");
              }
            }
          } catch {}
        }
      }

      setLogs((prev) => [...prev, `\n[System] 智能精修完成。正在拉取修订后的文本...\n`]);

      // 3. Read the revised file content from disk
      const readRes = await fetch(`/api/files/${encodedPath}?type=read&t=${Date.now()}`);
      if (!readRes.ok) {
        throw new Error("加载修改后的文件内容失败");
      }
      const data = await readRes.json();
      const newText = data.content || "";
      setRevisedContent(newText);

      // Compute diff
      const diff = computeDiff(currentContent, newText);
      setDiffLinesData(diff);
      setStatus("done");
      setLogs((prev) => [...prev, `[System] 差异对比生成成功，请在下方预览确认。\n`]);

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "执行智能精修时发生网络或系统错误");
      setLogs((prev) => [...prev, `\n❌ 运行异常: ${err.message || err}\n`]);
    }
  };

  const handleAccept = () => {
    onAccept(revisedContent);
    onClose();
  };

  const handleReject = async () => {
    setReverting(true);
    try {
      // Revert the file on disk to originalContent
      const encodedPath = encodeURIComponent(filePath);
      const res = await fetch(`/api/files/${encodedPath}`, {
        method: "POST",
        body: originalContent,
      });
      if (!res.ok) {
        throw new Error("恢复原始文本失败");
      }
      onClose();
    } catch (err: any) {
      alert(`还原失败: ${err.message}`);
    } finally {
      setReverting(false);
    }
  };

  // Synchronized scrolling
  const handleScroll = (source: "left" | "right") => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;
    if (!leftEl || !rightEl) return;

    if (source === "left") {
      rightEl.scrollTop = leftEl.scrollTop;
    } else {
      leftEl.scrollTop = rightEl.scrollTop;
    }
  };

  // Split diff lines into side-by-side lines to show changes aligned
  const alignDiffs = () => {
    const leftSide: DiffLine[] = [];
    const rightSide: DiffLine[] = [];

    let i = 0;
    while (i < diffLinesData.length) {
      const line = diffLinesData[i];
      if (line.type === "unchanged") {
        leftSide.push(line);
        rightSide.push(line);
        i++;
      } else if (line.type === "removed") {
        // Look ahead for corresponding added lines
        const removedBlock = [line];
        i++;
        while (i < diffLinesData.length && diffLinesData[i].type === "removed") {
          removedBlock.push(diffLinesData[i]);
          i++;
        }
        const addedBlock: DiffLine[] = [];
        while (i < diffLinesData.length && diffLinesData[i].type === "added") {
          addedBlock.push(diffLinesData[i]);
          i++;
        }

        const maxBlockLen = Math.max(removedBlock.length, addedBlock.length);
        for (let j = 0; j < maxBlockLen; j++) {
          leftSide.push(removedBlock[j] || { type: "unchanged", text: "" });
          rightSide.push(addedBlock[j] || { type: "unchanged", text: "" });
        }
      } else {
        // lonely added lines
        leftSide.push({ type: "unchanged", text: "" });
        rightSide.push(line);
        i++;
      }
    }

    return { leftSide, rightSide };
  };

  const { leftSide, rightSide } = alignDiffs();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 10, 10, 0.55)",
        backdropFilter: "blur(6px)",
        animation: "fadeIn 0.25s ease-out",
      }}
    >
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          width: "90vw",
          maxWidth: 1280,
          height: "85vh",
          boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🪄</span>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                InkOS AI 智能精修控制台
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 12 }}>
                当前文件: {filePath.split("/").pop()}
              </span>
            </div>
          </div>
          <button
            onClick={status === "running" ? undefined : onClose}
            disabled={status === "running" || reverting}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              fontSize: 16,
              cursor: (status === "running" || reverting) ? "not-allowed" : "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Workspace Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          
          {/* Left Config Panel */}
          {status !== "done" ? (
            <div
              style={{
                width: 380,
                borderRight: "1px solid var(--border)",
                background: "rgba(0,0,0,0.06)",
                display: "flex",
                flexDirection: "column",
                padding: 24,
                gap: 20,
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>选择精修模式</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { id: "polish", name: <><Emoji char="✨" /> 润色抛光</>, desc: "词藻修饰与病句修正" },
                    { id: "spot-fix", name: <><Emoji char="⚠️" /> 定点纠偏</>, desc: "微调逻辑及矛盾处" },
                    { id: "rework", name: <><Emoji char="✍️" /> 剧情重写</>, desc: "基于修改意见重构" },
                    { id: "anti-detect", name: <><Emoji char="🛡️" /> 祛AI腔</>, desc: "破除 LLM 句式痕迹" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={status === "running"}
                      onClick={() => setMode(item.id as any)}
                      style={{
                        padding: "12px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: "center",
                        border: `1px solid ${mode === item.id ? "var(--accent)" : "var(--border)"}`,
                        background: mode === item.id ? "var(--bg-selected)" : "var(--bg)",
                        color: mode === item.id ? "var(--accent)" : "var(--text)",
                        cursor: status === "running" ? "not-allowed" : "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        transition: "all 0.15s",
                      }}
                    >
                      <span>{item.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-dim)" }}>{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                  修改意图与指示 (Prompt Guidance)
                </label>
                <textarea
                  value={brief}
                  disabled={status === "running"}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="例如：\n- 强化此处伏笔，暗示张三的真实身份。\n- 让段落文字节奏更快，少用华丽辞藻。\n- 增加李四此时内心的挣扎描写..."
                  style={{
                    flex: 1,
                    minHeight: 180,
                    padding: "12px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 12,
                    lineHeight: "1.5",
                    outline: "none",
                    resize: "none",
                    fontFamily: "var(--font-serif)",
                  }}
                />
              </div>

              {errorMessage && (
                <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#f87171", fontSize: 11 }}>
                  <Emoji char="❌" /> {errorMessage}
                </div>
              )}

              <button
                onClick={handleStartRevision}
                disabled={status === "running"}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: status === "running" ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
                }}
              >
                {status === "running" ? <><Emoji char="⚡" /> AI 正在重构并审计章节...</> : <><Emoji char="🔮" /> 开始 AI 智能精修</>}
              </button>
            </div>
          ) : null}

          {/* Right Diff Panel or Log Console */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {status === "running" ? (
              /* Streaming Log Terminal */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#080808", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #222", paddingBottom: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "#38bdf8", fontWeight: 700 }}>
                    <Emoji char="⚡" /> INKOS AGENT REVISION EXECUTION LOG
                  </span>
                  <span style={{ fontSize: 10, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1s infinite" }} />
                    运行中...
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#cbd5e1", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {logs.join("")}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            ) : status === "done" ? (
              /* Side-by-Side Diff Editor Preview */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Visual diff header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.1)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  <div style={{ padding: "10px 16px", borderRight: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                    <span>原文本 (Original)</span>
                    <span style={{ color: "#f87171" }}>- 删除的行</span>
                  </div>
                  <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between" }}>
                    <span>已精修 (Revised)</span>
                    <span style={{ color: "#4ade80" }}>+ 增加的行</span>
                  </div>
                </div>

                {/* Split diff viewer content */}
                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                  {/* Left Column (Old) */}
                  <div
                    ref={leftScrollRef}
                    onScroll={() => handleScroll("left")}
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      borderRight: "1px solid var(--border)",
                      background: "var(--bg)",
                      fontFamily: "var(--font-serif)",
                      fontSize: 14,
                      lineHeight: "1.8",
                    }}
                  >
                    {leftSide.map((line, idx) => {
                      const isRemoved = line.type === "removed";
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            background: isRemoved ? "rgba(239, 68, 68, 0.08)" : "transparent",
                            borderLeft: `3px solid ${isRemoved ? "#f87171" : "transparent"}`,
                            minHeight: "1.8em",
                            paddingRight: 12,
                          }}
                        >
                          <span style={{ width: 40, textAlign: "right", color: "var(--text-dim)", fontSize: 10, paddingRight: 8, userSelect: "none", fontFamily: "var(--font-mono)", borderRight: "1px solid var(--border)", marginRight: 8, background: "rgba(0,0,0,0.05)" }}>
                            {line.lineNo || ""}
                          </span>
                          <span style={{ color: isRemoved ? "#f87171" : "var(--text)", textDecoration: isRemoved ? "line-through" : "none", whiteSpace: "pre-wrap", flex: 1 }}>
                            {line.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Column (New) */}
                  <div
                    ref={rightScrollRef}
                    onScroll={() => handleScroll("right")}
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      background: "var(--bg)",
                      fontFamily: "var(--font-serif)",
                      fontSize: 14,
                      lineHeight: "1.8",
                    }}
                  >
                    {rightSide.map((line, idx) => {
                      const isAdded = line.type === "added";
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            background: isAdded ? "rgba(16, 185, 129, 0.08)" : "transparent",
                            borderLeft: `3px solid ${isAdded ? "#34d399" : "transparent"}`,
                            minHeight: "1.8em",
                            paddingRight: 12,
                          }}
                        >
                          <span style={{ width: 40, textAlign: "right", color: "var(--text-dim)", fontSize: 10, paddingRight: 8, userSelect: "none", fontFamily: "var(--font-mono)", borderRight: "1px solid var(--border)", marginRight: 8, background: "rgba(0,0,0,0.05)" }}>
                            {line.lineNo || ""}
                          </span>
                          <span style={{ color: "var(--text)", fontWeight: isAdded ? 600 : 400, whiteSpace: "pre-wrap", flex: 1 }}>
                            {line.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Controls (Accept / Reject) */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 12,
                    padding: "16px 24px",
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg)",
                  }}
                >
                  <button
                    onClick={handleReject}
                    disabled={reverting}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: reverting ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {reverting ? "正在还原..." : "✕ 撤销并还原 (Reject)"}
                  </button>

                  <button
                    onClick={handleAccept}
                    style={{
                      padding: "8px 20px",
                      background: "var(--accent)",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    ✓ 应用精修结果 (Accept)
                  </button>
                </div>
              </div>
            ) : (
              /* Idle state placeholder when not run yet */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", gap: 12 }}>
                <Emoji char="🔮" style={{ fontSize: 48 }} />
                <span style={{ fontSize: 13 }}>配置精修模式和修改意图后，点击左侧按钮开始精修。</span>
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
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
