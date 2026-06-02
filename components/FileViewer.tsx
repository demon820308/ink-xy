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
          {getRelativeFilePath(filePath, cwd)}
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
          {getRelativeFilePath(filePath, cwd)}
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
          {getRelativeFilePath(filePath, cwd)}
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

export function FileViewer({ filePath, cwd }: Props) {
  if (isImagePath(filePath)) {
    return <ImageViewer filePath={filePath} cwd={cwd} />;
  }
  if (isAudioPath(filePath)) {
    return <AudioViewer filePath={filePath} cwd={cwd} />;
  }
  if (isPptxPath(filePath)) {
    return <PptxViewer filePath={filePath} cwd={cwd} />;
  }
  return <TextFileViewer filePath={filePath} cwd={cwd} />;
}

function TextFileViewer({ filePath, cwd }: Props) {
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

  // InkOS Integration states
  const [auditLoading, setAuditLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const [hasChapters, setHasChapters] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [isReportOpen, setIsReportOpen] = useState(false);

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
    setAuditLoading(true);
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
          args: { chapter: relativeChapter }
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "审计执行失败");
      }
      setReportContent(data.stdout || "审计完成，无一致性问题。");
    } catch (err: any) {
      console.error(err);
      setReportContent(`### ⚠️ 审计运行失败\n\n${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在「模型配置」中配置了大模型 API Key。`);
    } finally {
      setAuditLoading(false);
    }
  };

  const handlePlanChapter = async () => {
    if (!cwd) return;
    setPlanLoading(true);
    setReportTitle("本章意图与剧情大纲规划");
    setReportContent("正在运行 InkOS 多智能体规划管线，请稍候...");
    setIsReportOpen(true);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          cwd,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "规划执行失败");
      }
      setReportContent(data.stdout || "规划完成。已为您生成本章写作焦点和规则栈。");
    } catch (err: any) {
      console.error(err);
      setReportContent(`### ⚠️ 规划运行失败\n\n${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在「模型配置」中配置了大模型 API Key。`);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleWriteNext = async () => {
    if (!cwd) return;
    const bookId = getBookIdFromPath(filePath, cwd);
    if (!bookId) return;

    setWriteLoading(true);
    const modeTitle = hasChapters ? "智能续写正文" : "智能写作正文";
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

      // 2. Call the write next API with json: true
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write-next",
          cwd,
          args: { bookId, json: true }
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "智能创作执行失败");
      }

      // 3. Parse JSON results from stdout
      let results: any[] = [];
      try {
        results = JSON.parse(data.stdout);
      } catch (e) {
        console.error("Failed to parse write-next JSON output:", e);
        setReportContent(data.stdout || "写作/续写任务完成。");
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
        window.dispatchEvent(new CustomEvent("open-file", {
          detail: { filePath: newFilePath, fileName: found.name }
        }));
      }

      // 5. Refresh sidebar file tree explorer
      window.dispatchEvent(new CustomEvent("refresh-explorer"));

      // 6. Format consistency/audit report in markdown
      const isPassed = result.auditResult?.passed ?? false;
      const issues = result.auditResult?.issues ?? [];
      const reportMarkdown = [
        `### 🎉 ${modeTitle}完成！`,
        "",
        `- **章节**: 第 ${result.chapterNumber} 章 《${result.title}》`,
        `- **字数**: ${result.wordCount} 字`,
        `- **自动修正**: ${result.revised ? "已执行（已修复关键问题）" : "无（无需修正）"}`,
        `- **状态结算**: \`${result.status}\``,
        "",
        `#### 🔍 离线审稿审计结果`,
        isPassed 
          ? "✅ **审计通过**：无逻辑矛盾或角色人设崩塌问题。" 
          : "⚠️ **审计未完全通过**：检测到一些逻辑或人设风险，建议审阅：",
        "",
        issues.length > 0
          ? issues.map((issue: any) => `- [${issue.severity}] **${issue.category}**: ${issue.description}\n  *建议: ${issue.suggestion}*`).join("\n")
          : "*（无关键警告或错误）*"
      ].join("\n");

      setReportContent(reportMarkdown);
      setHasChapters(true);
    } catch (err: any) {
      console.error(err);
      setReportContent(`### ⚠️ 智能创作失败\n\n${err.message || String(err)}\n\n请确保已在侧边栏点击【一键开启创作宇宙】初始化该工作区，并在「模型配置」中配置了大模型 API Key。`);
    } finally {
      setWriteLoading(false);
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
        if (d.language === "markdown") setPreviewMode(true);
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
  const lines = data.content.split("\n");
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
          {getRelativeFilePath(filePath, cwd)}
        </span>
        <span style={{ marginLeft: "auto" }}>{data.language}</span>
        {viewMode === "source" && <span>{lines.length} lines</span>}
        <span>{formatSize(data.size)}</span>

        {/* Live watch indicator */}
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

        {/* Word wrap toggle */}
        {viewMode === "source" && !previewMode && (
          <button
            onClick={() => setWrapLines((v) => !v)}
            title={wrapLines ? "Disable word wrap" : "Enable word wrap"}
            style={{
              padding: "2px 8px", fontSize: 11, cursor: "pointer",
              background: wrapLines ? "var(--bg-selected)" : "var(--bg-hover)",
              color: wrapLines ? "var(--text)" : "var(--text-muted)",
              border: "1px solid var(--border)", borderRadius: 5,
              fontWeight: wrapLines ? 600 : 400,
            }}
          >
            wrap
          </button>
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
                padding: "32px 48px",
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
            {/* Zen Editor Footer Status */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 20px",
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)",
              fontSize: "11px",
              color: "var(--text-muted)",
              fontFamily: "var(--font-serif)",
              flexShrink: 0,
            }}>
              <div>
                字数统计: <span style={{ fontWeight: 600, color: "var(--text)", marginRight: 16 }}>{editContent.length} 字</span>
                行数: <span style={{ fontWeight: 600, color: "var(--text)" }}>{editContent.split("\n").length} 行</span>
              </div>
              
              {/* InkOS Command Toolbar */}
              {cwd && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={handleWriteNext}
                    disabled={writeLoading || saveStatus === "saving"}
                    style={{
                      padding: "3px 10px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: "10px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    {writeLoading ? "正在编写中..." : (hasChapters ? "✍️ 智能续写正文" : "✍️ 智能写作正文")}
                  </button>
                  <button
                    onClick={handleRunAudit}
                    disabled={auditLoading || saveStatus === "saving"}
                    style={{
                      padding: "3px 10px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: "10px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    {auditLoading ? "正在审计中..." : "🔍 人设防崩审计"}
                  </button>
                  <button
                    onClick={handlePlanChapter}
                    disabled={planLoading}
                    style={{
                      padding: "3px 10px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: "10px",
                      fontWeight: 600,
                      fontFamily: "var(--font-serif)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    {planLoading ? "正在规划中..." : "📝 规划本章意图"}
                  </button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                onClick={() => setIsReportOpen(false)}
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontFamily: "var(--font-serif)"
                }}
              >
                ✕ 关闭
              </button>
            </div>

            {/* Markdown Content */}
            <div style={{
              flex: 1,
              padding: "24px 32px",
              overflowY: "auto",
              lineHeight: "1.8",
              fontSize: "14px"
            }} className="markdown-body markdown-file-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
