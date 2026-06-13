"use client";

import React, { useState, useEffect, useRef } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  onCompleted: () => void;
}

export default function ShortRunModal({ isOpen, onClose, cwd, onCompleted }: Props) {
  // Input fields state
  const [shortDirection, setShortDirection] = useState("");
  const [shortChapters, setShortChapters] = useState(12);
  const [shortChars, setShortChars] = useState(1000);
  const [shortCover, setShortCover] = useState(true);

  // Flow/Run states
  const [shortStoryId, setShortStoryId] = useState<string | null>(null);
  const [shortFictionStage, setShortFictionStage] = useState<"outline" | "draft" | "package" | "completed" | "idle">("idle");
  const [isRunningShort, setIsRunningShort] = useState(false);
  const [shortLogs, setShortLogs] = useState<string[]>([]);
  const [shortError, setShortError] = useState<string | null>(null);
  const [shortSuccess, setShortSuccess] = useState<string | null>(null);

  const shortConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shortConsoleRef.current) {
      shortConsoleRef.current.scrollTop = shortConsoleRef.current.scrollHeight;
    }
  }, [shortLogs]);

  useEffect(() => {
    if (!isOpen) {
      setShortDirection("");
      setShortChapters(12);
      setShortChars(1000);
      setShortCover(true);
      setShortStoryId(null);
      setShortFictionStage("idle");
      setIsRunningShort(false);
      setShortLogs([]);
      setShortError(null);
      setShortSuccess(null);
    }
  }, [isOpen]);

  const handleShortRunStep = async (stepStage: "outline" | "draft" | "package") => {
    if (!shortDirection.trim()) {
      setShortError("创作方向不能为空");
      return;
    }
    if (!cwd) return;

    setIsRunningShort(true);
    setShortError(null);
    setShortSuccess(null);
    setShortLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "short-run",
          cwd,
          args: {
            direction: shortDirection.trim(),
            chapters: shortChapters,
            chars: shortChars,
            noCover: !shortCover,
            json: true,
            stage: stepStage,
            storyId: shortStoryId || undefined,
          }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string; stdout?: string; stderr?: string } | null = null;

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
              setShortLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (error) {
            console.error("Failed to parse stream chunk:", error);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || `${stepStage === "outline" ? "大纲规划" : stepStage === "draft" ? "正文写作" : "封面与包装"} 阶段任务执行失败`);
      }

      let parsed: { storyId?: string } | null = null;
      try {
        parsed = JSON.parse(finalResult.stdout || "");
      } catch (error) {
        console.error("Failed to parse short fiction result JSON:", error);
      }

      if (parsed && parsed.storyId) {
        setShortStoryId(parsed.storyId);
        if (stepStage === "outline") {
          setShortSuccess(`【第一步：生成大纲】执行完成！故事 ID 为: ${parsed.storyId}\n大纲与大纲评审文件已输出至 shorts/${parsed.storyId}/outline/v002.md，请查阅无误后点击下方【第二步】开始起草章节。`);
          setShortFictionStage("draft");
        } else if (stepStage === "draft") {
          setShortSuccess(`【第二步：批量起草】执行完成！故事 ID 为: ${parsed.storyId}\n所有章节的初稿已经全部起草完毕，文件输出在 shorts/${parsed.storyId}/final/full.md。点击下方【第三步】即可一键打包与制作封面。`);
          setShortFictionStage("package");
        } else if (stepStage === "package") {
          setShortSuccess(`【第三步：生成书封包装】执行完成！\n故事销售包装 and 封面图文件已成功生成。至此，该短篇小说已全部创作完毕！`);
          setShortFictionStage("completed");
        }
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        onCompleted();
      } else {
        setShortSuccess(`全自动短篇生成运行完成！已将成果输出至 shorts/ 目录下，请检查文件浏览器。`);
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        onCompleted();
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setShortError(message);
    } finally {
      setIsRunningShort(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        width: "520px",
        maxWidth: "95%",
        maxHeight: "85vh",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "var(--font-serif)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "rgba(139, 92, 246, 0.08)",
          color: "#a78bfa",
        }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🚀</span>
            <span>全自动短篇小说工坊 (Auto Short Fiction Pipeline)</span>
          </h3>
          {!isRunningShort && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
          {shortError && (
            <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: 11 }}>
              ⚠️ 运行错误: {shortError}
            </div>
          )}
          {shortSuccess && (
            <div style={{
              background: "rgba(16, 185, 129, 0.04)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: 8,
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#10b981", fontSize: "13px" }}>
                <span>✨</span> 阶段任务完成！
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {shortSuccess}
              </div>
            </div>
          )}

          {/* Stepper Wizard Progress */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: shortStoryId ? "#10b981" : (isRunningShort && shortFictionStage === "idle" ? "var(--accent)" : "var(--bg-hover)"),
                color: shortStoryId ? "white" : "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold"
              }}>
                {shortStoryId ? "✓" : "1"}
              </div>
              <span style={{ fontSize: 10, marginTop: 4, color: isRunningShort && shortFictionStage === "idle" ? "var(--accent)" : "var(--text-muted)" }}>大纲规划</span>
            </div>
            <div style={{ flex: 1, height: 2, background: shortStoryId ? "#10b981" : "var(--border)", margin: "0 -10px" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: shortFictionStage === "package" || shortFictionStage === "completed" ? "#10b981" : (isRunningShort && shortFictionStage === "draft" ? "var(--accent)" : "var(--bg-hover)"),
                color: shortFictionStage === "package" || shortFictionStage === "completed" ? "white" : "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold"
              }}>
                {shortFictionStage === "package" || shortFictionStage === "completed" ? "✓" : "2"}
              </div>
              <span style={{ fontSize: 10, marginTop: 4, color: isRunningShort && shortFictionStage === "draft" ? "var(--accent)" : "var(--text-muted)" }}>正文写作</span>
            </div>
            <div style={{ flex: 1, height: 2, background: shortFictionStage === "package" || shortFictionStage === "completed" ? "#10b981" : "var(--border)", margin: "0 -10px" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: shortFictionStage === "completed" ? "#10b981" : (isRunningShort && shortFictionStage === "package" ? "var(--accent)" : "var(--bg-hover)"),
                color: shortFictionStage === "completed" ? "white" : "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold"
              }}>
                {shortFictionStage === "completed" ? "✓" : "3"}
              </div>
              <span style={{ fontSize: 10, marginTop: 4, color: isRunningShort && shortFictionStage === "package" ? "var(--accent)" : "var(--text-muted)" }}>书封包装</span>
            </div>
          </div>

          {!isRunningShort && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  故事创意与走向方向 (Story Direction - 必填)*
                </label>
                <input
                  type="text"
                  value={shortDirection}
                  onChange={(e) => setShortDirection(e.target.value)}
                  placeholder="例如: 女频短篇 婚姻背叛 商业争夺 证据反杀 爽文"
                  disabled={!!shortStoryId}
                  required
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-serif)",
                    outline: "none",
                    opacity: shortStoryId ? 0.7 : 1,
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    章节数量 (Chapter Count)*
                  </label>
                  <select
                    value={shortChapters}
                    onChange={(e) => setShortChapters(parseInt(e.target.value, 10))}
                    disabled={!!shortStoryId}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: 12,
                      fontFamily: "var(--font-serif)",
                      outline: "none",
                      cursor: shortStoryId ? "not-allowed" : "pointer",
                      opacity: shortStoryId ? 0.7 : 1,
                    }}
                  >
                    {[12, 13, 14, 15, 16, 17, 18].map((n) => (
                      <option key={n} value={n}>{n} 章</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    单章目标字数 (Words Target)*
                  </label>
                  <select
                    value={shortChars}
                    onChange={(e) => setShortChars(parseInt(e.target.value, 10))}
                    disabled={!!shortStoryId}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: 12,
                      fontFamily: "var(--font-serif)",
                      outline: "none",
                      cursor: shortStoryId ? "not-allowed" : "pointer",
                      opacity: shortStoryId ? 0.7 : 1,
                    }}
                  >
                    {[900, 1000, 1100, 1200].map((n) => (
                      <option key={n} value={n}>{n} 字/章</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <input
                  type="checkbox"
                  id="shortCoverCheckbox"
                  checked={shortCover}
                  onChange={(e) => setShortCover(e.target.checked)}
                  disabled={!!shortStoryId}
                  style={{ cursor: shortStoryId ? "not-allowed" : "pointer", accentColor: "#a78bfa" }}
                />
                <label htmlFor="shortCoverCheckbox" style={{ fontSize: 11, color: "var(--text-muted)", cursor: shortStoryId ? "not-allowed" : "pointer", userSelect: "none", opacity: shortStoryId ? 0.7 : 1 }}>
                  🌌 全自动生成配图故事封面 (AI Cover Generation)
                </label>
              </div>
            </>
          )}

          {/* Console Output */}
          {isRunningShort && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                <div style={{
                  width: "12px", height: "12px",
                  border: "2px solid var(--border)", borderTopColor: "#a78bfa",
                  borderRadius: "50%", animation: "spin 1s linear infinite"
                }} />
                <span>
                  {shortFictionStage === "idle" || shortFictionStage === "outline"
                    ? "正在运行 步骤一：AI 规划大纲与大纲精修评审..."
                    : shortFictionStage === "draft"
                    ? "正在运行 步骤二：AI 协同批量起草各章节正文..."
                    : "正在运行 步骤三：AI 生成故事简介、卖点与封面提示词，并调用模型生成书封..."}
                </span>
              </div>
              <div
                ref={shortConsoleRef}
                style={{
                  height: "220px",
                  background: "#121214",
                  color: "#d4d4d4",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                  border: "1px solid var(--border)",
                  textAlign: "left"
                }}
              >
                {shortLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* Actions Footer */}
          <div style={{ display: "flex", gap: 10, borderTop: "1px solid var(--border)", paddingTop: "14px", justifyContent: "flex-end", alignItems: "center" }}>
            {shortStoryId && !isRunningShort && (
              <button
                type="button"
                onClick={() => {
                  setShortStoryId(null);
                  setShortFictionStage("idle");
                  setShortSuccess(null);
                  setShortError(null);
                  setShortLogs([]);
                }}
                style={{
                  padding: "0 12px", height: 38,
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8,
                  color: "#ef4444", fontSize: 11, fontWeight: 500,
                  cursor: "pointer", marginRight: "auto"
                }}
              >
                🔁 重置新故事
              </button>
            )}

            {isRunningShort ? (
              <button
                type="button"
                disabled
                style={{
                  padding: "0 20px", height: 38,
                  background: "var(--border)",
                  border: "none", borderRadius: 8,
                  color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
                  cursor: "not-allowed"
                }}
              >
                正在生成中...
              </button>
            ) : (
              <>
                {!shortStoryId && (
                  <button
                    type="button"
                    onClick={() => handleShortRunStep("outline")}
                    disabled={!shortDirection.trim()}
                    style={{
                      padding: "0 20px", height: 38,
                      background: "#a78bfa",
                      border: "none", borderRadius: 8,
                      color: "white", fontSize: 12, fontWeight: 600,
                      cursor: !shortDirection.trim() ? "not-allowed" : "pointer",
                      opacity: !shortDirection.trim() ? 0.6 : 1,
                    }}
                  >
                    🚀 步骤一：生成大纲
                  </button>
                )}
                {shortStoryId && shortFictionStage === "draft" && (
                  <button
                    type="button"
                    onClick={() => handleShortRunStep("draft")}
                    style={{
                      padding: "0 20px", height: 38,
                      background: "#8b5cf6",
                      border: "none", borderRadius: 8,
                      color: "white", fontSize: 12, fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    ✍️ 步骤二：批量起草正文
                  </button>
                )}
                {shortStoryId && shortFictionStage === "package" && (
                  <button
                    type="button"
                    onClick={() => handleShortRunStep("package")}
                    style={{
                      padding: "0 20px", height: 38,
                      background: "#ec4899",
                      border: "none", borderRadius: 8,
                      color: "white", fontSize: 12, fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    🎨 步骤三：生成封面与包装
                  </button>
                )}
              </>
            )}

            {!isRunningShort && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "0 16px", height: 38,
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)", borderRadius: 8,
                  color: "var(--text-muted)", fontSize: 12, fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {shortFictionStage === "completed" ? "完成" : "关闭"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
