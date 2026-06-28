"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Emoji } from "./Emoji";

interface StreamResult {
  success: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  archivedVolumes?: number;
  retainedChapters?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  bookId: string;
  onConsolidateSuccess: () => void;
}

export default function ConsolidationModal({
  isOpen,
  onClose,
  cwd,
  bookId,
  onConsolidateSuccess,
}: Props) {
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationLogs, setConsolidationLogs] = useState<string[]>([]);
  const [consolidationError, setConsolidationError] = useState<string | null>(null);
  const [consolidationResult, setConsolidationResult] = useState<{ archivedVolumes: number; retainedChapters: number } | null>(null);

  const consolidateConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consolidateConsoleRef.current) {
      consolidateConsoleRef.current.scrollTop = consolidateConsoleRef.current.scrollHeight;
    }
  }, [consolidationLogs]);

  const runConsolidate = useCallback(async () => {
    if (!cwd || !bookId) return;

    setIsConsolidating(true);
    setConsolidationError(null);
    setConsolidationResult(null);
    setConsolidationLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consolidate",
          cwd,
          args: { bookId, json: true }
        }),
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
      let finalResult: StreamResult | null = null;

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
              setConsolidationLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
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
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "大纲摘要压缩执行失败");
      }

      let result: { archivedVolumes?: number; retainedChapters?: number } | null = null;
      if (finalResult && typeof finalResult.archivedVolumes === "number") {
        result = finalResult;
      } else {
        try {
          result = JSON.parse(finalResult.stdout || "{}");
        } catch (e) {
          console.error("Failed to parse consolidate JSON output:", e);
        }
      }

      if (result) {
        setConsolidationResult({
          archivedVolumes: result.archivedVolumes ?? 0,
          retainedChapters: result.retainedChapters ?? 0,
        });
      } else {
        setConsolidationResult({ archivedVolumes: 1, retainedChapters: 0 });
      }

      onConsolidateSuccess();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setConsolidationError(errMsg || String(err));
    } finally {
      setIsConsolidating(false);
    }
  }, [cwd, bookId, onConsolidateSuccess]);

  useEffect(() => {
    if (isOpen) {
      runConsolidate();
    } else {
      setIsConsolidating(false);
      setConsolidationLogs([]);
      setConsolidationError(null);
      setConsolidationResult(null);
    }
  }, [isOpen, runConsolidate]);

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
        width: "500px",
        maxWidth: "90%",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "var(--font-serif)",
      }}>
        {/* Modal Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <Emoji char="🗜️" /> 大纲摘要压缩归档
          </span>
          <button
            onClick={() => { if (!isConsolidating) onClose(); }}
            disabled={isConsolidating}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              fontSize: 14, cursor: isConsolidating ? "not-allowed" : "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            运行大纲摘要压缩会将已完结分卷的逐章梗概合并提炼，输出到分卷摘要中，并对已完结章节的明细梗概进行历史归档，以大幅缩减大语言模型上下文 Token 占用，提升续写连贯性，防止远期情节记忆退化。
          </div>

          {/* Console Logs */}
          {(isConsolidating || consolidationLogs.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                {isConsolidating && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 1s linear infinite" }}>
                    <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                )}
                <span>执行控制台日志：</span>
              </div>
              <div
                ref={consolidateConsoleRef}
                style={{
                  height: "150px", overflowY: "auto",
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--text-dim)", background: "#121214",
                  padding: "8px 12px", borderRadius: 6, whiteSpace: "pre-wrap",
                  textAlign: "left", border: "1px solid var(--border)",
                  lineHeight: 1.4
                }}
              >
                {consolidationLogs.length === 0 ? (
                  <div style={{ color: "#6b7280" }}>正在初始化并启动命令行脚本...</div>
                ) : (
                  consolidationLogs.map((log, index) => (
                    <div key={index} style={{ marginBottom: 2 }}>{log}</div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Success Result Info */}
          {consolidationResult && (
            <div style={{
              background: "rgba(16, 185, 129, 0.04)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: 8,
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#10b981", fontSize: "12px" }}>
                <Emoji char="✨" /> 压缩归档完成
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                <div style={{ marginBottom: 4 }}>
                  • 成功压缩归档卷数：<strong>{consolidationResult.archivedVolumes} 卷</strong>
                </div>
                <div>
                  • 当前内存保留近期章节：<strong>{consolidationResult.retainedChapters} 章</strong>
                </div>
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 4, borderTop: "1px dashed rgba(16, 185, 129, 0.15)", paddingTop: 4 }}>
                已将对应卷的章节梗概安全移动至归档目录，活动大纲摘要已刷新。
              </div>
            </div>
          )}

          {/* Error Message */}
          {consolidationError && (
            <div style={{
              background: "rgba(239, 68, 68, 0.04)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: 8,
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#ef4444", fontSize: "12px" }}>
                <Emoji char="⚠️" /> 执行出错
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                {consolidationError}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {isConsolidating ? (
              <button
                disabled
                style={{
                  flex: 1, height: 38,
                  background: "var(--accent)", opacity: 0.7,
                  border: "none", borderRadius: 8,
                  color: "white", fontSize: 12, fontWeight: 600,
                  cursor: "not-allowed"
                }}
              >
                正在压缩...
              </button>
            ) : (
              <button
                onClick={onClose}
                style={{
                  flex: 1, height: 38,
                  background: "var(--accent)",
                  border: "none", borderRadius: 8,
                  color: "white", fontSize: 12, fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {consolidationError ? "关闭" : "确认并关闭"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
