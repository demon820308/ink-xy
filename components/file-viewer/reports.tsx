"use client";

import { StatusIcon } from "../StatusIcon";
import { Emoji } from "../Emoji";

// ── Types & Interfaces ────────────────────────────────────────────────────────

export interface DetectReportData {
  chapterNumber: number;
  detection: {
    score: number;
    provider: string;
  };
  passed: boolean;
}

export interface AuditIssue {
  severity: string;
  category: string;
  description: string;
  suggestion?: string;
}

export interface AuditReportData {
  passed: boolean;
  chapterNumber?: number;
  summary?: string;
  issues?: AuditIssue[];
}

export interface WriteReportData {
  chapterNumber: number;
  title: string;
  wordCount: number;
  revised: boolean;
  status: string;
  auditResult?: AuditReportData;
  autoReviseResult?: ReviseReportData;
}

export interface ReviseReportData {
  applied?: boolean;
  skippedReason?: string;
  fixedIssues?: string[];
  status?: string;
  wordCount?: number;
}

export interface SyncReportData {
  auditResult?: AuditReportData;
}

export interface PlanReportData {
  chapterNumber?: number;
  bookTitle?: string;
  goal?: string;
  intentFile?: string;
  raw?: string;
}

// ── Detect Report Component ───────────────────────────────────────────────────

export function DetectReport({ data }: { data: DetectReportData }) {
  const chapterNumber = data.chapterNumber;
  const score = data.detection?.score ?? 0;
  const percentage = score * 100;
  const provider = data.detection?.provider || "未知引擎";
  const isPassed = data.passed ?? true;

  const getStatusColor = () => {
    if (isPassed) return { text: "#10b981", border: "rgba(16, 185, 129, 0.4)", bg: "rgba(16, 185, 129, 0.08)", label: "符合自然创作特征 (通过)", emoji: "🟢" };
    return { text: "#ef4444", border: "rgba(239, 68, 68, 0.4)", bg: "rgba(239, 68, 68, 0.08)", label: "可能包含高比例 AI 生成 (超标)", emoji: "🔴" };
  };

  const getBarColor = () => {
    if (score < 0.3) return "linear-gradient(90deg, #10b981, #34d399)";
    if (score < 0.6) return "linear-gradient(90deg, #f59e0b, #fbbf24)";
    return "linear-gradient(90deg, #ef4444, #f87171)";
  };

  const status = getStatusColor();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        background: status.bg,
        border: `1px solid ${status.border}`,
        borderRadius: "8px",
      }}>
        <StatusIcon type={isPassed ? "pass" : "fail"} size={20} />
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>AIGC 风格合规评定</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: status.text, marginTop: "2px" }}>
            {status.label}
          </div>
        </div>
      </div>

      {/* Meter Card */}
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>
            AI 生成度占比 (AI味浓度)
          </span>
          <span style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--font-mono)", color: status.text }}>
            {percentage.toFixed(1)}%
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{
          width: "100%",
          height: "12px",
          background: "var(--bg)",
          borderRadius: "6px",
          overflow: "hidden",
          border: "1px solid var(--border)",
          position: "relative"
        }}>
          <div style={{
            width: `${Math.min(100, Math.max(0, percentage))}%`,
            height: "100%",
            background: getBarColor(),
            borderRadius: "6px",
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
          }} />
        </div>

        {/* Info Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          paddingTop: 12,
          borderTop: "1px solid var(--border)"
        }}>
          <div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>评估章节</div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>第 {chapterNumber} 章</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>检测引擎</div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{provider}</div>
          </div>
        </div>
      </div>

      {/* Guide/Suggestions */}
      <div style={{
        background: "rgba(16, 185, 129, 0.03)",
        border: "1px dashed var(--border)",
        borderRadius: "8px",
        padding: "14px 16px",
        fontSize: "12px",
        lineHeight: "1.6"
      }}>
        <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}><Emoji char="💡" /> 创作者润色建议：</div>
        <div style={{ color: "var(--text-muted)" }}>
          {isPassed ? (
            "本章文风特征自然，符合人类作家的遣词造句习惯。如果希望精益求精，可以继续保持目前的创作风格，或者使用「防崩审计」排查角色一致性。"
          ) : (
            <span>
              检测到当前章节的 AI 痕迹较为明显。建议点击编辑器底部工具栏的{" "}
              <strong style={{ color: "var(--accent)" }}>「🪄 局部定点修复」</strong> 按钮，并将修正模式切换为{" "}
              <strong style={{ color: "var(--accent)" }}>「防检测润色 (Anti-detect)」</strong>，AI
              协同润色器会自动打乱常见的 AI 写作特征，重组句子结构，使其更加自然流畅。
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Audit Report Component ────────────────────────────────────────────────────

export function AuditReport({ data }: { data: AuditReportData }) {
  const isPassed = data.passed ?? false;
  const issues = data.issues ?? [];

  const severityConfig = (severity: string) => {
    const s = (severity || "info").toLowerCase();
    if (s === "error" || s === "critical")
      return { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "#f87171", label: "严重", iconType: "error" as const };
    if (s === "warning")
      return { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "#fbbf24", label: "警告", iconType: "warning" as const };
    return { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "#60a5fa", label: "提示", iconType: "info" as const };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 16, borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ fontSize: 28 }}><Emoji char="🔍" /></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>人设防崩与一致性审计报告</div>
          {data.chapterNumber != null && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              第 {data.chapterNumber} 章
            </div>
          )}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            background: isPassed ? "rgba(74,222,128,0.12)" : "rgba(251,191,36,0.12)",
            color: isPassed ? "#4ade80" : "#fbbf24",
            border: `1px solid ${isPassed ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)"}`,
          }}>
            {isPassed ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="check" size={12} />
                <span>审计通过</span>
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="warning" size={12} />
                <span>发现风险</span>
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <Emoji char="📝" style={{ marginRight: 6 }} />本章内容总结
          </div>
          <div style={{
            padding: "14px 18px",
            background: "rgba(96,165,250,0.06)",
            border: "1px solid rgba(96,165,250,0.2)",
            borderLeft: "3px solid #60a5fa",
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.8,
            color: "var(--text)",
          }}>
            {data.summary}
          </div>
        </div>
      )}

      {/* Issues */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          <Emoji char="🛠️" style={{ marginRight: 6 }} />审计诊断条目 ({issues.length})
        </div>
        {issues.length === 0 ? (
          <div style={{
            padding: "14px 18px",
            background: "rgba(74,222,128,0.06)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderLeft: "3px solid #4ade80",
            borderRadius: 8,
            fontSize: 13,
            color: "#4ade80",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <StatusIcon type="check" size={14} />
            <span>未检测到任何明显的角色设定矛盾或世界观冲突风险。</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {issues.map((issue: AuditIssue, i: number) => {
              const cfg = severityConfig(issue.severity);
              return (
                <div key={i} style={{
                  padding: "14px 18px",
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}33`,
                  borderLeft: `3px solid ${cfg.border}`,
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusIcon type={cfg.iconType} size={14} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {cfg.label}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: "var(--text)",
                      background: "var(--bg-hover)",
                      padding: "1px 8px", borderRadius: 4,
                    }}>
                      {issue.category || "未分类"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--text)" }}>
                    <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>问题描述：</span>
                    {issue.description}
                  </div>
                  {issue.suggestion && (
                    <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>修改建议：</span>
                      {issue.suggestion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Write Report Component ─────────────────────────────────────────────────────

export function WriteReport({ data }: { data: WriteReportData }) {
  const audit = data.auditResult;
  const isPassed = audit?.passed ?? true;
  const issues = audit?.issues ?? [];
  const isDraft = data.status === "drafted";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 16, borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ fontSize: 28 }}><Emoji char={isDraft ? "🚀" : "✍️"} /></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            {isDraft ? "极速草稿起草完成" : "智能续写完成"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            第 {data.chapterNumber} 章 《{data.title}》
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            background: isDraft ? "rgba(249,115,22,0.12)" : "rgba(139,92,246,0.12)",
            color: isDraft ? "#ff903f" : "#a78bfa",
            border: isDraft ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(139,92,246,0.3)",
          }}>
            {isDraft ? <><Emoji char="🚀" /> 极速草稿</> : <><Emoji char="✨" /> 已生成</>}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "生成字数", value: `${data.wordCount} 字`, color: isDraft ? "#ff903f" : "#a78bfa", bg: isDraft ? "rgba(249,115,22,0.08)" : "rgba(139,92,246,0.08)", border: isDraft ? "rgba(249,115,22,0.2)" : "rgba(139,92,246,0.2)" },
          { label: "章节状态", value: isDraft ? "已起草 (未审计)" : (data.status || "complete"), color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)" },
          { label: "即时修正", value: isDraft ? "已绕过" : (data.revised ? "已执行" : "无需"), color: isDraft ? "var(--text-dim)" : (data.revised ? "#60a5fa" : "var(--text-muted)"), bg: isDraft ? "var(--bg-subtle)" : (data.revised ? "rgba(96,165,250,0.08)" : "var(--bg-hover)"), border: isDraft ? "var(--border)" : (data.revised ? "rgba(96,165,250,0.2)" : "var(--border)") },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: "12px 16px",
            background: stat.bg,
            border: `1px solid ${stat.border}`,
            borderRadius: 8,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Audit result section */}
      {audit && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <Emoji char="🔍" style={{ marginRight: 6 }} />离线审稿审计
          </div>
          <div style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: isPassed ? "rgba(74,222,128,0.06)" : "rgba(251,191,36,0.06)",
            border: `1px solid ${isPassed ? "rgba(74,222,128,0.2)" : "rgba(251,191,36,0.2)"}`,
            borderLeft: `3px solid ${isPassed ? "#4ade80" : "#fbbf24"}`,
            fontSize: 13, fontWeight: 600,
            color: isPassed ? "#4ade80" : "#fbbf24",
            marginBottom: issues.length > 0 ? 10 : 0,
          }}>
            {isPassed ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="check" size={13} />
                <span>审计通过 — 无明显逻辑矛盾或人设崩塌风险</span>
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="warning" size={13} />
                <span>审计未完全通过 — 检测到以下风险条目：</span>
              </span>
            )}
          </div>

          {issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {issues.map((issue: AuditIssue, i: number) => {
                const sev = (issue.severity || "info").toLowerCase();
                const cfg =
                  sev === "error" || sev === "critical"
                    ? { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "#f87171", iconType: "error" as const, label: "严重" }
                    : sev === "warning"
                    ? { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "#fbbf24", iconType: "warning" as const, label: "警告" }
                    : { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "#60a5fa", iconType: "info" as const, label: "提示" };
                return (
                  <div key={i} style={{
                    padding: "12px 16px", background: cfg.bg,
                    border: `1px solid ${cfg.border}33`,
                    borderLeft: `3px solid ${cfg.border}`,
                    borderRadius: 8, display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusIcon type={cfg.iconType} size={13} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cfg.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--bg-hover)", padding: "1px 8px", borderRadius: 4 }}>
                        {issue.category || "未分类"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>问题描述：</span>{issue.description}
                    </div>
                    {issue.suggestion && (
                      <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
                        <span style={{ fontWeight: 600 }}>修改建议：</span>{issue.suggestion}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Auto-revise result */}
      {data.autoReviseResult && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            🪄 自动修正结果
          </div>
          <ReviseReport data={data.autoReviseResult} compact />
        </div>
      )}

      {!data.autoReviseResult && !isPassed && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(96,165,250,0.06)",
          border: "1px solid rgba(96,165,250,0.2)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--text-muted)",
          lineHeight: 1.7,
        }}>
          <Emoji char="💡" /> <strong style={{ color: "var(--text)" }}>建议</strong>：点击编辑器底部工具栏的 <strong>「<Emoji char="🪄" /> 局部定点修复」</strong> 对以上风险条目进行自动局部修缮，或手动微调相关情节后点击 <strong>「<Emoji char="🔁" /> 同步设定」</strong> 重新对齐故事数据库。
        </div>
      )}
    </div>
  );
}

// ── Revise Report Component ────────────────────────────────────────────────────

export function ReviseReport({ data, compact = false }: { data: ReviseReportData; compact?: boolean }) {
  const applied = data.applied ?? false;

  if (!applied) {
    return (
      <div style={{
        padding: "14px 18px",
        background: "rgba(96,165,250,0.06)",
        border: "1px solid rgba(96,165,250,0.2)",
        borderLeft: "3px solid #60a5fa",
        borderRadius: 8,
        fontSize: 13, lineHeight: 1.75, color: "var(--text)",
      }}>
        <div style={{ fontWeight: 600, color: "#60a5fa", marginBottom: 4 }}><Emoji char="💡" /> 未应用修改</div>
        <div style={{ color: "var(--text-muted)" }}>{data.skippedReason || "未发现明显的改善机会，当前文本已达到较好的一致性水平。"}</div>
        {!compact && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
            建议手动微调相关段落后，点击 <strong>「<Emoji char="🔁" /> 同步设定」</strong> 重新对齐故事数据库。
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 16 }}>
      {!compact && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 16, borderBottom: "1px solid var(--border)"
        }}>
          <div style={{ fontSize: 28 }}><Emoji char="🪄" /></div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>局部定点修复成功应用</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 14px", borderRadius: 20,
              fontSize: 12, fontWeight: 600,
              background: "rgba(74,222,128,0.12)", color: "#4ade80",
              border: "1px solid rgba(74,222,128,0.3)",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="check" size={12} />
                <span>已修正</span>
              </span>
            </span>
          </div>
        </div>
      )}

      {data.fixedIssues && data.fixedIssues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.fixedIssues.map((f: string, i: number) => (
            <div key={i} style={{
              padding: "10px 14px",
              background: "rgba(74,222,128,0.06)",
              border: "1px solid rgba(74,222,128,0.2)",
              borderLeft: "3px solid #4ade80",
              borderRadius: 8,
              fontSize: 13, color: "var(--text)", lineHeight: 1.6,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <StatusIcon type="check" size={12} style={{ flexShrink: 0 }} />
              <span>{f}</span>
            </div>
          ))}
        </div>
      )}

      {!compact && (data.status || data.wordCount) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {data.status && (
            <div style={{ padding: "10px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>当前状态</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>{data.status}</div>
            </div>
          )}
          {data.wordCount && (
            <div style={{ padding: "10px 14px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>当前字数</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>{data.wordCount} 字</div>
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div style={{ padding: "12px 16px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
          <Emoji char="💡" /> 正文已自动更新。建议点击 <strong style={{ color: "var(--text)" }}>「<Emoji char="🔍" /> 防崩审计」</strong> 重新运行审查，确认修改后是否完全绿灯。
        </div>
      )}
    </div>
  );
}

// ── Sync Report Component ──────────────────────────────────────────────────────

export function SyncReport({ data }: { data: SyncReportData }) {
  const audit = data.auditResult;
  const isPassed = audit?.passed ?? true;
  const issues = audit?.issues ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 16, borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ fontSize: 28 }}><Emoji char="🔁" /></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>同步设定成功</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            人物卡、伏笔池与大纲事件线已与最新正文完全对齐
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            background: "rgba(52,211,153,0.12)", color: "#34d399",
            border: "1px solid rgba(52,211,153,0.3)",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Emoji char="🔁" />
              <span>已同步</span>
            </span>
          </span>
        </div>
      </div>

      {/* Audit inline */}
      {audit && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <Emoji char="🔍" style={{ marginRight: 6 }} />同步后审计结果
          </div>
          <div style={{
            padding: "10px 16px", borderRadius: 8,
            background: isPassed ? "rgba(74,222,128,0.06)" : "rgba(251,191,36,0.06)",
            border: `1px solid ${isPassed ? "rgba(74,222,128,0.2)" : "rgba(251,191,36,0.2)"}`,
            borderLeft: `3px solid ${isPassed ? "#4ade80" : "#fbbf24"}`,
            fontSize: 13, fontWeight: 600,
            color: isPassed ? "#4ade80" : "#fbbf24",
            marginBottom: issues.length > 0 ? 10 : 0,
          }}>
            {isPassed ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="check" size={13} />
                <span>审计通过 — 无逻辑矛盾或角色人设崩塌问题</span>
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusIcon type="warning" size={13} />
                <span>检测到部分人设或逻辑风险 — 建议处理以下条目：</span>
              </span>
            )}
          </div>

          {issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {issues.map((issue: AuditIssue, i: number) => {
                const sev = (issue.severity || "info").toLowerCase();
                const cfg =
                  sev === "error" || sev === "critical"
                    ? { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "#f87171", iconType: "error" as const, label: "严重" }
                    : sev === "warning"
                    ? { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "#fbbf24", iconType: "warning" as const, label: "警告" }
                    : { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "#60a5fa", iconType: "info" as const, label: "提示" };
                return (
                  <div key={i} style={{
                    padding: "12px 16px", background: cfg.bg,
                    border: `1px solid ${cfg.border}33`,
                    borderLeft: `3px solid ${cfg.border}`,
                    borderRadius: 8, display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusIcon type={cfg.iconType} size={13} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cfg.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--bg-hover)", padding: "1px 8px", borderRadius: 4 }}>
                        {issue.category || "未分类"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>问题描述：</span>{issue.description}
                    </div>
                    {issue.suggestion && (
                      <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
                        <span style={{ fontWeight: 600 }}>修改建议：</span>{issue.suggestion}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "12px 16px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <Emoji char="💡" style={{ marginRight: 6 }} />如发现残留的人设警告，可点击 <strong style={{ color: "var(--text)" }}>「<Emoji char="🪄" /> 局部定点修复」</strong> 运行自动局部修缮，或根据审计描述手动微调相关情节.
      </div>
    </div>
  );
}

// ── Plan Report Component ──────────────────────────────────────────────────────

export function PlanReport({ data }: { data: PlanReportData }) {
  if (data.raw && !data.goal) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 16, borderBottom: "1px solid var(--border)"
        }}>
          <div style={{ fontSize: 28 }}><Emoji char="📝" /></div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>本章意图规划完成</div>
        </div>
        <div style={{
          padding: "14px 18px",
          background: "rgba(96,165,250,0.06)",
          border: "1px solid rgba(96,165,250,0.2)",
          borderLeft: "3px solid #60a5fa",
          borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}>
          {data.raw}
        </div>
        <div style={{ padding: "12px 16px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
          <Emoji char="💡" style={{ marginRight: 6 }} />剧情意图与备忘账本已成功保存。点击 <strong style={{ color: "var(--text)" }}>「<Emoji char="✍️" /> 智能续写」</strong> 时，AI 会以此为核心基准进行剧情铺陈与细节扩写。
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 16, borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ fontSize: 28, fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>📝</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>本章意图与剧情大纲规划</div>
          {data.bookTitle && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              《{data.bookTitle}》 第 {data.chapterNumber} 章
            </div>
          )}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            background: "rgba(139,92,246,0.12)", color: "#a78bfa",
            border: "1px solid rgba(139,92,246,0.3)",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Emoji char="📝" />
              <span>已规划</span>
            </span>
          </span>
        </div>
      </div>

      {/* Goal */}
      {data.goal && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <Emoji char="🎯" style={{ marginRight: 6 }} />核心写作目标 (Goal)
          </div>
          <div style={{
            padding: "14px 18px",
            background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.2)",
            borderLeft: "3px solid #a78bfa",
            borderRadius: 8, fontSize: 14, lineHeight: 1.8, color: "var(--text)",
            fontStyle: "italic",
          }}>
            {data.goal}
          </div>
        </div>
      )}

      {/* Intent file */}
      {data.intentFile && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <Emoji char="📂" style={{ marginRight: 6 }} />关联意图文件 (Intent)
          </div>
          <div style={{
            padding: "10px 16px",
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
            borderRadius: 8, fontSize: 13, color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}>
            {data.intentFile}
          </div>
        </div>
      )}

      <div style={{ padding: "12px 16px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <Emoji char="💡" style={{ marginRight: 6 }} />剧情意图与备忘账本已保存。点击 <strong style={{ color: "var(--text)" }}>「<Emoji char="✍️" /> 智能续写」</strong> 时，AI 会以此目标为核心进行剧情铺陈与细节扩写，确保故事节奏与伏笔完美对齐。
      </div>
    </div>
  );
}
