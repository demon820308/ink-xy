"use client";

import { useState, useEffect } from "react";

interface SettingsModalProps {
  onClose: () => void;
  onSave?: () => void;
}

export function SettingsModal({ onClose, onSave }: SettingsModalProps) {
  const [showExecutionConfirm, setShowExecutionConfirm] = useState(true);
  const [showImportDraft, setShowImportDraft] = useState(true);
  const [showAutoGenerateShort, setShowAutoGenerateShort] = useState(true);
  const [showCreateBookCard, setShowCreateBookCard] = useState(true);
  const [disableDefaultAgentEditDelete, setDisableDefaultAgentEditDelete] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  interface LicenseData {
    active: boolean;
    key?: string;
    expires_at?: string;
    machine_uuid: string;
  }
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);

  useEffect(() => {
    fetch("/api/license")
      .then((res) => res.json())
      .then((data) => setLicenseData(data))
      .catch((err) => console.error("Error fetching license in SettingsModal:", err));
  }, []);

  const getExpiryText = (expiresAt?: string) => {
    if (!expiresAt) return "";
    if (expiresAt.startsWith("9999-12-31")) {
      return "永久有效";
    }
    try {
      const d = new Date(expiresAt);
      return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return expiresAt;
    }
  };

  const handleDeactivate = () => {
    window.dispatchEvent(new CustomEvent("deactivate-license"));
    onClose();
  };

  useEffect(() => {
    const val = localStorage.getItem("ink-show-execution-confirm");
    if (val !== null) {
      setShowExecutionConfirm(val === "true");
    }
    const importVal = localStorage.getItem("ink-show-import-draft");
    if (importVal !== null) {
      setShowImportDraft(importVal === "true");
    }
    const autoShortVal = localStorage.getItem("ink-show-auto-generate-short");
    if (autoShortVal !== null) {
      setShowAutoGenerateShort(autoShortVal === "true");
    }
    const createBookVal = localStorage.getItem("ink-show-create-book-card");
    if (createBookVal !== null) {
      setShowCreateBookCard(createBookVal === "true");
    }
    const disableDefaultAgentVal = localStorage.getItem("ink-disable-default-agent-edit-delete");
    if (disableDefaultAgentVal !== null) {
      setDisableDefaultAgentEditDelete(disableDefaultAgentVal === "true");
    }
  }, []);

  const handleSave = () => {
    setSaving(true);
    localStorage.setItem("ink-show-execution-confirm", String(showExecutionConfirm));
    localStorage.setItem("ink-show-import-draft", String(showImportDraft));
    localStorage.setItem("ink-show-auto-generate-short", String(showAutoGenerateShort));
    localStorage.setItem("ink-show-create-book-card", String(showCreateBookCard));
    localStorage.setItem("ink-disable-default-agent-edit-delete", String(disableDefaultAgentEditDelete));
    // Trigger custom event to notify other components (e.g. SessionSidebar) of settings changes
    window.dispatchEvent(
      new CustomEvent("ink-settings-changed", {
        detail: { showExecutionConfirm, showImportDraft, showAutoGenerateShort, showCreateBookCard, disableDefaultAgentEditDelete },
      })
    );
    setTimeout(() => {
      setSaving(false);
      setSavedOk(true);
      setTimeout(() => {
        setSavedOk(false);
        if (onSave) onSave();
        onClose();
      }, 500);
    }, 300);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 10, 10, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      {/* Dialog container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(400px, 90%)",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚙️</span> 系统全局设置
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 16,
              padding: 4,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          padding: "20px 18px", 
          display: "flex", 
          flexDirection: "column", 
          gap: 16,
          maxHeight: "min(420px, 60vh)",
          overflowY: "auto"
        }}>
          {/* Operation Confirmation */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                操作执行前确认提示
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
                点击底部工具栏按钮（智能续写、局部定点修复、防崩审计等）时，弹出确认窗口并显示功能说明。
              </span>
            </div>
            {/* Toggle Switch */}
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showExecutionConfirm}
                onChange={(e) => setShowExecutionConfirm(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  inset: 0,
                  backgroundColor: showExecutionConfirm ? "var(--accent)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 22,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: 16,
                    width: 16,
                    left: showExecutionConfirm ? 20 : 2,
                    bottom: 2,
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </span>
            </label>
          </div>

          <div style={{ height: "1px", background: "var(--border)", opacity: 0.6 }} />

          {/* Show Import Draft */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                显示“导入已有旧稿”按钮
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
                在侧边栏显示“导入已有旧稿”按钮，支持从外部 TXT 章节或已有文件批量导入故事宇宙。
              </span>
            </div>
            {/* Toggle Switch */}
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showImportDraft}
                onChange={(e) => setShowImportDraft(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  inset: 0,
                  backgroundColor: showImportDraft ? "var(--accent)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 22,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: 16,
                    width: 16,
                    left: showImportDraft ? 20 : 2,
                    bottom: 2,
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </span>
            </label>
          </div>

          <div style={{ height: "1px", background: "var(--border)", opacity: 0.6 }} />

          {/* Show Create Book Card Toggle */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                显示“创建新小说书籍”卡片
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
                在侧边栏顶部显示新书籍创建配置面板。若项目内已建立书籍，可关闭此卡片以释放侧边栏空间。
              </span>
            </div>
            {/* Toggle Switch */}
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showCreateBookCard}
                onChange={(e) => setShowCreateBookCard(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  inset: 0,
                  backgroundColor: showCreateBookCard ? "var(--accent)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 22,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: 16,
                    width: 16,
                    left: showCreateBookCard ? 20 : 2,
                    bottom: 2,
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </span>
            </label>
          </div>

          <div style={{ height: "1px", background: "var(--border)", opacity: 0.6 }} />

          {/* Show Auto Generate Short */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                显示“一键全自动生成短篇”按钮
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
                在侧边栏显示“一键全自动生成短篇”快捷键，支持配置并启动全自动短篇小说大纲与章节生成流水线。
              </span>
            </div>
            {/* Toggle Switch */}
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showAutoGenerateShort}
                onChange={(e) => setShowAutoGenerateShort(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  inset: 0,
                  backgroundColor: showAutoGenerateShort ? "var(--accent)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 22,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: 16,
                    width: 16,
                    left: showAutoGenerateShort ? 20 : 2,
                    bottom: 2,
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </span>
            </label>
          </div>

          <div style={{ height: "1px", background: "var(--border)", opacity: 0.6 }} />

          {/* Disable Default Agent Edit/Delete */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                关闭默认智能体编辑和删除
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>
                关闭 AI 写作伴侣中系统默认内置智能体（写作姬）的编辑与删除功能，防止误操作。自定义智能体不受此限制。
              </span>
            </div>
            {/* Toggle Switch */}
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={disableDefaultAgentEditDelete}
                onChange={(e) => setDisableDefaultAgentEditDelete(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  inset: 0,
                  backgroundColor: disableDefaultAgentEditDelete ? "var(--accent)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 22,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: 16,
                    width: 16,
                    left: disableDefaultAgentEditDelete ? 20 : 2,
                    bottom: 2,
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </span>
            </label>
          </div>

          <div style={{ height: "1px", background: "var(--border)", opacity: 0.6 }} />

          {/* 软件授权 (License) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              🔑 软件授权与设备
            </span>
            <div style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              {licenseData === null ? (
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>正在读取授权状态...</span>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>设备 ID</span>
                    <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)", userSelect: "all" }} title={licenseData.machine_uuid}>
                      {licenseData.machine_uuid ? `${licenseData.machine_uuid.slice(0, 8)}...${licenseData.machine_uuid.slice(-8)}` : "未知设备"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>授权状态</span>
                    <span style={{ 
                      color: licenseData.active ? "#10b981" : "#f59e0b",
                      fontWeight: 600
                    }}>
                      {licenseData.active ? "已激活 PRO 版" : "未激活 (试用中)"}
                    </span>
                  </div>
                  {licenseData.active && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text-muted)" }}>授权密钥</span>
                        <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                          {licenseData.key ? `${licenseData.key.slice(0, 6)}****${licenseData.key.slice(-4)}` : ""}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text-muted)" }}>有效期至</span>
                        <span style={{ color: "var(--text)" }}>
                          {getExpiryText(licenseData.expires_at)}
                        </span>
                      </div>
                      <button
                        onClick={handleDeactivate}
                        style={{
                          marginTop: 6,
                          padding: "6px 10px",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          borderRadius: 6,
                          color: "#f87171",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 500,
                          textAlign: "center",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
                          e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                          e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.2)";
                        }}
                      >
                        解除当前设备绑定
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-panel)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "5px 12px",
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
            onClick={handleSave}
            disabled={saving || savedOk}
            style={{
              padding: "5px 14px",
              minWidth: 80,
              background: savedOk ? "#16a34a" : "var(--accent)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: saving || savedOk ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "background-color 0.2s ease",
            }}
          >
            {savedOk && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{savedOk ? "已保存" : saving ? "保存中…" : "保存设定"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
