import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync } from "fs";

const home = homedir();
const inkDir = join(home, ".ink", "agent");
const piDir = join(home, ".pi", "agent");

if (!process.env.PI_CODING_AGENT_DIR) {
  process.env.PI_CODING_AGENT_DIR = inkDir;
}

function copyDirSync(src: string, dest: string) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      try {
        if (!existsSync(destPath)) {
          writeFileSync(destPath, readFileSync(srcPath));
        }
      } catch (e) {
        console.error(`[env-init] Failed to copy file ${srcPath} to ${destPath}:`, e);
      }
    }
  }
}

function isDefaultJsonContent(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return true;
    const content = readFileSync(filePath, "utf8").trim();
    if (!content || content === "{}" || content === '{\n  "providers": {}\n}') return true;
    const parsed = JSON.parse(content);
    if (Object.keys(parsed).length === 0) return true;
    if (parsed.providers && Object.keys(parsed.providers).length === 0) return true;
    return false;
  } catch {
    return true;
  }
}

// Auto-migrate configuration files and directories from .pi/agent to .ink/agent
try {
  if (existsSync(piDir)) {
    if (!existsSync(inkDir)) {
      mkdirSync(inkDir, { recursive: true });
    }

    // 1. Migrate JSON config files
    const filesToMigrate = [
      "models.json",
      "auth.json",
      "settings.json",
      "fetched-models-cache.json",
      "gem_xy.json",
      "locked-sessions.json"
    ];
    for (const file of filesToMigrate) {
      const srcPath = join(piDir, file);
      const destPath = join(inkDir, file);
      
      if (existsSync(srcPath)) {
        if (isDefaultJsonContent(destPath)) {
          try {
            writeFileSync(destPath, readFileSync(srcPath));
            console.log(`[env-init] Migrated config file ${file} from .pi/agent to .ink/agent`);
          } catch (e) {
            console.error(`[env-init] Failed to migrate config file ${file}:`, e);
          }
        }
      }
    }

    // 2. Migrate directories (sessions, skills, bin)
    const dirsToMigrate = ["sessions", "skills", "bin"];
    for (const dir of dirsToMigrate) {
      const srcDir = join(piDir, dir);
      const destDir = join(inkDir, dir);
      if (existsSync(srcDir)) {
        try {
          copyDirSync(srcDir, destDir);
          console.log(`[env-init] Migrated directory ${dir} from .pi/agent to .ink/agent`);
        } catch (e) {
          console.error(`[env-init] Failed to migrate directory ${dir}:`, e);
        }
      }
    }

    // 3. Rename old .pi directory to .pi.bak to keep environment clean
    const piParent = join(home, ".pi");
    if (existsSync(piParent)) {
      try {
        const backupPath = piParent + ".bak";
        // If backup already exists, append timestamp or number
        let finalBackupPath = backupPath;
        let counter = 1;
        while (existsSync(finalBackupPath)) {
          finalBackupPath = `${backupPath}_${counter}`;
          counter++;
        }
        renameSync(piParent, finalBackupPath);
        console.log(`[env-init] Renamed old config dir ${piParent} to ${finalBackupPath}`);
      } catch (e) {
        console.error(`[env-init] Failed to rename old config dir:`, e);
      }
    }
  }
} catch (err) {
  console.error("[env-init] Migration failed:", err);
}

