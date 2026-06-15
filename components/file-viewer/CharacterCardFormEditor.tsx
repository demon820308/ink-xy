import React, { useState, useEffect } from "react";
import { encodeFilePathForApi } from "@/lib/file-paths";
import yaml from "js-yaml";

interface CharacterData {
  name: string;
  tier: "major" | "minor";
  tags: string;
  contrastDetail: string;
  backStory: string;
  relationshipNetwork: string;
}

interface CharacterCardFormEditorProps {
  filePath: string;
  cwd: string;
  initialContent: string;
  onSaveSuccess?: (updatedContent: string) => void;
}

export const CharacterCardFormEditor: React.FC<CharacterCardFormEditorProps> = ({
  filePath,
  cwd,
  initialContent,
  onSaveSuccess,
}) => {
  const [formData, setFormData] = useState<CharacterData | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Extract filename as fallback name
  const fallbackName = (() => {
    const parts = filePath.replace(/\\/g, "/").split("/");
    const filename = parts[parts.length - 1] || "";
    return filename.replace(/\.md$/i, "");
  })();

  // Parse the file on mount
  useEffect(() => {
    try {
      // 1. Separate YAML and body
      const fmMatch = initialContent.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
      let frontmatter: Record<string, any> = {};
      let bodyText = initialContent;

      if (fmMatch) {
        try {
          frontmatter = yaml.load(fmMatch[1]) as Record<string, any> || {};
          bodyText = fmMatch[2] || "";
        } catch (e) {
          console.error("YAML Frontmatter parse error:", e);
        }
      }

      // 2. Parse markdown sections
      // Sections: Core_Tags, Contrast_Detail, Back_Story, Relationship_Network
      const sections = {
        tags: "",
        contrastDetail: "",
        backStory: "",
        relationshipNetwork: "",
      };

      const headerRegex = /^##\s+(Core_Tags|Contrast_Detail|Back_Story|Relationship_Network)\s*$/gim;
      const headersIndices: { name: string; index: number; headingLength: number }[] = [];
      let match;
      
      while ((match = headerRegex.exec(bodyText)) !== null) {
        headersIndices.push({
          name: match[1].toLowerCase(),
          index: match.index,
          headingLength: match[0].length,
        });
      }

      // If we found section headers, extract their text content
      if (headersIndices.length > 0) {
        for (let i = 0; i < headersIndices.length; i++) {
          const current = headersIndices[i];
          const next = headersIndices[i + 1];
          const start = current.index + current.headingLength;
          const end = next ? next.index : bodyText.length;
          const sectionContent = bodyText.substring(start, end).trim();

          if (current.name === "core_tags" || current.name === "tags") {
            sections.tags = sectionContent;
          } else if (current.name === "contrast_detail") {
            sections.contrastDetail = sectionContent;
          } else if (current.name === "back_story") {
            sections.backStory = sectionContent;
          } else if (current.name === "relationship_network") {
            sections.relationshipNetwork = sectionContent;
          }
        }
      } else {
        // Fallback: if no specific structure is found, put everything in backstory
        sections.backStory = bodyText.trim();
      }

      setFormData({
        name: frontmatter.name || fallbackName,
        tier: frontmatter.tier === "minor" ? "minor" : "major",
        tags: sections.tags,
        contrastDetail: sections.contrastDetail,
        backStory: sections.backStory,
        relationshipNetwork: sections.relationshipNetwork,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: `分析角色卡失败: ${err.message || String(err)}` });
    }
  }, [initialContent, filePath]);

  if (!formData) {
    return (
      <div style={{ padding: "24px", color: "var(--text-muted)" }}>
        {message ? message.text : "正在加载角色数据..."}
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // 1. Serialize Frontmatter
      const fmObj = {
        tier: formData.tier,
        name: formData.name.trim(),
      };
      const fmStr = yaml.dump(fmObj);

      // 2. Assemble Markdown
      const mdContent = `---
${fmStr.trim()}
---

## Core_Tags
${formData.tags.trim() || "暂无标签"}

## Contrast_Detail
${formData.contrastDetail.trim() || "暂无细节"}

## Back_Story
${formData.backStory.trim() || "暂无小传"}

## Relationship_Network
${formData.relationshipNetwork.trim() || "- 暂无关系线"}
`;

      const encoded = encodeFilePathForApi(filePath);
      const res = await fetch(`/api/files/${encoded}`, {
        method: "POST",
        body: new TextEncoder().encode(mdContent),
      });

      if (!res.ok) {
        throw new Error(`保存文件失败，HTTP 状态 ${res.status}`);
      }

      setMessage({ type: "success", text: "角色卡保存成功！" });
      if (onSaveSuccess) {
        onSaveSuccess(mdContent);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `保存失败: ${err.message || String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      maxWidth: "700px",
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
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "12px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>👤 角色设定人设卡</span>
          <span style={{
            fontSize: "10px",
            background: formData.tier === "major" ? "rgba(235,94,85,0.1)" : "rgba(var(--accent-rgb),0.1)",
            color: formData.tier === "major" ? "var(--accent)" : "var(--text-dim)",
            padding: "2px 6px",
            borderRadius: "10px",
            fontWeight: 600,
            border: `1px solid ${formData.tier === "major" ? "rgba(235,94,85,0.2)" : "var(--border)"}`
          }}>
            {formData.tier === "major" ? "主要角色" : "次要角色"}
          </span>
        </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              角色姓名 (Name)
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
              角色定位 (Tier)
            </label>
            <select
              value={formData.tier}
              onChange={(e) => setFormData({ ...formData, tier: e.target.value as any })}
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
              <option value="major">主要角色 (major)</option>
              <option value="minor">次要角色 (minor)</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
            核心性格标签 (Core Tags)
          </label>
          <input
            type="text"
            placeholder="例如：冷酷, 剑客, 身负血仇"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
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
            矛盾细节与反差设计 (Contrast Details)
          </label>
          <textarea
            rows={3}
            placeholder="例如：外表冷酷残忍，实则内心极度温柔，见不得小动物受难。对剑法偏执近乎痴迷。"
            value={formData.contrastDetail}
            onChange={(e) => setFormData({ ...formData, contrastDetail: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "12px",
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical"
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
            背景故事与生平小传 (Back Story)
          </label>
          <textarea
            rows={6}
            placeholder="记述人物成长线、门派来历、重大转折动机等..."
            value={formData.backStory}
            onChange={(e) => setFormData({ ...formData, backStory: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "12px",
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical"
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
            人际关系网络 (Relationship Network)
          </label>
          <textarea
            rows={3}
            placeholder="例如:&#10;- 与林墨：既是生死宿敌，又惺惺相惜&#10;- 与慕容雪：暗中保护的恩人"
            value={formData.relationshipNetwork}
            onChange={(e) => setFormData({ ...formData, relationshipNetwork: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              outline: "none",
              resize: "vertical"
            }}
          />
        </div>

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
            {saving ? "正在保存..." : "💾 保存设定"}
          </button>
        </div>
      </form>
    </div>
  );
};
