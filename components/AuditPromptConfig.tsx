"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditPromptConfigProps {
  onClose: () => void;
}

export function AuditPromptConfig({ onClose }: AuditPromptConfigProps) {
  const [promptName, setPromptName] = useState<"auditor_system" | "detector_system" | "state_validator_system">("auditor_system");
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPrompt = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // state_validator_system has no lang suffix, so we omit lang parameter
      const langParam = promptName === "state_validator_system" ? "" : `&lang=${lang}`;
      const res = await fetch(`/api/skills/prompts?name=${promptName}${langParam}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setContent(data.content);
      } else {
        setError(data.error || "获取提示词失败");
      }
    } catch (err) {
      console.error("Error fetching prompt:", err);
      setError("获取提示词时发生网络错误");
    } finally {
      setLoading(false);
    }
  }, [promptName, lang]);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  const validatePrompt = (): { valid: boolean; warning?: string } => {
    if (promptName === "auditor_system") {
      if (!content.includes("{{genre}}") || !content.includes("{{dimList}}")) {
        return {
          valid: false,
          warning: "提示词中缺少必要的系统插值变量 {{genre}} 或 {{dimList}}。误删变量可能导致 AI 质量审计因缺少题材或规则上下文而运行失败。"
        };
      }
    } else if (promptName === "detector_system") {
      if (!content.includes("{{content}}")) {
        return {
          valid: false,
          warning: "提示词中缺少待评估文本的插值变量 {{content}}。误删变量可能导致 AIGC 检测器因获取不到正文内容而运行失败。"
        };
      }
    } else if (promptName === "state_validator_system") {
      if (!content.includes("{{langInstruction}}")) {
        return {
          valid: false,
          warning: "提示词中缺少语言说明插值变量 {{langInstruction}}。误删变量可能导致状态真理校验器格式输出混乱。"
        };
      }
    }
    return { valid: true };
  };

  const handleSave = async () => {
    const { valid, warning } = validatePrompt();
    if (!valid && warning) {
      const confirmSave = window.confirm(`${warning}\n\n您确定要强行保存吗？`);
      if (!confirmSave) return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const langParam = promptName === "state_validator_system" ? undefined : lang;
      const res = await fetch("/api/skills/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: promptName,
          lang: langParam,
          content,
          action: "save"
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess("提示词已成功保存");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "保存失败");
      }
    } catch (err) {
      console.error("Error saving prompt:", err);
      setError("保存提示词时发生网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    const confirmRestore = window.confirm("您确定要恢复系统出厂的内置提示词吗？\n当前对该提示词做出的所有自定义修改都将被覆盖且无法撤销。");
    if (!confirmRestore) return;

    setRestoring(true);
    setError(null);
    setSuccess(null);
    try {
      const langParam = promptName === "state_validator_system" ? undefined : lang;
      const res = await fetch("/api/skills/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: promptName,
          lang: langParam,
          action: "restore"
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setContent(data.content);
        setSuccess("提示词已成功恢复为系统默认值");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "恢复失败");
      }
    } catch (err) {
      console.error("Error restoring prompt:", err);
      setError("恢复默认值时发生网络错误");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        display: "flex", flexDirection: "column",
        width: "90%", maxWidth: "800px", height: "80%", maxHeight: "620px",
        background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🤖</span> AI 质量审计与检测指令配置
            </h2>
            <span style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, display: "block" }}>
              管理和配置写手引擎的底层 Agent 提示词模板。请勿随意删除双大括号插值占位符。
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-muted)",
              cursor: "pointer", padding: 4, display: "flex", alignItems: "center"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar (Selectors) */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", background: "var(--bg-hover)", borderBottom: "1px solid var(--border)",
          flexShrink: 0, gap: 16, flexWrap: "wrap"
        }}>
          {/* Prompt Name Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>指令类型:</span>
            <select
              value={promptName}
              onChange={(e) => setPromptName(e.target.value as "auditor_system" | "detector_system" | "state_validator_system")}
              style={{
                padding: "6px 12px", background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text)", fontSize: 12, outline: "none", cursor: "pointer"
              }}
            >
              <option value="auditor_system">🛡️ 质量审计指令 (Auditor)</option>
              <option value="detector_system">👁️ AIGC痕迹检测指令 (Detector)</option>
              <option value="state_validator_system">🧩 设定与状态真理校验指令 (Validator)</option>
            </select>
          </div>

          {/* Language Tabs */}
          {promptName !== "state_validator_system" && (
            <div style={{ display: "flex", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 2 }}>
              <button
                onClick={() => setLang("zh")}
                style={{
                  padding: "4px 12px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: lang === "zh" ? "var(--bg-panel)" : "none",
                  color: lang === "zh" ? "var(--text)" : "var(--text-muted)",
                  cursor: "pointer", transition: "all 0.15s"
                }}
              >
                🇨🇳 中文版
              </button>
              <button
                onClick={() => setLang("en")}
                style={{
                  padding: "4px 12px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: lang === "en" ? "var(--bg-panel)" : "none",
                  color: lang === "en" ? "var(--text)" : "var(--text-muted)",
                  cursor: "pointer", transition: "all 0.15s"
                }}
              >
                🇺🇸 英文版
              </button>
            </div>
          )}
        </div>

        {/* Editor Main */}
        <div style={{ flex: 1, position: "relative", minHeight: 0, display: "flex", flexDirection: "column" }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>
              正在加载系统提示词指令...
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={saving || restoring}
              style={{
                flex: 1, width: "100%", border: "none", padding: "16px 20px", outline: "none",
                background: "var(--bg)", color: "var(--text)", fontSize: 13,
                fontFamily: "var(--font-mono)", lineHeight: 1.6, resize: "none",
                overflowY: "auto"
              }}
              placeholder="请输入系统提示词内容..."
            />
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)",
          flexShrink: 0
        }}>
          {/* Error & Success Messages */}
          <div style={{ flex: 1, marginRight: 16, display: "flex", alignItems: "center" }}>
            {error && <span style={{ fontSize: 12, color: "#f87171" }}>❌ {error}</span>}
            {success && <span style={{ fontSize: 12, color: "#4ade80" }}>✅ {success}</span>}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Restore Button */}
            <button
              onClick={handleRestore}
              disabled={loading || saving || restoring}
              style={{
                padding: "6px 12px", background: "none", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
                transition: "all 0.15s"
              }}
              onMouseEnter={(e) => {
                if (!saving && !restoring) {
                  e.currentTarget.style.borderColor = "#f87171";
                  e.currentTarget.style.color = "#f87171";
                  e.currentTarget.style.background = "rgba(248, 113, 113, 0.05)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "none";
              }}
            >
              ↩️ 恢复系统默认
            </button>

            {/* Cancel Button */}
            <button
              onClick={onClose}
              disabled={saving || restoring}
              style={{
                padding: "6px 14px", background: "none", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 12
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >
              取消
            </button>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={loading || saving || restoring}
              style={{
                padding: "6px 16px", background: "var(--accent)", border: "none",
                borderRadius: 6, color: "#fff", cursor: (saving || restoring || loading) ? "default" : "pointer",
                fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                opacity: (saving || restoring || loading) ? 0.6 : 1
              }}
            >
              {saving ? "正在保存..." : "💾 保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
