"use client";

export type DiffLine =
  | { type: "unchanged"; text: string; lineNo: number }
  | { type: "removed"; text: string; lineNo: number }
  | { type: "added"; text: string; lineNo: number };

// Myers diff — returns line-level unified diff
export function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
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
          const pv = trace[dd];
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

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  language: string;
  viewType?: "unified" | "split";
}

export function DiffView({ oldContent, newContent, viewType = "split" }: DiffViewProps) {
  const oldLines = oldContent.replace(/\r/g, "").split("\n");
  const newLines = newContent.replace(/\r/g, "").split("\n");
  const diff = diffLines(oldLines, newLines);

  const hasChanges = diff.some((l) => l.type !== "unchanged");
  if (!hasChanges) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        No changes
      </div>
    );
  }

  if (viewType === "split") {
    // Pre-calculate line numbers for left (old) and right (new) sides
    let leftLno = 1;
    let rightLno = 1;
    const processedDiff = diff.map((line) => {
      let leftNum: number | undefined;
      let rightNum: number | undefined;
      if (line.type === "unchanged") {
        leftNum = leftLno++;
        rightNum = rightLno++;
      } else if (line.type === "removed") {
        leftNum = leftLno++;
      } else if (line.type === "added") {
        rightNum = rightLno++;
      }
      return { ...line, leftNum, rightNum };
    });

    // Group into side-by-side rows
    interface SplitRow {
      type: "unchanged" | "split";
      left?: { type: "unchanged" | "removed"; text: string; lineNo: number };
      right?: { type: "unchanged" | "added"; text: string; lineNo: number };
    }

    const rows: SplitRow[] = [];
    let idx = 0;
    while (idx < processedDiff.length) {
      if (processedDiff[idx].type === "unchanged") {
        rows.push({
          type: "unchanged",
          left: { type: "unchanged", text: processedDiff[idx].text, lineNo: processedDiff[idx].leftNum! },
          right: { type: "unchanged", text: processedDiff[idx].text, lineNo: processedDiff[idx].rightNum! },
        });
        idx++;
      } else {
        const removed: typeof processedDiff = [];
        const added: typeof processedDiff = [];
        while (idx < processedDiff.length && processedDiff[idx].type !== "unchanged") {
          if (processedDiff[idx].type === "removed") {
            removed.push(processedDiff[idx]);
          } else if (processedDiff[idx].type === "added") {
            added.push(processedDiff[idx]);
          }
          idx++;
        }
        const maxLen = Math.max(removed.length, added.length);
        for (let j = 0; j < maxLen; j++) {
          rows.push({
            type: "split",
            left: removed[j] ? { type: "removed", text: removed[j].text, lineNo: removed[j].leftNum! } : undefined,
            right: added[j] ? { type: "added", text: added[j].text, lineNo: added[j].rightNum! } : undefined,
          });
        }
      }
    }

    // Determine visibility based on CONTEXT around change rows
    const CONTEXT = 3;
    const changedIndices = new Set<number>();
    rows.forEach((row, rIdx) => {
      if (row.type === "split") {
        changedIndices.add(rIdx);
      }
    });

    const visibleIndices = new Set<number>();
    for (const ci of changedIndices) {
      for (let j = Math.max(0, ci - CONTEXT); j <= Math.min(rows.length - 1, ci + CONTEXT); j++) {
        visibleIndices.add(j);
      }
    }

    const splitSegments: Array<{ hidden: true; count: number } | { hidden: false; rows: SplitRow[] }> = [];
    let rIdx = 0;
    while (rIdx < rows.length) {
      if (visibleIndices.has(rIdx)) {
        const block: SplitRow[] = [];
        while (rIdx < rows.length && visibleIndices.has(rIdx)) {
          block.push(rows[rIdx]);
          rIdx++;
        }
        splitSegments.push({ hidden: false, rows: block });
      } else {
        let count = 0;
        while (rIdx < rows.length && !visibleIndices.has(rIdx)) {
          count++;
          rIdx++;
        }
        splitSegments.push({ hidden: true, count });
      }
    }

    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
        {splitSegments.map((seg, si) => {
          if (seg.hidden) {
            return (
              <div
                key={si}
                style={{
                  padding: "4px 16px",
                  color: "var(--text-dim)",
                  background: "var(--bg-panel)",
                  fontSize: 11,
                  borderTop: si > 0 ? "1px solid var(--border)" : "none",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "center",
                  userSelect: "none",
                }}
              >
                ... {seg.count} unchanged lines ...
              </div>
            );
          }

          return (
            <div key={si}>
              {seg.rows.map((row, ri) => {
                const leftBg = row.left
                  ? row.left.type === "removed"
                    ? "rgba(240,60,60,0.14)"
                    : "transparent"
                  : "var(--bg-panel)";
                const rightBg = row.right
                  ? row.right.type === "added"
                    ? "rgba(0,200,80,0.12)"
                    : "transparent"
                  : "var(--bg-panel)";

                const leftPrefix = row.left ? (row.left.type === "removed" ? "-" : " ") : "";
                const rightPrefix = row.right ? (row.right.type === "added" ? "+" : " ") : "";

                const leftPrefixColor = row.left
                  ? row.left.type === "removed" ? "#f87171" : "var(--text-dim)"
                  : "transparent";
                const rightPrefixColor = row.right
                  ? row.right.type === "added" ? "#4ade80" : "var(--text-dim)"
                  : "transparent";

                const leftBorderColor = row.left?.type === "removed" ? "#f87171" : "transparent";
                const rightBorderColor = row.right?.type === "added" ? "#4ade80" : "transparent";

                return (
                  <div key={ri} style={{ display: "flex", width: "100%", borderBottom: "1px solid rgba(128,128,128,0.08)" }}>
                    {/* Left half (Old) */}
                    <div style={{ flex: 1, width: "50%", display: "flex", background: leftBg, borderRight: "1px solid var(--border)", borderLeft: `3px solid ${leftBorderColor}` }}>
                      <span
                        style={{
                          minWidth: 44,
                          padding: "0 8px 0 16px",
                          textAlign: "right",
                          color: "var(--text-dim)",
                          userSelect: "none",
                          fontSize: 11,
                          borderRight: "1px solid var(--border)",
                          background: "var(--bg-panel)",
                          flexShrink: 0,
                        }}
                      >
                        {row.left?.lineNo || ""}
                      </span>
                      <span
                        style={{
                          minWidth: 16,
                          padding: "0 6px",
                          color: leftPrefixColor,
                          userSelect: "none",
                          flexShrink: 0,
                          fontWeight: 600,
                          textAlign: "center",
                        }}
                      >
                        {leftPrefix}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          padding: "0 8px 0 0",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          color: row.left ? "var(--text)" : "var(--text-dim)",
                          overflowX: "auto",
                        }}
                      >
                        {row.left?.text || "\u00a0"}
                      </span>
                    </div>

                    {/* Right half (New) */}
                    <div style={{ flex: 1, width: "50%", display: "flex", background: rightBg, borderLeft: `3px solid ${rightBorderColor}` }}>
                      <span
                        style={{
                          minWidth: 44,
                          padding: "0 8px 0 16px",
                          textAlign: "right",
                          color: "var(--text-dim)",
                          userSelect: "none",
                          fontSize: 11,
                          borderRight: "1px solid var(--border)",
                          background: "var(--bg-panel)",
                          flexShrink: 0,
                        }}
                      >
                        {row.right?.lineNo || ""}
                      </span>
                      <span
                        style={{
                          minWidth: 16,
                          padding: "0 6px",
                          color: rightPrefixColor,
                          userSelect: "none",
                          flexShrink: 0,
                          fontWeight: 600,
                          textAlign: "center",
                        }}
                      >
                        {rightPrefix}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          padding: "0 8px 0 0",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          color: row.right ? "var(--text)" : "var(--text-dim)",
                          overflowX: "auto",
                        }}
                      >
                        {row.right?.text || "\u00a0"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
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
