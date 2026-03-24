import { app, BrowserWindow, dialog, utilityProcess, ipcMain } from "electron";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, appendFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const isProd = app.isPackaged;

// Resolve the frontend repo path (sibling directory)
const FRONTEND_DIR = join(ROOT, "..", "ucl-study-llm-chat-frontend");

let studyProcess = null;
let chatProcess = null;
let chatWindow = null;
const STUDY_PORT = 3000;
const CHAT_PORT = 3001;

function readConfig() {
  const configPath = join(app.getPath("userData"), "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Spawn a Next.js server (study manager or chat frontend).
 * Returns a promise that resolves when the server is ready.
 */
function spawnNextServer({ name, port, cwd, extraEnv = {} }) {
  return new Promise((resolve, reject) => {
    const config = readConfig();
    const env = {
      ...process.env,
      ...extraEnv,
    };
    if (config?.databaseUrl) {
      env.DATABASE_URL = config.databaseUrl;
    }

    let proc;

    if (isProd) {
      const standaloneDir = join(process.resourcesPath, `${name}-standalone`);
      const serverJs = join(standaloneDir, "server.js");

      if (!existsSync(serverJs)) {
        reject(new Error(`${name} standalone server not found at ${serverJs}`));
        return;
      }

      proc = utilityProcess.fork(serverJs, [], {
        cwd: standaloneDir,
        env: { ...env, PORT: String(port), HOSTNAME: "localhost", NODE_ENV: "production" },
        stdio: "pipe",
      });
    } else {
      proc = spawn("npx", ["next", "dev", "--port", String(port)], {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
    }

    let started = false;
    const logFile = join(app.getPath("userData"), `${name}.log`);
    appendFileSync(logFile, `\n--- Starting ${name} at ${new Date().toISOString()} port=${port} ---\n`);

    const onData = (data) => {
      const text = data.toString();
      appendFileSync(logFile, text);
      if (!isProd) process.stdout.write(`[${name}] ${text}`);
      if (!started && (text.includes("Ready") || text.includes("Listening") || text.includes("started"))) {
        started = true;
        resolve(proc);
      }
    };

    if (proc.stdout) proc.stdout.on("data", onData);
    if (proc.stderr) proc.stderr.on("data", (data) => {
      const text = data.toString();
      appendFileSync(logFile, text);
      if (!isProd) process.stderr.write(`[${name}] ${text}`);
      if (!started && text.includes("Listening")) { started = true; resolve(proc); }
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      appendFileSync(logFile, `[exit] code=${code}\n`);
      if (!started) reject(new Error(`${name} exited with code ${code}. Check ${logFile}`));
    });

    setTimeout(() => { if (!started) { started = true; resolve(proc); } }, 15000);
  });
}

function createStudyWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.mjs"),
    },
  });
  win.loadURL(`http://localhost:${STUDY_PORT}`);
  return win;
}

function openChatWindow(params = {}) {
  // Build query string from params
  const query = new URLSearchParams(params).toString();
  const url = `http://localhost:${CHAT_PORT}${query ? `?${query}` : ""}`;

  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.loadURL(url);
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    title: "AI Assistant",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  chatWindow.loadURL(url);
  chatWindow.on("closed", () => { chatWindow = null; });
}

// IPC: renderer requests to open the chat window
ipcMain.handle("open-chat", (_event, params) => {
  openChatWindow(params);
});

function killAll() {
  if (studyProcess) { studyProcess.kill(); studyProcess = null; }
  if (chatProcess) { chatProcess.kill(); chatProcess = null; }
}

app.whenReady().then(async () => {
  const earlyLog = join(app.getPath("userData"), "startup.log");
  appendFileSync(earlyLog, `\n--- ${new Date().toISOString()} ---\n`);
  appendFileSync(earlyLog, `isProd: ${isProd}\n`);

  if (isProd) {
    const config = readConfig();
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
    // Start study manager server
    studyProcess = await spawnNextServer({
      name: "study",
      port: STUDY_PORT,
      cwd: ROOT,
    });

    // Start chat frontend server (if available)
    const chatCwd = isProd ? null : FRONTEND_DIR;
    if (!isProd && existsSync(FRONTEND_DIR)) {
      chatProcess = await spawnNextServer({
        name: "chat",
        port: CHAT_PORT,
        cwd: FRONTEND_DIR,
        extraEnv: { STUDY_MANAGER_MODE: "true" },
      });
    } else if (isProd) {
      // Production: spawn from standalone
      chatProcess = await spawnNextServer({
        name: "chat",
        port: CHAT_PORT,
        cwd: ROOT, // not used in prod (standalone has its own cwd)
        extraEnv: { STUDY_MANAGER_MODE: "true" },
      });
    }
  } catch (err) {
    dialog.showErrorBox("Failed to start", err.message);
    killAll();
    app.quit();
    return;
  }

  createStudyWindow();
});

app.on("window-all-closed", () => {
  killAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createStudyWindow();
});

app.on("before-quit", killAll);
