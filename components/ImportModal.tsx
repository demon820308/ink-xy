"use client";

import React, { useState, useEffect, useRef } from "react";
import { Emoji } from "./Emoji";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  activeBookId: string | null;
  availableBooks: string[];
  onImportSuccess: (targetBookId?: string) => void;
}

export default function ImportModal({
  isOpen,
  onClose,
  cwd,
  activeBookId,
  availableBooks,
  onImportSuccess,
}: Props) {
  const [activeImportTab, setActiveImportTab] = useState<"chapters" | "canon">("chapters");
  const [importFromPath, setImportFromPath] = useState("");
  const [importSplitRegex, setImportSplitRegex] = useState("");
  const [importResumeFrom, setImportResumeFrom] = useState("");
  const [importIsSeries, setImportIsSeries] = useState(false);
  const [importCanonFromBookId, setImportCanonFromBookId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessText, setImportSuccessText] = useState<React.ReactNode>(null);
  const [importBookSelection, setImportBookSelection] = useState<"active" | "new">("active");
  const [newBookId, setNewBookId] = useState("");
  const [newBookTitle, setNewBookTitle] = useState("");

  const importConsoleRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of terminal console
  useEffect(() => {
    if (importConsoleRef.current) {
      importConsoleRef.current.scrollTop = importConsoleRef.current.scrollHeight;
    }
  }, [importLogs]);

  // Set default book selection when list changes
  useEffect(() => {
    setImportBookSelection(availableBooks.length > 0 ? "active" : "new");
    const otherBook = availableBooks.find((b) => b !== activeBookId) || "";
    setImportCanonFromBookId(otherBook);
  }, [availableBooks, activeBookId, isOpen]);

  if (!isOpen) return null;

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cwd) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccessText(null);
    setImportLogs([]);

    try {
      const targetBookId = (importBookSelection === "new" || availableBooks.length === 0)
        ? newBookId.trim()
        : (activeBookId || undefined);

      if ((importBookSelection === "new" || availableBooks.length === 0) && activeImportTab === "chapters") {
        if (!targetBookId) {
          throw new Error("新书籍 ID 不能为空");
        }
        const bTitle = newBookTitle.trim() || targetBookId;
        
        setImportLogs((prev) => [...prev, `[System] 正在自动创建新书籍 "${targetBookId}" (${bTitle})...\n`]);
        
        const createRes = await fetch("/api/inkos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "book-create",
            cwd,
            args: {
              title: bTitle,
              genre: "xuanhuan",
              platform: "tomato",
            }
          })
        });

        if (!createRes.ok) {
          throw new Error(`创建新书籍失败，HTTP 异常 ${createRes.status}`);
        }

        if (!createRes.body) {
          throw new Error("创建新书籍响应流为空");
        }

        const createReader = createRes.body.getReader();
        const createDecoder = new TextDecoder();
        let createBuffer = "";
        let createResult: { success: boolean; error?: string } | null = null;

        while (true) {
          const { done, value } = await createReader.read();
          if (done) break;
          createBuffer += createDecoder.decode(value, { stream: true });
          const lines = createBuffer.split("\n");
          createBuffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              if (chunk.type === "stdout" || chunk.type === "stderr") {
                setImportLogs((prev) => [...prev, chunk.data || ""]);
              } else if (chunk.type === "result") {
                createResult = chunk;
              }
            } catch {
              setImportLogs((prev) => [...prev, line + "\n"]);
            }
          }
        }

        if (createBuffer.trim()) {
          try {
            const chunk = JSON.parse(createBuffer);
            if (chunk.type === "result") createResult = chunk;
          } catch {
            setImportLogs((prev) => [...prev, createBuffer + "\n"]);
          }
        }

        if (!createResult || !createResult.success) {
          throw new Error(createResult?.error || "创建新书籍失败");
        }

        setImportLogs((prev) => [...prev, `[System] 新书籍创建完成，正在导入章节数据...\n`]);
      }

      let body: Record<string, unknown> = {};
      if (activeImportTab === "chapters") {
        if (!importFromPath.trim()) {
          throw new Error("导入源路径不能为空");
        }
        body = {
          action: "import-chapters",
          cwd,
          args: {
            bookId: targetBookId,
            from: importFromPath.trim(),
            split: importSplitRegex.trim() || undefined,
            resumeFrom: importResumeFrom ? parseInt(importResumeFrom, 10) : undefined,
            series: importIsSeries,
            json: true
          }
        };
      } else {
        if (!importCanonFromBookId.trim()) {
          throw new Error("请选择或输入原著/前作 Book ID");
        }
        body = {
          action: "import-canon",
          cwd,
          args: {
            bookId: activeBookId || undefined,
            from: importCanonFromBookId.trim(),
            json: true
          }
        };
      }

      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
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
      let finalResult: { success: boolean; stdout?: string; stderr?: string; error?: string } | null = null;

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
              setImportLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch {
            setImportLogs((prev) => [...prev, line + "\n"]);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {
          setImportLogs((prev) => [...prev, buffer + "\n"]);
        }
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "导入执行失败，请检查路径或日志。");
      }

      if (activeImportTab === "chapters") {
        let resultData: { importedCount?: number; totalWords?: number } | null = null;
        if (finalResult && typeof (finalResult as Record<string, unknown>).importedCount === "number") {
          resultData = finalResult as unknown as { importedCount?: number; totalWords?: number };
        } else {
          try {
            if (finalResult.stdout) {
              resultData = JSON.parse(finalResult.stdout);
            }
          } catch {}
        }
        const imported = resultData?.importedCount ?? "部分";
        const words = resultData?.totalWords ?? 0;
        setImportSuccessText(<><Emoji char="🎉" /> 成功导入章节！共处理了 {imported} 章节，约 {words} 字。逆向工程设定提取成功！</>);
      } else {
        setImportSuccessText(<><Emoji char="🎉" /> 成功导入前作设定！世界观与人物正典已同步成功。</>);
      }

      onImportSuccess(targetBookId);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setImportError(errMsg || "导入执行失败，请重试。");
    } finally {
      setIsImporting(false);
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
        {/* Modal Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            <Emoji char="📥" /> InkOS 导入向导 ({activeBookId})
          </span>
          <button
            onClick={() => { if (!isImporting) onClose(); }}
            disabled={isImporting}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              fontSize: 14, cursor: isImporting ? "not-allowed" : "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs Header */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}>
          <button
            type="button"
            onClick={() => { if (!isImporting) setActiveImportTab("chapters"); }}
            disabled={isImporting}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              background: activeImportTab === "chapters" ? "var(--bg)" : "transparent",
              color: activeImportTab === "chapters" ? "var(--accent)" : "var(--text-muted)",
              borderBottom: activeImportTab === "chapters" ? "2px solid var(--accent)" : "none",
              cursor: isImporting ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            <Emoji char="📥" /> 导入旧章原稿
          </button>
          <button
            type="button"
            onClick={() => { if (!isImporting) setActiveImportTab("canon"); }}
            disabled={isImporting}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              background: activeImportTab === "canon" ? "var(--bg)" : "transparent",
              color: activeImportTab === "canon" ? "var(--accent)" : "var(--text-muted)",
              borderBottom: activeImportTab === "canon" ? "2px solid var(--accent)" : "none",
              cursor: isImporting ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            <Emoji char="📖" /> 导入前作设定 (Canon)
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleImportSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {activeImportTab === "chapters" ? (
            <>
              {/* Book selection / creation option */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  选择导入的目标书籍*
                </label>
                {availableBooks.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text)", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="importBookSelect"
                          checked={importBookSelection === "active"}
                          onChange={() => setImportBookSelection("active")}
                          disabled={isImporting}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span>当前书籍 ({activeBookId})</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text)", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="importBookSelect"
                          checked={importBookSelection === "new"}
                          onChange={() => setImportBookSelection("new")}
                          disabled={isImporting}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span><Emoji char="➕" /> 导入并创建新书籍</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                    <Emoji char="⚠️" /> 当前小说宇宙内尚无书籍，将自动创建新书籍进行导入。
                  </span>
                )}
              </div>

              {(importBookSelection === "new" || availableBooks.length === 0) && (
                <div style={{
                  background: "rgba(var(--accent-rgb), 0.03)",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>新书籍 ID (拼音/英文)*</label>
                      <input
                        type="text"
                        value={newBookId}
                        onChange={(e) => setNewBookId(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
                        placeholder="如: my_new_novel"
                        disabled={isImporting}
                        style={{
                          width: "100%", padding: "6px 8px", borderRadius: 4,
                          background: "var(--bg)", border: "1px solid var(--border)",
                          color: "var(--text)", fontSize: 11, fontFamily: "var(--font-mono)",
                          outline: "none"
                        }}
                        required
                      />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>新书籍名称*</label>
                      <input
                        type="text"
                        value={newBookTitle}
                        onChange={(e) => setNewBookTitle(e.target.value)}
                        placeholder="如: 我的新科幻小说"
                        disabled={isImporting}
                        style={{
                          width: "100%", padding: "6px 8px", borderRadius: 4,
                          background: "var(--bg)", border: "1px solid var(--border)",
                          color: "var(--text)", fontSize: 11, fontFamily: "var(--font-serif)",
                          outline: "none"
                        }}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  输入源文件或文件夹路径 (from)*
                </label>
                <input
                  type="text"
                  value={importFromPath}
                  onChange={(e) => setImportFromPath(e.target.value)}
                  placeholder="如: D:/novel/drafts (目录) 或 D:/draft.txt (单文件)"
                  disabled={isImporting}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                    outline: "none"
                  }}
                  required
                />
                <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
                  提示：系统会扫描目录下的所有 .md/.txt 并按文件名排序，或读取大文件进行自动分章，同时**提取人设与设定数据库**以备续写。
                </span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    分章正则式 (可选)
                  </label>
                  <input
                    type="text"
                    value={importSplitRegex}
                    onChange={(e) => setImportSplitRegex(e.target.value)}
                    placeholder="如: ^第[一二三四五]章"
                    disabled={isImporting}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6,
                      background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                  />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    续传章节号 (可选)
                  </label>
                  <input
                    type="number"
                    value={importResumeFrom}
                    onChange={(e) => setImportResumeFrom(e.target.value)}
                    placeholder="如: 12"
                    disabled={isImporting}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6,
                      background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                  />
                </div>
              </div>

              <label style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, color: "var(--text)", cursor: isImporting ? "not-allowed" : "pointer",
                userSelect: "none", marginTop: 4
              }}>
                <input
                  type="checkbox"
                  checked={importIsSeries}
                  disabled={isImporting}
                  onChange={(e) => setImportIsSeries(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer" }}
                />
                <span>作为独立同宇宙系列作品导入 (shared universe spinoff)</span>
              </label>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                选择或输入前作书籍 ID (parentBookId)*
              </label>
              {availableBooks.filter(b => b !== activeBookId).length > 0 ? (
                <select
                  value={importCanonFromBookId}
                  onChange={(e) => setImportCanonFromBookId(e.target.value)}
                  disabled={isImporting}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontSize: 12, fontFamily: "var(--font-serif)",
                    outline: "none", cursor: "pointer"
                  }}
                  required
                >
                  <option value="">-- 请选择书籍 --</option>
                  {availableBooks.filter(b => b !== activeBookId).map((book) => (
                    <option key={book} value={book}>{book}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={importCanonFromBookId}
                  onChange={(e) => setImportCanonFromBookId(e.target.value)}
                  placeholder="请输入前作 Book ID (例如: my_first_novel)"
                  disabled={isImporting}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                    outline: "none"
                  }}
                  required
                />
              )}
              <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
                提示：将从所选的书籍目录中复制并合并人物卡片、纪元史和设定，帮助在全新书籍中开展同宇宙故事线（Spinoff）的创作。
              </span>
            </div>
          )}

          {/* Console Log Console */}
          {(isImporting || importLogs.length > 0 || importError || importSuccessText) && (
            <div style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "12px",
              fontSize: 11,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              {importError && (
                <div style={{ color: "#ef4444", fontWeight: 600 }}>
                  <Emoji char="⚠️" /> 导入失败: {importError}
                </div>
              )}
              {importSuccessText && (
                <div style={{ color: "#10b981", fontWeight: 600 }}>
                  {importSuccessText}
                </div>
              )}
              {isImporting && (
                <div style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 1s linear infinite" }}>
                    <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  <span>正在运行 InkOS 智能导入引擎，请稍候...</span>
                </div>
              )}
              {importLogs.length > 0 && (
                <div
                  ref={importConsoleRef}
                  style={{
                    maxHeight: "80px", overflowY: "auto",
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    color: "var(--text-dim)", background: "#121214",
                    padding: "6px", borderRadius: 4, whiteSpace: "pre-wrap",
                    textAlign: "left",
                  }}
                >
                  {importLogs.map((log, index) => (
                    <div key={index} style={{ marginBottom: 2 }}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              disabled={isImporting}
              style={{
                flex: 1, height: 38,
                background: "var(--accent)",
                border: "none", borderRadius: 8,
                color: "white", fontSize: 12, fontWeight: 600,
                cursor: isImporting ? "not-allowed" : "pointer",
                opacity: isImporting ? 0.7 : 1,
              }}
            >
              {isImporting ? "正在导入..." : "确认开始导入"}
            </button>
            {!isImporting && (
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
