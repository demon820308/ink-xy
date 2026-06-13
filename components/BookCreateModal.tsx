"use client";

import React, { useState, useEffect, useRef } from "react";
import { encodeFilePathForApi } from "@/lib/file-paths";

interface Genre {
  id: string;
  name: string;
  source: string;
  profile?: {
    language?: string;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  onCreated: (newBookId: string) => void;
  availableBooks: string[];
  dynamicGenres: Genre[];
}

export default function BookCreateModal({
  isOpen,
  onClose,
  cwd,
  onCreated,
  availableBooks,
  dynamicGenres,
}: Props) {
  // Form States
  const [bookTitle, setBookTitle] = useState("");
  const [bookGenre, setBookGenre] = useState("xuanhuan");
  const [bookPlatform, setBookPlatform] = useState("tomato");
  const [bookBrief, setBookBrief] = useState("");
  const [bookCanonSource, setBookCanonSource] = useState("");

  // Fanfic States
  const [fanficMode, setFanficMode] = useState<"canon" | "au" | "ooc" | "cp">("canon");
  const [fanficSource, setFanficSource] = useState("");

  // Local file detection states
  const [detectedFramework, setDetectedFramework] = useState<{ name: string; fullPath: string } | null>(null);
  const [detectedCharacter, setDetectedCharacter] = useState<{ name: string; fullPath: string } | null>(null);
  const [useFramework, setUseFramework] = useState(true);
  const [useCharacter, setUseCharacter] = useState(true);

  // Status/Loading States
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [bookCreateProgressText, setBookCreateProgressText] = useState("");
  const [bookCreateLogs, setBookCreateLogs] = useState<string[]>([]);
  const [createSuccessInfo, setCreateSuccessInfo] = useState<{ bookId: string; title: string } | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  const consoleRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of terminal console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [bookCreateLogs]);

  // Scan for framework and character files when modal opens
  useEffect(() => {
    if (!isOpen) {
      setDetectedFramework(null);
      setDetectedCharacter(null);
      setUseFramework(true);
      setUseCharacter(true);
      return;
    }
    if (!cwd) return;

    const scanLocalFiles = async () => {
      try {
        let fw: { name: string; fullPath: string } | null = null;
        let char: { name: string; fullPath: string } | null = null;

        // De-duplicate directories to avoid case-insensitive duplication on Windows
        const directoriesToCheck = [
          { name: "根目录", path: cwd },
          { name: "Temp", path: `${cwd}/Temp` },
          { name: "temp", path: `${cwd}/temp` }
        ].filter((dir, idx, self) => {
          return self.findIndex(d => d.path.toLowerCase().replace(/\\/g, "/") === dir.path.toLowerCase().replace(/\\/g, "/")) === idx;
        });

        const frameworkNames = ["novel_framework_v2.md", "novel_framework.md", "novel-framework.md", "架构.md", "构架.md"];
        const characterNames = ["character_profiles.md", "character-profiles.md", "character.md", "人设.md"];

        for (const dirInfo of directoriesToCheck) {
          try {
            const res = await fetch(`/api/files/${encodeFilePathForApi(dirInfo.path)}?type=list&check=true`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.exists === false) continue;
            if (data.entries) {
              if (!fw) {
                const found = data.entries.find((e: { name: string; isDir: boolean }) => !e.isDir && frameworkNames.includes(e.name.toLowerCase()));
                if (found) {
                  fw = {
                    name: found.name,
                    fullPath: `${dirInfo.path}/${found.name}`
                  };
                }
              }
              if (!char) {
                const found = data.entries.find((e: { name: string; isDir: boolean }) => !e.isDir && characterNames.includes(e.name.toLowerCase()));
                if (found) {
                  char = {
                    name: found.name,
                    fullPath: `${dirInfo.path}/${found.name}`
                  };
                }
              }
            }
          } catch {
            // ignore folder read failures
          }
        }
        
        setDetectedFramework(fw);
        setDetectedCharacter(char);
      } catch (e) {
        console.error("Failed to scan local framework/character files:", e);
      }
    };
    
    scanLocalFiles();
  }, [isOpen, cwd]);

  if (!isOpen) return null;

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) {
      setBookError("书籍名称不能为空");
      return;
    }
    if (!cwd) return;

    setIsCreatingBook(true);
    setBookError(null);
    setBookCreateLogs([]);
    setBookCreateProgressText("正在为您分析题材并生成初始大纲，请稍候...");

    try {
      const isFanficGenre = bookGenre === "fanfic";
      if (isFanficGenre && !fanficSource.trim()) {
        throw new Error("同人小说原作素材磁盘路径不能为空");
      }

      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isFanficGenre ? "fanfic-init" : "book-create",
          cwd,
          args: isFanficGenre ? {
            title: bookTitle.trim(),
            from: fanficSource.trim(),
            mode: fanficMode,
            genre: "fanfic",
            platform: bookPlatform,
            json: true,
          } : {
            title: bookTitle.trim(),
            genre: bookGenre,
            platform: bookPlatform,
            brief: bookBrief.trim() || undefined,
            selectedFrameworkPath: (detectedFramework && useFramework) ? detectedFramework.fullPath : undefined,
            selectedCharacterPath: (detectedCharacter && useCharacter) ? detectedCharacter.fullPath : undefined,
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
              const text = chunk.data || "";
              setBookCreateLogs((prev) => [...prev, text]);

              if (text.includes("生成基础设定") || text.includes("generating foundation")) {
                setBookCreateProgressText("正在为您构思并起草世界观/角色人设设定...");
              } else if (text.includes("保存书籍配置") || text.includes("saving book config")) {
                setBookCreateProgressText("正在落盘书籍配置参数...");
              } else if (text.includes("写入基础设定文件") || text.includes("writing foundation files")) {
                setBookCreateProgressText("正在保存大纲结构与角色卡片...");
              } else if (text.includes("初始化控制文档") || text.includes("initializing control documents")) {
                setBookCreateProgressText("正在构建写作控制台数据...");
              } else if (text.includes("创建初始快照") || text.includes("creating initial snapshot")) {
                setBookCreateProgressText("正在为当前创作宇宙创建创世快照...");
              } else if (text.includes("导入同人正典") || text.includes("importing fanfic canon")) {
                setBookCreateProgressText("正在解析并分析导入的同人原作素材...");
              } else if (text.includes("生成同人基础设定") || text.includes("generating fanfic foundation")) {
                setBookCreateProgressText("正在起草同人专属世界观设定...");
              } else if (text.includes("提取原作风格指纹") || text.includes("extracting source style fingerprint")) {
                setBookCreateProgressText("正在分析并提取原作风格与文风指纹...");
              } else if (text.includes("reviewing foundation") || text.includes("审核基础设定")) {
                const roundMatch = text.match(/(?:round|第)\s*(\d+)/i);
                const roundNum = roundMatch ? roundMatch[1] : "1";
                setBookCreateProgressText(`AI 协同审核员正在审查设定质量与一致性（第 ${roundNum} 轮）...`);
              } else if (text.includes("streaming") || text.includes("生成中")) {
                setBookCreateProgressText("AI 架构师思维涌动，正在为您撰写大纲与设定档案...");
              }
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch {
            setBookCreateLogs((prev) => [...prev, line + "\n"]);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {
          setBookCreateLogs((prev) => [...prev, buffer + "\n"]);
        }
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "创建书籍失败，大模型生成异常，请检查配置和 Key");
      }

      const stdout = finalResult?.stdout || "";
      let createdBookId: string | undefined;
      const matchZh = stdout.match(/已创建书籍：([a-zA-Z0-9_-]+)/);
      const matchEn = stdout.match(/Book created:\s*([a-zA-Z0-9_-]+)/);
      if (matchZh) {
        createdBookId = matchZh[1];
      } else if (matchEn) {
        createdBookId = matchEn[1];
      }

      if (!createdBookId && stdout.includes("{")) {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.bookId) {
            createdBookId = parsed.bookId;
          }
        } catch {}
      }

      if (bookCanonSource && createdBookId) {
        setBookCreateProgressText("正在继承前作/世界观设定 (import-canon)...");
        try {
          const canonRes = await fetch("/api/inkos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "import-canon",
              cwd,
              args: {
                bookId: createdBookId,
                from: bookCanonSource,
                json: true
              }
            })
          });
          if (!canonRes.ok) {
            const errText = await canonRes.text();
            console.error("Failed to import canon:", errText);
            setBookCreateLogs((prev) => [...prev, `[Warning] 继承世界观设定失败: ${errText}`]);
          } else {
            setBookCreateLogs((prev) => [...prev, `[Success] 已成功自书籍 ${bookCanonSource} 继承世界观设定！`]);
          }
        } catch (errCanon) {
          console.error("Error importing canon:", errCanon);
        }
      }

      const finalId = createdBookId || "unknown";
      setCreateSuccessInfo({
        bookId: finalId,
        title: bookTitle.trim()
      });
      
      onCreated(finalId);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setBookError(errMsg || "创建书籍失败，请确认侧边栏左下角 Models 中 API Key 填写正确且模型支持当前题材生成。");
    } finally {
      setIsCreatingBook(false);
    }
  };

  const handleCloseSuccess = () => {
    setBookTitle("");
    setBookBrief("");
    setFanficSource("");
    setBookCanonSource("");
    setCreateSuccessInfo(null);
    onClose();
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        width: "min(480px, 90vw)",
        padding: "20px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        fontFamily: "var(--font-serif)",
      }}>
        <h3 style={{
          margin: "0 0 16px",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          paddingBottom: "10px",
        }}>
          <span>📚</span>
          <span>创建新小说书籍 (Create Book)</span>
        </h3>
        
        {createSuccessInfo ? (
          <div style={{ padding: "10px 10px", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🎉</div>
            <h4 style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text)",
              margin: "0 0 10px",
            }}>
              书籍创建成功！
            </h4>
            <p style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              lineHeight: 1.6,
              margin: "0 0 20px",
              padding: "0 10px"
            }}>
              新书 <strong style={{ color: "var(--accent)" }}>《{createSuccessInfo.title}》</strong> 已成功初始化完毕，并已自动切换为当前活跃书籍。<br/>
              现在您可以前往侧边栏开始管理该书的大纲、角色卡片与世界观法则。
            </p>
            <div style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "10px 12px",
              fontSize: "11px",
              color: "var(--text-muted)",
              lineHeight: 1.5,
              textAlign: "left",
              marginBottom: "20px"
            }}>
              <strong>已初始化的设定包括：</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                <li>分卷与分章大纲基本脉络</li>
                <li>主要核心人物设定卡片</li>
                <li>世界观底层规则要素</li>
              </ul>
            </div>
            <div style={{ display: "flex", justifyContent: "center", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <button
                type="button"
                onClick={handleCloseSuccess}
                style={{
                  padding: "6px 24px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
              >
                确定
              </button>
            </div>
          </div>
        ) : isCreatingBook ? (
          <div style={{ padding: "20px 10px", textAlign: "center" }}>
            <div style={{
              width: "36px",
              height: "36px",
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }} />
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8, fontSize: "13px" }}>
              正在生成创作宇宙基础设定...
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.6, maxWidth: "400px", margin: "0 auto 12px" }}>
              AI 架构师正在分析题材大纲，并自动构建卷大纲、角色设定卡片与世界观法则，请耐心等待。
            </div>

            {bookCreateProgressText && (
              <div style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--accent)",
                margin: "12px auto",
                padding: "6px 12px",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                maxWidth: "400px",
                display: "inline-block"
              }}>
                🎯 {bookCreateProgressText}
              </div>
            )}

            <div 
              ref={consoleRef}
              style={{
                background: "#121214",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "12px",
                height: "180px",
                overflowY: "auto",
                textAlign: "left",
                fontFamily: "var(--font-mono), monospace",
                fontSize: "11px",
                lineHeight: "1.5",
                color: "#e4e4e7",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                marginTop: "16px",
              }}
            >
              {bookCreateLogs.length === 0 ? (
                <span style={{ color: "var(--text-dim)" }}>正在启动 AI 协同规划引擎...</span>
              ) : (
                bookCreateLogs.map((log, index) => (
                  <div key={index} style={{ marginBottom: 2 }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateBook}>
            {bookError && (
              <div style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "6px",
                padding: "10px",
                color: "#ef4444",
                fontSize: "11px",
                marginBottom: "16px",
                lineHeight: 1.5,
              }}>
                ⚠️ {bookError}
              </div>
            )}

            {(detectedFramework || detectedCharacter) ? (
              <div style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                fontSize: "12px",
              }}>
                <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "8px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🔍 检测到本地创作设定，请选择是否作为新书创建基础：</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detectedFramework && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={useFramework}
                        onChange={(e) => setUseFramework(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      <span>小说框架：<code style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>{detectedFramework.name}</code></span>
                    </label>
                  )}
                  {detectedCharacter && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={useCharacter}
                        onChange={(e) => setUseCharacter(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      <span>角色人设：<code style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>{detectedCharacter.name}</code></span>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div style={{
                background: "var(--bg-panel)",
                border: "1px dashed var(--border)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                fontSize: "11px",
                lineHeight: 1.6,
                color: "var(--text-muted)",
              }}>
                <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "6px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>💡 创作建议与提示</span>
                </div>
                当前未检测到本地的「小说框架」或「角色人设」设定文件。您可以：
                <ul style={{ margin: "4px 0 0", paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <li><strong>直接创建书卷</strong>：忽略此提示，系统将自动为您构思并生成初始的世界观与角色人设。</li>
                  <li><strong>AI 协同起草</strong>：先关闭此窗口，用左侧的<strong>「AI写作伴侣」</strong>来共同探讨并起草您的框架与人设设定，保存后再行创建。</li>
                </ul>
              </div>
            )}
            
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                小说书名 (Title)
              </label>
              <input
                type="text"
                required
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                placeholder="例如：万古大帝"
                style={{
                  width: "100%",
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
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                    小说题材 (Genre)
                  </label>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent("trigger-genres-config"))}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontSize: "11px",
                      color: "var(--accent)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2px"
                    }}
                  >
                    ⚙️ 题材管理
                  </button>
                </div>
                <select
                  value={bookGenre}
                  onChange={(e) => setBookGenre(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "12px",
                    outline: "none",
                  }}
                >
                  {(() => {
                    const BUILTIN_GENRE_IDS = new Set([
                      "xuanhuan", "xianxia", "urban", "horror", "other", "litrpg",
                      "progression", "cozy", "cultivation", "dungeon-core", "isekai",
                      "romantasy", "sci-fi", "system-apocalypse", "tower-climber"
                    ]);
                    const hasDynamic = dynamicGenres && dynamicGenres.length > 0;
                    if (hasDynamic) {
                      const zhGenres = dynamicGenres.filter(g => g.profile?.language === "zh" && BUILTIN_GENRE_IDS.has(g.id) && g.id !== "other");
                      const enGenres = dynamicGenres.filter(g => g.profile?.language === "en" && BUILTIN_GENRE_IDS.has(g.id));
                      const customGenres = dynamicGenres.filter(g => !BUILTIN_GENRE_IDS.has(g.id) && g.id !== "fanfic");
                      const otherGenreObj = dynamicGenres.find(g => g.id === "other");

                      return (
                        <>
                          <optgroup label="中文网文题材 (Chinese Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                            {zhGenres.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.id.toUpperCase()}){g.source === "project" ? " *[已修改]" : ""}
                              </option>
                            ))}
                            {otherGenreObj && (
                              <option value="other">
                                {otherGenreObj.name} ({otherGenreObj.id.toUpperCase()}){otherGenreObj.source === "project" ? " *[已修改]" : ""}
                              </option>
                            )}
                          </optgroup>
                          <optgroup label="英文原生题材 (English Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                            {enGenres.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.id.toUpperCase()}){g.source === "project" ? " *[已修改]" : ""}
                              </option>
                            ))}
                          </optgroup>
                          {customGenres.length > 0 && (
                            <optgroup label="自定义专属题材 (Custom Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                              {customGenres.map(g => (
                                <option key={g.id} value={g.id}>
                                  {g.name} ({g.id})
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="特殊创作模式 (Special Modes)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                            <option value="fanfic">同人创作 (Fanfic)</option>
                          </optgroup>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <optgroup label="中文网文题材 (Chinese Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                            <option value="xuanhuan">玄幻奇幻 (Xuanhuan)</option>
                            <option value="xianxia">仙侠修真 (Xianxia)</option>
                            <option value="urban">都市异能 (Urban)</option>
                            <option value="horror">悬疑恐怖 (Horror)</option>
                            <option value="other">其它通用 (Other)</option>
                          </optgroup>
                          <optgroup label="英文原生题材 (English Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                            <option value="litrpg">数据无限流/系统流 (LitRPG)</option>
                            <option value="progression">升级流奇幻 (Progression Fantasy)</option>
                            <option value="cozy">温馨奇幻 (Cozy Fantasy)</option>
                            <option value="cultivation">英文修真 (English Cultivation)</option>
                            <option value="dungeon-core">地下城核心流 (Dungeon Core)</option>
                            <option value="isekai">异世界穿梭 (Isekai / Portal Fantasy)</option>
                            <option value="romantasy">浪漫奇幻 (Romantasy)</option>
                            <option value="sci-fi">科学幻想 (Science Fiction)</option>
                            <option value="system-apocalypse">系统废土流 (System Apocalypse)</option>
                            <option value="tower-climber">爬塔闯关流 (Tower Climbing)</option>
                          </optgroup>
                          <optgroup label="特殊创作模式 (Special Modes)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                            <option value="fanfic">同人创作 (Fanfic)</option>
                          </optgroup>
                        </>
                      );
                    }
                  })()}
                </select>
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                  目标平台 (Platform)
                </label>
                <select
                  value={bookPlatform}
                  onChange={(e) => setBookPlatform(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "12px",
                    outline: "none",
                  }}
                >
                  <option value="tomato">番茄小说 (Tomato)</option>
                  <option value="qidian">起点中文 (Qidian)</option>
                  <option value="other">其他独立平台 (Other)</option>
                </select>
              </div>
            </div>
            
            {bookGenre === "fanfic" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                    同人创作模式 (Fanfic Mode)
                  </label>
                  <select
                    value={fanficMode}
                    onChange={(e) => setFanficMode(e.target.value as "canon" | "au" | "ooc" | "cp")}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                      outline: "none",
                    }}
                  >
                    <option value="canon">正典延续 (Canon - 忠实原著剧情补完)</option>
                    <option value="au">平行宇宙 (AU - 相同设定不同时空/世界)</option>
                    <option value="ooc">角色偏离 (OOC - 性格反转与脑洞脑侧)</option>
                    <option value="cp">角色配对 (CP - 深入刻画人物关系与情感)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                    原作素材文件/目录绝对路径 (Source Path - 必填)
                  </label>
                  <input
                    type="text"
                    value={fanficSource}
                    onChange={(e) => setFanficSource(e.target.value)}
                    placeholder="请输入原作素材的绝对路径，例如: D:/novel/source.txt"
                    required
                    style={{
                      width: "100%",
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
                  <div style={{ color: "var(--text-dim)", fontSize: "10px", marginTop: "4px", lineHeight: 1.4 }}>
                    支持指向一个 `.txt` / `.md` 文本文件，或包含若干原作设定/故事文本的文件夹绝对路径。AI 将会自动提取并解析作为同人设定依据。
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                  大纲梗概/创意简报 (Brief - 可选)
                </label>
                <textarea
                  value={bookBrief}
                  onChange={(e) => setBookBrief(e.target.value)}
                  placeholder="在此输入您的创意构想（例如：主角是退役兵王、金手指是万界交易面板、核心冲突为世家倾轧）。AI 架构师将优先融合您的创意进行大纲设定设计。"
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-serif)",
                    lineHeight: "1.6",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
            )}

            {bookGenre !== "fanfic" && availableBooks.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                  继承前作设定/共享宇宙世界观 (Canon Source Book)
                </label>
                <select
                  value={bookCanonSource}
                  onChange={(e) => setBookCanonSource(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "12px",
                    outline: "none",
                  }}
                >
                  <option value="">(不继承，创建全新世界观设定)</option>
                  {availableBooks.map((book) => (
                    <option key={book} value={book}>
                      {book}
                    </option>
                  ))}
                </select>
                <div style={{ color: "var(--text-dim)", fontSize: "10px", marginTop: "4px", lineHeight: 1.4 }}>
                  选择一本书籍，系统将在创建新书后自动从其继承已知的世界观设定与人设。
                </div>
              </div>
            )}
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "6px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  background: "transparent",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                type="submit"
                style={{
                  padding: "6px 16px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                确认创建
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
