import { execFile, execSync } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { dirname, join, delimiter } from "path";
import { execPath } from "process";
import { homedir } from "os";

const execFileAsync = promisify(execFile);

/**
 * Automatically repair PATH on macOS GUI/packaged application environments.
 */
function fixMacPath() {
  if (process.platform !== "darwin") return;

  const paths = new Set<string>();

  // 1. Add standard developer binary locations
  paths.add("/usr/local/bin");
  paths.add("/opt/homebrew/bin");

  // 2. Merge existing PATH entries
  if (process.env.PATH) {
    process.env.PATH.split(":").forEach((p) => paths.add(p));
  }

  // 3. Fetch active user shell PATH synchronously via a zsh login shell invocation
  try {
    const userPath = execSync("zsh -lic 'echo $PATH'", { encoding: "utf8", timeout: 2000 }).trim();
    if (userPath) {
      userPath.split(":").forEach((p) => paths.add(p));
    }
  } catch (e) {
    // Fail silently if shell invocation fails (e.g. non-Catalina macOS or no zsh)
  }

  // 4. Update the process.env.PATH
  process.env.PATH = Array.from(paths).join(":");
}

// Invoke PATH recovery
try {
  fixMacPath();
} catch {
  // ignore
}

interface ResolvedNpx {
  nodePath: string;
  npxCliPath: string;
}

/**
 * Locate system Node.js binary and its corresponding npx-cli.js path.
 *
 * Inside packaged Electron, process.execPath is the packaged desktop app itself,
 * not the Node.js binary. We scan PATH and standard install directories to
 * locate the system Node.js and npm CLI tooling.
 */
function resolveNpx(): ResolvedNpx | null {
  // 1. Try to find Node relative to the running execPath (works in standard dev or server Node.js)
  const nodeDir = dirname(execPath);
  const candidates = [
    // Windows MSI installer layout: node.exe and node_modules share a dir
    join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
    // Unix layout: .../bin/node + .../lib/node_modules/npm/bin/npx-cli.js
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ];

  const isElectron = process.versions.electron !== undefined || 
                     execPath.toLowerCase().includes("electron") || 
                     execPath.toLowerCase().includes("desktop");

  if (!isElectron) {
    for (const p of candidates) {
      try {
        if (existsSync(p)) {
          return { nodePath: execPath, npxCliPath: p };
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. Scan system PATH to locate system Node.js installation
  const pathEnv = process.env.PATH || "";
  const paths = pathEnv.split(delimiter);
  const nodeBinNames = process.platform === "win32" ? ["node.exe", "node"] : ["node"];

  for (const dir of paths) {
    if (!dir) continue;
    for (const binName of nodeBinNames) {
      const nodePath = join(dir, binName);
      try {
        if (existsSync(nodePath)) {
          const relativeCandidates = [
            // Windows layout: node_modules next to node.exe
            join(dir, "node_modules", "npm", "bin", "npx-cli.js"),
            // Unix/macOS layout: bin/node and lib/node_modules/npm
            join(dir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
          ];
          for (const p of relativeCandidates) {
            if (existsSync(p)) {
              return { nodePath, npxCliPath: p };
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 3. Fallback to standard installation paths if not on PATH
  if (process.platform === "win32") {
    const stdWinPath = "C:\\Program Files\\nodejs\\node.exe";
    const stdNpxCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";
    try {
      if (existsSync(stdWinPath) && existsSync(stdNpxCli)) {
        return { nodePath: stdWinPath, npxCliPath: stdNpxCli };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export interface RunNpxOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunNpxResult {
  stdout: string;
  stderr: string;
}

/**
 * Cross-platform wrapper for invoking `npx <args>` safely.
 *
 * Prefers executing npx-cli.js directly using the system Node binary to avoid
 * spawning shell command shells and potential argument injection vulnerabilities.
 * Falls back to spawning npx.cmd (on Windows) or npx directly with shell: true
 * if system Node cannot be dynamically located.
 */
export async function runNpx(args: string[], opts: RunNpxOptions = {}): Promise<RunNpxResult> {
  const resolved = resolveNpx();
  if (resolved) {
    console.log(`[runNpx] using resolved node: "${resolved.nodePath}" with npx-cli: "${resolved.npxCliPath}"`);
    return execFileAsync(resolved.nodePath, [resolved.npxCliPath, ...args], {
      timeout: opts.timeout,
      cwd: opts.cwd,
      env: opts.env,
    });
  }

  // Fallback to spawning npx directly on PATH using shell on Windows to support batch executables (.cmd)
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  console.log(`[runNpx] falling back to spawning "${command}" directly`);
  return execFileAsync(command, args, {
    timeout: opts.timeout,
    cwd: opts.cwd,
    env: opts.env,
    shell: process.platform === "win32" ? true : undefined,
  });
}

interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Resolve environment variables from the isolated ~/.ink/agent/models.json configuration file.
 */
function resolveModelsEnv(): Record<string, string> {
  const envs: Record<string, string> = {};
  try {
    const home = homedir();
    const agentDir = process.env.PI_CODING_AGENT_DIR || join(home, ".ink", "agent");
    const settingsPath = join(agentDir, "settings.json");
    const modelsPath = join(agentDir, "models.json");

    let defaultProvider = "";
    let defaultModel = "";
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        defaultProvider = settings.defaultProvider || "";
        defaultModel = settings.defaultModel || "";
      } catch (e) {
        // ignore
      }
    }

    if (existsSync(modelsPath)) {
      const data = JSON.parse(readFileSync(modelsPath, "utf8"));
      if (data && data.providers) {
        // Map all providers
        for (const [providerName, providerConfig] of Object.entries(data.providers)) {
          if (providerConfig && typeof providerConfig === "object") {
            const config = providerConfig as ProviderConfig;
            const upperProvider = providerName.toUpperCase();
            if (config.apiKey) {
              envs[`${upperProvider}_API_KEY`] = config.apiKey;
              // Set fallback OPENAI_API_KEY if not already set
              if (!envs["OPENAI_API_KEY"]) {
                envs["OPENAI_API_KEY"] = config.apiKey;
              }
            }
            if (config.baseUrl) {
              envs[`${upperProvider}_BASE_URL`] = config.baseUrl;
              envs[`${upperProvider}_API_URL`] = config.baseUrl;
              if (!envs["OPENAI_BASE_URL"]) {
                envs["OPENAI_BASE_URL"] = config.baseUrl;
              }
            }
          }
        }

        // Map default selected provider to INKOS_LLM_ environment keys
        const activeProvider = defaultProvider ? data.providers[defaultProvider] : null;
        if (activeProvider && typeof activeProvider === "object") {
          const config = activeProvider as ProviderConfig;
          if (config.apiKey) {
            envs["INKOS_LLM_API_KEY"] = config.apiKey;
          }
          if (config.baseUrl) {
            envs["INKOS_LLM_BASE_URL"] = config.baseUrl;
          }
          if (defaultModel) {
            envs["INKOS_LLM_MODEL"] = defaultModel;
          }
          envs["INKOS_LLM_PROVIDER"] = "openai";
          envs["INKOS_LLM_API_FORMAT"] = "chat";
          envs["INKOS_LLM_STREAM"] = "true";
        }
      }
    }
  } catch (e) {
    console.error("[runInkos] Failed to resolve models.json environment:", e);
  }
  return envs;
}

/**
 * Cross-platform runner for the locally migrated InkOS CLI.
 * Spawns the compiled packages/cli/dist/index.js directly using the resolved Node binary.
 */
export async function runInkos(args: string[], opts: RunNpxOptions = {}): Promise<RunNpxResult> {
  const resolved = resolveNpx();
  const nodeBin = resolved ? resolved.nodePath : "node";
  // The absolute path of the local compiled CLI dist/index.js inside the migrated inkos/ packages.
  // Must be resolved relative to the Next.js project root (E:\ink-xY) rather than the active workspace (opts.cwd).
  let cliPath = join(process.cwd(), "inkos", "packages", "cli", "dist", "index.js");
  if (!existsSync(cliPath)) {
    cliPath = join(__dirname, "..", "inkos", "packages", "cli", "dist", "index.js");
  }

  const modelsEnv = resolveModelsEnv();
  console.log(`[runInkos] invoking local InkOS CLI: "${nodeBin} ${cliPath} ${args.join(" ")}"`);
  return execFileAsync(nodeBin, [cliPath, ...args], {
    timeout: opts.timeout,
    cwd: opts.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...modelsEnv,
      ...opts.env,
    },
  });
}



