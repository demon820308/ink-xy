"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SessionInfo } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string, gemId?: string | null) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  explorerRefreshKey?: number;
  onAtMention?: (relativePath: string) => void;
  activeGemId?: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** Return the 5 most recently active cwds across all sessions */
function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>(); // cwd -> most recent modified
  for (const s of sessions) {
    if (!s.cwd) continue;
    const prev = latestByCwd.get(s.cwd);
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd);
}

function shortenCwd(cwd: string, homeDir?: string): string {
  const path = (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
  const sep = path.includes("/") ? "/" : "\\";
  const parts = path.split(sep).filter(Boolean);
  if (parts.length <= 2) return path;
  return "…/" + parts.slice(-2).join(sep);
}



interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so we can resolve missing ancestors
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  // Walk up the parentSessionId chain to find the nearest ancestor that exists in byId
  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id);
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return null;
  }

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by locked desc first, then by modified desc
  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => {
      const lockA = a.session.locked ? 1 : 0;
      const lockB = b.session.locked ? 1 : 0;
      if (lockA !== lockB) return lockB - lockA;
      return b.session.modified.localeCompare(a.session.modified);
    });
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

function useScramble(target: string, running: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setDisplay(target);
      return;
    }
    iterRef.current = 0;
    const totalFrames = target.length * 4;

    const step = () => {
      iterRef.current += 1;
      const progress = iterRef.current / totalFrames;
      const resolved = Math.floor(progress * target.length);

      setDisplay(
        target
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < resolved) return char;
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );

      if (iterRef.current < totalFrames) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, running]);

  return display;
}

function StudioTitle() {
  const [showVersion, setShowVersion] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = showVersion ? `v${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}` : "ink-xY Studio";
  const display = useScramble(target, scrambling);

  const triggerScramble = useCallback((toVersion: boolean) => {
    setShowVersion(toVersion);
    setScrambling(true);
    setTimeout(() => setScrambling(false), (toVersion ? 6 : 8) * 4 * (1000 / 60) + 100);
  }, []);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);

    const next = !showVersion;
    triggerScramble(next);

    if (next) {
      revertTimerRef.current = setTimeout(() => triggerScramble(false), 3000);
    }
  }, [showVersion, triggerScramble]);

  useEffect(() => () => { if (revertTimerRef.current) clearTimeout(revertTimerRef.current); }, []);

  return (
    <button
      onClick={handleClick}
      style={{
        background: "none", border: "none", padding: 0, cursor: "default",
        fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em",
        color: showVersion ? "var(--accent)" : "var(--text)",
        fontFamily: "var(--font-mono)",
        minWidth: "6ch",
      }}
    >
      {display}
    </button>
  );
}

import GemEditorModal from "./GemEditorModal";
import type { GemProfile } from "@/lib/types";

export function SessionSidebar({ selectedSessionId, onSelectSession, onNewSession, initialSessionId, onInitialRestoreDone, refreshKey, onSessionDeleted, selectedCwd: selectedCwdProp, onCwdChange, onOpenFile, explorerRefreshKey, onAtMention, activeGemId }: Props) {
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customPathValue, setCustomPathValue] = useState("");
  const customPathInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerKey, setExplorerKey] = useState(0);

  // Gem-xY custom agent states
  const [gems, setGems] = useState<GemProfile[]>([]);
  const [modelList, setModelList] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [isGemModalOpen, setIsGemModalOpen] = useState(false);
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  const [gemsExpanded, setGemsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  // InkOS workspace states
  const [isInkosWorkspace, setIsInkosWorkspace] = useState(true);
  const [hasBooks, setHasBooks] = useState(true);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  // Book creation form state
  const [bookTitle, setBookTitle] = useState("");
  const [bookGenre, setBookGenre] = useState("xuanhuan");
  const [bookPlatform, setBookPlatform] = useState("tomato");
  const [bookBrief, setBookBrief] = useState("");

  const [detectedFramework, setDetectedFramework] = useState<{ name: string; fullPath: string } | null>(null);
  const [detectedCharacter, setDetectedCharacter] = useState<{ name: string; fullPath: string } | null>(null);
  const [useFramework, setUseFramework] = useState(true);
  const [useCharacter, setUseCharacter] = useState(true);

  useEffect(() => {
    if (!isBookModalOpen) {
      setDetectedFramework(null);
      setDetectedCharacter(null);
      setUseFramework(true);
      setUseCharacter(true);
      return;
    }
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    const scanLocalFiles = async () => {
      try {
        let fw: { name: string; fullPath: string } | null = null;
        let char: { name: string; fullPath: string } | null = null;

        // De-duplicate directories to avoid case-insensitive duplication on Windows
        const directoriesToCheck = [
          { name: "根目录", path: activeCwd },
          { name: "Temp", path: `${activeCwd}/Temp` },
          { name: "temp", path: `${activeCwd}/temp` }
        ].filter((dir, idx, self) => {
          return self.findIndex(d => d.path.toLowerCase().replace(/\\/g, "/") === dir.path.toLowerCase().replace(/\\/g, "/")) === idx;
        });

        const frameworkNames = ["novel_framework_v2.md", "novel_framework.md", "novel-framework.md", "架构.md", "构架.md"];
        const characterNames = ["character_profiles.md", "character-profiles.md", "character.md", "人设.md"];

        for (const dirInfo of directoriesToCheck) {
          try {
            const res = await fetch(`/api/files/${encodeFilePathForApi(dirInfo.path)}?type=list`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.entries) {
              // Find framework if not already found
              if (!fw) {
                const found = data.entries.find((e: any) => !e.isDir && frameworkNames.includes(e.name.toLowerCase()));
                if (found) {
                  fw = {
                    name: found.name,
                    fullPath: `${dirInfo.path}/${found.name}`
                  };
                }
              }
              // Find character if not already found
              if (!char) {
                const found = data.entries.find((e: any) => !e.isDir && characterNames.includes(e.name.toLowerCase()));
                if (found) {
                  char = {
                    name: found.name,
                    fullPath: `${dirInfo.path}/${found.name}`
                  };
                }
              }
            }
          } catch (e) {
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
  }, [isBookModalOpen, selectedCwdProp, selectedCwd]);

  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const checkWorkspaceStatus = useCallback(async (cwd: string) => {
    if (!cwd) return;
    try {
      const encoded = encodeFilePathForApi(cwd);
      const res = await fetch(`/api/files/${encoded}?type=list`);
      if (!res.ok) return;
      const data = await res.json();
      const entries = data.entries || [];
      const hasSignature = entries.some(
        (e: any) => e.name === ".inkos" || e.name === "story" || e.name === "books"
      );
      setIsInkosWorkspace(hasSignature);

      if (hasSignature) {
        const booksDir = joinFilePath(cwd, "books");
        const booksEncoded = encodeFilePathForApi(booksDir);
        const booksRes = await fetch(`/api/files/${booksEncoded}?type=list`);
        if (booksRes.ok) {
          const booksData = await booksRes.json();
          const bookEntries = booksData.entries || [];
          const actualBooks = bookEntries.filter((e: any) => e.name !== ".gitkeep" && !e.name.startsWith("."));
          setHasBooks(actualBooks.length > 0);
        } else {
          setHasBooks(false);
        }
      } else {
        setHasBooks(false);
      }
    } catch (e) {
      console.error("Failed to verify workspace status:", e);
    }
  }, []);

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) {
      setBookError("书籍名称不能为空");
      return;
    }
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    setIsCreatingBook(true);
    setBookError(null);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "book-create",
          cwd: activeCwd,
          args: {
            title: bookTitle.trim(),
            genre: bookGenre,
            platform: bookPlatform,
            brief: bookBrief.trim() || undefined,
            selectedFrameworkPath: (detectedFramework && useFramework) ? detectedFramework.fullPath : undefined,
            selectedCharacterPath: (detectedCharacter && useCharacter) ? detectedCharacter.fullPath : undefined,
          }
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "创建书籍失败，大模型生成异常，请检查配置和 Key");
      }

      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1);
      
      setBookTitle("");
      setBookBrief("");
      setIsBookModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setBookError(err.message || "创建书籍失败，请确认侧边栏左下角 Models 中 API Key 填写正确且模型支持当前题材生成。");
    } finally {
      setIsCreatingBook(false);
    }
  };

  const handleInitWorkspace = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;
    setIsInitializing(true);
    setInitError(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", cwd: activeCwd }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to initialize workspace");
      }
      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1); // trigger file explorer refresh
    } catch (err: any) {
      console.error(err);
      setInitError(err.message || "初始化失败");
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (activeCwd) {
      checkWorkspaceStatus(activeCwd);
    } else {
      setIsInkosWorkspace(true);
    }
  }, [selectedCwdProp, selectedCwd, checkWorkspaceStatus, explorerKey]);

  // Load Gems
  const loadGems = useCallback(async () => {
    try {
      const res = await fetch("/api/gem-xy");
      if (!res.ok) throw new Error("Failed to load Gem-xY profiles");
      const data = await res.json() as GemProfile[];
      setGems(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadGems();
  }, [loadGems]);

  // Load Models List (for editor configuration)
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { modelList?: { id: string; name: string; provider: string }[] }) => {
        if (d.modelList) setModelList(d.modelList);
      })
      .catch(() => {});
  }, []);

  const handleSelectGem = useCallback((gemId: string) => {
    if (!selectedCwd) return;
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd, gemId);
  }, [selectedCwd, onNewSession]);

  const handleDeleteGem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个智能体吗？")) return;
    try {
      const res = await fetch(`/api/gem-xy/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      loadGems();
    } catch (err) {
      console.error(err);
      alert("删除失败");
    }
  };
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sessions: SessionInfo[] };
      setAllSessions(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  useEffect(() => {
    fetch("/api/home").then((r) => r.json()).then((d: { home?: string }) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
  }, []);

  const restoredRef = useRef(false);

  useEffect(() => {
    onCwdChange?.(selectedCwd);
  }, [selectedCwd, onCwdChange]);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setSelectedCwd(target.cwd);
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const cwds = getRecentCwds(allSessions);
      if (cwds.length > 0) setSelectedCwd(cwds[0]);
    }
  }, [allSessions, selectedCwd, initialSessionId, onSelectSession, onInitialRestoreDone]);

  const commitCustomPath = useCallback(() => {
    const path = customPathValue.trim();
    if (path) {
      setSelectedCwd(path);
    }
    setCustomPathOpen(false);
    setCustomPathValue("");
    setDropdownOpen(false);
  }, [customPathValue]);

  const handleDefaultCwd = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = await res.json() as { cwd?: string; error?: string };
      if (data.cwd) {
        setSelectedCwd(data.cwd);
        setDropdownOpen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCustomPathOpen(false);
        setCustomPathValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return;
    // Generate a temporary UUID client-side — no backend call needed.
    // Pi will be spawned lazily when the user sends the first message.
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd);
  }, [selectedCwd, onNewSession]);

  const recentCwds = getRecentCwds(allSessions);
  const filteredSessions = selectedCwd
    ? allSessions.filter((s) => s.cwd === selectedCwd)
    : allSessions;

  // Build parent-child tree within the filtered set
  const sessionTree = buildSessionTree(filteredSessions);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 10px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <StudioTitle />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleNewSession}
              disabled={!selectedCwd}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: selectedCwd ? "var(--text-muted)" : "var(--text-dim)",
                cursor: selectedCwd ? "pointer" : "not-allowed",
                height: 32,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                flexShrink: 0,
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
              title={selectedCwd ? `在新协同会话中写作` : "请先选择创作工作区"}
              onMouseEnter={(e) => {
                if (!selectedCwd) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = selectedCwd ? "var(--text-muted)" : "var(--text-dim)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              新会话
            </button>
            <button
              onClick={() => loadSessions(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: sessionRefreshDone ? "rgba(74,222,128,0.18)" : "var(--bg-hover)",
                border: `1px solid ${sessionRefreshDone ? "rgba(74,222,128,0.4)" : "var(--border)"}`,
                color: sessionRefreshDone ? "#4ade80" : "var(--text-muted)",
                cursor: "pointer",
                width: 32, height: 32,
                borderRadius: 7,
                padding: 0,
                flexShrink: 0,
                transition: "background 0.3s, color 0.3s, border-color 0.3s",
              }}
              onMouseEnter={(e) => {
                if (sessionRefreshDone) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
              }}
              onMouseLeave={(e) => {
                if (sessionRefreshDone) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
              title="刷新会话"
            >
              {sessionRefreshDone ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* CWD picker */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              background: selectedCwd ? "var(--bg-hover)" : "rgba(37,99,235,0.06)",
              border: selectedCwd ? "1px solid var(--border)" : "1px solid rgba(37,99,235,0.4)",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text)",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: selectedCwd ? "var(--text)" : "var(--text-dim)",
              }}
              title={selectedCwd ?? ""}
            >
              {selectedCwd ? shortenCwd(selectedCwd, homeDir) : (initialSessionId && !restoredRef.current ? "" : "选择创作目录…")}
            </span>
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
                overflow: "hidden",
              }}
            >
              {recentCwds.map((cwd) => (
                <button
                  key={cwd}
                  onClick={() => {
                    setSelectedCwd(cwd);
                    setCustomPathOpen(false);
                    setCustomPathValue("");
                    setDropdownOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: cwd === selectedCwd ? "var(--bg-selected)" : "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    color: cwd === selectedCwd ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={cwd}
                >
                  {cwd === selectedCwd && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  )}
                  {cwd !== selectedCwd && <span style={{ width: 10, flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortenCwd(cwd, homeDir)}</span>
                </button>
              ))}

              {/* Default cwd shortcut */}
              {!customPathOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDefaultCwd(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    borderTop: recentCwds.length > 0 ? "1px solid var(--border)" : "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                  </svg>
                  <span>使用默认创作目录</span>
                </button>
              )}

              {/* Custom path entry */}
              {!customPathOpen ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomPathOpen(true);
                    setTimeout(() => customPathInputRef.current?.focus(), 0);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <line x1="5" y1="1" x2="5" y2="9" />
                    <line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  <span>自定义路径…</span>
                </button>
              ) : (
                <div style={{ padding: "6px 8px", borderTop: recentCwds.length > 0 ? "none" : undefined }}>
                  <input
                    ref={customPathInputRef}
                    value={customPathValue}
                    onChange={(e) => setCustomPathValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCustomPath();
                      if (e.key === "Escape") {
                        setCustomPathOpen(false);
                        setCustomPathValue("");
                      }
                    }}
                    placeholder="/path/to/project"
                    style={{
                      width: "100%",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "5px 8px",
                      border: "1px solid var(--accent)",
                      borderRadius: 5,
                      outline: "none",
                      background: "var(--bg)",
                      color: "var(--text)",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                    <button
                      onClick={commitCustomPath}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 5,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      打开
                    </button>
                    <button
                      onClick={() => { setCustomPathOpen(false); setCustomPathValue(""); }}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        background: "var(--bg-hover)",
                        border: "1px solid var(--border)",
                        borderRadius: 5,
                        color: "var(--text-muted)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File Explorer section (workspace assets tree, elevated to be the main focus) */}
      {(selectedCwdProp || selectedCwd) && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flex: explorerOpen ? "1 1 0" : "0 0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "8px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: explorerOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              创作目录 (Workspace)
            </button>
            <button
              onClick={() => {
                setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title="刷新创作目录"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, padding: 0, marginRight: 6,
                background: explorerRefreshDone ? "rgba(74,222,128,0.18)" : "none",
                border: "none",
                color: explorerRefreshDone ? "#4ade80" : "var(--text-dim)",
                cursor: "pointer",
                borderRadius: 5,
                flexShrink: 0,
                transition: "color 0.3s, background 0.3s",
              }}
              onMouseEnter={(e) => { if (explorerRefreshDone) return; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (explorerRefreshDone) return; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
            >
              {explorerRefreshDone ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
              {!isInkosWorkspace && (
                <div style={{
                  margin: "8px 10px",
                  padding: "12px",
                  background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-serif)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>✒️</span>
                    <span>未初始化的创作空间</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                    该目录尚未创建 InkOS 小说项目结构。一键初始化以启用自动章节规划、人设审计与快照防崩系统。
                  </div>
                  {initError && (
                    <div style={{ color: "#ef4444", marginBottom: 8, fontSize: 10 }}>
                      ⚠️ {initError}
                    </div>
                  )}
                  <button
                    onClick={handleInitWorkspace}
                    disabled={isInitializing}
                    style={{
                      width: "100%",
                      padding: "6px 0",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontWeight: 600,
                      cursor: isInitializing ? "not-allowed" : "pointer",
                      opacity: isInitializing ? 0.7 : 1,
                      textAlign: "center",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {isInitializing ? "正在开启小说宇宙..." : "一键开启创作宇宙"}
                  </button>
                </div>
              )}
              {isInkosWorkspace && !hasBooks && (
                <div style={{
                  margin: "8px 10px",
                  padding: "12px",
                  background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-serif)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>📚</span>
                    <span>小说宇宙内尚无书籍</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                    在 InkOS 中，设定与大纲是以“书籍”为单位存储的。立即创建您的第一本书，AI 架构师将为您搭建创作地基。
                  </div>
                  <button
                    onClick={() => setIsBookModalOpen(true)}
                    style={{
                      width: "100%",
                      padding: "6px 0",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "opacity 0.15s",
                    }}
                  >
                    ✍️ 创建小说书籍
                  </button>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <FileExplorer
                  cwd={selectedCwdProp ?? selectedCwd!}
                  onOpenFile={onOpenFile ?? (() => {})}
                  refreshKey={explorerKey}
                  onAtMention={onAtMention}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gem-xY custom agent panel (AI co-writers list, collapsible) */}
      {(selectedCwdProp || selectedCwd) && (
        <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0, paddingBottom: 6 }}>
          <div
            onClick={() => setGemsExpanded(!gemsExpanded)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px 4px",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: gemsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              <span>AI 写作伴侣 (Co-writers)</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingGemId(null);
                setIsGemModalOpen(true);
              }}
              title="配置专属写作姬"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              + Create
            </button>
          </div>

          {gemsExpanded && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "0 6px",
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {gems.length === 0 ? (
                <div style={{ padding: "6px 10px", color: "var(--text-dim)", fontSize: 11, fontStyle: "italic" }}>
                  暂无写作姬，点击 Create 配置
                </div>
              ) : (
                gems.map((gem) => {
                  const isSelected = activeGemId === gem.id && !selectedSessionId;
                  return (
                    <div
                      key={gem.id}
                      onClick={() => handleSelectGem(gem.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: isSelected ? "var(--bg-selected)" : "transparent",
                        cursor: "pointer",
                        fontSize: 12,
                        transition: "all 0.12s",
                      }}
                      className="gem-sidebar-item"
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{gem.avatar || "🔮"}</span>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span
                            style={{
                              color: isSelected ? "var(--accent)" : "var(--text)",
                              fontWeight: isSelected ? 600 : 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {gem.name}
                          </span>
                          {gem.description && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--text-dim)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {gem.description}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div
                        className="gem-actions"
                        style={{
                          display: "flex",
                          gap: 4,
                          flexShrink: 0,
                          opacity: 0,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGemId(gem.id);
                            setIsGemModalOpen(true);
                          }}
                          title="编辑"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                        >
                          ✎
                        </button>
                        <button
                          onClick={(e) => handleDeleteGem(e, gem.id)}
                          title="删除"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            padding: 2,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Session list section (AI chats / co-writing sessions, collapsible, default collapsed) */}
      {(selectedCwdProp || selectedCwd) && (
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
          <div
            onClick={() => setSessionsExpanded(!sessionsExpanded)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px 4px",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: sessionsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              <span>AI 协同历史 (AI Chats)</span>
            </div>
          </div>

          {sessionsExpanded && (
            <div style={{ maxHeight: 160, overflowY: "auto", padding: "0" }}>
              {loading && (
                <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 11 }}>
                  Loading...
                </div>
              )}
              {error && (
                <div style={{ padding: "12px 14px", color: "#f87171", fontSize: 11 }}>
                  {error}
                </div>
              )}
              {!loading && !error && filteredSessions.length === 0 && (
                <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 11 }}>
                  无历史协同会话
                </div>
              )}
              {sessionTree.map((node) => (
                <SessionTreeItem
                  key={node.session.id}
                  node={node}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={onSelectSession}
                  onRenamed={loadSessions}
                  onSessionDeleted={(id) => {
                    onSessionDeleted?.(id);
                    loadSessions();
                  }}
                  depth={0}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .gem-sidebar-item:hover .gem-actions {
          opacity: 1 !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <GemEditorModal
        isOpen={isGemModalOpen}
        onClose={() => setIsGemModalOpen(false)}
        gemId={editingGemId}
        onSave={() => loadGems()}
        modelList={modelList}
      />
      
      {/* Create Book Modal */}
      {isBookModalOpen && (
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
            
            {isCreatingBook ? (
              <div style={{ padding: "30px 10px", textAlign: "center" }}>
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
                <div style={{ color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>
                  AI 架构师正在分析题材大纲，并自动构建卷大纲、角色设定卡片与世界观法则，请稍候约 30 秒。
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
                      <li><strong>AI 协同起草</strong>：先关闭此窗口，配合右侧的<strong>「AI写作伴侣」</strong>共同探讨并起草您的框架与人设设定，保存后再行创建。</li>
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
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                      小说题材 (Genre)
                    </label>
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
                      <option value="xuanhuan">玄幻奇幻 (Xuanhuan)</option>
                      <option value="urban">都市异能 (Urban)</option>
                      <option value="history">历史同人 (History)</option>
                      <option value="scifi">科幻未来 (Sci-Fi)</option>
                      <option value="game">网游竞技 (Game)</option>
                      <option value="fanfic">同人创作 (Fanfic)</option>
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
                
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setIsBookModalOpen(false)}
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
      )}
    </div>
  );
}

function SessionTreeItem({
  node,
  selectedSessionId,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  depth,
}: {
  node: SessionTreeNode;
  selectedSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div style={{ position: "relative" }}>
        {/* Indent line for child sessions */}
        {depth > 0 && (
          <div style={{
            position: "absolute",
            left: depth * 12 + 6,
            top: 0, bottom: 0,
            width: 1,
            background: "var(--border)",
            pointerEvents: "none",
          }} />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedSessionId}
          onClick={() => onSelectSession(node.session)}
          onRenamed={onRenamed}
          onDeleted={(id) => onSessionDeleted?.(id)}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onSessionDeleted={onSessionDeleted}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
}: {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lockedState, setLockedState] = useState(session.locked);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state if session prop updates
  useEffect(() => {
    setLockedState(session.locked);
  }, [session.locked]);

  const handleLockToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !lockedState;
    setLockedState(newStatus);
    session.locked = newStatus; // optimistic update on reference
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: newStatus }),
      });
      onRenamed?.(); // refresh sidebar list
    } catch {
      setLockedState(!newStatus);
      session.locked = !newStatus;
    }
  }, [lockedState, session, onRenamed]);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(session.name ?? "");
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [session.name]);

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
      onDeleted?.(session.id);
    } catch {
      setDeleting(false);
    }
  }, [session.id, onDeleted]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  // Fixed-height outer wrapper — content swaps in place so the list never reflows
  const ITEM_HEIGHT = 54;

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{
        height: ITEM_HEIGHT,
        display: "flex",
        alignItems: "center",
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        paddingRight: 8,
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "rgba(239,68,68,0.06)"
          : isSelected ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "transparent",
        borderLeft: confirmDelete
          ? "2px solid #ef4444"
          : isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
        opacity: deleting ? 0.5 : 1,
        gap: 6,
        overflow: "hidden",
      }}
    >
      {confirmDelete ? (
        /* ── Delete confirmation: same height, two flat buttons ── */
        <>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Delete <span style={{ fontWeight: 600 }}>&ldquo;{title.slice(0, 22)}{title.length > 22 ? "…" : ""}&rdquo;</span>?
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button
              onClick={handleDeleteConfirm}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                height: 30, padding: "0 11px",
                background: "#ef4444", border: "none",
                borderRadius: 6, color: "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
            <button
              onClick={handleDeleteCancel}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 30, padding: "0 11px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)",
                cursor: "pointer", fontSize: 12, fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── Rename: input fills the same row ── */
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          style={{
            flex: 1,
            fontSize: 12,
            padding: "5px 8px",
            border: "1px solid var(--accent)",
            borderRadius: 5,
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 30,
          }}
        />
      ) : (
        /* ── Normal view ── */
        <>
          {/* Fork indicator for child sessions */}
          {depth > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              title={title}
            >
              {lockedState && (
                <span title="本会话已被锁定，无法删除。请先解锁！" style={{ display: "inline-flex", fontSize: 10, flexShrink: 0 }}>🔒</span>
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            </div>
            <div style={{ marginTop: 2, display: "flex", gap: 8, color: "var(--text-dim)", fontSize: 11 }}>
              <span title={session.modified}>{formatRelativeTime(session.modified)}</span>
              <span>{session.messageCount} msgs</span>
            </div>
          </div>

          {/* Collapse toggle — always visible when has children */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              title={collapsed ? "Expand forks" : "Collapse forks"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, padding: 0, flexShrink: 0,
                background: "none", border: "none",
                color: "var(--text-dim)", cursor: "pointer",
                transform: collapsed ? "rotate(-90deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </button>
          )}

          {/* Action buttons — shown on hover */}
          {hovered && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {/* Lock/Unlock Toggle Button */}
              <button
                onClick={handleLockToggle}
                title={lockedState ? "解锁会话 (Unlock session)" : "锁定会话 (Lock session)"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7,
                  color: lockedState ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                  borderColor: lockedState ? "rgba(37,99,235,0.25)" : "var(--border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = lockedState ? "var(--accent)" : "var(--text-muted)";
                  e.currentTarget.style.borderColor = lockedState ? "rgba(37,99,235,0.25)" : "var(--border)";
                }}
              >
                {lockedState ? (
                  /* Padlock Locked Icon */
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  /* Padlock Unlocked Icon */
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>
              <button
                onClick={startRename}
                title="Rename"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                onClick={lockedState ? undefined : handleDeleteClick}
                disabled={lockedState}
                title={lockedState ? "本会话已被锁定，无法删除。请先解锁！" : "Delete"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7,
                  color: lockedState ? "var(--text-dim)" : "var(--text-muted)",
                  cursor: lockedState ? "not-allowed" : "pointer",
                  flexShrink: 0,
                  opacity: lockedState ? 0.35 : 1,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (lockedState) return;
                  e.currentTarget.style.background = "rgba(239,68,68,0.08)";
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)";
                }}
                onMouseLeave={(e) => {
                  if (lockedState) return;
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
