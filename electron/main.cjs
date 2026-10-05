const { app, BrowserWindow, dialog } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const apiPort = "3001";
let apiProcess;

function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "server", "index.js");
  }
  return path.join(__dirname, "..", "server", "index.js");
}

function getEnvironmentPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, "..", ".env");
}

function getServerEnvironment() {
  const env = { ...process.env, PORT: apiPort };
  const envPath = getEnvironmentPath();

  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }

  env.HEARTHY_DATA_DIR = path.join(app.getPath("userData"), "data");
  env.ELECTRON_RUN_AS_NODE = "1";
  return env;
}

function waitForApi() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (apiProcess?.exitCode !== null && apiProcess?.exitCode !== undefined) {
        reject(new Error(`Hearthy API exited with code ${apiProcess.exitCode}.`));
        return;
      }

      fetch(`http://127.0.0.1:${apiPort}/api/health`)
        .then((response) => {
          if (response.ok) resolve();
          else retry();
        })
        .catch(retry);
    };
    const retry = () => {
      if (Date.now() - startedAt > 15000) {
        reject(new Error("Hearthy API did not start within 15 seconds."));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 360,
    minHeight: 640,
    backgroundColor: "#f5f3ed",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    await window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    await window.loadURL("http://localhost:8443");
  }
}

app.whenReady().then(async () => {
  try {
    apiProcess = fork(getServerPath(), [], {
      execPath: process.execPath,
      env: getServerEnvironment(),
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForApi();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox("Hearthy could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiProcess && apiProcess.exitCode === null) apiProcess.kill();
});
