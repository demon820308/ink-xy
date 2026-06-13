"use client";

import { isImagePath, ImageViewer } from "./file-viewer/ImageViewer";
import { isAudioPath, AudioViewer } from "./file-viewer/AudioViewer";
import { isPptxPath, PptxViewer } from "./file-viewer/PptxViewer";
import { TextFileViewer } from "./file-viewer/TextFileViewer";

interface Props {
  filePath: string;
  cwd?: string;
  availableStyles?: string[];
  activeStyleName?: string | null;
  showExecutionConfirm?: boolean;
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
  return (
    <TextFileViewer
      filePath={filePath}
      cwd={cwd}
      availableStyles={availableStyles}
      activeStyleName={activeStyleName}
      showExecutionConfirm={showExecutionConfirm}
    />
  );
}
