import { app, BrowserWindow, dialog, utilityProcess } from "electron";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, appendFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const isProd = app.isPackaged;

let nextProcess = null;
const port = 3000;

function readConfig() {
  const configPath = join(app.getPath("userData"), "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const config = readConfig();
    const extraEnv = {};
    if (config?.databaseUrl) {
      extraEnv.DATABASE_URL = config.databaseUrl;
    }

    if (isProd) {
      const standaloneDir = join(process.resourcesPath, "standalone");
      const serverJs = join(standaloneDir, "server.js");

      if (!existsSync(serverJs)) {
        reject(new Error(`Standalone server not found at ${serverJs}`));
        return;
      }

      // Use Electron's utilityProcess.fork() — runs server.js with Electron's
      // bundled Node.js runtime, no external node binary needed.
      nextProcess = utilityProcess.fork(serverJs, [], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          ...extraEnv,
          PORT: String(port),
          HOSTNAME: "localhost",
          NODE_ENV: "production",
        },
        stdio: "pipe",
      });

      let started = false;

      const logFile = join(app.getPath("userData"), "server.log");
      appendFileSync(logFile, `\n--- Starting server at ${new Date().toISOString()} ---\n`);
      appendFileSync(logFile, `serverJs: ${serverJs}\ncwd: ${standaloneDir}\n`);

      nextProcess.stdout.on("data", (data) => {
        const text = data.toString();
        appendFileSync(logFile, `[stdout] ${text}`);
        if (!started && (text.includes("Ready") || text.includes("Listening") || text.includes("started"))) {
          started = true;
          resolve();
        }
      });

      nextProcess.stderr.on("data", (data) => {
        const text = data.toString();
        appendFileSync(logFile, `[stderr] ${text}`);
        if (!started && (text.includes("Ready") || text.includes("Listening"))) {
          started = true;
          resolve();
        }
      });

      nextProcess.on("exit", (code) => {
        appendFileSync(logFile, `[exit] code=${code}\n`);
        if (!started) reject(new Error(`Next.js exited with code ${code}. Check ${logFile}`));
      });

      setTimeout(() => {
        if (!started) { started = true; resolve(); }
      }, 15000);

    } else {
      // Dev mode: spawn npx next dev
      nextProcess = spawn("npx", ["next", "dev", "--port", String(port)], {
        cwd: ROOT,
        env: { ...process.env, ...extraEnv },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

      let started = false;

      nextProcess.stdout.on("data", (data) => {
        const text = data.toString();
        process.stdout.write(text);
        if (!started && text.includes("Ready")) {
          started = true;
          resolve();
        }
      });

      nextProcess.stderr.on("data", (data) => {
        process.stderr.write(data.toString());
      });

      nextProcess.on("error", reject);
      nextProcess.on("exit", (code) => {
        if (!started) reject(new Error(`Next.js exited with code ${code}`));
      });

      setTimeout(() => {
        if (!started) { started = true; resolve(); }
      }, 15000);
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(`http://localhost:${port}`);
}

app.whenReady().then(async () => {
  const earlyLog = join(app.getPath("userData"), "startup.log");
  appendFileSync(earlyLog, `\n--- ${new Date().toISOString()} ---\n`);
  appendFileSync(earlyLog, `isProd: ${isProd}\n`);
  appendFileSync(earlyLog, `resourcesPath: ${process.resourcesPath}\n`);
  appendFileSync(earlyLog, `appPath: ${app.getAppPath()}\n`);

  if (isProd) {
    const config = readConfig();
    appendFileSync(earlyLog, `config found: ${!!config}\n`);
    if (!config?.databaseUrl) {
      const configPath = join(app.getPath("userData"), "config.json");
      dialog.showErrorBox(
        "Configuration missing",
        `Please place a config.json file at:\n\n${configPath}\n\nWith contents:\n{\n  "databaseUrl": "postgresql://..."\n}\n\nContact your study administrator.`
      );
      app.quit();
      return;
    }
  }

  try {
    await startNextServer();
  } catch (err) {
    dialog.showErrorBox("Failed to start", err.message);
    app.quit();
    return;
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (nextProcess) { nextProcess.kill(); nextProcess = null; }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (nextProcess) { nextProcess.kill(); nextProcess = null; }
});
