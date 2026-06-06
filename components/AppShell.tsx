"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SessionSidebar } from "./SessionSidebar";
import { ChatWindow } from "./ChatWindow";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { BranchNavigator } from "./BranchNavigator";
import { SettingsModal } from "./SettingsModal";
import { HelpModal } from "./HelpModal";
import { useTheme } from "@/hooks/useTheme";
import { ChapterDashboard } from "./ChapterDashboard";
import { CharacterRelationDashboard } from "./CharacterRelationDashboard";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ChatInputHandle } from "./ChatInput";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";

export function AppShell() {

  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [activeGemId, setActiveGemId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showExecutionConfirm, setShowExecutionConfirm] = useState(true);
  const [maxChapterNumber, setMaxChapterNumber] = useState<number | null>(null);
  const [latestChapterPath, setLatestChapterPath] = useState<string | null>(null);
  const [latestChapterName, setLatestChapterName] = useState<string | null>(null);
  const [styleConfirm, setStyleConfirm] = useState<{
    targetStyle: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const systemBtnRef = useRef<HTMLButtonElement>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<{ tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null>(null);
  const handleSessionStatsChange = useCallback((stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => {
    setSessionStats(stats);
  }, []);

  // Context usage — populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const handleContextUsageChange = useCallback((usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
    setContextUsage(usage);
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"branches" | "system" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleTopPanel = useCallback((panel: "branches" | "system") => {
    setActiveTopPanel((cur) => cur === panel ? null : panel);
  }, []);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const rect = topBarRef.current!.getBoundingClientRect();
      setTopPanelPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel]);

  useEffect(() => {
    const val = localStorage.getItem("ink-show-execution-confirm");
    if (val !== null) {
      setShowExecutionConfirm(val === "true");
    } else {
      setShowExecutionConfirm(true);
    }
    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ showExecutionConfirm: boolean }>;
      if (customEvent.detail) {
        setShowExecutionConfirm(customEvent.detail.showExecutionConfirm);
      }
    };
    window.addEventListener("ink-settings-changed", handleSettingsChanged);
    return () => {
      window.removeEventListener("ink-settings-changed", handleSettingsChanged);
    };
  }, []);

  // Right panel — file tabs only
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return !!params.get("session");
    }
    return false;
  });

  const handleAtMention = useCallback((relativePath: string) => {
    chatInputRef.current?.insertText("`" + relativePath + "`");
  }, []);

  const [initialSessionId] = useState<string | null>(() => searchParams.get("session"));
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  const handleCwdChange = useCallback((cwd: string | null) => {
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount) or during the initial URL restore.
    if (!cwd || suppressCwdBumpRef.current) return;
    // Close any session that belongs to a different cwd — it no longer
    // matches the selected project directory.
    setSelectedSession((prev) => {
      if (prev && prev.cwd !== cwd) return null;
      return prev;
    });
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    window.history.replaceState(null, "", "/");
  }, []);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setActiveGemId(null);
    setSessionKey((k) => k + 1);
    setSystemPrompt(null);
    setInitialSessionRestored(true);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
      setTimeout(() => { suppressCwdBumpRef.current = false; }, 0);
    }
    // Use history.replaceState instead of router.replace to avoid
    // production Next.js RSC re-rendering which causes multi-second lag
    if (!isRestore) {
      window.history.replaceState(null, "", `?session=${encodeURIComponent(session.id)}`);
    }
    setRightPanelOpen(true);
  }, []);

  const handleNewSession = useCallback((_sessionId: string, cwd: string, gemId?: string | null) => {
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    setActiveGemId(gemId ?? null);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    window.history.replaceState(null, "", "/");
    setRightPanelOpen(true);
  }, []);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setActiveGemId(null);
    setRefreshKey((k) => k + 1);
    window.history.replaceState(null, "", `?session=${encodeURIComponent(session.id)}`);
    setRightPanelOpen(true);
  }, []);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
  }, []);

  const handleSessionForked = useCallback((newSessionId: string) => {
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
    }));
    window.history.replaceState(null, "", `?session=${encodeURIComponent(newSessionId)}`);
    setRightPanelOpen(true);
  }, []);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setSessionKey((k) => k + 1);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setActiveTopPanel(null);
      window.history.replaceState(null, "", "/");
    }
  }, [selectedSession]);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveFileTabId(tabId);
    setRightPanelOpen(false);
  }, []);

  const handleOpenFile = useCallback((filePath: string, fileName: string) => {
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: fileName, filePath }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(false);
  }, []);

  const handleOpenDashboard = useCallback((bookId: string) => {
    const tabId = `dashboard:${bookId}`;
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: `📊 ${bookId} 看板`, filePath: `dashboard:${bookId}` }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(false);
  }, []);

  const handleOpenCharactersGraph = useCallback((bookId: string) => {
    const tabId = `characters:${bookId}`;
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: `👥 ${bookId} 角色人设`, filePath: `characters:${bookId}` }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(false);
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      setExplorerRefreshKey((k) => k + 1);
    };
    const handleOpenFileEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ filePath: string; fileName: string }>;
      if (customEvent.detail) {
        handleOpenFile(customEvent.detail.filePath, customEvent.detail.fileName);
      }
    };
    const handleCloseFileEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ filePath: string }>;
      if (customEvent.detail && customEvent.detail.filePath) {
        handleCloseFileTab(`file:${customEvent.detail.filePath}`);
      }
    };
    const handleCloseDirEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ dirPath: string }>;
      if (customEvent.detail && customEvent.detail.dirPath) {
        const prefix = customEvent.detail.dirPath.replace(/\\/g, "/").toLowerCase();
        setFileTabs((prev) => {
          const next = prev.filter((t) => {
            const normalizedPath = t.filePath.replace(/\\/g, "/").toLowerCase();
            return !normalizedPath.startsWith(prefix);
          });
          if (next.length === 0) setRightPanelOpen(false);
          
          setActiveFileTabId((cur) => {
            if (!cur) return null;
            const currentPath = cur.replace(/^file:/, "").replace(/\\/g, "/").toLowerCase();
            if (currentPath.startsWith(prefix)) {
              return next.length > 0 ? next[next.length - 1].id : null;
            }
            return cur;
          });
          
          return next;
        });
      }
    };
    const handleOpenDashboardEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ bookId: string }>;
      if (customEvent.detail && customEvent.detail.bookId) {
        handleOpenDashboard(customEvent.detail.bookId);
      }
    };
    const handleOpenCharactersGraphEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ bookId: string }>;
      if (customEvent.detail && customEvent.detail.bookId) {
        handleOpenCharactersGraph(customEvent.detail.bookId);
      }
    };
    window.addEventListener("refresh-explorer", handleRefresh);
    window.addEventListener("open-file", handleOpenFileEvent);
    window.addEventListener("close-file", handleCloseFileEvent);
    window.addEventListener("close-directory", handleCloseDirEvent);
    window.addEventListener("open-dashboard", handleOpenDashboardEvent);
    window.addEventListener("open-characters-graph", handleOpenCharactersGraphEvent);
    return () => {
      window.removeEventListener("refresh-explorer", handleRefresh);
      window.removeEventListener("open-file", handleOpenFileEvent);
      window.removeEventListener("close-file", handleCloseFileEvent);
      window.removeEventListener("close-directory", handleCloseDirEvent);
      window.removeEventListener("open-dashboard", handleOpenDashboardEvent);
      window.removeEventListener("open-characters-graph", handleOpenCharactersGraphEvent);
    };

  }, [handleOpenFile, handleCloseFileTab, handleOpenDashboard, handleOpenCharactersGraph]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat;

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;

  // Global writing action states
  const [globalWriteMode, setGlobalWriteMode] = useState<"normal" | "draft">("normal");
  const [isGlobalWriteDropdownOpen, setIsGlobalWriteDropdownOpen] = useState(false);
  const [globalWriteLoading, setGlobalWriteLoading] = useState(false);

  useEffect(() => {
    const handleWriteStart = () => setGlobalWriteLoading(true);
    const handleWriteEnd = () => setGlobalWriteLoading(false);

    window.addEventListener("write-start", handleWriteStart);
    window.addEventListener("write-end", handleWriteEnd);
    return () => {
      window.removeEventListener("write-start", handleWriteStart);
      window.removeEventListener("write-end", handleWriteEnd);
    };
  }, []);

  const handleGlobalWriteClick = useCallback((mode: "normal" | "draft") => {
    // Check if the current tab is an active chapter
    const isActiveChapter = activeFileTab?.filePath && 
      !activeFileTab.filePath.startsWith("dashboard:") && 
      !activeFileTab.filePath.startsWith("characters:") &&
      activeFileTab.filePath.includes("/chapters/");

    if (isActiveChapter) {
      window.dispatchEvent(new CustomEvent("trigger-global-write", { detail: { mode } }));
    } else {
      // Find if any open tab is a chapter file
      const openChapterTab = fileTabs.find(tab => 
        tab.filePath && 
        !tab.filePath.startsWith("dashboard:") && 
        !tab.filePath.startsWith("characters:") &&
        tab.filePath.includes("/chapters/")
      );

      if (openChapterTab) {
        setActiveFileTabId(openChapterTab.id);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("trigger-global-write", { detail: { mode } }));
        }, 150);
      } else if (latestChapterPath && latestChapterName) {
        // Automatically open the latest chapter and trigger write
        handleOpenFile(latestChapterPath, latestChapterName);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("trigger-global-write", { detail: { mode } }));
        }, 300);
      }
    }
  }, [activeFileTab, fileTabs, latestChapterPath, latestChapterName, handleOpenFile]);

  const [availableStyles, setAvailableStyles] = useState<string[]>([]);
  const [activeStyleName, setActiveStyleName] = useState<string | null>(null);
  const [isInkosWorkspace, setIsInkosWorkspace] = useState(false);
  const [hasBooks, setHasBooks] = useState(false);
  const [hasChapters, setHasChapters] = useState(false);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [isStyleSwitching, setIsStyleSwitching] = useState(false);

  const handleStylesChange = useCallback((styles: string[], activeStyle: string | null) => {
    setAvailableStyles(styles);
    setActiveStyleName(activeStyle);
    setIsStyleSwitching(false);
  }, []);

  const triggerStyleSwitch = useCallback((styleName: string) => {
    setIsStyleSwitching(true);
    window.dispatchEvent(new CustomEvent("trigger-style-switch", { detail: { styleName } }));
  }, []);

  const handleStyleSelectChange = useCallback((targetValue: string) => {
    const previousValue = activeStyleName || "default";
    if (targetValue === previousValue) return;

    if (!showExecutionConfirm) {
      triggerStyleSwitch(targetValue);
      return;
    }

    setStyleConfirm({
      targetStyle: targetValue,
      onConfirm: () => {
        triggerStyleSwitch(targetValue);
        setStyleConfirm(null);
      },
      onCancel: () => {
        setStyleConfirm(null);
      }
    });
  }, [activeStyleName, showExecutionConfirm, triggerStyleSwitch]);

  const handleWorkspaceStatusChange = useCallback((
    isInkos: boolean,
    books: boolean,
    chapters: boolean,
    maxCh?: number,
    latestPath?: string | null,
    latestName?: string | null
  ) => {
    setIsInkosWorkspace(isInkos);
    setHasBooks(books);
    setHasChapters(chapters);
    if (typeof maxCh === "number") {
      setMaxChapterNumber(maxCh);
    } else {
      setMaxChapterNumber(null);
    }
    setLatestChapterPath(latestPath ?? null);
    setLatestChapterName(latestName ?? null);
  }, []);

  const getNextChapterNumber = useCallback(() => {
    const isActiveChapter = activeFileTab?.filePath && 
      !activeFileTab.filePath.startsWith("dashboard:") && 
      !activeFileTab.filePath.startsWith("characters:") &&
      activeFileTab.filePath.includes("/chapters/");
      
    let targetPath = "";
    if (isActiveChapter && activeFileTab) {
      targetPath = activeFileTab.filePath;
    } else {
      const openChapterTab = fileTabs.find(tab => 
        tab.filePath && 
        !tab.filePath.startsWith("dashboard:") && 
        !tab.filePath.startsWith("characters:") &&
        tab.filePath.includes("/chapters/")
      );
      if (openChapterTab) {
        targetPath = openChapterTab.filePath;
      }
    }

    if (!targetPath) {
      if (typeof maxChapterNumber === "number" && maxChapterNumber > 0) {
        return maxChapterNumber + 1;
      }
      return null;
    }

    const fileName = targetPath.split("/").pop() || "";
    const match = fileName.match(/^(\d+)/);
    if (match) {
      const currentNum = parseInt(match[1], 10);
      return currentNum + 1;
    }
    return null;
  }, [activeFileTab, fileTabs, maxChapterNumber]);



  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        initialSessionId={initialSessionId}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? null}
        onCwdChange={handleCwdChange}
        onOpenFile={handleOpenFile}
        explorerRefreshKey={explorerRefreshKey}
        onAtMention={handleAtMention}
        activeGemId={activeGemId}
        availableStyles={availableStyles}
        activeStyleName={activeStyleName}
        onStylesChange={handleStylesChange}
        onWorkspaceStatusChange={handleWorkspaceStatusChange}
        onActiveBookChange={setActiveBookId}
      />
    </>
  );

  return (
    <>
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}>
      {/* Mobile overlay backdrop */}
      <div
        className="sidebar-overlay-backdrop"
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.4)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Left sidebar */}
      <div
        className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
        style={{
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 200,
        }}
      >
        {sidebarContent}
      </div>

      {/* Center: chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border)", height: 36, background: "var(--bg-panel)" }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, padding: 0,
              background: "none", border: "none", borderRight: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {sidebarOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>

          {/* Writer Toolbar integrated in-between toggle buttons */}
          {isInkosWorkspace && (
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0, height: "100%" }}>
              {/* 1. Style Switcher (切换风格) */}
              <div style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                borderRight: "1px solid var(--border)",
                height: "100%",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  height: 24,
                  transition: "all 0.2s ease",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <select
                    value={styleConfirm ? styleConfirm.targetStyle : (activeStyleName || "default")}
                    disabled={isStyleSwitching}
                    onChange={(e) => handleStyleSelectChange(e.target.value)}
                    style={{
                      background: "none",
                      color: "#818cf8",
                      border: "none",
                      fontSize: "11px",
                      outline: "none",
                      cursor: (availableStyles && availableStyles.length > 1) ? "pointer" : "default",
                      padding: "0 4px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                    }}
                  >
                    {availableStyles && availableStyles.length > 0 ? (
                      availableStyles.map((style) => (
                        <option key={style} value={style} style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                          {style}
                        </option>
                      ))
                    ) : (
                      <option value="default" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>default</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Global Writing Action Pill */}
              {hasChapters && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  borderRight: "1px solid var(--border)",
                  height: "100%",
                }}>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {/* Left Action Button */}
                    <button
                      onClick={() => !globalWriteLoading && handleGlobalWriteClick(globalWriteMode)}
                      disabled={globalWriteLoading}
                      title={globalWriteMode === "normal" ? "智能续写 (Smart Continue)" : "极速草稿 (Quick Draft)"}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        height: 24,
                        background: "var(--accent)",
                        border: "1px solid var(--accent)",
                        borderTopLeftRadius: "6px",
                        borderBottomLeftRadius: "6px",
                        borderRight: "none",
                        padding: "0 10px",
                        color: "#ffffff",
                        cursor: globalWriteLoading ? "not-allowed" : "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                        fontFamily: "var(--font-serif)",
                        transition: "all 0.2s ease",
                        outline: "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!globalWriteLoading) {
                          e.currentTarget.style.background = "var(--accent-hover)";
                          e.currentTarget.style.borderColor = "var(--accent-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!globalWriteLoading) {
                          e.currentTarget.style.background = "var(--accent)";
                          e.currentTarget.style.borderColor = "var(--accent)";
                        }
                      }}
                    >
                      {(() => {
                        const nextCh = getNextChapterNumber();
                        const suffix = nextCh !== null ? `第${nextCh}章` : "";
                        if (globalWriteLoading) {
                          return (
                            <>
                              <span style={{
                                marginRight: 4,
                                display: "inline-block",
                                animation: "spin 1s linear infinite",
                              }}>⏳</span>
                              <span>{globalWriteMode === "normal" ? `正在续写${suffix}...` : `正在起草${suffix}...`}</span>
                            </>
                          );
                        }
                        return (
                          <>
                            <span style={{ marginRight: 4 }}>{globalWriteMode === "normal" ? "✍️" : "⚡"}</span>
                            <span>{globalWriteMode === "normal" ? `智能续写${suffix}` : `极速草稿${suffix}`}</span>
                          </>
                        );
                      })()}
                    </button>

                    {/* Dropdown Toggle */}
                    <button
                      onClick={() => setIsGlobalWriteDropdownOpen(!isGlobalWriteDropdownOpen)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 24,
                        background: "var(--accent)",
                        border: "1px solid var(--accent)",
                        borderLeft: "1px solid rgba(255, 255, 255, 0.25)",
                        borderTopRightRadius: "6px",
                        borderBottomRightRadius: "6px",
                        padding: 0,
                        color: "#ffffff",
                        cursor: "pointer",
                        fontSize: "8px",
                        transition: "all 0.2s ease",
                        outline: "none",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--accent-hover)";
                        e.currentTarget.style.borderColor = "var(--accent-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--accent)";
                        e.currentTarget.style.borderColor = "var(--accent)";
                      }}
                    >
                      ▼
                    </button>

                    {/* Dropdown Menu */}
                    {isGlobalWriteDropdownOpen && (
                      <>
                        {/* Invisible backdrop to capture outside clicks */}
                        <div
                          onClick={() => setIsGlobalWriteDropdownOpen(false)}
                          style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 999,
                          }}
                        />
                        <div style={{
                          position: "absolute",
                          top: "28px",
                          right: 0,
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          padding: "4px",
                          zIndex: 1000,
                          minWidth: "140px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}>
                          {(() => {
                            const nextCh = getNextChapterNumber();
                            return (
                              <>
                                <button
                                  onClick={() => {
                                    setGlobalWriteMode("normal");
                                    setIsGlobalWriteDropdownOpen(false);
                                  }}
                                  style={{
                                    background: globalWriteMode === "normal" ? "var(--bg-hover)" : "none",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "6px 8px",
                                    color: globalWriteMode === "normal" ? "var(--accent)" : "var(--text)",
                                    textAlign: "left",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                    fontWeight: globalWriteMode === "normal" ? 600 : 400,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    width: "100%",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (globalWriteMode !== "normal") e.currentTarget.style.background = "var(--bg-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (globalWriteMode !== "normal") e.currentTarget.style.background = "none";
                                  }}
                                >
                                  <span>✍️</span>
                                  <span>智能续写 {nextCh !== null ? `第${nextCh}章` : "(标准)"}</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setGlobalWriteMode("draft");
                                    setIsGlobalWriteDropdownOpen(false);
                                  }}
                                  style={{
                                    background: globalWriteMode === "draft" ? "var(--bg-hover)" : "none",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "6px 8px",
                                    color: globalWriteMode === "draft" ? "var(--accent)" : "var(--text)",
                                    textAlign: "left",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                    fontWeight: globalWriteMode === "draft" ? 600 : 400,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    width: "100%",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (globalWriteMode !== "draft") e.currentTarget.style.background = "var(--bg-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (globalWriteMode !== "draft") e.currentTarget.style.background = "none";
                                  }}
                                >
                                  <span>⚡</span>
                                  <span>极速草稿 {nextCh !== null ? `第${nextCh}章` : "(快跑)"}</span>
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 1.5. Chapter Control Dashboard (章节管控看板) */}
              {hasBooks && activeBookId && (
                <button
                  onClick={() => {
                    handleOpenDashboard(activeBookId);
                  }}
                  title="章节管控看板 (Chapter Control Center)"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: "100%",
                    padding: "0 12px",
                    background: "none",
                    border: "none",
                    borderRight: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ fontSize: 12 }}>📊</span>
                  <span>章节管控看板</span>
                </button>
              )}


              {/* 2. Style Clone Workshop (文风克隆工坊) */}
              {hasBooks && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new Event("trigger-style-clone"));
                  }}
                  title="文风克隆工坊 (Style Clone)"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: "100%",
                    padding: "0 12px",
                    background: "none",
                    border: "none",
                    borderRight: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
                    <path d="M8 10h.01M16 10h.01" strokeWidth="3" />
                    <path d="M12 14a3 3 0 0 0-3 3h6a3 3 0 0 0-3-3z" />
                  </svg>
                  <span>文风克隆工坊</span>
                </button>
              )}

              {/* 3. Market Radar (市场雷达) */}
              <button
                onClick={() => {
                  window.dispatchEvent(new Event("trigger-radar"));
                }}
                title="市场雷达 (Market Intelligence Scan)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  padding: "0 12px",
                  background: "none",
                  border: "none",
                  borderRight: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  transition: "color 0.12s, background 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 17c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                </svg>
                <span>市场雷达</span>
              </button>
            </div>
          )}

          {/* Branches and System buttons hidden for novelist-oriented Zen UI */}
          {/* Session stats — right-aligned in top bar */}
          {showChat && (sessionStats || contextUsage) && (() => {
            const t = sessionStats?.tokens;
            const c = sessionStats?.cost ?? 0;
            const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
            const costStr = c > 0 ? (c >= 0.01 ? `$${c.toFixed(2)}` : `<$0.01`) : null;

            let ctxColor = "var(--text-muted)";
            let ctxStr: string | null = null;
            if (contextUsage?.contextWindow) {
              const pct = contextUsage.percent;
              if (pct !== null && pct > 90) ctxColor = "#ef4444";
              else if (pct !== null && pct > 70) ctxColor = "rgba(234,179,8,0.95)";
              ctxStr = pct !== null ? `${pct.toFixed(0)}% / ${fmt(contextUsage.contextWindow)}` : `? / ${fmt(contextUsage.contextWindow)}`;
            }

            const tooltipParts: string[] = [];
            if (t) {
              tooltipParts.push(`in: ${t.input.toLocaleString()}`);
              tooltipParts.push(`out: ${t.output.toLocaleString()}`);
              tooltipParts.push(`cache read: ${t.cacheRead.toLocaleString()}`);
              tooltipParts.push(`cache write: ${t.cacheWrite.toLocaleString()}`);
              if (c > 0) tooltipParts.push(`cost: $${c.toFixed(4)}`);
            }
            if (contextUsage?.contextWindow) {
              const pct = contextUsage.percent;
              tooltipParts.push(`context: ${pct !== null ? pct.toFixed(1) + "%" : "unknown"} of ${contextUsage.contextWindow.toLocaleString()} tokens`);
            }
            const tooltip = tooltipParts.join("  |  ");

            return (
              <div
                title={tooltip}
                style={{
                  marginLeft: "auto",
                  flex: "0 1 auto",
                  minWidth: 0,
                  overflow: "hidden",
                  display: "flex", alignItems: "center", gap: 10,
                  paddingLeft: 12,
                  paddingRight: rightPanelOpen ? 12 : 156,
                  height: "100%",
                  fontSize: 11, color: "var(--text-muted)",
                  whiteSpace: "nowrap", cursor: "default",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t && t.input > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="8.5" x2="5" y2="1.5" /><polyline points="2 4 5 1.5 8 4" />
                    </svg>
                    {fmt(t.input)}
                  </span>
                )}
                {t && t.output > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
                    </svg>
                    {fmt(t.output)}
                  </span>
                )}
                {t && t.cacheRead > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 5a3.5 3.5 0 1 1-1-2.45" /><polyline points="6.5 1.5 8.5 2.5 7.5 4.5" />
                    </svg>
                    {fmt(t.cacheRead)}
                  </span>
                )}
                {costStr && (
                  <span style={{ display: "flex", alignItems: "center", color: "var(--text)", fontWeight: 500 }}>
                    {costStr}
                  </span>
                )}
                {ctxStr && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: ctxColor }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 9 L1 5 Q1 1 5 1 Q9 1 9 5 L9 9" /><line x1="1" y1="9" x2="9" y2="9" />
                    </svg>
                    {ctxStr}
                  </span>
                )}
              </div>
            );
          })()}
          {/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              zIndex: 500,
            }}>
              {activeTopPanel === "system" && (
                <div style={{
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {systemPrompt ? (
                    <div style={{
                      maxHeight: "min(600px, 75vh)",
                      overflowY: "auto",
                      padding: "12px 16px",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {systemPrompt}
                    </div>
                  ) : systemPrompt === "" ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      System prompt is empty (tools are disabled)
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      Send a message to load the system prompt
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Editor Tab Bar */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", height: 36 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseFileTab}
            />
          </div>
        </div>

        {/* Editor Main Content Area */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "var(--bg)" }}>
          {activeFileTab?.filePath ? (
            activeFileTab.filePath.startsWith("dashboard:") ? (
              <ChapterDashboard
                bookId={activeFileTab.filePath.substring("dashboard:".length)}
                cwd={activeCwd!}
                onOpenFile={handleOpenFile}
              />
            ) : activeFileTab.filePath.startsWith("characters:") ? (
              <CharacterRelationDashboard
                bookId={activeFileTab.filePath.substring("characters:".length)}
                cwd={activeCwd!}
                onOpenFile={handleOpenFile}
              />
            ) : (
              <FileViewer
                filePath={activeFileTab.filePath}
                cwd={activeCwd ?? undefined}
                availableStyles={availableStyles}
                activeStyleName={activeStyleName}
                showExecutionConfirm={showExecutionConfirm}
              />
            )
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                开始您的文学创作之旅
              </div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", maxWidth: 360, lineHeight: 1.6 }}>
                在左侧“项目目录”中选择故事大纲、章节草稿或人设卡片，即可在此开启沉浸式 Zen 模式协同写作。
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Collapsible AI Co-writer assistant */}
      <div
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"}`}
        style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {/* Right panel header */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", height: 36, padding: "0 12px" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            写作协同姬 (AI Copilot)
          </span>
        </div>

        {/* AI Co-writer chat window */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {showChat ? (
            <ChatWindow
              session={selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={handleAgentEnd}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSessionStatsChange={handleSessionStatsChange}
              onContextUsageChange={handleContextUsageChange}
              activeGemId={activeGemId}
            />
          ) : showPlaceholder ? (
            activeCwd ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13, padding: 16, textAlign: "center" }}>
                请在左侧侧边栏中选择或新建写作会话以激活 AI 写作姬。
              </div>
            ) : (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "flex-start", gap: 8, userSelect: "none", pointerEvents: "none" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <line x1="20" y1="12" x2="4" y2="12" /><polyline points="10 6 4 12 10 18" />
                </svg>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>创作起航</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    1. 在左侧选择项目工作区<br />
                    2. 点击底部 Models 键配置模型
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
    {/* Models Config toggle — always visible at top-right, left of the settings toggle */}
    <button
      onClick={() => setModelsConfigOpen(true)}
      title="配置模型"
      style={{
        position: "fixed", top: 0, right: 144, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: "var(--bg-panel)", border: "none", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        color: "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    </button>
    {/* Global Settings toggle — placed between Models Config and Help buttons */}
    <button
      onClick={() => setSettingsOpen(true)}
      title="全局设置"
      style={{
        position: "fixed", top: 0, right: 108, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: "var(--bg-panel)", border: "none", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        color: "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
    {/* Novel Writing Guide Help toggle — placed between Settings and Theme buttons */}
    <button
      onClick={() => setHelpOpen(true)}
      title="小说创作实战手册"
      style={{
        position: "fixed", top: 0, right: 72, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: "var(--bg-panel)", border: "none", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        color: "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
      </svg>
    </button>
    {/* Theme toggle (Moon/Sun) — fixed at right: 36 */}
    <button
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      style={{
        position: "fixed", top: 0, right: 36, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: "var(--bg-panel)", border: "none", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        color: "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
    {/* Right panel toggle — always visible at top-right */}
    <button
      onClick={() => setRightPanelOpen((v) => !v)}
      title={rightPanelOpen ? "隐藏写作辅助" : "显示写作辅助"}
      style={{
        position: "fixed", top: 0, right: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: "var(--bg-panel)", border: "none", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        color: rightPanelOpen ? "var(--text)" : "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = rightPanelOpen ? "var(--text)" : "var(--text-muted)"; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
    {modelsConfigOpen && <ModelsConfig onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }} />}
    {skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
      <SkillsConfig cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} />
    )}
    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    {styleConfirm && (
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(10, 10, 10, 0.4)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.2s ease-out"
      }}
      onClick={styleConfirm.onCancel}
      >
        <div style={{
          width: "min(500px, 92%)",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "var(--font-serif)"
        }}
        onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 24px",
            background: "rgba(99, 102, 241, 0.08)",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              border: `1px solid #818cf833`,
              boxShadow: `0 2px 8px rgba(99, 102, 241, 0.15)`
            }}>
              🎭
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>确认更换写作文风</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>将风格切换至：{styleConfirm.targetStyle}</span>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              fontSize: 13,
              color: "var(--text)",
              lineHeight: "1.6",
            }}>
              您正在准备将当前书籍的写作风格切换为 <strong style={{ color: "#818cf8" }}>「{styleConfirm.targetStyle}」</strong>。
            </div>
            
            <div style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderLeft: `4px solid #818cf8`,
              borderRadius: "8px",
              padding: "14px 18px",
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: "1.7",
            }}>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>⚠️ 注意事项：</span>
              此操作将使用该文风模板自动覆盖当前书籍的活动文风指南（`story/style_guide.md`）与统计特征库（`style_profile.json`）。历史章节正文不会被修改。
            </div>

            <div style={{
              background: "var(--bg-hover)",
              borderRadius: "8px",
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: "1.6",
            }}>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>💡 后续操作指引：</span>
              切换成功后，接下来的「智能续写」、「极速草稿」、「文本润色」和「剧情重写」等 AI 生成动作，都将自动采用该风格进行写作。
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            padding: "16px 24px",
            background: "var(--bg-panel)",
            borderTop: "1px solid var(--border)"
          }}>
            <button
              onClick={styleConfirm.onCancel}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontWeight: 500,
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              取消
            </button>
            <button
              onClick={styleConfirm.onConfirm}
              style={{
                padding: "7px 20px",
                fontSize: 12,
                borderRadius: 8,
                border: "none",
                background: "#818cf8",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
                boxShadow: `0 4px 12px rgba(99, 102, 241, 0.33)`,
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = `0 6px 16px rgba(99, 102, 241, 0.44)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = `0 4px 12px rgba(99, 102, 241, 0.33)`;
              }}
            >
              确定更换
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
