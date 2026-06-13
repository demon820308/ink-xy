"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface RadarRecommendation {
  title: string;
  confidence: number;
  platform: string;
  genre: string;
  concept: string;
  reasoning: string;
  benchmarkTitles?: string[];
}

interface RadarResult {
  marketSummary: string;
  recommendations: RadarRecommendation[];
}

interface StreamResult {
  success: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  recommendations?: RadarRecommendation[];
  [key: string]: unknown;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
}

export default function RadarModal({ isOpen, onClose, cwd }: Props) {
  const [isScanningRadar, setIsScanningRadar] = useState(false);
  const [radarLogs, setRadarLogs] = useState<string[]>([]);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [radarResult, setRadarResult] = useState<RadarResult | null>(null);

  const radarConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (radarConsoleRef.current) {
      radarConsoleRef.current.scrollTop = radarConsoleRef.current.scrollHeight;
    }
  }, [radarLogs]);

  useEffect(() => {
    if (!isOpen) {
      setIsScanningRadar(false);
      setRadarLogs([]);
      setRadarError(null);
      setRadarResult(null);
    }
  }, [isOpen]);

  const handleRadarScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cwd) return;

    setIsScanningRadar(true);
    setRadarError(null);
    setRadarResult(null);
    setRadarLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "radar-scan",
          cwd,
          args: { json: true }
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
              setRadarLogs((prev) => [...prev, chunk.data || ""]);
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
        throw new Error(finalResult?.error || "题材分析雷达扫描失败");
      }

      let parsedResult: RadarResult | null = null;
      if (finalResult && finalResult.recommendations) {
        parsedResult = finalResult as unknown as RadarResult;
      } else {
        try {
          parsedResult = JSON.parse(finalResult.stdout || "{}");
        } catch (e) {
          console.error("Failed to parse radar JSON output:", e);
        }
      }

      if (parsedResult) {
        setRadarResult(parsedResult);
      } else {
        throw new Error("题材分析雷达未返回有效的结构化数据");
      }

    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setRadarError(errMsg || String(err));
    } finally {
      setIsScanningRadar(false);
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
        width: "650px",
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
          display: "flex", alignItems: "center",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "rgba(16, 185, 129, 0.08)",
          color: "#10b981",
          justifyContent: "space-between"
        }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📡</span>
            <span>智能市场分析雷达 (Radar Market Scanner)</span>
          </h3>
          {!isScanningRadar && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {radarError && (
            <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: 11 }}>
              ⚠️ 扫描失败: {radarError}
            </div>
          )}

          {/* Progress Console */}
          {isScanningRadar && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                <div style={{
                  width: "12px", height: "12px",
                  border: "2px solid var(--border)", borderTopColor: "#10b981",
                  borderRadius: "50%", animation: "spin 1s linear infinite"
                }} />
                <span>雷达天线展开，正在扫描各大网文平台潜力题材与受众风向...</span>
              </div>
              <div
                ref={radarConsoleRef}
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
                {radarLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* Scan Results Display */}
          {!isScanningRadar && radarResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Summary Card */}
              <div style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "14px 16px",
                fontSize: "12px",
                lineHeight: "1.6"
              }}>
                <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📊</span> 市场概况总结 (Global Trend Summary)
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{radarResult.marketSummary}</ReactMarkdown>
                </div>
              </div>

              {/* Recommendations Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🎯</span> AI 潜力选题方向推荐 (AIGC Concept Prompts)
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {radarResult.recommendations?.map((rec: RadarRecommendation, idx: number) => {
                    const confidencePercent = Math.round(rec.confidence * 100);
                    const isHigh = confidencePercent >= 75;
                    const badgeColor = isHigh ? "#10b981" : "#f59e0b";
                    const badgeBg = isHigh ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)";

                    return (
                      <div
                        key={idx}
                        style={{
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "14px",
                          transition: "all 0.2s",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
                            {rec.platform} / {rec.genre}
                          </span>
                          <span style={{
                            fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                            borderRadius: "10px", color: badgeColor, background: badgeBg,
                            border: `1px solid ${badgeColor}33`
                          }}>
                            潜力指数: {confidencePercent}%
                          </span>
                        </div>

                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          <strong style={{ color: "var(--text)" }}>核心概念:</strong> {rec.concept}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          <strong style={{ color: "var(--text)" }}>推荐逻辑:</strong> {rec.reasoning}
                        </div>
                        {(rec.benchmarkTitles?.length ?? 0) > 0 && (
                          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            <span>🏷️ 对标书目:</span>
                            {(rec.benchmarkTitles ?? []).map((b: string, i: number) => (
                              <span key={i} style={{ background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4 }}>《{b}》</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Start Scan view */}
          {!isScanningRadar && !radarResult && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 10px", gap: 14, textAlign: "center" }}>
              <span style={{ fontSize: "40px" }}>📡</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>扫描当前网文市场热点</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.6 }}>
                  AI 市场雷达将深度挖掘当前各大发布平台的热门标签、高互动率流派以及对标爆款，为您提供高置信度的写作题材概念指南。
                </div>
              </div>
              <button
                onClick={(e) => handleRadarScan(e)}
                style={{
                  padding: "8px 24px",
                  background: "#10b981", border: "none", borderRadius: "8px",
                  color: "white", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  transition: "opacity 0.15s"
                }}
              >
                <span>📡</span> 启动雷达行情扫描
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 8, padding: "12px 20px",
          background: "var(--bg-panel)", borderTop: "1px solid var(--border)",
          justifyContent: "flex-end"
        }}>
          {!isScanningRadar && (
            <button
              onClick={onClose}
              style={{
                padding: "6px 16px",
                background: "var(--bg-hover)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text-muted)",
                fontSize: 12, fontWeight: 500, cursor: "pointer"
              }}
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
