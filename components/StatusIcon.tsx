import React from "react";

export type StatusIconType =
  | "error"
  | "warning"
  | "info"
  | "pass"
  | "fail"
  | "dot-green"
  | "dot-red"
  | "dot-yellow"
  | "dot-blue"
  | "dot-gray"
  | "check";

interface StatusIconProps {
  type: StatusIconType;
  size?: number;
  style?: React.CSSProperties;
}

export function StatusIcon({ type, size = 16, style }: StatusIconProps) {
  switch (type) {
    case "error":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="12" cy="12" r="10" fill="#fef2f2" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case "warning":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#fffbeb" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "info":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="12" cy="12" r="10" fill="#eff6ff" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "pass":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="12" cy="12" r="10" fill="#10b981" />
          <path d="M9 12l2 2 4-4" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "fail":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="12" cy="12" r="10" fill="#ef4444" />
          <path d="M15 9l-6 6M9 9l6 6" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "dot-green":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 12 12"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="6" cy="6" r="5" fill="#10b981" />
        </svg>
      );
    case "dot-red":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 12 12"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="6" cy="6" r="5" fill="#ef4444" />
        </svg>
      );
    case "dot-yellow":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 12 12"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="6" cy="6" r="5" fill="#f59e0b" />
        </svg>
      );
    case "dot-blue":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 12 12"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="6" cy="6" r="5" fill="#3b82f6" />
        </svg>
      );
    case "dot-gray":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 12 12"
          fill="none"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <circle cx="6" cy="6" r="5" fill="#6b7280" />
        </svg>
      );
    case "check":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    default:
      return null;
  }
}
