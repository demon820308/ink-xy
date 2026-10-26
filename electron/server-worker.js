const { createServer } = require("http");
const path = require("path");
const next = require("next");

// Ensure process.cwd() is consistent with the app binary directory on Windows
try {
  process.chdir(path.dirname(process.execPath));
} catch {}

// Exit with the Electron main process; an orphaned worker keeps port 3030 with a stale app.asar after reinstall (white screen)
process.on("disconnect", () => process.exit(0));

const PORT = process.env.PORT || 3030;
const nextApp = next({
  dev: false,
  dir: path.join(__dirname, "..")
});
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });
  server.listen(PORT, (err) => {
    if (err) {
      console.error("[Next.js Server Worker Error]:", err);
      process.exit(1);
    }
    console.log(`[Next.js Server Worker] listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("[Next.js Server Worker Prepare Error]:", err);
  process.exit(1);
});
