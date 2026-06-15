import React, { useState, useEffect } from "react";
import { encodeFilePathForApi } from "@/lib/file-paths";

interface BookConfig {
  id: string;
  title: string;
  platform: "tomato" | "feilu" | "qidian" | "other";
  genre: string;
  status: "incubating" | "outlining" | "writing" | "active" | "paused" | "completed" | "dropped";
  targetChapters: number;
  chapterWordCount: number;
  language?: "zh" | "en";
  createdAt?: string;
  updatedAt?: string;
  parentBookId?: string;
  fanficMode?: "canon" | "au" | "ooc" | "cp";
}

interface GenreItem {
  id: string;
  name: string;
  source: string;
}

interface BookSettingsEditorProps {
  filePath: string; // Absolute path
  cwd: string;
  initialContent: string;
  onSaveSuccess?: (updatedContent: string) => void;
}

export const BookSettingsEditor: React.FC<BookSettingsEditorProps> = ({
  filePath,
  cwd,
  initialContent,
  onSaveSuccess,
}) => {
  const [config, setConfig] = useState<BookConfig | null>(null);
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Parse initial content
  useEffect(() => {
    try {
      const parsed = JSON.parse(initialContent) as BookConfig;
      setConfig(parsed);
    } catch (err: any) {
      setMessage({ type: "error", text: `解析 book.json 失败: ${err.message || String(err)}` });
    }
  }, [initialContent]);

  // Fetch available genres from Inkos API
  useEffect(() => {
    if (!cwd) return;
    let active = true;
    const fetchGenres = async () => {
      try {
        const res = await fetch(`/api/genres?cwd=${encodeURIComponent(cwd)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.genres && active) {
            setGenres(data.genres);
          }
        }
      } catch (err) {
        console.error("Failed to fetch genres:", err);
      }
    };
    fetchGenres();
    return () => {
      active = false;
    };
  }, [cwd]);

  if (!config) {
    return (
      <div style={{ padding: "24px", color: "var(--text-muted)" }}>
        {message ? message.text : "加载配置中..."}
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const updatedConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
    };

    try {
      const jsonStr = JSON.stringify(updatedConfig, null, 2);
      const encoded = encodeFilePathForApi(filePath);
      const res = await fetch(`/api/files/${encoded}`, {
        method: "POST",
        body: new TextEncoder().encode(jsonStr),
      });

      if (!res.ok) {
        throw new Error(`保存文件失败，HTTP 状态 ${res.status}`);
      }

      setMessage({ type: "success", text: "书籍配置保存成功！" });
      setConfig(updatedConfig);
      if (onSaveSuccess) {
        onSaveSuccess(jsonStr);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `保存失败: ${err.message || String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      maxWidth: "600px",
      margin: "0 auto",
      padding: "24px",
      background: "var(--bg-panel)",
      borderRadius: "12px",
      border: "1px solid var(--border)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      fontFamily: "var(--font-sans)",
      color: "var(--text)"
    }}>
      <h3 style={{
        margin: "0 0 16px 0",
        fontSize: "16px",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "12px"
      }}>
        <span>⚙️ 书籍核心参数设置</span>
        {config.id && (
          <code style={{
            fontSize: "11px",
            background: "var(--bg)",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)"
          }}>{config.id}</code>
        )}
      </h3>

      {message && (
        <div style={{
          padding: "10px 14px",
          borderRadius: "6px",
          marginBottom: "16px",
          fontSize: "12px",
          background: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          color: message.type === "success" ? "#10b981" : "#ef4444",
          border: `1px solid ${message.type === "success" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`
        }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
            书籍标题
          </label>
          <input
            type="text"
            required
            value={config.title}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "12px",
              outline: "none"
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              首发平台
            </label>
            <select
              value={config.platform}
              onChange={(e) => setConfig({ ...config, platform: e.target.value as any })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            >
              <option value="tomato">番茄小说 (tomato)</option>
              <option value="qidian">起点中文网 (qidian)</option>
              <option value="feilu">飞卢小说网 (feilu)</option>
              <option value="other">其他平台 (other)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              题材类型 (Genre)
            </label>
            <select
              value={config.genre}
              onChange={(e) => setConfig({ ...config, genre: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            >
              {genres.length > 0 ? (
                genres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.id})
                  </option>
                ))
              ) : (
                <option value={config.genre}>{config.genre}</option>
              )}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              创作状态 (Status)
            </label>
            <select
              value={config.status}
              onChange={(e) => setConfig({ ...config, status: e.target.value as any })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            >
              <option value="incubating">脑暴孵化 (incubating)</option>
              <option value="outlining">大纲规划 (outlining)</option>
              <option value="writing">草稿撰写 (writing)</option>
              <option value="active">活跃更文中 (active)</option>
              <option value="paused">暂停搁置 (paused)</option>
              <option value="completed">已完结 (completed)</option>
              <option value="dropped">已太监 (dropped)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              语言
            </label>
            <select
              value={config.language || "zh"}
              onChange={(e) => setConfig({ ...config, language: e.target.value as any })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            >
              <option value="zh">中文 (zh)</option>
              <option value="en">English (en)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              计划章节数 (Target Chapters)
            </label>
            <input
              type="number"
              min={1}
              required
              value={config.targetChapters || 200}
              onChange={(e) => setConfig({ ...config, targetChapters: parseInt(e.target.value, 10) || 200 })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              单章字数预算 (Word Count Target)
            </label>
            <input
              type="number"
              min={1000}
              required
              value={config.chapterWordCount || 3000}
              onChange={(e) => setConfig({ ...config, chapterWordCount: parseInt(e.target.value, 10) || 3000 })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            />
          </div>
        </div>

        {config.fanficMode && (
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              同人创作模式
            </label>
            <select
              value={config.fanficMode}
              onChange={(e) => setConfig({ ...config, fanficMode: e.target.value as any })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none"
              }}
            >
              <option value="canon">正典续写 (canon)</option>
              <option value="au">平行宇宙 (au)</option>
              <option value="ooc">角色崩坏 (ooc)</option>
              <option value="cp">配对同人 (cp)</option>
            </select>
          </div>
        )}

        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "12px",
          borderTop: "1px solid var(--border)",
          paddingTop: "16px",
          marginTop: "8px"
        }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 20px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}
          >
            {saving ? "正在保存..." : "💾 保存配置"}
          </button>
        </div>
      </form>
    </div>
  );
};
