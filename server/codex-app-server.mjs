import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const DEFAULT_TIMEOUT_MS = 15_000;

function appServerError(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = "CODEX_APP_SERVER_UNAVAILABLE";
  return error;
}

export class CodexAppServerClient {
  constructor({
    spawnImpl = spawn,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    log = () => {},
    platform = process.platform,
    env = process.env,
  } = {}) {
    this.spawnImpl = spawnImpl;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.platform = platform;
    this.env = env;
    this.process = null;
    this.reader = null;
    this.pending = new Map();
    this.nextId = 1;
    this.starting = null;
  }

  async ensureStarted() {
    if (this.process) return;
    if (this.starting) return this.starting;
    this.starting = this.start().finally(() => { this.starting = null; });
    return this.starting;
  }

  async start() {
    let child;
    try {
      const command = this.platform === "win32"
        ? (this.env.ComSpec || this.env.COMSPEC || "cmd.exe")
        : "codex";
      const args = this.platform === "win32"
        ? ["/d", "/s", "/c", "codex.cmd app-server"]
        : ["app-server"];
      child = this.spawnImpl(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      throw appServerError("Codex could not be started.", error);
    }
    this.process = child;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(line));
    child.stderr?.on("data", (chunk) => this.log(String(chunk).trim()));
    child.once("error", (error) => this.failAll(appServerError("Codex app-server failed.", error)));
    child.once("exit", (code, signal) => {
      this.failAll(appServerError(`Codex app-server exited (${signal ?? code ?? "unknown"}).`));
    });

    try {
      await this.request("initialize", {
        clientInfo: { name: "why_not_now", title: "WhyNotNow", version: "0.1.0" },
      }, { skipStart: true });
      this.notify("initialized", {});
    } catch (error) {
      this.failAll(error);
      child.kill?.();
      throw error;
    }
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id === undefined || message.id === null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(appServerError(message.error.message || "Codex app-server request failed."));
    } else {
      pending.resolve(message.result);
    }
  }

  failAll(error) {
    this.reader?.close();
    this.reader = null;
    this.process = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  notify(method, params) {
    if (!this.process?.stdin?.writable) throw appServerError("Codex app-server is not writable.");
    this.process.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async request(method, params, { skipStart = false } = {}) {
    if (!skipStart) await this.ensureStarted();
    if (!this.process?.stdin?.writable) throw appServerError("Codex app-server is not available.");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(appServerError(`Codex app-server timed out while handling ${method}.`));
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(appServerError("Codex app-server request could not be written.", error));
      });
    });
  }

  async createThread({ cwd } = {}) {
    const result = await this.request("thread/start", cwd ? { cwd } : {});
    const threadId = result?.thread?.id;
    if (typeof threadId !== "string" || !threadId) {
      throw appServerError("Codex did not return a thread ID.");
    }
    return threadId;
  }

  async startTurn(threadId, prompt) {
    await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
    });
  }

  async archiveThread(threadId) {
    try {
      await this.request("thread/archive", { threadId });
    } catch (error) {
      this.log(`Could not archive unused Codex thread: ${error.message}`);
    }
  }
}
