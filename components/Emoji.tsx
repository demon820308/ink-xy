import React from "react";

interface EmojiProps {
  char: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Emoji({ char, className, style }: EmojiProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        display: "inline-block",
        verticalAlign: "middle",
        fontVariantEmoji: "emoji",
        ...style,
      }}
    >
      {char}
    </span>
  );
}
