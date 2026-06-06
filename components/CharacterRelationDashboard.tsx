"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";

interface Node {
  id: string;
  name: string;
  tier: "major" | "minor";
  tags: string[];
  contrast: string;
  bio: string;
  filePath: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  relationships: { target: string; type: string }[];
}

interface Props {
  bookId: string;
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
}

export function CharacterRelationDashboard({ bookId, cwd, onOpenFile }: Props) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Character Creation Form State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<"major" | "minor">("major");
  const [newTags, setNewTags] = useState("");
  const [newContrast, setNewContrast] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // AI File Upload / Paste States
  const [importMode, setImportMode] = useState<"file" | "paste">("paste");
  const [pastedText, setPastedText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isBatchImport, setIsBatchImport] = useState(false);
  const [batchCharacters, setBatchCharacters] = useState<any[]>([]);
  const [batchDuplicates, setBatchDuplicates] = useState<string[]>([]);
  const [batchUniques, setBatchUniques] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  // Parse markdown for a single character card (v5 layout roles/*/*.md)
  const parseCharacterMarkdown = useCallback((content: string, fileName: string, tier: "major" | "minor", filePath: string): Node => {
    const name = fileName.replace(/\.md$/, "");
    let tags: string[] = [];
    let contrast = "";
    let bio = "";
    const relationships: { target: string; type: string }[] = [];

    // Extract frontmatter if present
    let cleanContent = content;
    const fmMatch = content.match(/^---([\s\S]*?)---/);
    if (fmMatch) {
      cleanContent = content.slice(fmMatch[0].length).trim();
    }

    const sections = cleanContent.split(/^##\s+/gm);
    for (const section of sections) {
      const lines = section.split("\n");
      const header = lines[0].trim().toLowerCase();
      const body = lines.slice(1).join("\n").trim();

      if (header.includes("core_tags") || header.includes("核心标签") || header.includes("tags")) {
        if (body.includes(",")) {
          tags = body.split(",").map(t => t.trim()).filter(Boolean);
        } else if (body.includes("，")) {
          tags = body.split("，").map(t => t.trim()).filter(Boolean);
        } else {
          tags = body.split("\n")
            .map(line => line.replace(/^[-*+]\s*/, "").trim())
            .filter(Boolean);
        }
      } else if (header.includes("contrast_detail") || header.includes("矛盾细节") || header.includes("对比细节")) {
        contrast = body;
      } else if (header.includes("back_story") || header.includes("背景故事") || header.includes("人物经历") || header.includes("bio")) {
        bio = body;
      } else if (header.includes("relationship") || header.includes("关系")) {
        const listItems = body.split("\n");
        for (const item of listItems) {
          const cleaned = item.trim();
          if (!cleaned) continue;

          // Match "- Target: Type" or "- 与Target：Type"
          const match = cleaned.match(/^[-*+]\s*(与?([^\n：:：\-—]+))\s*[：:：\-—]\s*(.+)$/);
          if (match) {
            const target = match[2].trim().replace(/^与|^对|^和/, "").trim();
            const type = match[3].trim();
            relationships.push({ target, type });
          } else {
            const parts = cleaned.replace(/^[-*+]\s*/, "").split(/[:：]/);
            if (parts.length >= 2) {
              const target = parts[0].trim().replace(/^与|^对|^和/, "").trim();
              const type = parts.slice(1).join("：").trim();
              relationships.push({ target, type });
            }
          }
        }
      }
    }

    return {
      id: name,
      name,
      tier,
      tags: tags.slice(0, 5),
      contrast,
      bio: bio || cleanContent,
      filePath,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      relationships
    };
  }, []);

  // Parse markdown for single-file character mapping (character_matrix.md etc)
  const parseSingleFileCharacters = useCallback((content: string, filePath: string): Node[] => {
    const characters: Node[] = [];
    const sections = content.split(/^##+\s+/gm);

    for (const section of sections) {
      const lines = section.split("\n");
      const header = lines[0].trim();
      if (!header || /角色矩阵|character matrix|人设|目录/i.test(header)) {
        continue;
      }

      let name = header;
      let tier: "major" | "minor" = "major";
      if (/次要|配角|minor|supporting/i.test(header)) {
        tier = "minor";
      }
      name = name.replace(/\([^\)]+\)/g, "").replace(/（[^）]+）/g, "").trim();

      const body = lines.slice(1).join("\n").trim();
      let tags: string[] = [];
      let contrast = "";
      let bio = "";
      const relationships: { target: string; type: string }[] = [];

      const subSections = body.split(/^###+\s+/gm);
      if (subSections.length > 1) {
        for (const sub of subSections) {
          const subLines = sub.split("\n");
          const subHeader = subLines[0].trim().toLowerCase();
          const subBody = subLines.slice(1).join("\n").trim();
          if (subHeader.includes("tags") || subHeader.includes("标签")) {
            tags = subBody.split(/[,，\n]/).map(t => t.replace(/^[-*+]\s*/, "").trim()).filter(Boolean);
          } else if (subHeader.includes("contrast") || subHeader.includes("对比") || subHeader.includes("矛盾")) {
            contrast = subBody;
          } else if (subHeader.includes("relationship") || subHeader.includes("关系")) {
            const listItems = subBody.split("\n");
            for (const item of listItems) {
              const cleaned = item.trim();
              const match = cleaned.match(/^[-*+]\s*(与?([^\n：:：\-—]+))\s*[：:：\-—]\s*(.+)$/);
              if (match) {
                relationships.push({ target: match[2].trim().replace(/^与|^对|^和/, "").trim(), type: match[3].trim() });
              }
            }
          } else if (subHeader.includes("bio") || subHeader.includes("背景") || subHeader.includes("经历")) {
            bio = subBody;
          }
        }
      } else {
        const listItems = body.split("\n");
        for (const item of listItems) {
          const cleaned = item.trim();
          if (cleaned.startsWith("-") || cleaned.startsWith("*")) {
            const match = cleaned.match(/^[-*+]\s*(与?([^\n：:：\-—]+))\s*[：:：\-—]\s*(.+)$/);
            if (match) {
              const targetName = match[2].trim().replace(/^与|^对|^和/, "").trim();
              if (targetName.length >= 2 && targetName.length <= 10) {
                relationships.push({ target: targetName, type: match[3].trim() });
              }
            }
          }
        }
      }

      characters.push({
        id: name,
        name,
        tier,
        tags: tags.slice(0, 5),
        contrast,
        bio: bio || body,
        relationships,
        filePath,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0
      });
    }

    return characters;
  }, []);

  // Load characters and build graph
  const loadGraphData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const majorDir = joinFilePath(cwd, `books/${bookId}/story/roles/主要角色`);
    const minorDir = joinFilePath(cwd, `books/${bookId}/story/roles/次要角色`);

    const loadedNodes: Node[] = [];
    let success = false;

    // Helper to fetch files in a directory
    const getFilesInDir = async (dirPath: string) => {
      try {
        const encoded = encodeFilePathForApi(dirPath);
        const res = await fetch(`/api/files/${encoded}?type=list`);
        if (res.ok) {
          const data = await res.json();
          return (data.entries || []).filter((e: any) => !e.isDir && e.name.endsWith(".md"));
        }
      } catch (err) {
        console.warn(`Failed to read directory: ${dirPath}`, err);
      }
      return [];
    };

    // Helper to read file content
    const readFileContent = async (filePath: string) => {
      try {
        const encoded = encodeFilePathForApi(filePath);
        const res = await fetch(`/api/files/${encoded}?type=read`);
        if (res.ok) {
          const data = await res.json();
          return data.content || "";
        }
      } catch (err) {
        console.error(`Failed to read file: ${filePath}`, err);
      }
      return "";
    };

    // 1. Try reading the roles directory structure
    const majorFiles = await getFilesInDir(majorDir);
    const minorFiles = await getFilesInDir(minorDir);

    if (majorFiles.length > 0 || minorFiles.length > 0) {
      success = true;
      for (const file of majorFiles) {
        const path = joinFilePath(majorDir, file.name);
        const content = await readFileContent(path);
        loadedNodes.push(parseCharacterMarkdown(content, file.name, "major", path));
      }
      for (const file of minorFiles) {
        const path = joinFilePath(minorDir, file.name);
        const content = await readFileContent(path);
        loadedNodes.push(parseCharacterMarkdown(content, file.name, "minor", path));
      }
    }

    // 2. If roles dir didn't work, try fallback single files
    if (!success) {
      const fallbackPaths = [
        { path: joinFilePath(cwd, `books/${bookId}/story/character_matrix.md`), label: "character_matrix.md" },
        { path: joinFilePath(cwd, `books/${bookId}/character_profiles.md`), label: "character_profiles.md" },
        { path: joinFilePath(cwd, `books/${bookId}/character.md`), label: "character.md" }
      ];

      for (const fallback of fallbackPaths) {
        try {
          const encoded = encodeFilePathForApi(fallback.path);
          const checkRes = await fetch(`/api/files/${encoded}?type=read&check=true`);
          const checkData = await checkRes.json();
          
          const exists = checkRes.ok && checkData.exists !== false;
          if (exists) {
            const content = await readFileContent(fallback.path);
            if (content.trim()) {
              const singleFileNodes = parseSingleFileCharacters(content, fallback.path);
              if (singleFileNodes.length > 0) {
                loadedNodes.push(...singleFileNodes);
                success = true;
                break;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (!success || loadedNodes.length === 0) {
      setLoading(false);
      return;
    }

    // Sort: major characters first, then minor characters, then alphabetically
    const sortedNodes = [...loadedNodes].sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier === "major" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-CN");
    });

    setNodes(sortedNodes);
    
    // Auto-select the first character on load
    if (sortedNodes.length > 0) {
      setSelectedNodeId(sortedNodes[0].id);
    }

    // Synchronize character_matrix.md if nodes are loaded from roles directory
    const isFromRolesDir = sortedNodes.some(n => n.filePath.includes("roles/"));
    if (isFromRolesDir) {
      const matrixPath = joinFilePath(cwd, `books/${bookId}/story/character_matrix.md`);
      const majorLines = sortedNodes
        .filter((c) => c.tier === "major")
        .map((c) => `- roles/主要角色/${c.name}.md`);
      const minorLines = sortedNodes
        .filter((c) => c.tier === "minor")
        .map((c) => `- roles/次要角色/${c.name}.md`);

      const markdownContent = `# 角色矩阵（兼容指针——已废弃）

> 本文件仅为外部读取保留。权威来源已迁移至 roles/ 文件夹（一人一卡）。

## 主要角色

${majorLines.join("\n") || "（无）"}

## 次要角色

${minorLines.join("\n") || "（无）"}
`;

      try {
        const encoded = encodeFilePathForApi(matrixPath);
        const checkRes = await fetch(`/api/files/${encoded}?type=read`);
        let currentContent = "";
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          currentContent = checkData.content || "";
        }

        if (currentContent.trim() !== markdownContent.trim()) {
          await fetch(`/api/files/${encoded}`, {
            method: "POST",
            body: new TextEncoder().encode(markdownContent)
          });
          window.dispatchEvent(new Event("refresh-explorer"));
        }
      } catch (err) {
        console.error("Failed to sync character_matrix.md:", err);
      }
    }
    
    setLoading(false);
  }, [bookId, cwd, parseCharacterMarkdown, parseSingleFileCharacters]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  const handleClearUpload = useCallback(() => {
    setUploadedFileName(null);
    setIsBatchImport(false);
    setBatchCharacters([]);
    setBatchDuplicates([]);
    setBatchUniques([]);
    setIsParsing(false);
    setFormError("");
    setPastedText("");
    setImportMode("paste");
  }, []);

  const parseContent = async (text: string) => {
    if (!text || !text.trim()) {
      setFormError("解析内容不能为空");
      return;
    }

    setIsParsing(true);
    setFormError("");

    try {
      const parsedList: any[] = [];
      let cleanText = text.trim();

      // If wrapped in ```markdown ... ``` or ``` ... ```, unwrap it
      if (cleanText.startsWith("```")) {
        const lines = cleanText.split("\n");
        if (lines[0].startsWith("```") && lines[lines.length - 1] === "```") {
          cleanText = lines.slice(1, -1).join("\n").trim();
        }
      }

      // Split by --- lines
      const cleanParts = cleanText.split(/^---\s*$/m);

      // We expect pairs of:
      // cleanParts[i] (odd) -> Frontmatter
      // cleanParts[i+1] (even) -> Body content
      for (let i = 1; i < cleanParts.length; i += 2) {
        const frontmatterText = cleanParts[i].trim();
        const bodyText = cleanParts[i+1] ? cleanParts[i+1].trim() : "";

        if (!frontmatterText) continue;

        // Parse frontmatter (name & tier)
        const lines = frontmatterText.split("\n");
        let tier: "major" | "minor" = "major";
        let name = "";

        for (const line of lines) {
          const match = line.match(/^\s*(tier|name)\s*:\s*(.+)$/i);
          if (match) {
            const key = match[1].toLowerCase();
            const val = match[2].trim();
            if (key === "tier") {
              tier = val === "minor" ? "minor" : "major";
            } else if (key === "name") {
              name = val.replace(/（[^）]+）/g, "").replace(/\([^\)]+\)/g, "").replace(/['"“”]/g, "").trim();
            }
          }
        }

        if (!name) continue;

        // Parse body content sections by "## " headings
        const sections = bodyText.split(/^##\s+(.+)$/m);
        let tags: string[] = [];
        let contrast = "";
        let bio = "";
        const relationships: { target: string; type: string }[] = [];

        for (let j = 1; j < sections.length; j += 2) {
          const heading = sections[j].trim().toLowerCase();
          const content = sections[j+1] ? sections[j+1].trim() : "";

          if (heading.includes("tag") || heading.includes("标签") || heading === "core_tags") {
            tags = content
              .split(/[,，\n]/)
              .map(t => t.trim())
              .filter(t => t.length > 0);
          } else if (heading.includes("contrast") || heading.includes("反差") || heading === "contrast_detail") {
            contrast = content;
          } else if (heading.includes("story") || heading.includes("bio") || heading.includes("故事") || heading.includes("背景") || heading === "back_story") {
            bio = content;
          } else if (heading.includes("relation") || heading.includes("关系") || heading === "relationship_network") {
            const relLines = content.split("\n");
            for (const relLine of relLines) {
              const cleanLine = relLine.replace(/^[-*\s]+/, "").trim();
              if (!cleanLine) continue;

              const match = cleanLine.match(/^(?:与)?([^\s：:-]+)[\s：:-]+(.+)$/);
              if (match) {
                let target = match[1].trim();
                target = target.replace(/（[^）]+）/g, "").replace(/\([^\)]+\)/g, "").replace(/['"“”]/g, "").trim();
                relationships.push({
                  target,
                  type: match[2].trim()
                });
              }
            }
          }
        }

        parsedList.push({
          name,
          tier,
          tags,
          contrast,
          bio,
          relationships
        });
      }

      if (parsedList.length === 0) {
        throw new Error("未能识别到符合标准格式的角色。请确保复制的内容包含 tier、name 等属性前导配置（由 --- 分隔），以及 ## Core_Tags 等格式标题。");
      }

      // Duplication checking
      const duplicates = parsedList.filter((c: any) =>
        nodes.some(n => n.name.trim() === c.name.trim())
      );
      const uniques = parsedList.filter((c: any) =>
        !nodes.some(n => n.name.trim() === c.name.trim())
      );

      setBatchCharacters(parsedList);
      setBatchDuplicates(duplicates.map((c: any) => c.name));
      setBatchUniques(uniques);
      setIsBatchImport(true);

    } catch (err: any) {
      setFormError(err.message || "解析时发生异常");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormError("");
    setUploadedFileName(file.name);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const fileContent = event.target?.result as string;
      if (!fileContent || !fileContent.trim()) {
        setFormError("上传的文件为空文件");
        setIsParsing(false);
        setUploadedFileName(null);
        return;
      }
      await parseContent(fileContent);
    };

    reader.onerror = () => {
      setFormError("读取文件失败");
      setIsParsing(false);
      setUploadedFileName(null);
    };

    reader.readAsText(file);
  };

  const handlePasteParse = async () => {
    if (!pastedText.trim()) {
      setFormError("请先粘贴角色描述文本");
      return;
    }
    await parseContent(pastedText);
  };

  // Handle Character Creation
  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBatchImport) {
      if (batchUniques.length === 0) return;

      setSubmitting(true);
      setFormError("");

      try {
        const uploadPromises = batchUniques.map(async (char) => {
          const tierSubfolder = char.tier === "minor" ? "次要角色" : "主要角色";
          const targetPath = joinFilePath(cwd, `books/${bookId}/story/roles/${tierSubfolder}/${char.name}.md`);
          const encoded = encodeFilePathForApi(targetPath);

          const tagsText = (char.tags || []).join(", ");
          const relText = char.relationships && char.relationships.length > 0
            ? char.relationships.map((r: any) => `- 与${r.target}：${r.type}`).join("\n")
            : "- 主角: 关系描述";

          const markdownContent = `---
tier: ${char.tier || "major"}
name: ${char.name}
---
## Core_Tags
${tagsText || "性格标签1, 标签2"}

## Contrast_Detail
${char.contrast ? char.contrast.trim() : "人物矛盾冲突与反差细节描写"}

## Back_Story
${char.bio ? char.bio.trim() : "这里写人物的背景故事与生平小传..."}

## Relationship_Network
${relText}
`;

          const res = await fetch(`/api/files/${encoded}`, {
            method: "POST",
            body: new TextEncoder().encode(markdownContent)
          });

          if (!res.ok) {
            throw new Error(`保存角色 ${char.name} 失败`);
          }
        });

        await Promise.all(uploadPromises);

        // Success
        setIsCreateModalOpen(false);
        handleClearUpload();

        // Reload list
        await loadGraphData();

        // Select the first new node
        if (batchUniques.length > 0) {
          setSelectedNodeId(batchUniques[0].name);
        }

        // Refresh Left Sidebar FileExplorer
        window.dispatchEvent(new Event("refresh-explorer"));

      } catch (err: any) {
        setFormError(err.message || "批量创建角色时发生异常");
      } finally {
        setSubmitting(false);
      }

    } else {
      const name = newName.trim();
      if (!name) return;

      // Check duplicate
      if (nodes.some(n => n.name === name)) {
        setFormError("该角色姓名已存在");
        return;
      }

      setSubmitting(true);
      setFormError("");

      const tierSubfolder = newTier === "major" ? "主要角色" : "次要角色";
      const targetPath = joinFilePath(cwd, `books/${bookId}/story/roles/${tierSubfolder}/${name}.md`);

      // Format Markdown Content
      const parsedTags = newTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
      const tagsText = parsedTags.join(", ");
      const markdownContent = `---
tier: ${newTier}
name: ${name}
---
## Core_Tags
${tagsText || "性格标签1, 标签2"}

## Contrast_Detail
${newContrast.trim() || "人物矛盾冲突与反差细节描写"}

## Back_Story
这里写人物的背景故事与生平小传...

## Relationship_Network
- 主角: 关系描述
`;

      try {
        const encoded = encodeFilePathForApi(targetPath);
        const res = await fetch(`/api/files/${encoded}`, {
          method: "POST",
          body: new TextEncoder().encode(markdownContent)
        });

        if (!res.ok) {
          throw new Error("保存文件失败");
        }

        // Success
        setIsCreateModalOpen(false);
        setNewName("");
        setNewTier("major");
        setNewTags("");
        setNewContrast("");

        // Reload list
        await loadGraphData();

        // Select the new node
        setSelectedNodeId(name);

        // Refresh Left Sidebar FileExplorer
        window.dispatchEvent(new Event("refresh-explorer"));

      } catch (err: any) {
        setFormError(err.message || "创建角色时发生异常");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleToggleTier = async (node: Node, newTier: "major" | "minor") => {
    if (node.tier === newTier) return;

    setSubmitting(true);
    setFormError("");

    try {
      // 1. Read existing content
      const oldEncoded = encodeFilePathForApi(node.filePath);
      const readRes = await fetch(`/api/files/${oldEncoded}?type=read`);
      if (!readRes.ok) throw new Error("读取原有角色卡失败");
      const { content } = await readRes.json();

      // 2. Modify frontmatter tier
      let updatedContent = content;
      const fmMatch = content.match(/^---([\s\S]*?)---/);
      if (fmMatch) {
        const fmContent = fmMatch[1];
        let updatedFm = fmContent;
        if (fmContent.includes("tier:")) {
          updatedFm = fmContent.replace(/(tier\s*:\s*)(major|minor)/, `$1${newTier}`);
        } else {
          updatedFm = `tier: ${newTier}\n` + fmContent;
        }
        updatedContent = `---${updatedFm}---` + content.substring(fmMatch[0].length);
      } else {
        // No frontmatter? Insert one
        updatedContent = `---\ntier: ${newTier}\nname: ${node.name}\n---\n` + content;
      }

      // 3. Save to new path
      const targetSubfolder = newTier === "major" ? "主要角色" : "次要角色";
      const newPath = joinFilePath(cwd, `books/${bookId}/story/roles/${targetSubfolder}/${node.name}.md`);
      const newEncoded = encodeFilePathForApi(newPath);

      const writeRes = await fetch(`/api/files/${newEncoded}`, {
        method: "POST",
        body: new TextEncoder().encode(updatedContent)
      });
      if (!writeRes.ok) throw new Error("保存新角色卡文件失败");

      // 4. Delete old file
      const deleteRes = await fetch(`/api/files/${oldEncoded}`, {
        method: "DELETE"
      });
      if (!deleteRes.ok) {
        console.warn("删除旧人设文件失败，可能导致副本残留");
      }

      // 5. Update UI
      await loadGraphData();

      // Keep selection on the same character name
      setSelectedNodeId(node.name);

      // Refresh Left Sidebar FileExplorer
      window.dispatchEvent(new Event("refresh-explorer"));

    } catch (err: any) {
      setFormError(err.message || "切换主要/次要等级失败");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter list by search query
  const filteredNodes = nodes.filter(n => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      n.name.toLowerCase().includes(query) ||
      n.tags.some(tag => tag.toLowerCase().includes(query)) ||
      (n.tier === "major" ? "主要角色" : "次要角色").includes(query)
    );
  });

  const activeNode = nodes.find(n => n.id === selectedNodeId) ?? null;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "var(--bg)",
        color: "var(--text)",
        overflow: "hidden",
        fontFamily: "var(--font-serif)"
      }}
    >
      {/* Left Area: Character List */}
      <div
        style={{
          width: 300,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "var(--bg-panel)"
        }}
      >
        {/* Header and Search */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span>👥</span> 角色人设一览
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setNewName("");
                  setNewTier("major");
                  setNewTags("");
                  setNewContrast("");
                  setFormError("");
                  handleClearUpload();
                  setIsCreateModalOpen(true);
                }}
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  color: "#818cf8",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontWeight: 600
                }}
              >
                <span>➕</span> 创建
              </button>
              <button
                onClick={loadGraphData}
                title="重新加载设定"
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  gap: 3
                }}
              >
                <span>🔄</span> 刷新
              </button>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="搜索姓名、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 12px 6px 28px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text)",
                outline: "none",
                transition: "border-color 0.15s ease"
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-dim)" }}>
              🔍
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 10
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list container */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", flexDirection: "column", gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
              </svg>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>载入中...</span>
            </div>
          )}

          {!loading && filteredNodes.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              {searchQuery ? "未找到匹配角色" : "暂无角色数据"}
            </div>
          )}

          {!loading && filteredNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const avatarColor = node.tier === "major"
              ? { bg: "rgba(99, 102, 241, 0.08)", border: "#818cf8", color: "#6366f1" }
              : { bg: "rgba(16, 185, 129, 0.06)", border: "#34d399", color: "#10b981" };

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  marginBottom: "8px",
                  borderRadius: "8px",
                  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  background: isSelected ? "rgba(99, 102, 241, 0.03)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: isSelected ? "0 2px 8px rgba(99, 102, 241, 0.08)" : "none"
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }
                }}
              >
                {/* Initial Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "700",
                    fontSize: 12,
                    background: avatarColor.bg,
                    border: `1.2px solid ${isSelected ? "var(--accent)" : avatarColor.border}`,
                    color: isSelected ? "var(--accent)" : avatarColor.color,
                    flexShrink: 0,
                    boxShadow: isSelected ? `0 0 6px ${avatarColor.border}30` : "none",
                    transition: "all 0.2s"
                  }}
                >
                  {node.name.slice(0, 1)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {node.name}
                    </span>
                    <span
                      style={{
                        fontSize: "8.5px",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        fontWeight: 600,
                        background: node.tier === "major" ? "rgba(99, 102, 241, 0.08)" : "rgba(16, 185, 129, 0.08)",
                        color: node.tier === "major" ? "#818cf8" : "#34d399",
                        flexShrink: 0
                      }}
                    >
                      {node.tier === "major" ? "主要" : "次要"}
                    </span>
                  </div>
                  {/* Tag preview */}
                  {node.tags.length > 0 && (
                    <div style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                      {node.tags.map(t => `#${t}`).join(" ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Area: Wide Detailed Settings Viewer */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg)"
        }}
      >
        {activeNode ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Scrollable details wrapper */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
              {/* Document Container */}
              <div style={{ maxWidth: 800, margin: "0 auto" }}>
                {/* Detail Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text)", fontFamily: "var(--font-serif)" }}>
                      {activeNode.name}
                    </h1>
                    <select
                      value={activeNode.tier}
                      onChange={(e) => handleToggleTier(activeNode, e.target.value as "major" | "minor")}
                      disabled={submitting}
                      title="点击修改角色等级（主要/次要）"
                      style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: 600,
                        background: activeNode.tier === "major" ? "rgba(99, 102, 241, 0.08)" : "rgba(16, 185, 129, 0.08)",
                        color: activeNode.tier === "major" ? "#818cf8" : "#34d399",
                        border: `1px solid ${activeNode.tier === "major" ? "#818cf833" : "#34d39933"}`,
                        cursor: submitting ? "not-allowed" : "pointer",
                        outline: "none",
                        fontFamily: "var(--font-serif)",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        appearance: "none",
                      }}
                    >
                      <option value="major" style={{ background: "var(--bg-panel)", color: "#818cf8" }}>主要角色设定卡 ▾</option>
                      <option value="minor" style={{ background: "var(--bg-panel)", color: "#34d399" }}>次要角色设定卡 ▾</option>
                    </select>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {activeNode.name}.md
                  </div>
                </div>

                {/* Tag Pills */}
                {activeNode.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                    {activeNode.tags.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "10px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "var(--bg-panel)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border)",
                          fontFamily: "var(--font-mono)"
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Contrast Detail Callout */}
                {activeNode.contrast && (
                  <div
                    style={{
                      padding: "14px 18px",
                      background: "rgba(245, 158, 11, 0.04)",
                      borderLeft: "4px solid #f59e0b",
                      borderRadius: "0 8px 8px 0",
                      fontSize: "12px",
                      lineHeight: 1.6,
                      marginBottom: 24,
                      color: "var(--text)"
                    }}
                  >
                    <strong style={{ display: "block", color: "#f59e0b", marginBottom: 6, fontSize: "11px", letterSpacing: "0.03em" }}>
                      🎭 立体反差维度设计 (Contrast Detail)
                    </strong>
                    {activeNode.contrast}
                  </div>
                )}

                {/* Biography & Settings */}
                <div style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: "13px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", paddingBottom: 6, margin: "0 0 12px 0" }}>
                    📖 经历设定与背景 (Biography)
                  </h3>
                  <div className="markdown-preview" style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.7 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeNode.bio}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Relationships */}
                {activeNode.relationships.length > 0 && (
                  <div style={{ marginTop: 28, marginBottom: 40 }}>
                    <h3 style={{ fontSize: "13px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", paddingBottom: 6, margin: "0 0 12px 0" }}>
                      🔗 关联人际网络 (Relationships)
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                      {activeNode.relationships.map((rel, i: number) => {
                        const relNode = nodes.find(n => n.name === rel.target || n.name === rel.target.replace(/^\*+|\*+$/g, "").replace(/^与|^对|^和/, "").trim());
                        const cleanTarget = rel.target.replace(/^\*+|\*+$/g, "");
                        return (
                          <div
                            key={i}
                            onClick={() => relNode && setSelectedNodeId(relNode.id)}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: 6,
                              padding: "12px 16px",
                              background: "var(--bg-panel)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              cursor: relNode ? "pointer" : "default",
                              transition: "all 0.15s"
                            }}
                            onMouseEnter={(e) => {
                              if (relNode) {
                                e.currentTarget.style.borderColor = "var(--accent)";
                                e.currentTarget.style.background = "var(--bg-hover)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (relNode) {
                                e.currentTarget.style.borderColor = "var(--border)";
                                e.currentTarget.style.background = "var(--bg-panel)";
                              }
                            }}
                          >
                            <span style={{ fontSize: "12px", fontWeight: 700, color: relNode ? "var(--text)" : "var(--text-dim)", textDecoration: relNode ? "underline" : "none" }}>
                              {cleanTarget}
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                              {rel.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Footer - Centered Edit Button */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
                background: "var(--bg-panel)",
                display: "flex",
                justifyContent: "center"
              }}
            >
              <button
                onClick={() => {
                  onOpenFile(activeNode.filePath, `${activeNode.name}.md`);
                }}
                style={{
                  width: "min(320px, 100%)",
                  padding: "8px 0",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-selected)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg)"; }}
              >
                <span>✏️</span> 编辑人设文件
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              padding: 24,
              textAlign: "center",
              gap: 8
            }}
          >
            <span style={{ fontSize: 36 }}>👥</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>请选择一个人物</div>
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
              点击左侧列表中的人物，即可在此处查看该角色的具体设定、核心标签及矛盾维度。
            </p>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isCreateModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(4px)"
          }}
          onClick={() => {
            setIsCreateModalOpen(false);
            handleClearUpload();
          }}
        >
          <div
            style={{
              width: "min(420px, 90%)",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              gap: 16
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                ➕ 创建新角色人设卡
              </h3>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                可通过手动填写，或上传 MD/TXT 文件由 AI 自动解析并导入角色设定。
              </p>
            </div>

            {formError && (
              <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 6, color: "#ef4444", fontSize: 11 }}>
                ⚠️ {formError}
              </div>
            )}

            {/* Import Mode Tabs (only when not parsed or parsing) */}
            {!isBatchImport && !isParsing && (
              <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setImportMode("paste")}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    background: importMode === "paste" ? "var(--bg-selected)" : "none",
                    border: "1px solid " + (importMode === "paste" ? "var(--accent)" : "var(--border)"),
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: importMode === "paste" ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer"
                  }}
                >
                  📋 粘贴文本导入
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode("file")}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    background: importMode === "file" ? "var(--bg-selected)" : "none",
                    border: "1px solid " + (importMode === "file" ? "var(--accent)" : "var(--border)"),
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: importMode === "file" ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer"
                  }}
                >
                  📁 上传文件导入
                </button>
              </div>
            )}

            {/* Import Controls (only when not parsed or parsing) */}
            {!isBatchImport && !isParsing && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {importMode === "file" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>选择人设文档 (.md 或 .txt)</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="file"
                        accept=".md,.txt"
                        disabled={isParsing || submitting}
                        onChange={handleFileUpload}
                        id="char-file-upload"
                        style={{ display: "none" }}
                      />
                      <label
                        htmlFor="char-file-upload"
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          background: "var(--bg)",
                          border: "1px dashed var(--border)",
                          borderRadius: 6,
                          fontSize: 11,
                          color: "var(--text-muted)",
                          cursor: (isParsing || submitting) ? "not-allowed" : "pointer",
                          textAlign: "center",
                          transition: "all 0.15s"
                        }}
                        onMouseEnter={(e) => { if (!isParsing && !submitting) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; } }}
                        onMouseLeave={(e) => { if (!isParsing && !submitting) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; } }}
                      >
                        {uploadedFileName ? `📄 ${uploadedFileName}` : "选择或拖入包含角色的人设文件..."}
                      </label>
                      {uploadedFileName && (
                        <button
                          type="button"
                          onClick={handleClearUpload}
                          disabled={submitting}
                          style={{
                            padding: "7px 12px",
                            background: "none",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 11,
                            color: "#ef4444",
                            cursor: "pointer"
                          }}
                        >
                          清除
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>粘贴你在写作伴侣中起草/转换好的 Markdown 设定内容</label>
                    <textarea
                      placeholder="在这里粘贴人设文本，支持单个或多个角色连同其标签、反差、小传、关系网内容..."
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      rows={5}
                      disabled={isParsing || submitting}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "var(--text)",
                        outline: "none",
                        resize: "none",
                        fontFamily: "var(--font-mono)"
                      }}
                    />
                    <button
                      type="button"
                      onClick={handlePasteParse}
                      disabled={isParsing || submitting || !pastedText.trim()}
                      style={{
                        padding: "8px 16px",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: (isParsing || submitting || !pastedText.trim()) ? "not-allowed" : "pointer",
                        opacity: (isParsing || submitting || !pastedText.trim()) ? 0.6 : 1,
                        textAlign: "center"
                      }}
                    >
                      🪄 开始 AI 自动解析与提取
                    </button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleCreateCharacter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {isParsing ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", flexDirection: "column", gap: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                  </svg>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>AI 正在解析和提取设定中，请稍候...</span>
                </div>
              ) : isBatchImport ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                      🎉 AI 解析成功！共 {batchCharacters.length} 个角色：
                    </span>
                    <button
                      type="button"
                      onClick={handleClearUpload}
                      disabled={submitting}
                      style={{
                        padding: "3px 8px",
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: 5,
                        fontSize: 10,
                        color: "#ef4444",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      清除并重试
                    </button>
                  </div>
                  
                  <div style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    background: "var(--bg)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6
                  }}>
                    {batchCharacters.map((char, index) => {
                      const isDuplicate = batchDuplicates.includes(char.name);
                      return (
                        <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{
                            fontWeight: 600,
                            textDecoration: isDuplicate ? "line-through" : "none",
                            color: isDuplicate ? "var(--text-dim)" : "var(--text)"
                          }}>
                            {char.name} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 10 }}>({char.tier === "minor" ? "次要" : "主要"})</span>
                          </span>
                          <span style={{
                            fontSize: 9,
                            padding: "1px 4px",
                            borderRadius: 3,
                            fontWeight: 600,
                            background: isDuplicate ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                            color: isDuplicate ? "#ef4444" : "#10b981"
                          }}>
                            {isDuplicate ? "已存在，将跳过" : "新角色"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                    ⚠️ 提示：系统将自动跳过重名角色。点击下方“确认创建”开始导入 <strong>{batchUniques.length}</strong> 个新角色设定文件。
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>姓名 (必填)</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="例如：林动"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "var(--text)",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>角色等级</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "var(--text)" }}>
                        <input
                          type="radio"
                          name="tier"
                          checked={newTier === "major"}
                          onChange={() => setNewTier("major")}
                        />
                        主要角色 (主角)
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "var(--text)" }}>
                        <input
                          type="radio"
                          name="tier"
                          checked={newTier === "minor"}
                          onChange={() => setNewTier("minor")}
                        />
                        次要角色 (普通配角)
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>核心标签 (选填)</label>
                    <input
                      type="text"
                      placeholder="例如：冷静, 坚毅, 剑客 (逗号隔开)"
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "var(--text)",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>反差设计 (选填)</label>
                    <textarea
                      placeholder="例如：冷酷的外表下有着极其细腻的心思..."
                      value={newContrast}
                      onChange={(e) => setNewContrast(e.target.value)}
                      rows={3}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "var(--text)",
                        outline: "none",
                        resize: "none",
                        fontFamily: "inherit"
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    handleClearUpload();
                  }}
                  disabled={submitting}
                  style={{
                    padding: "6px 14px",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    cursor: submitting ? "not-allowed" : "pointer"
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || isParsing || (isBatchImport ? batchUniques.length === 0 : !newName.trim())}
                  style={{
                    padding: "6px 14px",
                    background: (submitting || isParsing || (isBatchImport ? batchUniques.length === 0 : !newName.trim())) ? "var(--bg-hover)" : "var(--accent)",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    color: (submitting || isParsing || (isBatchImport ? batchUniques.length === 0 : !newName.trim())) ? "var(--text-dim)" : "#ffffff",
                    fontWeight: 600,
                    cursor: (submitting || isParsing || (isBatchImport ? batchUniques.length === 0 : !newName.trim())) ? "not-allowed" : "pointer"
                  }}
                >
                  {submitting ? "创建中..." : "确认创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
