export function normalizeFilePathSlashes(filePath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")) {
    return filePath.replace(/\\/g, "/");
  }
  return filePath;
}

export function encodeFilePathForApi(filePath: string): string {
  return normalizeFilePathSlashes(filePath)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export function getFileName(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath).replace(/\/+$/, "");
  return normalized.split("/").pop() ?? normalized;
}

export function getRelativeFilePath(filePath: string, cwd?: string): string {
  if (!cwd) return filePath;

  let normalizedFile = normalizeFilePathSlashes(filePath);
  let normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/$/, "");

  // Normalize drive letter casing for Windows paths
  const driveLetterRegex = /^[a-zA-Z]:\//;
  if (driveLetterRegex.test(normalizedFile) && driveLetterRegex.test(normalizedCwd)) {
    if (normalizedFile[0].toLowerCase() === normalizedCwd[0].toLowerCase()) {
      normalizedFile = normalizedFile[0].toLowerCase() + normalizedFile.slice(1);
      normalizedCwd = normalizedCwd[0].toLowerCase() + normalizedCwd.slice(1);
    }
  }

  if (normalizedFile.startsWith(normalizedCwd + "/")) {
    return normalizedFile.slice(normalizedCwd.length + 1);
  }
  return filePath;
}

export function joinFilePath(parent: string, child: string): string {
  return `${normalizeFilePathSlashes(parent).replace(/\/$/, "")}/${child}`;
}
