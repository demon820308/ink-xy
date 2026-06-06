"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/hooks/useTheme";
import { encodeFilePathForApi, getFileName, getRelativeFilePath } from "@/lib/file-paths";

interface Props {
  filePath: string;
  cwd?: string;
  availableStyles?: string[];
  activeStyleName?: string | null;
  showExecutionConfirm?: boolean;
}

interface FileData {
  content: string;
  language: string;
  size: number;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac", "weba", "webm"]);
const PPTX_EXTS = new Set(["pptx", "ppt"]);

function isImagePath(filePath: string): boolean {
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXTS.has(ext);
}

function isAudioPath(filePath: string): boolean {
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return AUDIO_EXTS.has(ext);
}

function isPptxPath(filePath: string): boolean {
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return PPTX_EXTS.has(ext);
}

function getBookIdFromPath(filePath: string, cwd?: string): string | null {
  if (!cwd) return null;
  const relative = getRelativeFilePath(filePath, cwd);
  const normalized = relative.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts[0] === "books" && parts[1]) {
    return parts[1];
  }
  return null;
}

function getFileDisplayPath(filePath: string, cwd?: string): string {
  const relative = getRelativeFilePath(filePath, cwd);
  const normalized = relative.replace(/\\/g, "/");
  const match = normalized.match(/^books\/[^/]+\/chapters\/(.+)$/);
  if (match) {
    return match[1];
  }
  return relative;
}

type DiffLine =
  | { type: "unchanged"; text: string; lineNo: number }
  | { type: "removed"; text: string; lineNo: number }
  | { type: "added"; text: string; lineNo: number };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Myers diff — returns line-level unified diff
function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;
  const max = m + n;
  const v: number[] = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
        x = v[k + 1 + max];
      } else {
        x = v[k - 1 + max] + 1;
      }
      let y = x - k;
      while (x < m && y < n && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[k + max] = x;
      if (x >= m && y >= n) {
        // backtrack
        const result: DiffLine[] = [];
        let cx = m, cy = n;
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd - 1];
          const pk = cx - cy;
          let prevK: number;
          if (pk === -dd || (pk !== dd && pv[pk - 1 + max] < pv[pk + 1 + max])) {
            prevK = pk + 1;
          } else {
            prevK = pk - 1;
          }
          const prevX = pv[prevK + max];
          const prevY = prevX - prevK;
          while (cx > prevX && cy > prevY) {
            cx--;
            cy--;
            result.unshift({ type: "unchanged", text: oldLines[cx], lineNo: cx + 1 });
          }
          if (dd > 0) {
            if (cx > prevX) {
              cx--;
              result.unshift({ type: "removed", text: oldLines[cx], lineNo: cx + 1 });
            } else {
              cy--;
              result.unshift({ type: "added", text: newLines[cy], lineNo: cy + 1 });
            }
          }
        }
        while (cx > 0 && cy > 0) {
          cx--;
          cy--;
          result.unshift({ type: "unchanged", text: oldLines[cx], lineNo: cx + 1 });
        }
        return result;
      }
    }
  }
  // Fallback: treat all as replaced
  return [
    ...oldLines.map((t, i) => ({ type: "removed" as const, text: t, lineNo: i + 1 })),
    ...newLines.map((t, i) => ({ type: "added" as const, text: t, lineNo: i + 1 })),
  ];
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string; language: string }) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const diff = diffLines(oldLines, newLines);

  const hasChanges = diff.some((l) => l.type !== "unchanged");
  if (!hasChanges) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        No changes
      </div>
    );
  }

  // Render with context: show 3 lines around each change, collapse the rest
  const CONTEXT = 3;
  const changed = new Set(diff.flatMap((l, i) => (l.type !== "unchanged" ? [i] : [])));
  const visible = new Set<number>();
  for (const ci of changed) {
    for (let j = Math.max(0, ci - CONTEXT); j <= Math.min(diff.length - 1, ci + CONTEXT); j++) {
      visible.add(j);
    }
  }

  const segments: Array<{ hidden: true; count: number } | { hidden: false; lines: DiffLine[] }> = [];
  let i = 0;
  while (i < diff.length) {
    if (visible.has(i)) {
      const block: DiffLine[] = [];
      while (i < diff.length && visible.has(i)) {
        block.push(diff[i]);
        i++;
      }
      segments.push({ hidden: false, lines: block });
    } else {
      let count = 0;
      while (i < diff.length && !visible.has(i)) {
        count++;
        i++;
      }
      segments.push({ hidden: true, count });
    }
  }

  // Track running line number for added/unchanged lines
  const newLineNos: number[] = [];
  let nlo = 1;
  for (const line of diff) {
    if (line.type === "removed") {
      newLineNos.push(0);
    } else {
      newLineNos.push(nlo++);
    }
  }

  let diffIdx = 0;

  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6 }}>
      {segments.map((seg, si) => {
        if (seg.hidden) {
          const result = (
            <div
              key={si}
              style={{
                padding: "2px 16px",
                color: "var(--text-dim)",
                background: "var(--bg-panel)",
                fontSize: 11,
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              ... {seg.count} unchanged lines ...
            </div>
          );
          diffIdx += seg.count;
          return result;
        }
        const lines = seg.lines.map((line, li) => {
          const idx = diffIdx + li;
          const newLno = newLineNos[idx];
          const bg =
            line.type === "added"
              ? "rgba(0,200,80,0.12)"
              : line.type === "removed"
              ? "rgba(240,60,60,0.14)"
              : "transparent";
          const prefix =
            line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
          const prefixColor =
            line.type === "added" ? "#4ade80" : line.type === "removed" ? "#f87171" : "var(--text-dim)";

          return (
            <div
              key={li}
              style={{
                display: "flex",
                background: bg,
                borderLeft: line.type === "added"
                  ? "3px solid #4ade80"
                  : line.type === "removed"
                  ? "3px solid #f87171"
                  : "3px solid transparent",
              }}
            >
              <span
                style={{
                  minWidth: 44,
                  padding: "0 8px 0 16px",
                  textAlign: "right",
                  color: "var(--text-dim)",
                  userSelect: "none",
                  fontSize: 11,
                  lineHeight: 1.6,
                  borderRight: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  flexShrink: 0,
                }}
              >
                {line.type === "removed" ? line.lineNo : newLno || ""}
              </span>
              <span
                style={{
                  minWidth: 16,
                  padding: "0 6px",
                  color: prefixColor,
                  userSelect: "none",
                  flexShrink: 0,
                  fontWeight: 600,
                }}
              >
                {prefix}
              </span>
              <span
                style={{
                  flex: 1,
                  padding: "0 8px 0 0",
                  whiteSpace: "pre",
                  color: "var(--text)",
                  overflowX: "auto",
                }}
              >
                {line.text || "\u00a0"}
              </span>
            </div>
          );
        });
        diffIdx += seg.lines.length;
        return <div key={si}>{lines}</div>;
      })}
    </div>
  );
}

function ImageViewer({ filePath, cwd }: { filePath: string; cwd?: string }) {
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileName(filePath).toLowerCase().split(".").pop() ?? "";

  useEffect(() => {
    setBust(0);
    setSize(null);
    setNaturalSize(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const encoded = encodeFilePathForApi(filePath);
    const es = new EventSource(`/api/files/${encoded}?type=watch`);
    esRef.current = es;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") setSize(d.size);
      } catch { /* ignore */ }
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setBust((b) => b + 1);
      }, 1000); // 1.0s debounce for images
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      es.close();
      esRef.current = null;
    };
  }, [filePath]);

  const encoded = encodeFilePathForApi(filePath);
  const src = `/api/files/${encoded}?type=read${bust ? `&v=${bust}` : ""}`;

  const formatSizeStr = size != null ? formatSize(size) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }} title={filePath}>
          {getFileDisplayPath(filePath, cwd)}
        </span>
        <span style={{ marginLeft: "auto" }}>{ext || "image"}</span>
        {naturalSize && <span>{naturalSize.w} × {naturalSize.h}</span>}
        {formatSizeStr && <span>{formatSizeStr}</span>}
        <span
          title={watching ? "Live sync active" : "Not watching"}
          style={{ display: "flex", alignItems: "center", gap: 4, color: watching ? "#4ade80" : "var(--text-dim)" }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: watching ? "#4ade80" : "var(--border)",
              display: "inline-block",
              boxShadow: watching ? "0 0 4px #4ade80" : "none",
            }}
          />
          {watching ? "live" : "static"}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          backgroundImage:
            "linear-gradient(45deg, var(--bg) 25%, transparent 25%), linear-gradient(-45deg, var(--bg) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--bg) 75%), linear-gradient(-45deg, transparent 75%, var(--bg) 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
        }}
      >
        {error ? (
          <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={filePath}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            onError={() => setError("Failed to load image")}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function AudioViewer({ filePath, cwd }: { filePath: string; cwd?: string }) {
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileName(filePath).toLowerCase().split(".").pop() ?? "";

  useEffect(() => {
    setBust(0);
    setSize(null);
    setDuration(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const encoded = encodeFilePathForApi(filePath);
    const es = new EventSource(`/api/files/${encoded}?type=watch`);
    esRef.current = es;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") setSize(d.size);
      } catch { /* ignore */ }
      setDuration(null);
      setError(null);
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setBust((b) => b + 1);
      }, 1000); // 1.0s debounce for audio
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      es.close();
      esRef.current = null;
    };
  }, [filePath]);

  const encoded = encodeFilePathForApi(filePath);
  const src = `/api/files/${encoded}?type=read${bust ? `&v=${bust}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }} title={filePath}>
          {getFileDisplayPath(filePath, cwd)}
        </span>
        <span style={{ marginLeft: "auto" }}>{ext || "audio"}</span>
        {duration != null && <span>{formatDuration(duration)}</span>}
        {size != null && <span>{formatSize(size)}</span>}
        <span
          title={watching ? "Live sync active" : "Not watching"}
          style={{ display: "flex", alignItems: "center", gap: 4, color: watching ? "#4ade80" : "var(--text-dim)" }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: watching ? "#4ade80" : "var(--border)",
              display: "inline-block",
              boxShadow: watching ? "0 0 4px #4ade80" : "none",
            }}
          />
          {watching ? "live" : "static"}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ width: "min(680px, 100%)" }}>
          {error && (
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
              {error}
            </div>
          )}
          <audio
            key={src}
            controls
            preload="metadata"
            src={src}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setError("Failed to load audio")}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

function isLocalOrPrivateHost(hostname: string): boolean {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return true;
  }
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Pattern);
  if (match) {
    const [, p1, p2] = match.map(Number);
    if (p1 === 10) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 169 && p2 === 254) return true;
    if (p1 === 127) return true;
  }
  if (hostname.startsWith("[fe8") || hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("fe8") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return true;
  }
  return false;
}

interface PptxViewerInstance {
  processor?: {
    getSlideDimensions?(): { cx: number; cy: number };
    presentation?: {
      slideSize?: { cx: number; cy: number };
    };
  };
  renderSlide(slideIndex: number, canvas: HTMLCanvasElement | null, options?: Record<string, unknown>): Promise<unknown>;
  getSlideCount(): number;
  getCurrentSlideIndex(): number;
  destroy(): void;
}

function LocalPptxViewer({ src }: { filePath: string; src: string; formatSizeStr: string | null; ext: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<PptxViewerInstance | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDimensions, setModalDimensions] = useState<{ width: number; height: number } | null>(null);

  // 1. Observe container dimensions dynamically
  useEffect(() => {
    if (!containerRef.current) return;

    // Set initial size
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  // 1b. Observe modal container dimensions dynamically when open
  useEffect(() => {
    if (!isModalOpen || !modalContainerRef.current) return;

    // Set initial size
    const rect = modalContainerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setModalDimensions({ width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setModalDimensions({ width, height });
      }
    });

    observer.observe(modalContainerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [isModalOpen]);

  // 2. Load the PPTX presentation (only on src change)
  useEffect(() => {
    let active = true;
    let localViewer: PptxViewerInstance | null = null;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Fetch ArrayBuffer of the PPTX file
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        if (!active) return;

        // Dynamically import pptxviewjs client-side to prevent SSR issues
        const { PPTXViewer } = await import("pptxviewjs");
        
        if (!active) return;

        const rawViewer = new PPTXViewer({
          canvas: canvasRef.current,
          slideSizeMode: "fit",
          autoChartRerenderDelayMs: 200,
        });

        localViewer = rawViewer as unknown as PptxViewerInstance;
        await rawViewer.loadFile(new Uint8Array(arrayBuffer));

        if (!active) return;

        setTotalSlides(localViewer.getSlideCount());
        setCurrentSlide(localViewer.getCurrentSlideIndex());
        
        let ratio = 16 / 9;
        const processor = localViewer.processor;
        if (processor) {
          if (typeof processor.getSlideDimensions === "function") {
            const slideSize = processor.getSlideDimensions();
            if (slideSize && slideSize.cx && slideSize.cy) {
              ratio = slideSize.cx / slideSize.cy;
            }
          } else if (processor.presentation?.slideSize) {
            const slideSize = processor.presentation.slideSize;
            if (slideSize && slideSize.cx && slideSize.cy) {
              ratio = slideSize.cx / slideSize.cy;
            }
          }
        }
        setAspectRatio(ratio);

        setViewer(localViewer);
        setLoading(false);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("PPTX render error:", err);
        if (active) {
          setError(errMsg || "Failed to render PowerPoint presentation");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
      if (localViewer) {
        try {
          localViewer.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [src]);

  // 3. Calculate exact canvas dimensions based on container sizes and slide aspect ratio
  const currentRatio = aspectRatio || (16 / 9);
  let canvasWidth = 0;
  let canvasHeight = 0;

  if (dimensions) {
    // Keep 16px padding on all sides (total 32px subtracted)
    const maxW = Math.max(10, dimensions.width - 32);
    const maxH = Math.max(10, dimensions.height - 32);

    if (maxW / maxH > currentRatio) {
      canvasHeight = maxH;
      canvasWidth = maxH * currentRatio;
    } else {
      canvasWidth = maxW;
      canvasHeight = maxW / currentRatio;
    }
  }

  // Calculate exact canvas dimensions for the modal
  let modalCanvasWidth = 0;
  let modalCanvasHeight = 0;

  if (isModalOpen && modalDimensions) {
    // Keep 24px padding on each side (total 48px subtracted) and 80px for header
    const maxW = Math.max(10, modalDimensions.width - 48);
    const maxH = Math.max(10, modalDimensions.height - 80);

    if (maxW / maxH > currentRatio) {
      modalCanvasHeight = maxH;
      modalCanvasWidth = maxH * currentRatio;
    } else {
      modalCanvasWidth = maxW;
      modalCanvasHeight = maxW / currentRatio;
    }
  }

  // 4. Render the current slide on the main canvas when viewer, slide index, or canvas dimensions change
  useEffect(() => {
    const currentViewer = viewer;
    if (!currentViewer || !canvasRef.current || canvasWidth === 0 || canvasHeight === 0 || isModalOpen) return;

    let active = true;
    async function draw() {
      if (!currentViewer) return;
      try {
        await currentViewer.renderSlide(currentSlide, canvasRef.current, { quality: "high" });
      } catch (e) {
        if (active) {
          console.error("Render slide error:", e);
        }
      }
    }
    draw();

    return () => {
      active = false;
    };
  }, [viewer, currentSlide, canvasWidth, canvasHeight, isModalOpen]);

  // 4b. Render the current slide in the modal when viewer, currentSlide, dimensions, or canvas size changes
  useEffect(() => {
    const currentViewer = viewer;
    if (!isModalOpen || !currentViewer || !modalCanvasRef.current || modalCanvasWidth === 0 || modalCanvasHeight === 0) return;

    let active = true;
    async function draw() {
      if (!currentViewer) return;
      try {
        await currentViewer.renderSlide(currentSlide, modalCanvasRef.current, { quality: "high" });
      } catch (e) {
        if (active) {
          console.error("Render modal slide error:", e);
        }
      }
    }
    draw();

    return () => {
      active = false;
    };
  }, [isModalOpen, viewer, currentSlide, modalCanvasWidth, modalCanvasHeight]);

  const handleNext = () => {
    if (viewer && currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    if (viewer && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* PPT navigation toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 16px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
            {totalSlides > 0 ? `Slide ${currentSlide + 1} of ${totalSlides}` : "Loading slides..."}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={handlePrev}
            disabled={loading || currentSlide === 0}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              color: "var(--text)",
              cursor: (loading || currentSlide === 0) ? "default" : "pointer",
              opacity: (loading || currentSlide === 0) ? 0.5 : 1,
            }}
          >
            ◀ Prev
          </button>
          <button
            onClick={handleNext}
            disabled={loading || currentSlide === totalSlides - 1}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              color: "var(--text)",
              cursor: (loading || currentSlide === totalSlides - 1) ? "default" : "pointer",
              opacity: (loading || currentSlide === totalSlides - 1) ? 0.5 : 1,
            }}
          >
            Next ▶
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={loading || totalSlides === 0}
            title="Open in fullscreen zoom"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              color: "var(--text)",
              cursor: (loading || totalSlides === 0) ? "default" : "pointer",
              opacity: (loading || totalSlides === 0) ? 0.5 : 1,
            }}
          >
            🔍 Zoom
          </button>
          <a
            href={src}
            download
            title="Download original file"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--accent)",
              color: "white",
              textDecoration: "none",
              fontWeight: 500,
              marginLeft: 6
            }}
          >
            ⬇️ Download
          </a>
        </div>
      </div>

      {/* Main rendering area */}
      <div 
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-panel)",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {loading && (
          <div style={{
            position: "absolute",
            zIndex: 10,
            background: "rgba(0,0,0,0.05)",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 13
          }}>
            Rendering slide...
          </div>
        )}
        
        {error ? (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}>
            <div style={{
              padding: 24,
              background: "var(--bg-panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textAlign: "center",
              maxWidth: 400
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171", marginBottom: 8 }}>
                Local Preview Failed
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                {error}
              </div>
              <a
                href={src}
                download
                style={{
                  padding: "6px 16px",
                  background: "var(--accent)",
                  color: "white",
                  borderRadius: 4,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  display: "inline-block"
                }}
              >
                ⬇️ Download File
              </a>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: `${Math.round(canvasWidth)}px`,
              height: `${Math.round(canvasHeight)}px`,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              background: "white",
              display: "block",
              visibility: loading && totalSlides === 0 ? "hidden" : "visible"
            }}
          />
        )}
      </div>

      {/* Modal Zoom Overlay */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 24px",
          color: "white"
        }}>
          {/* Modal Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexShrink: 0
          }}>
            <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>
              {totalSlides > 0 ? `Slide ${currentSlide + 1} of ${totalSlides}` : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={handlePrev}
                disabled={currentSlide === 0}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#222",
                  color: "white",
                  cursor: currentSlide === 0 ? "default" : "pointer",
                  opacity: currentSlide === 0 ? 0.5 : 1,
                }}
              >
                ◀ Prev
              </button>
              <button
                onClick={handleNext}
                disabled={currentSlide === totalSlides - 1}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#222",
                  color: "white",
                  cursor: currentSlide === totalSlides - 1 ? "default" : "pointer",
                  opacity: currentSlide === totalSlides - 1 ? 0.5 : 1,
                }}
              >
                Next ▶
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: "6px 16px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  marginLeft: 12
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Modal Canvas Container */}
          <div 
            ref={modalContainerRef}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative"
            }}
          >
            {modalCanvasWidth > 0 && modalCanvasHeight > 0 && (
              <canvas
                ref={modalCanvasRef}
                style={{
                  width: `${Math.round(modalCanvasWidth)}px`,
                  height: `${Math.round(modalCanvasHeight)}px`,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  background: "white",
                  display: "block"
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PptxViewer({ filePath, cwd }: Props) {
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileName(filePath).toLowerCase().split(".").pop() ?? "";

  useEffect(() => {
    setBust(0);
    setSize(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const encoded = encodeFilePathForApi(filePath);
    const es = new EventSource(`/api/files/${encoded}?type=watch`);
    esRef.current = es;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") setSize(d.size);
      } catch { /* ignore */ }
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setBust((b) => b + 1);
      }, 1500); // 1.5s debounce for PPTX presentations
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      es.close();
      esRef.current = null;
    };
  }, [filePath]);

  const encoded = encodeFilePathForApi(filePath);
  const src = `/api/files/${encoded}?type=read${bust ? `&v=${bust}` : ""}`;

  const formatSizeStr = size != null ? formatSize(size) : null;

  // Google Docs / Office Online Viewer URL for PPT preview
  // Note: This requires the file to be publicly accessible.
  // For local or private network hosts, Microsoft/Google cannot access the file, so we'll show a download link instead.
  const isLocal = typeof window !== "undefined" && isLocalOrPrivateHost(window.location.hostname);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }} title={filePath}>
          {getFileDisplayPath(filePath, cwd)}
        </span>
        <span style={{ marginLeft: "auto" }}>{ext.toUpperCase()}</span>
        {formatSizeStr && <span>{formatSizeStr}</span>}
        <span
          title={watching ? "Live sync active" : "Not watching"}
          style={{ display: "flex", alignItems: "center", gap: 4, color: watching ? "#4ade80" : "var(--text-dim)" }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: watching ? "#4ade80" : "var(--border)",
              display: "inline-block",
              boxShadow: watching ? "0 0 4px #4ade80" : "none",
            }}
          />
          {watching ? "live" : "static"}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-panel)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {error ? (
          <div style={{ color: "#f87171", fontSize: 13, padding: 16 }}>{error}</div>
        ) : isLocal ? (
          <LocalPptxViewer filePath={filePath} src={src} formatSizeStr={formatSizeStr} ext={ext} />
        ) : (
          // For remote files, use iframe with Google Docs Viewer
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(window.location.origin + src)}`}
            style={{ width: "100%", height: "100%", border: "none" }}
            title="PPT Preview"
          />
        )}
      </div>
    </div>
  );
}

// ── Detect Report Component ───────────────────────────────────────────────────

interface DetectReportData {
  chapterNumber: number;
  detection: {
    score: number;
    provider: string;
  };
  passed: boolean;
}

function DetectReport({ data }: { data: DetectReportData }) {
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
        <span style={{ fontSize: 20 }}>{status.emoji}</span>
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
        <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>💡 创作者润色建议：</div>
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

interface AuditIssue {
  severity: string;
  category: string;
  description: string;
  suggestion?: string;
}

interface AuditReportData {
  passed: boolean;
  chapterNumber?: number;
  summary?: string;
  issues?: AuditIssue[];
}

function AuditReport({ data }: { data: AuditReportData }) {
  const isPassed = data.passed ?? false;
  const issues = data.issues ?? [];

  const severityConfig = (severity: string) => {
    const s = (severity || "info").toLowerCase();
    if (s === "error" || s === "critical")
      return { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "#f87171", label: "严重", emoji: "❌" };
    if (s === "warning")
      return { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "#fbbf24", label: "警告", emoji: "⚠️" };
    return { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "#60a5fa", label: "提示", emoji: "ℹ️" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingBottom: 16, borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ fontSize: 28 }}>🔍</div>
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
            {isPassed ? "✅ 审计通过" : "⚠️ 发现风险"}
          </span>
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            📝 本章内容总结
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
          🛠️ 审计诊断条目 ({issues.length})
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
          }}>
            ✅ 未检测到任何明显的角色设定矛盾或世界观冲突风险。
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
                    <span style={{ fontSize: 14 }}>{cfg.emoji}</span>
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

interface WriteReportData {
  chapterNumber: number;
  title: string;
  wordCount: number;
  revised: boolean;
  status: string;
  auditResult?: AuditReportData;
  autoReviseResult?: ReviseReportData;
}

function WriteReport({ data }: { data: WriteReportData }) {
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
        <div style={{ fontSize: 28 }}>{isDraft ? "🚀" : "✍️"}</div>
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
            {isDraft ? "🚀 极速草稿" : "✨ 已生成"}
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
            🔍 离线审稿审计
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
            {isPassed ? "✅ 审计通过 — 无明显逻辑矛盾或人设崩塌风险" : "⚠️ 审计未完全通过 — 检测到以下风险条目："}
          </div>

          {issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {issues.map((issue: AuditIssue, i: number) => {
                const sev = (issue.severity || "info").toLowerCase();
                const cfg =
                  sev === "error" || sev === "critical"
                    ? { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "#f87171", emoji: "❌", label: "严重" }
                    : sev === "warning"
                    ? { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "#fbbf24", emoji: "⚠️", label: "警告" }
                    : { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "#60a5fa", emoji: "ℹ️", label: "提示" };
                return (
                  <div key={i} style={{
                    padding: "12px 16px", background: cfg.bg,
                    border: `1px solid ${cfg.border}33`,
                    borderLeft: `3px solid ${cfg.border}`,
                    borderRadius: 8, display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13 }}>{cfg.emoji}</span>
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
          💡 <strong style={{ color: "var(--text)" }}>建议</strong>：点击工具栏的 <strong>「🪄 局部定点修复」</strong> 对以上风险条目进行自动局部修缮，或手动微调相关情节后点击 <strong>「🔄 同步设定」</strong> 重新对齐故事数据库。
        </div>
      )}
    </div>
  );
}

// ── Revise Report Component ────────────────────────────────────────────────────

interface ReviseReportData {
  applied?: boolean;
  skippedReason?: string;
  fixedIssues?: string[];
  status?: string;
  wordCount?: number;
}

function ReviseReport({ data, compact = false }: { data: ReviseReportData; compact?: boolean }) {
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
        <div style={{ fontWeight: 600, color: "#60a5fa", marginBottom: 4 }}>💡 未应用修改</div>
        <div style={{ color: "var(--text-muted)" }}>{data.skippedReason || "未发现明显的改善机会，当前文本已达到较好的一致性水平。"}</div>
        {!compact && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
            建议手动微调相关段落后，点击 <strong>「🔄 同步设定」</strong> 重新对齐故事数据库。
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
          <div style={{ fontSize: 28 }}>🪄</div>
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
            }}>✅ 已修正</span>
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
            }}>
              ✅ {f}
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
          💡 正文已自动更新。建议点击 <strong style={{ color: "var(--text)" }}>「🔍 防崩审计」</strong> 重新运行审查，确认修改后是否完全绿灯。
        </div>
      )}
    </div>
  );
}

// ── Sync Report Component ──────────────────────────────────────────────────────

interface SyncReportData {
  auditResult?: AuditReportData;
}

function SyncReport({ data }: { data: SyncReportData }) {
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
        <div style={{ fontSize: 28 }}>🔄</div>
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
          }}>🔄 已同步</span>
        </div>
      </div>

      {/* Audit inline */}
      {audit && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            🔍 同步后审计结果
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
            {isPassed ? "✅ 审计通过 — 无逻辑矛盾或角色人设崩塌问题" : "⚠️ 检测到部分人设或逻辑风险 — 建议处理以下条目："}
          </div>

          {issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {issues.map((issue: AuditIssue, i: number) => {
                const sev = (issue.severity || "info").toLowerCase();
                const cfg =
                  sev === "error" || sev === "critical"
                    ? { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "#f87171", emoji: "❌", label: "严重" }
                    : sev === "warning"
                    ? { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "#fbbf24", emoji: "⚠️", label: "警告" }
                    : { color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "#60a5fa", emoji: "ℹ️", label: "提示" };
                return (
                  <div key={i} style={{
                    padding: "12px 16px", background: cfg.bg,
                    border: `1px solid ${cfg.border}33`,
                    borderLeft: `3px solid ${cfg.border}`,
                    borderRadius: 8, display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13 }}>{cfg.emoji}</span>
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
        💡 如发现残留的人设警告，可点击 <strong style={{ color: "var(--text)" }}>「🪄 局部定点修复」</strong> 运行自动局部修缮，或根据审计描述手动微调相关情节。
      </div>
    </div>
  );
}

// ── Plan Report Component ──────────────────────────────────────────────────────

interface PlanReportData {
  chapterNumber?: number;
  bookTitle?: string;
  goal?: string;
  intentFile?: string;
  raw?: string;
}

function PlanReport({ data }: { data: PlanReportData }) {
  if (data.raw && !data.goal) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 16, borderBottom: "1px solid var(--border)"
        }}>
          <div style={{ fontSize: 28 }}>📝</div>
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
          💡 剧情意图与备忘账本已成功保存。点击 <strong style={{ color: "var(--text)" }}>「✍️ 智能续写」</strong> 时，AI 会以此为核心基准进行剧情铺陈与细节扩写。
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
        <div style={{ fontSize: 28 }}>📝</div>
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
          }}>📝 已规划</span>
        </div>
      </div>

      {/* Goal */}
      {data.goal && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            🎯 核心写作目标 (Goal)
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
            📂 关联意图文件 (Intent)
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
        💡 剧情意图与备忘账本已保存。点击 <strong style={{ color: "var(--text)" }}>「✍️ 智能续写」</strong> 时，AI 会以此目标为核心进行剧情铺陈与细节扩写，确保故事节奏与伏笔完美对齐。
      </div>
    </div>
  );
}

export function FileViewer({ filePath, cwd, availableStyles = [], activeStyleName = null, showExecutionConfirm = true }: Props) {

  if (isImagePath(filePath)) {
    return <ImageViewer filePath={filePath} cwd={cwd} />;
  }
  if (isAudioPath(filePath)) {
    return <AudioViewer filePath={filePath} cwd={cwd} />;
  }
  if (isPptxPath(filePath)) {
    return <PptxViewer filePath={filePath} cwd={cwd} />;
  }
  return <TextFileViewer filePath={filePath} cwd={cwd} availableStyles={availableStyles} activeStyleName={activeStyleName} showExecutionConfirm={showExecutionConfirm} />;
}

function TextFileViewer({ filePath, cwd, availableStyles = [], activeStyleName = null, showExecutionConfirm = true }: Props) {
  const { isDark } = useTheme();
  const [data, setData] = useState<FileData | null>(null);
  const [prevContent, setPrevContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [viewMode, setViewMode] = useState<"source" | "diff">("source");
  const [wrapLines, setWrapLines] = useState(false);
  const [watching, setWatching] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isHtmlModalOpen, setIsHtmlModalOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Zen Editor specific states
  const [editContent, setEditContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | "dirty">("saved");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusRef = useRef(saveStatus);

  const [auditLoading, setAuditLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const [reviseLoading, setReviseLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [hasChapters, setHasChapters] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [auditData, setAuditData] = useState<any>(null);
  const [detectData, setDetectData] = useState<any>(null);
  const [writeResult, setWriteResult] = useState<WriteReportData | null>(null);
  const [reviseResult, setReviseResult] = useState<ReviseReportData | null>(null);
  const [syncResult, setSyncResult] = useState<SyncReportData | null>(null);
  const [planResult, setPlanResult] = useState<PlanReportData | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const isRunning = writeLoading || reviseLoading || auditLoading || syncLoading || planLoading || detectLoading;
  const [logs, setLogs] = useState<string[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  const [chapterStatus, setChapterStatus] = useState<string | null>(null);
  const [chapterHasPlan, setChapterHasPlan] = useState<boolean>(false);
  const [chapterHasSnapshot, setChapterHasSnapshot] = useState<boolean>(false);
  const [auditIssues, setAuditIssues] = useState<string[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [reviewLogs, setReviewLogs] = useState<string[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    warning?: string;
    onConfirm: () => void;
  } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    title: string;
    message: string;
    type?: "warning" | "error" | "info" | "success";
    checklist?: { text: string; completed: boolean }[];
  } | null>(null);
  const [writeMode, setWriteMode] = useState<"normal" | "draft">("normal");
  const [isWriteDropdownOpen, setIsWriteDropdownOpen] = useState(false);
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);
  const [draftWords, setDraftWords] = useState<number>(2000);
  const [draftContext, setDraftContext] = useState("");
  const [selectedStyleName, setSelectedStyleName] = useState<string | null>(null);

  const [reviseMode, setReviseMode] = useState<"detect-llm" | "spot-fix" | "anti-detect" | "polish" | "rewrite" | "rework">("spot-fix");
  const [isReviseDropdownOpen, setIsReviseDropdownOpen] = useState(false);
  const [localShowConfirm, setLocalShowConfirm] = useState(showExecutionConfirm);
  const [execConfirm, setExecConfirm] = useState<{
    title: string;
    description: string;
    actionType: "write-next" | "draft" | "detect-llm" | "spot-fix" | "anti-detect" | "polish" | "rewrite" | "rework" | "audit" | "sync" | "plan";
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    const val = localStorage.getItem("ink-show-execution-confirm");
    if (val !== null) {
      setLocalShowConfirm(val === "true");
    } else {
      setLocalShowConfirm(showExecutionConfirm);
    }
    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ showExecutionConfirm: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.showExecutionConfirm === "boolean") {
        setLocalShowConfirm(customEvent.detail.showExecutionConfirm);
      }
    };
    window.addEventListener("ink-settings-changed", handleSettingsChanged);
    return () => {
      window.removeEventListener("ink-settings-changed", handleSettingsChanged);
    };
  }, [showExecutionConfirm]);

  useEffect(() => {
    setLocalShowConfirm(showExecutionConfirm);
  }, [showExecutionConfirm]);

  useEffect(() => {
    setSelectedStyleName(activeStyleName);
  }, [activeStyleName]);

  const bookId = getBookIdFromPath(filePath, cwd);
  const filename = getFileName(filePath);
  const chMatch = filename.match(/^(\d{4})_/);
  const chapterNumber = chMatch ? parseInt(chMatch[1], 10) : null;
  const nextChapterNum = chapterNumber !== null ? chapterNumber + 1 : null;
  const formattedChNum = chMatch ? chMatch[1] : "XXXX";

  const getActionMeta = (actionType: string) => {
    const actionMeta: Record<string, { title: string; desc: string; icon: string; themeColor: string; bgTheme: string }> = {
      "write-next": {
        title: "智能续写 (标准模式)",
        desc: "大模型将根据当前正文、大纲 and 人设设定，自动为您生成并续写下一段正文内容。\n\n💡 说明：续写前会自动将正文同步至设定库并运行防崩审计，以保证人设不崩。生成质量高但速度相对较慢（约1分钟左右）。",
        icon: "✍️",
        themeColor: "#f97316",
        bgTheme: "rgba(249, 115, 22, 0.08)",
      },
      "draft": {
        title: "极速草稿 (快跑模式)",
        desc: "AI 将绕过复杂的设定同步、审计和 spot-fix 局部修正，直接根据大纲和创意引导快速生成下一章首稿。\n\n⚠️ 注意：极速草稿追求速度，可能会出现设定矛盾或人设偏移，适合灵感爆发时快速铺垫字数，后续建议配合「防崩审计」和「局部定点修复」进行优化。",
        icon: "🚀",
        themeColor: "#ff903f",
        bgTheme: "rgba(255, 144, 63, 0.08)",
      },
      "detect-llm": {
        title: "检测 AI 味",
        desc: "利用大模型智能评估当前章节的文本风格特征，仅分析 AI 特征并生成诊断报告，不会对章节正文内容做任何修改。",
        icon: "🔍",
        themeColor: "#8b5cf6",
        bgTheme: "rgba(139, 92, 246, 0.08)",
      },
      "spot-fix": {
        title: "局部定点修复",
        desc: "通过 AI 微调修复当前正文中存在的叙事冲突、前后矛盾与逻辑不一致的问题。\n\n💡 运作机制：此功能会自动读取上一阶段「防崩审计」检出的冲突列表，针对性生成局部替换补丁进行“唯一精准定位修复”。未受影响的其余正文和段落结构将被强行保留，不影响小说整体框架。",
        icon: "🪄",
        themeColor: "#2dd4bf",
        bgTheme: "rgba(45, 212, 191, 0.08)",
      },
      "anti-detect": {
        title: "防检测润色 (消除 AI 腔调)",
        desc: "专门优化当前正文中机器味过浓的语句，进行口语化、自然化重构，在不改变原有故事结构的前提下降低 AIGC 痕迹。\n\n💡 运作机制：\n1. 替换高频 AI 标记词/疲劳词（如“仿佛、不禁、宛如、竟然、冷笑、瞳孔骤缩”等）。\n2. 优化死板套板的排比句、连续相同开头的“列表式句式”以及生硬转折。\n3. 重组为口语化、文学色彩更自然的句子，提升人类作家的阅读节奏感。\n\n🛡️ 提示：此润色仅在“遣词造句”和“句法文风”层运作，100% 保持您的剧情走向、人物关系与故事设定不发生任何变动。",
        icon: "🪄",
        themeColor: "#2dd4bf",
        bgTheme: "rgba(45, 212, 191, 0.08)",
      },
      "polish": {
        title: "文本润色",
        desc: "对章节词句进行精细化雕琢以提升文学色彩和可读性，在此过程中将保留全部原有的剧情和段落结构。",
        icon: "🪄",
        themeColor: "#2dd4bf",
        bgTheme: "rgba(45, 212, 191, 0.08)",
      },
      "rewrite": {
        title: "智能改写",
        desc: "对特定段落进行重新编写以提升细节、张力与动作情绪。\n\n💡 说明：无需您手动在编辑器中拉框选择段落。系统将自动根据「防崩审计」检出的叙事或文风欠佳段落，针对该段落及直接上下文进行重组改写，同时保留核心因果与人物动机。",
        icon: "🪄",
        themeColor: "#2dd4bf",
        bgTheme: "rgba(45, 212, 191, 0.08)",
      },
      "rework": {
        title: "剧情重写",
        desc: `根据大纲与意图完全重新编写本章内容（现有正文将被覆盖，建议提前备份）。\n\n⚠️ 必须先手动修改：如果您需要改变本章的剧情走向，请先双击左侧文件浏览器中的以下文件进行编辑：\n- 大纲文件：story/volume_map.md（修改大纲事件走向）\n- 本章写作意图：story/runtime/chapter-${formattedChNum}.intent.md（若文件不存在，可先点击「规划蓝图」生成）\n\n确认修改并保存上述设定后，再点击确定，AI 才会基于新走向进行重写。`,
        icon: "🪄",
        themeColor: "#2dd4bf",
        bgTheme: "rgba(45, 212, 191, 0.08)",
      },
      "audit": {
        title: "防崩审计",
        desc: "运行 InkOS 离线审计引擎，全面扫描本章内容与大纲、人设卡、设定真相库的一致性，排查潜在的人设崩塌与逻辑漏洞。",
        icon: "🛡️",
        themeColor: "#3b82f6",
        bgTheme: "rgba(59, 130, 246, 0.08)",
      },
      "sync": {
        title: "同步设定",
        desc: "将正文中的最新改变同步至故事设定库，重构 AI 记忆体系。\n\n💡 使用场景：当您手动修改了正文核心剧情（例如新增了角色、发放了新道具、解开了某处伏笔）后，请务必执行此同步。它会更新 story/current_state.md（状态卡） and story/pending_hooks.md（伏笔池），以防后续续写出现冲突。",
        icon: "🔄",
        themeColor: "#10b981",
        bgTheme: "rgba(16, 185, 129, 0.08)",
      },
      "plan": {
        title: "规划蓝图",
        desc: `规划本章写作焦点与规则栈，为起草做准备。\n\n💡 后续编辑说明：运行成功后，会在左侧 story/runtime/ 目录下生成本章的 chapter-${formattedChNum}.intent.md 意图文件，您可以在此文件生成后双击打开，手动修改您想要的“必须保留/必须避免”要求，然后再启动续写或重写。`,
        icon: "🗺️",
        themeColor: "#a855f7",
        bgTheme: "rgba(168, 85, 247, 0.08)",
      },
    };
    return actionMeta[actionType] || {
      title: "操作确认",
      desc: "",
      icon: "⚡",
      themeColor: "var(--accent)",
      bgTheme: "var(--bg-hover)",
    };
  };

  const requestRunAction = (
    actionType: "write-next" | "draft" | "detect-llm" | "spot-fix" | "anti-detect" | "polish" | "rewrite" | "rework" | "audit" | "sync" | "plan",
    onConfirm: () => void
  ) => {
    if (!localShowConfirm) {
      onConfirm();
      return;
    }

    const meta = getActionMeta(actionType);
    setExecConfirm({
      title: meta.title,
      description: meta.desc,
      actionType,
      onConfirm,
    });
  };

  const loadActiveChapterStatus = useCallback(async () => {
    if (!cwd || !filePath) return;
    const bookIdVal = getBookIdFromPath(filePath, cwd);
    if (!bookIdVal || !chapterNumber) {
      setChapterStatus(null);
      setChapterHasPlan(false);
      setChapterHasSnapshot(false);
      setAuditIssues([]);
      return;
    }

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dashboard",
          cwd,
          args: { bookId: bookIdVal }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.chapters)) {
          const ch = data.chapters.find((c: any) => c.number === chapterNumber);
          if (ch) {
            setChapterStatus(ch.status || null);
            setChapterHasPlan(!!ch.hasPlan);
            setChapterHasSnapshot(!!ch.hasSnapshot);
            setAuditIssues(ch.auditIssues || []);
            return;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load active chapter status from dashboard API:", e);
    }

    // Fallback: Read index.json directly
    const indexPath = `${cwd}/books/${bookIdVal}/chapters/index.json`;
    const encoded = encodeFilePathForApi(indexPath);
    try {
      const res = await fetch(`/api/files/${encoded}?type=read`);
      if (res.ok) {
        const indexData = await res.json();
        const parsed = JSON.parse(indexData.content);
        if (Array.isArray(parsed)) {
          const ch = parsed.find((c: { number: number; status?: string; auditIssues?: string[] }) => c.number === chapterNumber);
          if (ch) {
            setChapterStatus(ch.status || null);
            setChapterHasPlan(false);
            setChapterHasSnapshot(false);
            setAuditIssues(ch.auditIssues || []);
            return;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load active chapter status from index.json:", e);
    }
    setChapterStatus(null);
    setChapterHasPlan(false);
    setChapterHasSnapshot(false);
    setAuditIssues([]);
  }, [cwd, filePath, chapterNumber]);

  useEffect(() => {
    loadActiveChapterStatus();
  }, [loadActiveChapterStatus]);

  const handleApproveChapter = async () => {
    if (!cwd || !bookId || !chapterNumber) return;
    setIsReviewing(true);
    setReviewError(null);
    setReviewLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review-approve",
          cwd,
          args: {
            bookId,
            chapter: chapterNumber,
            json: true
          }
        })
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
      let finalResult: any = null;

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
              setReviewLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "批准章节执行失败");
      }

      await loadActiveChapterStatus();
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    } catch (err: any) {
      console.error(err);
      setReviewError(err.message || "批准章节失败，请重试。");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRejectChapter = async () => {
    if (!cwd || !bookId || !chapterNumber) return;
    setIsReviewing(true);
    setReviewError(null);
    setReviewLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review-reject",
          cwd,
          args: {
            bookId,
            chapter: chapterNumber,
            reason: rejectReason.trim() || undefined,
            json: true
          }
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

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
              setReviewLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "驳回并重构章节执行失败");
      }

      setIsRejectDialogOpen(false);
      setRejectReason("");

      // Close file tab
      window.dispatchEvent(new CustomEvent("close-file", {
        detail: { filePath }
      }));
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    } catch (err: any) {
      console.error(err);
      setReviewError(err.message || "驳回章节失败，请重试。");
    } finally {
      setIsReviewing(false);
    }
  };

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (!cwd || !filePath) return;
    const bookId = getBookIdFromPath(filePath, cwd);
    if (!bookId) {
      setHasChapters(false);
      return;
    }
    const chaptersDir = `${cwd}/books/${bookId}/chapters`;
    const encoded = encodeFilePathForApi(chaptersDir);
    fetch(`/api/files/${encoded}?type=list`)
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) {
          const mdFiles = data.entries.filter((e: any) => !e.isDir && e.name.endsWith(".md") && /^\d{4}/.test(e.name));
          setHasChapters(mdFiles.length > 0);
        } else {
          setHasChapters(false);
        }
      })
      .catch((err) => {
        console.error("Failed to check chapters list:", err);
        setHasChapters(false);
      });
  }, [filePath, cwd]);

  const handleRunAudit = async () => {
    if (!cwd) return;
    setAuditData(null);
    setDetectData(null);
    setAuditLoading(true);
    setLogs([]);
    setReportTitle("人设防崩与一致性审计报告");
    setReportContent("正在运行 InkOS 离线审计引擎，请稍候...");
    setIsReportOpen(true);
    try {
      const relativeChapter = getRelativeFilePath(filePath, cwd);
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "audit",
          cwd,
          args: { chapter: relativeChapter, json: true }
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
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "审计执行失败");
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse audit result JSON:", e);
      }

      if (parsed) {
        setWriteResult(null);
        setReviseResult(null);
        setSyncResult(null);
        setPlanResult(null);
        setAuditData(parsed);
        setReportContent("");
      } else {
        setAuditData(null);
        setWriteResult(null);
        setReviseResult(null);
        setSyncResult(null);
        setPlanResult(null);
        setReportContent([
          `### 🔍 防崩审计完成`,
          "",
          `🎉 **审计结论**：未检测到明显的一致性问题或人设偏离风险。`,
          "",
          `---`,
          `- **诊断详情**：${finalResult.stdout || "审计完成，没有检测到任何一致性警告。"}`,
          `- **提示**：如果您新写了正文，建议点击工具栏底部的 **「🔄 同步设定」**，将最新正文内容同步至故事数据库中。`
        ].join("\n"));
      }

      await loadActiveChapterStatus();
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    } catch (err: any) {
      console.error(err);
      setAuditData(null);
      setReportContent(`审计运行失败：${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在「模型配置」中配置了大模型 API Key。`);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleRunDetect = async (mode: "llm" | "local" = "llm") => {
    if (!cwd) return;
    setDetectData(null);
    setAuditData(null);
    setWriteResult(null);
    setReviseResult(null);
    setSyncResult(null);
    setPlanResult(null);
    setDetectLoading(true);
    setLogs([]);
    setReportTitle(mode === "local" ? "本地离线 AIGC 风格特征检测报告" : "AIGC 写作风格与 AI 味检测报告");
    setReportContent(mode === "local" ? "正在运行 InkOS 本地规则检测引擎扫描套话转折..." : "正在运行 InkOS AI 检测引擎评估文本风格特征，请稍候...");
    setIsReportOpen(true);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "aigc-detect",
          cwd,
          args: { bookId, chapter: chapterNumber || undefined, provider: mode, json: true }
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
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult) {
        throw new Error("未能获取检测模块的运行结果");
      }

      const hasNotEnabledWarning = finalResult.stderr?.includes("detection is not enabled") || finalResult.stdout?.includes("detection is not enabled");
      if (hasNotEnabledWarning) {
        setReportContent([
          `### ⚠️ AIGC 检测服务未启用`,
          "",
          `当前项目尚未开启 AIGC 检测支持。`,
          "",
          `> **💻 推荐：使用全局大模型分析（最简配置，直接调用您右上角配置的大模型）**`,
          `> 请在工作区根目录的配置文件 \`inkos.json\` 中，开启 \`detection\` 并指定服务商为 \`llm\`：`,
          `> \`\`\`json`,
          `> "detection": {`,
          `>   "enabled": true,`,
          `>   "provider": "llm",`,
          `>   "threshold": 0.5`,
          `> }`,
          `> \`\`\``,
          `> *提示：\`llm\` 模式下，系统将自动调用您在右上角配置的**全局默认大模型**（例如 MiniMax-M3）为您撰写的正文分析 AI 味。*`,
          "",
          `> **🔌 备选：使用本地离线规则分析（零 Token 消耗，即时计算）**`,
          `> \`\`\`json`,
          `> "detection": {`,
          `>   "enabled": true,`,
          `>   "provider": "local",`,
          `>   "threshold": 0.5`,
          `> }`,
          `> \`\`\``,
          `> *提示：\`local\` 模式下，系统会完全离线地通过段落等长性、套话转折密度和列表式排比句式特征等客观指标进行诊断。*`,
          "",
          `> **🌐 备选：使用外部专业检测服务（需配置 API 密钥）**`,
          `> \`\`\`json`,
          `> "detection": {`,
          `>   "enabled": true,`,
          `>   "provider": "gptzero",`,
          `>   "apiUrl": "https://api.gptzero.me/v2/predict/text",`,
          `>   "apiKeyEnv": "DETECTION_API_KEY",`,
          `>   "threshold": 0.5`,
          `> }`,
          `> \`\`\``,
          `> *提示：配置外部服务时，请在环境或项目根目录 .env 中设置对应的环境变量（如 \`DETECTION_API_KEY\`）。*`
        ].join("\n"));
        return;
      }

      if (!finalResult.success) {
        throw new Error(finalResult?.error || "检测运行失败");
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse detect result JSON:", e);
      }

      if (parsed) {
        setDetectData(parsed);
        setReportContent("");
      } else {
        setReportContent([
          `### 🔍 AI 味检测完成`,
          "",
          `评测输出：`,
          `\`\`\``,
          finalResult.stdout || "无详细检测结果。",
          `\`\`\``
        ].join("\n"));
      }
    } catch (err: any) {
      console.error(err);
      setReportContent(`AIGC 检测失败：${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化工作区，并验证检测环境接口无故障。`);
    } finally {
      setDetectLoading(false);
    }
  };

  const handlePlanChapter = async () => {
    if (!cwd) return;
    setAuditData(null);
    setDetectData(null);
    setPlanLoading(true);
    setLogs([]);
    setReportTitle("本章意图与剧情大纲规划");
    setReportContent("正在运行 InkOS 多智能体规划管线，请稍候...");
    setIsReportOpen(true);
    try {
      const bookId = getBookIdFromPath(filePath, cwd);
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          cwd,
          args: { bookId }
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
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "规划执行失败");
      }
      const rawOutput = finalResult.stdout || "";
      const match = rawOutput.match(/Planned chapter (\d+) for "([^"]+)" Goal: ([\s\S]+?)(?:\s+Intent:\s+(.+))?$/i);
      if (match) {
        const [_, chNum, bookTitle, goal, intentFile] = match;
        setAuditData(null);
        setWriteResult(null);
        setReviseResult(null);
        setSyncResult(null);
        setPlanResult({
          chapterNumber: parseInt(chNum, 10),
          bookTitle,
          goal: goal.trim(),
          intentFile: intentFile ? intentFile.trim() : undefined,
        });
        setReportContent("");
      } else {
        setAuditData(null);
        setWriteResult(null);
        setReviseResult(null);
        setSyncResult(null);
        setPlanResult({ raw: rawOutput || "规划完成。已为您生成本章写作焦点和规则栈。" });
        setReportContent("");
      }
    } catch (err: any) {
      console.error(err);
      setPlanResult(null);
      setReportContent(`### ⚠️ 规划运行失败\n\n${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在「模型配置」中配置了大模型 API Key。`);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleWriteNext = async (forceRewrite: any = false) => {
    if (!cwd) return;
    setAuditData(null);
    setDetectData(null);
    const bookId = getBookIdFromPath(filePath, cwd);
    if (!bookId) return;

    if (chapterNumber !== null && chapterStatus !== "approved") {
      setAlertDialog({
        title: "章节未满足续写条件",
        message: `当前章节 (第 ${chapterNumber} 章) 尚未通过安全保障审核。在开始续写下一章之前，需要满足以下前置条件：`,
        type: "warning",
        checklist: [
          { text: "完成『规划蓝图』 (在编辑器底部或章节看板中运行)", completed: chapterHasPlan },
          { text: "通过『防崩审计』 (运行人设与设定一致性审计)", completed: chapterStatus === "approved" || chapterStatus === "ready-for-review" },
          { text: "运行『同步设定』 (将最新正文同步至故事数据库)", completed: chapterHasSnapshot },
          { text: "将本章状态设为『已过审』", completed: chapterStatus === "approved" }
        ]
      });
      return;
    }

    const isForce = forceRewrite === true;
    setWriteLoading(true);
    window.dispatchEvent(new Event("write-start"));
    setLogs([]);
    const modeTitle = "智能续写";
    setReportTitle(modeTitle);
    setReportContent(hasChapters ? "正在进行智能续写中，请稍候..." : "正在为您规划大纲并起草首章正文，请稍候...");
    setIsReportOpen(true);

    try {
      // 1. If editor is dirty, save the current text to disk immediately
      if (saveStatus === "dirty") {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        await saveFile(editContent);
      }

      // Parse active chapter number from current file
      const fileMatch = getFileName(filePath).match(/^(\d+)/);
      const activeChapter = fileMatch ? parseInt(fileMatch[1], 10) : undefined;

      // 2. Call the write next API with json: true
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write-next",
          cwd,
          args: { bookId, json: true, activeChapter, forceRewrite: isForce }
        }),
      });

      if (res.status === 409) {
        const conflictData = await res.json();
        setWriteLoading(false);
        window.dispatchEvent(new Event("write-end"));
        setIsReportOpen(false);
        if (conflictData.conflict) {
          setConfirmDialog({
            title: "确认覆盖并重构章节",
            warning: "注意：此操作不可逆！",
            message: `${conflictData.message}\n\n确认要重写该章节并永久删除后续所有章节吗？`,
            onConfirm: () => {
              handleWriteNext(true);
            }
          });
        }
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch (e) {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "智能创作执行失败");
      }

      // 3. Parse JSON results from stdout
      let results: any[] = [];
      try {
        results = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse write-next JSON output:", e);
        setReportContent(finalResult.stdout || "写作/续写任务完成。");
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        return;
      }

      const result = results[0];
      if (!result) {
        throw new Error("未返回有效的创作章节结果。");
      }

      // 4. Resolve file path of newly created file and open it
      const paddedNum = String(result.chapterNumber).padStart(4, "0");
      const chaptersDir = `${cwd}/books/${bookId}/chapters`;
      const listRes = await fetch(`/api/files/${encodeFilePathForApi(chaptersDir)}?type=list`);
      const listData = await listRes.json();
      const found = listData.entries?.find((e: any) => !e.isDir && e.name.startsWith(paddedNum));

      if (found) {
        const newFilePath = chaptersDir + "/" + found.name;
        if (newFilePath !== filePath) {
          window.dispatchEvent(new CustomEvent("close-file", {
            detail: { filePath }
          }));
        }
        window.dispatchEvent(new CustomEvent("open-file", {
          detail: { filePath: newFilePath, fileName: found.name }
        }));
      }

      // 5. Refresh sidebar file tree explorer
      window.dispatchEvent(new CustomEvent("refresh-explorer"));

      // 6. Extract audit result from write-next JSON
      const auditResult: AuditReportData | undefined = result.auditResult;
      const isPassed = auditResult?.passed ?? true;

      // 7. Show WriteReport card (clear other result panels)
      setAuditData(null);
      setReviseResult(null);
      setSyncResult(null);
      setPlanResult(null);
      setWriteResult({
        chapterNumber: result.chapterNumber,
        title: result.title || "",
        wordCount: result.wordCount ?? 0,
        revised: !!result.revised,
        status: result.status || "complete",
        auditResult,
      });
      setReportContent("");
      setHasChapters(true);

      // 8. If audit did not pass and result.revised is false, auto-run revise in-place
      if (!isPassed && !result.revised && bookId) {
        setReportTitle("✍️ 智能续写 + 🪄 自动修正");
        try {
          const fileMatch = getFileName(found ? chaptersDir + "/" + found.name : filePath).match(/^(\d+)/);
          const chNum = fileMatch ? parseInt(fileMatch[1], 10) : result.chapterNumber;
          const revRes = await fetch("/api/inkos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "revise",
              cwd,
              args: { bookId, chapter: chNum, mode: "spot-fix", json: true }
            }),
          });
          if (revRes.ok && revRes.body) {
            const revReader = revRes.body.getReader();
            const revDecoder = new TextDecoder();
            let revBuffer = "";
            let revFinal: any = null;
            while (true) {
              const { done, value } = await revReader.read();
              if (done) break;
              revBuffer += revDecoder.decode(value, { stream: true });
              const lines = revBuffer.split("\n");
              revBuffer = lines.pop() || "";
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const chunk = JSON.parse(line);
                  if (chunk.type === "stdout" || chunk.type === "stderr") {
                    setLogs((prev) => [...prev, chunk.data || ""]);
                  } else if (chunk.type === "result") {
                    revFinal = chunk;
                  }
                } catch (e) { /* skip */ }
              }
            }
            if (revBuffer.trim()) {
              try { const c = JSON.parse(revBuffer); if (c.type === "result") revFinal = c; } catch (e) { /* skip */ }
            }
            if (revFinal?.success) {
              let revData: any = null;
              try { revData = JSON.parse(revFinal.stdout); } catch (e) { /* skip */ }
              if (revData) {
                // Reload content after auto-revise
                await fetchContent(found ? chaptersDir + "/" + found.name : filePath);
                setWriteResult((prev) => prev ? {
                  ...prev,
                  autoReviseResult: {
                    applied: revData.applied ?? true,
                    skippedReason: revData.skippedReason,
                    fixedIssues: revData.fixedIssues,
                    status: revData.status,
                    wordCount: revData.wordCount,
                  }
                } : null);
              }
            }
          }
        } catch (revErr) {
          console.error("Auto-revise after write-next failed:", revErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      setWriteResult(null);
      const isTimeout = err.message.includes("超时") || err.message.includes("timed out") || logs.some(l => l.includes("超时"));
      if (isTimeout) {
        setReportContent(`### ⚠️ 智能创作超时\n\n系统运行已超过 1800 秒，已自动终止。\n\n**建议解决方案**:\n- 检查您的大模型代理和 API Key 是否能快速响应。\n- 在右上角【配置模型】中，建议更换速度较快的模型（例如将 reasoning/思索模型切换为标准对话模型）后再试。`);
      } else {
        setReportContent(`### ⚠️ 智能创作失败\n\n**错误详情**:\n${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在右上角【配置模型】中配置了大模型 API Key 和接口代理。`);
      }
    } finally {
      setWriteLoading(false);
      window.dispatchEvent(new Event("write-end"));
    }
  };

  const handleDraft = async (forceRewrite: any = false) => {
    if (!cwd) return;
    setAuditData(null);
    setDetectData(null);
    const bookId = getBookIdFromPath(filePath, cwd);
    if (!bookId) return;

    if (chapterNumber !== null && chapterStatus !== "approved") {
      setAlertDialog({
        title: "章节未满足起草条件",
        message: `当前章节 (第 ${chapterNumber} 章) 尚未通过安全保障审核。在开始起草下一章之前，需要满足以下前置条件：`,
        type: "warning",
        checklist: [
          { text: "完成『规划蓝图』 (在编辑器底部或章节看板中运行)", completed: chapterHasPlan },
          { text: "通过『防崩审计』 (运行人设与设定一致性审计)", completed: chapterStatus === "approved" || chapterStatus === "ready-for-review" },
          { text: "运行『同步设定』 (将最新正文同步至故事数据库)", completed: chapterHasSnapshot },
          { text: "将本章状态设为『已过审』", completed: chapterStatus === "approved" }
        ]
      });
      return;
    }

    const isForce = forceRewrite === true;
    setWriteLoading(true);
    window.dispatchEvent(new Event("write-start"));
    setLogs([]);
    const modeTitle = "极速起草";
    setReportTitle(modeTitle);
    setReportContent("正在为您极速起草下一章草稿（绕过审计/修正管道），请稍候...");
    setIsReportOpen(true);
    setIsDraftDialogOpen(false);

    try {
      // Auto switch style first if a different one was selected in draft config
      if (selectedStyleName && selectedStyleName !== activeStyleName) {
        try {
          const switchRes = await fetch("/api/inkos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "style-switch",
              cwd,
              args: { bookId, styleName: selectedStyleName }
            })
          });
          if (switchRes.ok) {
            window.dispatchEvent(new CustomEvent("refresh-explorer"));
          }
        } catch (switchErr) {
          console.error("Failed to switch style guide before draft:", switchErr);
        }
      }

      // 1. If editor is dirty, save the current text to disk immediately
      if (saveStatus === "dirty") {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        await saveFile(editContent);
      }

      // Parse active chapter number from current file
      const fileMatch = getFileName(filePath).match(/^(\d+)/);
      const activeChapter = fileMatch ? parseInt(fileMatch[1], 10) : undefined;

      // 2. Call the draft API with json: true
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          cwd,
          args: { 
            bookId, 
            json: true, 
            activeChapter, 
            forceRewrite: isForce,
            words: draftWords,
            context: draftContext
          }
        }),
      });

      if (res.status === 409) {
        const conflictData = await res.json();
        setWriteLoading(false);
        window.dispatchEvent(new Event("write-end"));
        setIsReportOpen(false);
        if (conflictData.conflict) {
          setConfirmDialog({
            title: "确认覆盖并起草章节",
            warning: "注意：此操作不可逆！",
            message: `${conflictData.message}\n\n确认要起草该章节并永久删除后续所有章节吗？`,
            onConfirm: () => {
              handleDraft(true);
            }
          });
        }
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch (e) {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "极速草稿起草失败");
      }

      // 3. Parse JSON results from stdout
      let result: any = null;
      try {
        result = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse draft JSON output:", e);
        setReportContent(finalResult.stdout || "草稿起草任务完成。");
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        return;
      }

      if (!result) {
        throw new Error("未返回有效的草稿章节结果。");
      }

      // 4. Resolve file path of newly created file and open it
      const paddedNum = String(result.chapterNumber).padStart(4, "0");
      const chaptersDir = `${cwd}/books/${bookId}/chapters`;
      const listRes = await fetch(`/api/files/${encodeFilePathForApi(chaptersDir)}?type=list`);
      const listData = await listRes.json();
      const found = listData.entries?.find((e: any) => !e.isDir && e.name.startsWith(paddedNum));

      if (found) {
        const newFilePath = chaptersDir + "/" + found.name;
        if (newFilePath !== filePath) {
          window.dispatchEvent(new CustomEvent("close-file", {
            detail: { filePath }
          }));
        }
        window.dispatchEvent(new CustomEvent("open-file", {
          detail: { filePath: newFilePath, fileName: found.name }
        }));
      }

      // 5. Refresh sidebar file tree explorer
      window.dispatchEvent(new CustomEvent("refresh-explorer"));

      // 6. Show WriteReport card (clear other result panels)
      setAuditData(null);
      setReviseResult(null);
      setSyncResult(null);
      setPlanResult(null);
      setWriteResult({
        chapterNumber: result.chapterNumber,
        title: result.title || "",
        wordCount: result.wordCount ?? 0,
        revised: false,
        status: "drafted",
        auditResult: undefined,
      });
      setReportContent("");
      setHasChapters(true);

    } catch (err: any) {
      console.error(err);
      setWriteResult(null);
      const isTimeout = err.message.includes("超时") || err.message.includes("timed out") || logs.some(l => l.includes("超时"));
      if (isTimeout) {
        setReportContent(`### ⚠️ 极速起草超时\n\n系统运行已超过 1800 秒，已自动终止。\n\n**建议解决方案**:\n- 检查您的大模型代理 and API Key 是否能快速响应。\n- 在右上角【配置模型】中，建议更换速度较快的模型后再试。`);
      } else {
        setReportContent(`### ⚠️ 极速起草失败\n\n**错误详情**:\n${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在右上角【配置模型】中配置了大模型 API Key 和接口代理。`);
      }
    } finally {
      setWriteLoading(false);
      window.dispatchEvent(new Event("write-end"));
    }
  };

  useEffect(() => {
    const handleGlobalWrite = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: "normal" | "draft" }>;
      if (!customEvent.detail) return;
      if (isRunning || saveStatus === "saving") return;

      if (customEvent.detail.mode === "normal") {
        requestRunAction("write-next", () => handleWriteNext(false));
      } else if (customEvent.detail.mode === "draft") {
        setIsDraftDialogOpen(true);
      }
    };
    window.addEventListener("trigger-global-write", handleGlobalWrite as EventListener);
    return () => {
      window.removeEventListener("trigger-global-write", handleGlobalWrite as EventListener);
    };
  }, [isRunning, saveStatus, requestRunAction, handleWriteNext, setIsDraftDialogOpen]);

  const handleRevise = async (mode: string = "spot-fix") => {
    if (!cwd) return;
    setAuditData(null);
    setDetectData(null);
    const bookId = getBookIdFromPath(filePath, cwd);
    if (!bookId) return;

    setReviseLoading(true);
    setLogs([]);
    const getModeName = (m: string) => {
      switch (m) {
        case "anti-detect": return "防检测润色";
        case "polish": return "文本润色";
        case "rewrite": return "智能改写";
        case "rework": return "剧情重写";
        default: return "AI 局部定点修复";
      }
    };
    setReportTitle(`🪄 局部定点修复 - ${getModeName(mode)}`);
    setReportContent(`正在运行 InkOS AI ${getModeName(mode)}，请稍候...`);
    setIsReportOpen(true);

    try {
      // 1. If editor is dirty, save the current text to disk immediately
      if (saveStatus === "dirty") {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        await saveFile(editContent);
      }

      // Parse active chapter number from current file
      const fileMatch = getFileName(filePath).match(/^(\d+)/);
      const chapter = fileMatch ? parseInt(fileMatch[1], 10) : undefined;

      // 2. Call the revise API
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revise",
          cwd,
          args: { bookId, chapter, mode, json: true }
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
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch (e) {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "智能修正执行失败");
      }

      // 3. Parse JSON results from stdout
      let result: any = null;
      try {
        result = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse revise JSON output:", e);
      }

      if (result && !result.applied) {
        setAuditData(null);
        setWriteResult(null);
        setSyncResult(null);
        setPlanResult(null);
        setReviseResult({
          applied: false,
          skippedReason: result.skippedReason,
        });
        setReportContent("");
      } else if (result) {
        setAuditData(null);
        setWriteResult(null);
        setSyncResult(null);
        setPlanResult(null);
        setReviseResult({
          applied: true,
          fixedIssues: result.fixedIssues && result.fixedIssues.length > 0 ? result.fixedIssues : ["优化并修正了人设与设定偏离"],
          status: result.status,
          wordCount: result.wordCount,
        });
        setReportContent("");
      } else {
        setAuditData(null);
        setWriteResult(null);
        setSyncResult(null);
        setPlanResult(null);
        setReviseResult({ applied: true });
        setReportContent("");
      }

      // 4. Force reload content in editor
      await fetchContent(filePath);
      // 5. Refresh active chapter status & sidebar file tree explorer
      await loadActiveChapterStatus();
      window.dispatchEvent(new CustomEvent("refresh-explorer"));

    } catch (err: any) {
      console.error(err);
      setReviseResult(null);
      const isTimeout = err.message.includes("超时") || err.message.includes("timed out") || logs.some(l => l.includes("超时"));
      if (isTimeout) {
        setReportContent(`### ⚠️ 智能修正超时\n\n系统运行已超过 1800 秒，已自动终止。\n\n**建议解决方案**:\n- 在右上角【配置模型】中更换速度较快的对话模型后再试。`);
      } else {
        setReportContent(`### ⚠️ 智能修正失败\n\n**错误详情**:\n${err.message || String(err)}`);
      }
    } finally {
      setReviseLoading(false);
    }
  };

  const handleSync = async () => {
    if (!cwd) return;
    setAuditData(null);
    setDetectData(null);
    const bookId = getBookIdFromPath(filePath, cwd);
    if (!bookId) return;

    setSyncLoading(true);
    setLogs([]);
    setReportTitle("🔄 同步设定");
    setReportContent("正在同步您修改的正文内容至故事真相账本中，并重新构建索引...");
    setIsReportOpen(true);

    try {
      // 1. If editor is dirty, save the current text to disk immediately
      if (saveStatus === "dirty") {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        await saveFile(editContent);
      }

      // Parse active chapter number from current file
      const fileMatch = getFileName(filePath).match(/^(\d+)/);
      const chapter = fileMatch ? parseInt(fileMatch[1], 10) : undefined;

      // 2. Call the write sync API
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write-sync",
          cwd,
          args: { bookId, chapter, json: true }
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
      let finalResult: any = null;

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
              setLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch (e) {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "同步设定失败");
      }

      // 3. Parse JSON results from stdout
      let result: any = null;
      try {
        const results = JSON.parse(finalResult.stdout);
        result = results[0] || results;
      } catch (e) {
        console.error("Failed to parse sync JSON output:", e);
      }

      const auditResult: AuditReportData | undefined = result?.auditResult;

      setAuditData(null);
      setWriteResult(null);
      setReviseResult(null);
      setPlanResult(null);
      setSyncResult({ auditResult });
      setReportContent("");

      // Refresh sidebar file tree explorer
      window.dispatchEvent(new CustomEvent("refresh-explorer"));

    } catch (err: any) {
      console.error(err);
      setSyncResult(null);
      setReportContent(`### ⚠️ 同步设定失败\n\n**错误详情**:\n${err.message || String(err)}`);
    } finally {
      setSyncLoading(false);
    }
  };


  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  const saveFile = useCallback(async (contentToSave: string) => {
    setSaveStatus("saving");
    try {
      const encoded = encodeFilePathForApi(filePath);
      const res = await fetch(`/api/files/${encoded}`, {
        method: "POST",
        body: contentToSave,
      });
      if (!res.ok) {
        throw new Error(`Failed to save file: ${res.statusText}`);
      }
      setSaveStatus("saved");
    } catch (e) {
      console.error(e);
      setSaveStatus("error");
    }
  }, [filePath]);

  const handleContentChange = (newVal: string) => {
    setEditContent(newVal);
    setSaveStatus("dirty");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveFile(newVal);
    }, 1500);
  };

  const fetchContent = useCallback((filePath: string, isRefresh = false) => {
    const encoded = encodeFilePathForApi(filePath);
    return fetch(`/api/files/${encoded}?type=read`)
      .then((r) => r.json())
      .then((d: FileData & { error?: string }) => {
        if (d.error) {
          setError(d.error);
          return null;
        }
        if (isRefresh) {
          setData((prev) => {
            if (prev) setPrevContent(prev.content);
            return d;
          });
          setChangeCount((c) => c + 1);
        } else {
          setData(d);
        }
        return d;
      })
      .catch((e) => {
        setError(String(e));
        return null;
      });
  }, []);

  // Initial load + SSE watch setup
  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    setPrevContent(null);
    setPreviewMode(false);
    setViewMode("source");
    setWrapLines(false);
    setChangeCount(0);
    setWatching(false);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSaveStatus("saved");

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    fetchContent(filePath).then((d) => {
      if (d) {
        setEditContent(d.content);
        // Default to "沉浸创作" (edit mode) instead of forcing previewMode for markdown files
        // if (d.language === "markdown") setPreviewMode(true);
      }
    }).finally(() => setLoading(false));

    // Set up SSE watch
    const encoded = encodeFilePathForApi(filePath);
    const es = new EventSource(`/api/files/${encoded}?type=watch`);
    esRef.current = es;

    es.addEventListener("connected", () => {
      setWatching(true);
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("change", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Only safely reload if the user is NOT actively typing to prevent losing keystrokes
        if (saveStatusRef.current === "saved") {
          fetchContent(filePath, true).then((newD) => {
            if (newD) {
              setEditContent(newD.content);
            }
          });
        }
      }, 800); // 800ms debounce for text files
    });

    es.addEventListener("error", () => {
      setWatching(false);
    });

    es.onerror = () => {
      setWatching(false);
    };

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      es.close();
      esRef.current = null;
    };
  }, [filePath, fetchContent]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const isHtml = data.language === "html";
  const isMarkdown = data.language === "markdown";
  const hasDiff = prevContent !== null && prevContent !== data.content;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }} title={filePath}>
          {getFileDisplayPath(filePath, cwd)}
        </span>

        {/* Chapter review status & controls */}
        {chapterNumber !== null && chapterStatus && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: "1px solid var(--border)", paddingLeft: 12 }}>
            <span
              onClick={auditIssues.length > 0 ? () => setIsAuditModalOpen(true) : undefined}
              title={auditIssues.length > 0 ? "点击查看审计详情" : undefined}
              onMouseEnter={(e) => {
                if (auditIssues.length > 0) {
                  e.currentTarget.style.filter = "brightness(1.15)";
                  e.currentTarget.style.transform = "scale(1.02)";
                }
              }}
              onMouseLeave={(e) => {
                if (auditIssues.length > 0) {
                  e.currentTarget.style.filter = "none";
                  e.currentTarget.style.transform = "none";
                }
              }}
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "4px",
                fontWeight: 600,
                cursor: auditIssues.length > 0 ? "pointer" : "default",
                transition: "all 0.15s ease",
                color: 
                  chapterStatus === "approved" ? "#10b981" :
                  chapterStatus === "ready-for-review" ? "#eab308" :
                  chapterStatus === "audit-failed" ? "#ef4444" :
                  chapterStatus === "rejected" ? "#9ca3af" : "var(--text-muted)",
                background: 
                  chapterStatus === "approved" ? "rgba(16,185,129,0.08)" :
                  chapterStatus === "ready-for-review" ? "rgba(234,179,8,0.08)" :
                  chapterStatus === "audit-failed" ? "rgba(239,68,68,0.08)" :
                  chapterStatus === "rejected" ? "rgba(156,163,175,0.08)" : "var(--bg-hover)",
                border: `1px solid ${
                  chapterStatus === "approved" ? "#10b98125" :
                  chapterStatus === "ready-for-review" ? "#eab30825" :
                  chapterStatus === "audit-failed" ? "#ef444425" :
                  chapterStatus === "rejected" ? "#9ca3af25" : "transparent"
                }`
              }}
            >
              {
                chapterStatus === "approved" ? "已过审" :
                chapterStatus === "ready-for-review" ? "待审核" :
                chapterStatus === "audit-failed" ? "审计失败" :
                chapterStatus === "rejected" ? "已驳回" : chapterStatus
              }
              {auditIssues.length > 0 && (
                <span style={{ marginLeft: 4, fontSize: 8 }}>🔍</span>
              )}
            </span>

            {chapterStatus !== "approved" && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleApproveChapter}
                  disabled={isReviewing}
                  style={{
                    padding: "2px 8px", fontSize: 10, cursor: isReviewing ? "not-allowed" : "pointer",
                    background: "rgba(16,185,129,0.08)",
                    color: "#10b981",
                    border: "1px solid rgba(16,185,129,0.25)",
                    borderRadius: 5,
                    fontWeight: 600,
                    whiteSpace: "nowrap"
                  }}
                  title="批准并提交该章节状态为已过审"
                >
                  {isReviewing ? "处理中..." : "✅ 批准章节"}
                </button>
                <button
                  onClick={() => setIsRejectDialogOpen(true)}
                  disabled={isReviewing}
                  style={{
                    padding: "2px 8px", fontSize: 10, cursor: isReviewing ? "not-allowed" : "pointer",
                    background: "rgba(239,68,68,0.08)",
                    color: "#ef4444",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 5,
                    fontWeight: 600,
                    whiteSpace: "nowrap"
                  }}
                  title="驳回并回滚故事状态到该章之前"
                >
                  {isReviewing ? "处理中..." : "❌ 驳回重构"}
                </button>
              </div>
            )}
          </div>
        )}
        {/* Spacer to push buttons to the right */}
        <div style={{ marginLeft: "auto" }} />

        {/* Diff / Source toggle — shown only when there are changes */}
        {hasDiff && (
          <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
            <button
              onClick={() => setViewMode("source")}
              style={{
                padding: "2px 8px", fontSize: 11, border: "none", cursor: "pointer",
                background: viewMode === "source" ? "var(--bg-selected)" : "var(--bg-hover)",
                color: viewMode === "source" ? "var(--text)" : "var(--text-muted)",
                fontWeight: viewMode === "source" ? 600 : 400,
              }}
            >
              Source
            </button>
            <button
              onClick={() => setViewMode("diff")}
              style={{
                padding: "2px 8px", fontSize: 11, border: "none", borderLeft: "1px solid var(--border)", cursor: "pointer",
                background: viewMode === "diff" ? "var(--bg-selected)" : "var(--bg-hover)",
                color: viewMode === "diff" ? "var(--text)" : "var(--text-muted)",
                fontWeight: viewMode === "diff" ? 600 : 400,
              }}
            >
              Diff {changeCount > 0 && <span style={{ color: "#4ade80", marginLeft: 2 }}>+{changeCount}</span>}
            </button>
          </div>
        )}



        {/* HTML source/preview toggle */}
        {isHtml && viewMode === "source" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
              <button
                onClick={() => setPreviewMode(false)}
                style={{
                  padding: "2px 8px", fontSize: 11, border: "none", cursor: "pointer",
                  background: !previewMode ? "var(--bg-selected)" : "var(--bg-hover)",
                  color: !previewMode ? "var(--text)" : "var(--text-muted)",
                  fontWeight: !previewMode ? 600 : 400,
                }}
              >
                Code
              </button>
              <button
                onClick={() => setPreviewMode(true)}
                style={{
                  padding: "2px 8px", fontSize: 11, border: "none", borderLeft: "1px solid var(--border)", cursor: "pointer",
                  background: previewMode ? "var(--bg-selected)" : "var(--bg-hover)",
                  color: previewMode ? "var(--text)" : "var(--text-muted)",
                  fontWeight: previewMode ? 600 : 400,
                }}
              >
                Preview
              </button>
            </div>
            {previewMode && (
              <button
                onClick={() => setIsHtmlModalOpen(true)}
                title="Open preview in fullscreen modal"
                style={{
                  padding: "2px 8px", fontSize: 11, cursor: "pointer",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)", borderRadius: 5,
                  fontWeight: 400,
                }}
              >
                🔍 Zoom
              </button>
            )}
          </div>
        )}

        {/* Markdown preview/raw toggle */}
        {isMarkdown && viewMode === "source" && (
          <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
            <button
              onClick={() => setPreviewMode(true)}
              style={{
                padding: "2px 8px", fontSize: 11, border: "none", cursor: "pointer",
                background: previewMode ? "var(--bg-selected)" : "var(--bg-hover)",
                color: previewMode ? "var(--text)" : "var(--text-muted)",
                fontWeight: previewMode ? 600 : 400,
              }}
            >
              排版预览
            </button>
            <button
              onClick={() => setPreviewMode(false)}
              style={{
                padding: "2px 8px", fontSize: 11, border: "none", borderLeft: "1px solid var(--border)", cursor: "pointer",
                background: !previewMode ? "var(--bg-selected)" : "var(--bg-hover)",
                color: !previewMode ? "var(--text)" : "var(--text-muted)",
                fontWeight: !previewMode ? 600 : 400,
              }}
            >
              沉浸创作
            </button>
          </div>
        )}

        {/* Copy button — visible in Raw mode */}
        {viewMode === "source" && !previewMode && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(editContent).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            title="Copy to clipboard"
            style={{
              padding: "2px 8px", fontSize: 11, cursor: "pointer",
              background: copied ? "rgba(74,222,128,0.15)" : "var(--bg-hover)",
              color: copied ? "#4ade80" : "var(--text-muted)",
              border: "1px solid var(--border)", borderRadius: 5,
              display: "flex", alignItems: "center", gap: 4,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        {viewMode === "diff" && hasDiff ? (
          <div style={{ flex: 1, overflow: "auto" }}>
            <DiffView oldContent={prevContent!} newContent={editContent} language={data.language} />
          </div>
        ) : isHtml && previewMode ? (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <iframe
              srcDoc={editContent}
              sandbox="allow-scripts"
              style={{ width: "100%", height: "100%", border: "none", background: "var(--bg)" }}
              title="HTML preview"
            />
          </div>
        ) : isMarkdown && previewMode ? (
          <div style={{ flex: 1, overflow: "auto" }}>
            <div
              className="markdown-body markdown-file-preview"
              style={{ padding: "32px 48px", maxWidth: 800, margin: "0 auto", fontFamily: "var(--font-serif)" }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
            </div>
          </div>
        ) : (data.language === "markdown" || data.language === "text") ? (
          /* Zen Writing Editor */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <textarea
              value={editContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="在这里开始您的文学创作..."
              spellCheck={false}
              style={{
                flex: 1,
                width: "100%",
                padding: "32px 48px 80px",
                background: "var(--bg)",
                color: "var(--text)",
                fontFamily: "var(--font-serif)",
                fontSize: "16px",
                lineHeight: "1.8",
                border: "none",
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
                overflowY: "auto",
                caretColor: "var(--accent)",
              }}
            />
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              height: "35px",
              boxSizing: "border-box",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)",
              fontSize: "11px",
              color: "var(--text-muted)",
              fontFamily: "var(--font-serif)",
              flexShrink: 0,
            }}>
              <div style={{ flexShrink: 0, whiteSpace: "nowrap", marginRight: 16 }}>
                字数: <span style={{ fontWeight: 600, color: "var(--text)", marginRight: 16 }}>{editContent.length} 字</span>
                行数: <span style={{ fontWeight: 600, color: "var(--text)" }}>{editContent.split("\n").length} 行</span>
              </div>
              
              {/* InkOS Command Toolbar */}
              {cwd && (
                <div 
                  className="no-scrollbar"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    overflowX: "auto",
                    whiteSpace: "nowrap",
                    flexShrink: 1,
                  }}
                >

                  <button
                    onClick={() => requestRunAction("audit", handleRunAudit)}
                    disabled={auditLoading || writeLoading || reviseLoading || syncLoading || planLoading || saveStatus === "saving"}
                    style={{
                      padding: "5px 12px",
                      background: "rgba(59, 130, 246, 0.08)",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      borderRadius: "6px",
                      color: "#60a5fa",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(59, 130, 246, 0.16)";
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.color = "#93c5fd";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(59, 130, 246, 0.08)";
                      e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.4)";
                      e.currentTarget.style.color = "#60a5fa";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
                    }}
                  >
                    {auditLoading ? "正在审计中..." : (
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                          <circle cx="11" cy="11" r="7" />
                          <path d="m21 21-4.3-4.3" />
                          <path d="m8 11 2 2 4-4" />
                        </svg>
                        防崩审计
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => requestRunAction("sync", handleSync)}
                    disabled={syncLoading || writeLoading || reviseLoading || auditLoading || planLoading || saveStatus === "saving"}
                    style={{
                      padding: "5px 12px",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      borderRadius: "6px",
                      color: "#34d399",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(16, 185, 129, 0.16)";
                      e.currentTarget.style.borderColor = "#10b981";
                      e.currentTarget.style.color = "#6ee7b7";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(16, 185, 129, 0.08)";
                      e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.4)";
                      e.currentTarget.style.color = "#34d399";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
                    }}
                  >
                    {syncLoading ? "正在同步中..." : (
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                          <path d="M16 3h5v5" />
                          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                          <path d="M8 21H3v-5" />
                        </svg>
                        同步设定
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => requestRunAction("plan", handlePlanChapter)}
                    disabled={planLoading || writeLoading || reviseLoading || syncLoading || auditLoading || saveStatus === "saving"}
                    style={{
                      padding: "5px 12px",
                      background: "rgba(168, 85, 247, 0.08)",
                      border: "1px solid rgba(168, 85, 247, 0.4)",
                      borderRadius: "6px",
                      color: "#c084fc",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(168, 85, 247, 0.16)";
                      e.currentTarget.style.borderColor = "#a855f7";
                      e.currentTarget.style.color = "#d8b4fe";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(168, 85, 247, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(168, 85, 247, 0.08)";
                      e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.4)";
                      e.currentTarget.style.color = "#c084fc";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
                    }}
                  >
                    {planLoading ? "正在规划中..." : (
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M21 9H3M21 15H3M12 3v18" />
                        </svg>
                        规划蓝图
                      </span>
                    )}
                  </button>
                  {/* AI Revise Mode Dropdown Split Button */}
                  {(() => {
                    const isDetectMode = reviseMode.startsWith("detect-");
                    const btnTheme = isDetectMode ? {
                      text: "#a78bfa",
                      textHover: "#c084fc",
                      bg: "rgba(139, 92, 246, 0.08)",
                      bgHover: "rgba(139, 92, 246, 0.16)",
                      border: "rgba(139, 92, 246, 0.4)",
                      borderHover: "#8b5cf6",
                      separator: "rgba(139, 92, 246, 0.3)"
                    } : {
                      text: "#2dd4bf",
                      textHover: "#5eead4",
                      bg: "rgba(20, 184, 166, 0.08)",
                      bgHover: "rgba(20, 184, 166, 0.16)",
                      border: "rgba(20, 184, 166, 0.4)",
                      borderHover: "#14b8a6",
                      separator: "rgba(20, 184, 166, 0.3)"
                    };

                    return (
                      <div 
                        style={{ position: "relative", display: "inline-flex", alignItems: "stretch" }}
                        onMouseLeave={() => setIsReviseDropdownOpen(false)}
                      >
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          background: btnTheme.bg,
                          border: `1px solid ${btnTheme.border}`,
                          borderRadius: "6px",
                          transition: "all 0.2s ease",
                          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                        }}>
                          <button
                            onClick={() => {
                              if (reviseMode === "detect-llm") {
                                requestRunAction("detect-llm", () => handleRunDetect("llm"));
                              } else {
                                requestRunAction(reviseMode, () => handleRevise(reviseMode));
                              }
                            }}
                            disabled={reviseLoading || detectLoading || writeLoading || syncLoading || auditLoading || planLoading || saveStatus === "saving"}
                            style={{
                              padding: "5px 10px 5px 12px",
                              background: "none",
                              border: "none",
                              borderRadius: "5px 0 0 5px",
                              color: btnTheme.text,
                              cursor: "pointer",
                              fontSize: "11px",
                              fontWeight: 600,
                              fontFamily: "var(--font-serif)",
                              whiteSpace: "nowrap",
                              outline: "none",
                              display: "flex",
                              alignItems: "center",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.parentElement!.style.background = btnTheme.bgHover;
                              e.currentTarget.parentElement!.style.borderColor = btnTheme.borderHover;
                              e.currentTarget.style.color = btnTheme.textHover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.parentElement!.style.background = btnTheme.bg;
                              e.currentTarget.parentElement!.style.borderColor = btnTheme.border;
                              e.currentTarget.style.color = btnTheme.text;
                            }}
                          >
                            {reviseLoading || detectLoading ? (
                              reviseLoading ? "正在修正..." : "正在检测..."
                            ) : (
                              <span style={{ display: "flex", alignItems: "center" }}>
                                {isDetectMode ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                                    <circle cx="11" cy="11" r="7" />
                                    <path d="m21 21-4.3-4.3" />
                                    <rect x="9" y="9" width="4" height="4" rx="1" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" />
                                    <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5Z" opacity="0.6" />
                                  </svg>
                                )}
                                {reviseMode === "detect-llm" && "检测 AI 味"}
                                {reviseMode === "spot-fix" && "局部定点修复"}
                                {reviseMode === "anti-detect" && "防检测润色"}
                                {reviseMode === "polish" && "文本润色"}
                                {reviseMode === "rewrite" && "智能改写"}
                                {reviseMode === "rework" && "剧情重写"}
                              </span>
                            )}
                          </button>
                          <div style={{
                            width: "1px",
                            alignSelf: "stretch",
                            background: btnTheme.separator,
                            margin: "4px 0",
                          }} />
                          <button
                            onClick={() => setIsReviseDropdownOpen(!isReviseDropdownOpen)}
                            disabled={reviseLoading || detectLoading || writeLoading || syncLoading || auditLoading || planLoading || saveStatus === "saving"}
                            style={{
                              padding: "5px 8px",
                              background: "none",
                              border: "none",
                              borderRadius: "0 5px 5px 0",
                              color: btnTheme.text,
                              cursor: "pointer",
                              fontSize: "10px",
                              outline: "none",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.parentElement!.style.background = btnTheme.bgHover;
                              e.currentTarget.parentElement!.style.borderColor = btnTheme.borderHover;
                              e.currentTarget.style.color = btnTheme.textHover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.parentElement!.style.background = btnTheme.bg;
                              e.currentTarget.parentElement!.style.borderColor = btnTheme.border;
                              e.currentTarget.style.color = btnTheme.text;
                            }}
                          >
                            ▾
                          </button>
                        </div>

                        {/* Revise/Detect Mode selector dropdown menu */}
                        {isReviseDropdownOpen && (
                          <div style={{
                            position: "absolute",
                            bottom: "100%",
                            right: 0,
                            paddingBottom: "6px",
                            minWidth: "220px",
                            zIndex: 105,
                          }}>
                            <div style={{
                              background: "var(--bg-panel)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                              padding: "6px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                              animation: "fadeIn 0.15s ease-out",
                            }}>
                              <div style={{
                                fontSize: "9px",
                                color: "var(--text-dim)",
                                padding: "4px 8px 2px",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}>
                                选择修正模式
                              </div>
                              
                              {([
                                { mode: "detect-llm", label: "检测 AI 味", desc: "大模型智能评估，只分析特征提供诊断报告，不动正文", isDetect: true },
                                { mode: "spot-fix", label: "局部定点修复", desc: "微调修复叙事前后矛盾与逻辑不一致", isDetect: false },
                                { mode: "anti-detect", label: "防检测润色", desc: "消除 AI 腔调与高频标记词，使文字表达自然流畅", isDetect: false },
                                { mode: "polish", label: "文本润色", desc: "雕琢词句提升文学性，保留全部原有情节", isDetect: false },
                                { mode: "rewrite", label: "智能改写", desc: "重写特定段落，丰富对话、情绪和动作描写", isDetect: false },
                                { mode: "rework", label: "剧情重写", desc: "根据最新意图和大纲完全重写本章", isDetect: false }
                              ] as const).map((item) => (
                                <button
                                  key={item.mode}
                                  onClick={() => {
                                    setReviseMode(item.mode);
                                    setIsReviseDropdownOpen(false);
                                  }}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    padding: "8px 10px",
                                    borderRadius: "6px",
                                    border: "none",
                                    background: reviseMode === item.mode ? "var(--bg-selected)" : "transparent",
                                    cursor: "pointer",
                                    width: "100%",
                                    textAlign: "left",
                                    fontFamily: "var(--font-serif)",
                                    transition: "background 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (reviseMode !== item.mode) e.currentTarget.style.background = "var(--bg-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (reviseMode !== item.mode) e.currentTarget.style.background = "transparent";
                                  }}
                                >
                                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center" }}>
                                    {item.isDetect ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                                        <circle cx="11" cy="11" r="7" />
                                        <path d="m21 21-4.3-4.3" />
                                        <rect x="9" y="9" width="4" height="4" rx="1" />
                                      </svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" />
                                      </svg>
                                    )}
                                    {item.label}
                                  </div>
                                  <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>
                                    {item.desc}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}


              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {!isReportOpen && (isRunning || auditData || detectData || writeResult || reviseResult || syncResult || planResult || reportContent) && (
                  <button
                    onClick={() => setIsReportOpen(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      fontSize: 10,
                      cursor: "pointer",
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.15s",
                      marginRight: 6,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <span>{isRunning ? "⏳" : "📋"}</span>
                    <span>{isRunning ? "查看运行进度" : "查看报告"}</span>
                  </button>
                )}
                {saveStatus === "saving" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    </svg>
                    自动保存中...
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span style={{ color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    已自动保存
                  </span>
                )}
                {saveStatus === "dirty" && (
                  <span style={{ color: "var(--text-dim)" }}>
                    编辑中...
                  </span>
                )}
                {saveStatus === "error" && (
                  <span style={{ color: "#ef4444" }}>
                    ⚠️ 自动保存失败
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* General Non-editable source files (e.g. scripts) */
          <div style={{ flex: 1, overflow: "auto" }}>
            <SyntaxHighlighter
              language={data.language === "text" ? "plaintext" : data.language}
              style={isDark ? vscDarkPlus : vs}
              showLineNumbers
              lineNumberStyle={{
                color: "var(--text-dim)",
                fontStyle: "normal",
                minWidth: "3em",
                paddingRight: "1em",
              }}
              customStyle={{
                margin: 0,
                padding: "12px 0",
                background: "var(--bg)",
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: "var(--font-mono)",
                minHeight: "100%",
              }}
              codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
              wrapLongLines={wrapLines}
            >
              {editContent}
            </SyntaxHighlighter>
          </div>
        )}
      </div>

      {/* HTML Fullscreen Modal */}
      {isHtmlModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 24px",
          color: "white"
        }}>
          {/* Modal Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexShrink: 0
          }}>
            <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>
              HTML Fullscreen Preview
            </span>
            <button
              onClick={() => setIsHtmlModalOpen(false)}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                borderRadius: 4,
                border: "none",
                background: "#ef4444",
                color: "white",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              ✕ Close
            </button>
          </div>

          {/* Modal Content */}
          <div style={{
            flex: 1,
            background: "white",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
          }}>
            <iframe
              srcDoc={data.content}
              sandbox="allow-scripts"
              style={{ width: "100%", height: "100%", border: "none" }}
              title="HTML fullscreen preview"
            />
          </div>
        </div>
      )}

      {/* InkOS Audit/Plan Report Drawer */}
      {isReportOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(10, 10, 10, 0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "flex-end", // slide-over from right
          color: "var(--text)"
        }}>
          {/* Drawer Body */}
          <div style={{
            width: "min(600px, 90%)",
            height: "100%",
            background: "var(--bg)",
            boxShadow: "-10px 0 30px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid var(--border)",
            fontFamily: "var(--font-serif)"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)",
              flexShrink: 0
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {reportTitle}
              </span>
              <button
                onClick={() => {
                  if (isRunning) return;
                  setIsReportOpen(false);
                }}
                disabled={isRunning}
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: isRunning ? "var(--bg)" : "var(--bg-hover)",
                  color: isRunning ? "var(--text-dim)" : "var(--text-muted)",
                  cursor: isRunning ? "not-allowed" : "pointer",
                  opacity: isRunning ? 0.6 : 1,
                  fontWeight: 600,
                  fontFamily: "var(--font-serif)"
                }}
              >
                {isRunning ? "执行中..." : "✕ 关闭"}
              </button>
            </div>

            {/* Markdown Content */}
            <div style={{
              flex: 1,
              padding: "24px 32px",
              overflowY: "auto",
              lineHeight: "1.8",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column"
            }} className="markdown-body markdown-file-preview">
              {(writeLoading || auditLoading || planLoading || reviseLoading || syncLoading || detectLoading) ? (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexShrink: 0 }}>
                    <div style={{
                      width: "16px",
                      height: "16px",
                      border: "2px solid var(--border)",
                      borderTopColor: "var(--accent)",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                      flexShrink: 0
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
                      正在执行指令，实时进度如下：
                    </span>
                  </div>
                  <div 
                    ref={consoleRef}
                    style={{
                      flex: 1,
                      background: "#121214",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      padding: "12px",
                      overflowY: "auto",
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: "11px",
                      lineHeight: "1.5",
                      color: "#e4e4e7",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {logs.length === 0 ? (
                      <span style={{ color: "var(--text-dim)" }}>正在准备执行环境...</span>
                    ) : (
                      logs.map((log, index) => (
                        <div key={index} style={{ marginBottom: 2 }}>
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                ) : (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {detectData ? (
                      <DetectReport data={detectData} />
                    ) : auditData ? (
                      <AuditReport data={auditData} />
                    ) : writeResult ? (
                      <WriteReport data={writeResult} />
                    ) : reviseResult ? (
                      <ReviseReport data={reviseResult} />
                    ) : syncResult ? (
                      <SyncReport data={syncResult} />
                    ) : planResult ? (
                      <PlanReport data={planResult} />
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent}</ReactMarkdown>
                    )}
                  </div>
                  {logs.length > 0 && (
                    <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 12, flexShrink: 0 }}>
                      <details style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                        <summary style={{ fontWeight: 600, marginBottom: 8, userSelect: "none" }}>查看控制台运行日志</summary>
                        <div 
                          style={{
                            background: "#121214",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "12px",
                            maxHeight: "180px",
                            overflowY: "auto",
                            fontFamily: "var(--font-mono), monospace",
                            fontSize: "11px",
                            lineHeight: "1.5",
                            color: "#e4e4e7",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            textAlign: "left",
                          }}
                        >
                          {logs.map((log, index) => (
                            <div key={index} style={{ marginBottom: 2 }}>
                              {log}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Dialog */}
      {isRejectDialogOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(15, 10, 10, 0.4)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            width: "min(480px, 90%)",
            background: "var(--bg-panel)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 20px",
              background: "rgba(239, 68, 68, 0.08)",
              borderBottom: "1px solid rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              fontWeight: 600,
              fontSize: 14
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>确认驳回并重构章节</span>
            </div>

            {/* Content */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{
                background: "rgba(239, 68, 68, 0.04)",
                border: "1px solid rgba(239, 68, 68, 0.1)",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: 12,
                color: "var(--text)",
                lineHeight: "1.6"
              }}>
                <span style={{ color: "#ef4444", fontWeight: 600, display: "block", marginBottom: 4 }}>
                  ⚠️ 毁灭性操作警告：
                </span>
                驳回该章节将<strong>删除此章节及所有后续章节</strong>，并将书籍与AI系统的状态数据库回滚到前一章节（第 {chapterNumber ? chapterNumber - 1 : 0} 章）。此操作会丢弃当前章节的所有生成数据与文件，<strong>且无法撤销！</strong>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                  请输入驳回重构的具体原因（可选，将作为重构的指导上下文）：
                </span>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="例如：剧情节奏太慢，角色性格偏离设定，或者需要重新规划意图..."
                  disabled={isReviewing}
                  style={{
                    width: "100%",
                    height: "90px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "var(--text)",
                    fontFamily: "var(--font-serif)",
                    resize: "none",
                    outline: "none"
                  }}
                />
              </div>

              {reviewError && (
                <div style={{
                  color: "#ef4444",
                  fontSize: 12,
                  background: "rgba(239, 68, 68, 0.05)",
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                  borderRadius: "6px",
                  padding: "8px 12px"
                }}>
                  {reviewError}
                </div>
              )}

              {isReviewing && reviewLogs.length > 0 && (
                <div style={{
                  background: "#121214",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "8px",
                  maxHeight: "100px",
                  overflowY: "auto",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: "10px",
                  color: "#e4e4e7",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all"
                }}>
                  {reviewLogs.map((log, index) => (
                    <div key={index} style={{ marginBottom: 2 }}>{log}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              padding: "12px 20px",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)"
            }}>
              <button
                onClick={() => {
                  setIsRejectDialogOpen(false);
                  setRejectReason("");
                }}
                disabled={isReviewing}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                  cursor: isReviewing ? "not-allowed" : "pointer",
                  fontWeight: 500
                }}
              >
                取消
              </button>
              <button
                onClick={handleRejectChapter}
                disabled={isReviewing}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "none",
                  background: isReviewing ? "rgba(239, 68, 68, 0.5)" : "#ef4444",
                  color: "white",
                  cursor: isReviewing ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                {isReviewing ? (
                  <>
                    <div style={{
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255, 255, 255, 0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite"
                    }} />
                    正在回滚...
                  </>
                ) : (
                  "确认驳回并重构"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Settings Dialog */}
      {isDraftDialogOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(15, 10, 10, 0.4)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            width: "min(500px, 92%)",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 20px",
              background: "rgba(249, 115, 22, 0.08)",
              borderBottom: "1px solid rgba(249, 115, 22, 0.15)",
              color: "#ff903f",
              fontWeight: 600,
              fontSize: 14
            }}>
              <span style={{ fontSize: 16 }}>🚀</span>
              <span>极速起草模式配置</span>
            </div>

            {/* Content */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Guidance Info */}
              <div style={{
                background: "rgba(249, 115, 22, 0.03)",
                border: "1px solid rgba(249, 115, 22, 0.1)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: "1.5"
              }}>
                <span style={{ color: "#ff903f", fontWeight: 600 }}>💡 极速起草说明：</span>
                此模式下，AI 将绕过复杂的设定同步、审计和 spot-fix 局部修正，直接根据大纲和以下创意引导快速生成首稿。这对于维持高涨的灵感和连贯的写作逻辑非常合适。
              </div>

              {/* Creative Guidance */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                  本章创意引导 (可选，指导本章具体剧情走向)：
                </span>
                <textarea
                  value={draftContext}
                  onChange={(e) => setDraftContext(e.target.value)}
                  placeholder="例如：主角在林中遭遇黑衣人伏击，一番激战后身负轻伤跳崖。在崖底醒来，发现一个神秘石洞..."
                  style={{
                    width: "100%",
                    height: "110px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "var(--text)",
                    fontFamily: "var(--font-serif)",
                    resize: "none",
                    outline: "none"
                  }}
                />
              </div>

              {/* Write Style Selector */}
              {availableStyles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                    🎭 选择写作文风偏好：
                  </span>
                  
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availableStyles.map((style: string) => {
                      const isSelected = (selectedStyleName || "default") === style;
                      return (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setSelectedStyleName(style)}
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            borderRadius: "16px",
                            border: `1px solid ${isSelected ? "#ff903f" : "var(--border)"}`,
                            background: isSelected ? "rgba(249, 115, 22, 0.08)" : "var(--bg)",
                            color: isSelected ? "#ff903f" : "var(--text)",
                            cursor: "pointer",
                            fontWeight: isSelected ? 600 : 500,
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <span>🎭</span>
                          <span>{style}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Word Count */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                  期望本章字数：
                </span>
                
                {/* Preset choices */}
                <div style={{ display: "flex", gap: 8 }}>
                  {[1000, 2000, 3000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDraftWords(preset)}
                      style={{
                        flex: 1,
                        padding: "5px 0",
                        fontSize: "11px",
                        borderRadius: "4px",
                        border: `1px solid ${draftWords === preset ? "#ff903f" : "var(--border)"}`,
                        background: draftWords === preset ? "rgba(249, 115, 22, 0.08)" : "var(--bg)",
                        color: draftWords === preset ? "#ff903f" : "var(--text)",
                        cursor: "pointer",
                        fontWeight: draftWords === preset ? 600 : 500,
                        transition: "all 0.2s",
                      }}
                    >
                      {preset}字
                    </button>
                  ))}
                </div>

                {/* Slider + numeric input */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                  <input
                    type="range"
                    min="500"
                    max="10000"
                    step="100"
                    value={draftWords}
                    onChange={(e) => setDraftWords(parseInt(e.target.value, 10))}
                    style={{
                      flex: 1,
                      accentColor: "#ff903f",
                      cursor: "pointer",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      min="500"
                      max="20000"
                      value={draftWords}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setDraftWords(val);
                      }}
                      style={{
                        width: "70px",
                        textAlign: "center",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        padding: "4px 6px",
                        fontSize: "11px",
                        color: "var(--text)",
                        fontFamily: "var(--font-serif)",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>字</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              padding: "12px 20px",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)"
            }}>
              <button
                onClick={() => {
                  setIsDraftDialogOpen(false);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontWeight: 500
                }}
              >
                取消
              </button>
              <button
                onClick={() => requestRunAction("draft", () => handleDraft(false))}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "none",
                  background: "#ff903f",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                开始起草
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Issues Modal */}
      {isAuditModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(15, 10, 10, 0.4)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            width: "min(600px, 92%)",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              background: "rgba(59, 130, 246, 0.08)",
              borderBottom: "1px solid rgba(59, 130, 246, 0.15)",
              color: "var(--text)",
              fontWeight: 600,
              fontSize: 14
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🛡️</span>
                <span>离线审计报告 - 第 {chapterNumber} 章</span>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 18,
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxHeight: "60vh",
              overflowY: "auto"
            }}>
              {auditIssues.length === 0 ? (
                <div style={{
                  padding: "20px 0",
                  textAlign: "center",
                  color: "var(--text-dim)",
                  fontSize: 12
                }}>
                  没有检测到任何审计问题。
                </div>
              ) : (
                auditIssues.map((issue, idx) => {
                  // Parse severity and content
                  const match = issue.match(/^\[(critical|warning|info)\]\s*(.*)$/i);
                  const severity = match ? (match[1].toLowerCase() as "critical" | "warning" | "info") : "info";
                  const text = match ? match[2] : issue;

                  const severityMeta = {
                    critical: {
                      label: "严重错误",
                      color: "#ef4444",
                      bg: "rgba(239, 68, 68, 0.04)",
                      border: "rgba(239, 68, 68, 0.15)",
                      badgeBg: "rgba(239, 68, 68, 0.12)"
                    },
                    warning: {
                      label: "潜在风险",
                      color: "#eab308",
                      bg: "rgba(234, 179, 8, 0.04)",
                      border: "rgba(234, 179, 8, 0.15)",
                      badgeBg: "rgba(234, 179, 8, 0.12)"
                    },
                    info: {
                      label: "风格建议",
                      color: "#3b82f6",
                      bg: "rgba(59, 130, 246, 0.04)",
                      border: "rgba(59, 130, 246, 0.15)",
                      badgeBg: "rgba(59, 130, 246, 0.12)"
                    }
                  }[severity];

                  return (
                    <div
                      key={idx}
                      style={{
                        background: severityMeta.bg,
                        border: `1px solid ${severityMeta.border}`,
                        borderLeft: `4px solid ${severityMeta.color}`,
                        borderRadius: "8px",
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          color: severityMeta.color,
                          background: severityMeta.badgeBg,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase"
                        }}>
                          {severityMeta.label}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: "var(--text)",
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word"
                      }}>
                        {text}
                      </div>

                      {/* Recommended Fix */}
                      <div style={{
                        marginTop: 4,
                        paddingTop: 6,
                        borderTop: "1px dashed var(--border)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        color: "var(--text-muted)"
                      }}>
                        <span style={{ color: "var(--text-dim)" }}>建议使用修复功能：</span>
                        <span style={{ 
                          color: 
                            severity === "critical" || severity === "warning" ? "#2dd4bf" : "#3b82f6",
                          fontWeight: 500
                        }}>
                          {severity === "critical" || severity === "warning"
                            ? "🪄 局部定点修复"
                            : text.toLowerCase().includes("ai") || text.includes("检测到") || text.includes("句式")
                            ? "🪄 防检测润色 / 文本润色"
                            : "🪄 文本润色"
                          }
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "12px 20px",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)"
            }}>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                style={{
                  padding: "6px 20px",
                  fontSize: 12,
                  borderRadius: 6,
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
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      {confirmDialog && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(15, 10, 10, 0.4)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            width: "min(480px, 90%)",
            background: "var(--bg-panel)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 20px",
              background: "rgba(239, 68, 68, 0.08)",
              borderBottom: "1px solid rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              fontWeight: 600,
              fontSize: 14
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>{confirmDialog.title}</span>
            </div>

            {/* Content */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{
                background: "rgba(239, 68, 68, 0.04)",
                border: "1px solid rgba(239, 68, 68, 0.1)",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: 12,
                color: "var(--text)",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap"
              }}>
                <span style={{ color: "#ef4444", fontWeight: 600, display: "block", marginBottom: 4 }}>
                  ⚠️ {confirmDialog.warning || "操作警告："}
                </span>
                {confirmDialog.message}
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              padding: "12px 20px",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)"
            }}>
              <button
                onClick={() => setConfirmDialog(null)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontWeight: 500
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const onConfirm = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  onConfirm();
                }}
                style={{
                  padding: "6px 16px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#dc2626"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#ef4444"; }}
              >
                确认操作
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Dialog */}
      {alertDialog && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "rgba(15, 10, 10, 0.45)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            width: "min(480px, 90%)",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 20px",
              background: "rgba(234, 88, 12, 0.08)",
              borderBottom: "1px solid rgba(234, 88, 12, 0.15)",
              color: "var(--accent)",
              fontWeight: 600,
              fontSize: 14
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{alertDialog.title}</span>
            </div>

            {/* Content */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{
                fontSize: 13,
                color: "var(--text)",
                margin: 0,
                lineHeight: "1.5"
              }}>
                {alertDialog.message}
              </p>

              {alertDialog.checklist && alertDialog.checklist.length > 0 && (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "12px 14px"
                }}>
                  {alertDialog.checklist.map((item, idx) => (
                    <div key={idx} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 12,
                      color: item.completed ? "var(--text-muted)" : "var(--text)",
                      opacity: item.completed ? 0.75 : 1,
                      lineHeight: "1.4"
                    }}>
                      {item.completed ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2, animation: "pulse 2s infinite" }}>
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                      <span style={{ fontWeight: item.completed ? 400 : 500 }}>
                        {item.text}
                        {item.completed && (
                          <span style={{ 
                            fontSize: 9, 
                            color: "#10b981", 
                            background: "rgba(16, 185, 129, 0.08)", 
                            border: "1px solid rgba(16, 185, 129, 0.15)",
                            padding: "1px 5px", 
                            borderRadius: 4, 
                            marginLeft: 6,
                            fontWeight: 600,
                            display: "inline-block",
                            verticalAlign: "middle"
                          }}>
                            已就绪
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "12px 20px",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)"
            }}>
              <button
                onClick={() => setAlertDialog(null)}
                style={{
                  padding: "6px 18px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Execution Confirmation Modal */}
      {execConfirm && (() => {
        const meta = getActionMeta(execConfirm.actionType);

        return (
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
          onClick={() => setExecConfirm(null)}
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
                background: meta.bgTheme,
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
                  border: `1px solid ${meta.themeColor}33`,
                  boxShadow: `0 2px 8px ${meta.themeColor}15`
                }}>
                  {meta.icon}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>确认执行此操作</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{meta.title}</span>
                </div>
              </div>

              {/* Content */}
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{
                  fontSize: 13,
                  color: "var(--text)",
                  lineHeight: "1.6",
                }}>
                  您已点击运行 <strong style={{ color: meta.themeColor }}>「{meta.title}」</strong>。
                </div>
                
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderLeft: `4px solid ${meta.themeColor}`,
                  borderRadius: "8px",
                  padding: "14px 18px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: "1.7",
                }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>功能说明：</span>
                  {meta.desc}
                </div>

                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  💡 提示：您可以在顶部的“系统全局设置” ⚙️ 中关闭此确认弹窗。
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
                  onClick={() => setExecConfirm(null)}
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
                  onClick={() => {
                    const confirmFn = execConfirm.onConfirm;
                    setExecConfirm(null);
                    confirmFn();
                  }}
                  style={{
                    padding: "7px 20px",
                    fontSize: 12,
                    borderRadius: 8,
                    border: "none",
                    background: meta.themeColor,
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    boxShadow: `0 4px 12px ${meta.themeColor}33`,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.9";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = `0 6px 16px ${meta.themeColor}44`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = `0 4px 12px ${meta.themeColor}33`;
                  }}
                >
                  确定执行
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
