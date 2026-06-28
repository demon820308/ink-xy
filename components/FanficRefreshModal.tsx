"use client";

import React, { useState, useEffect, useRef } from "react";
import { Emoji } from "./Emoji";

interface StreamResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  bookId: string;
  onRefreshSuccess: () => void;
}

export default function FanficRefreshModal({
  isOpen,
  onClose,
  cwd,
  bookId,
  onRefreshSuccess,
}: Props) {
  const [fanficRefreshSource, setFanficRefreshSource] = useState("");
  const [isRefreshingCanon, setIsRefreshingCanon] = useState(false);
  const [fanficRefreshLogs, setFanficRefreshLogs] = useState<string[]>([]);
  const [fanficRefreshError, setFanficRefreshError] = useState<string | null>(null);
  const [fanficRefreshSuccess, setFanficRefreshSuccess] = useState<string | null>(null);
  
  const fanficRefreshConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fanficRefreshConsoleRef.current) {
      fanficRefreshConsoleRef.current.scrollTop = fanficRefreshConsoleRef.current.scrollHeight;
    }
  }, [fanficRefreshLogs]);

  useEffect(() => {
    if (!isOpen) {
      setFanficRefreshSource("");
      setFanficRefreshLogs([]);
      setFanficRefreshError(null);
      setFanficRefreshSuccess(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFanficRefresh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cwd || !bookId) return;

    if (!fanficRefreshSource.trim()) {
      setFanficRefreshError("请输入原作素材的绝对路径");
      return;
    }

    setIsRefreshingCanon(true);
    setFanficRefreshError(null);
    setFanficRefreshSuccess(null);
    setFanficRefreshLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fanfic-refresh",
          cwd,
          args: {
            bookId,
            from: fanficRefreshSource.trim(),
            json: true,
          }
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
              setFanficRefreshLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "刷新原作设定执行失败");
      }

      setFanficRefreshSuccess("同人原作正典设定已刷新！");
      onRefreshSuccess();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setFanficRefreshError(errMsg || String(err));
    } finally {
      setIsRefreshingCanon(false);
    }
  };

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
        maxWidth: "95%",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "var(--font-serif)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "rgba(139, 92, 246, 0.08)",
          color: "#a78bfa",
        }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Emoji char="🔁" />
            <span>刷新同人原作设定 ({bookId})</span>
          </h3>
          {!isRefreshingCanon && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          )}
        </div>

        <form onSubmit={handleFanficRefresh} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {fanficRefreshError && (
            <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: 11 }}>
              <Emoji char="⚠️" /> {fanficRefreshError}
            </div>
          )}
          {fanficRefreshSuccess && (
            <div style={{ padding: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, color: "#10b981", fontSize: 11 }}>
              <Emoji char="✨" /> {fanficRefreshSuccess}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
              同人原作素材绝对路径 (Source Path - 必填)
            </label>
            <input
              type="text"
              value={fanficRefreshSource}
              onChange={(e) => setFanficRefreshSource(e.target.value)}
              placeholder="请输入最新的原著素材路径，例如: D:/novel/source_v2.txt"
              required
              disabled={isRefreshingCanon}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                fontFamily: "var(--font-serif)",
                outline: "none",
              }}
            />
          </div>

          {fanficRefreshLogs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                刷新运行日志
              </label>
              <div
                ref={fanficRefreshConsoleRef}
                style={{
                  height: "150px",
                  background: "#1e1e1e",
                  color: "#d4d4d4",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                  border: "1px solid var(--border)",
                }}
              >
                {fanficRefreshLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, borderTop: "1px solid var(--border)", paddingTop: "14px", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isRefreshingCanon}
              style={{
                padding: "0 16px", height: 38,
                background: "#a78bfa",
                border: "none", borderRadius: 8,
                color: "white", fontSize: 12, fontWeight: 600,
                cursor: isRefreshingCanon ? "not-allowed" : "pointer",
                opacity: isRefreshingCanon ? 0.7 : 1,
              }}
            >
              {isRefreshingCanon ? "正在分析刷新..." : "开始刷新"}
            </button>
            {!isRefreshingCanon && (
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
                取消
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
