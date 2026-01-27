import { exec, ChildProcess, spawn } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { DependencyStatus, QmdResult, QmdCollection, QmdContext, QmdFileListItem, ScoreColor } from "../types";
import { parseCollectionList, parseContextList, parseFileList } from "./parsers";

const execAsync = promisify(exec);

// Active embed process tracking
let activeEmbedProcess: ChildProcess | null = null;

// ============================================================================
// Path & Environment Utilities
// ============================================================================

/**
 * Get environment with extended PATH for Raycast sandbox
 * Raycast doesn't inherit the user's shell PATH, so we need to add common paths
 */
function getEnvWithPath(): NodeJS.ProcessEnv {
  const home = homedir();
  const additionalPaths = [
    join(home, ".bun", "bin"), // Bun default install location
    join(home, ".local", "bin"), // Common user bin
    "/opt/homebrew/bin", // Homebrew on Apple Silicon
    "/usr/local/bin", // Homebrew on Intel Mac / common location
    "/usr/bin",
    "/bin",
  ];

  const currentPath = process.env.PATH || "";
  const newPath = [...additionalPaths, currentPath].join(":");

  return {
    ...process.env,
    PATH: newPath,
  };
}

/**
 * Get the full path to the bun executable
 */
function getBunExecutable(): string {
  const bunInHome = join(homedir(), ".bun", "bin", "bun");
  if (existsSync(bunInHome)) {
    return bunInHome;
  }
  return "bun"; // fallback to PATH
}

/**
 * Get the full path to the qmd script
 */
function getQmdScript(): string {
  return join(homedir(), ".bun", "bin", "qmd");
}

/**
 * Build a shell command that sets PATH and runs qmd
 */
function buildQmdShellCommand(args: string[]): string {
  const bunBin = join(homedir(), ".bun", "bin");
  // Escape single quotes in args for shell safety
  const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(" ");
  return `export PATH="${bunBin}:$PATH" && qmd ${escapedArgs}`;
}

/**
 * Get QMD database path
 */
export function getQmdDatabasePath(): string {
  return join(homedir(), ".cache", "qmd", "index.sqlite");
}

/**
 * Validate if a collection path exists
 */
export function validateCollectionPath(path: string): boolean {
  // Expand ~ to home directory
  const expandedPath = path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
  return existsSync(expandedPath);
}

/**
 * Expand ~ in path to full home directory path
 */
export function expandPath(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

// ============================================================================
// Dependency Checks
// ============================================================================

/**
 * Check if Bun is installed
 */
export async function checkBunInstalled(): Promise<{ installed: boolean; version?: string }> {
  const bunPath = getBunExecutable();

  // Check if bun exists at the expected path
  if (existsSync(bunPath)) {
    return { installed: true, version: "installed" };
  }

  // fallback: Try running bun to check if it's in PATH
  try {
    const { stdout } = await execAsync("bun --version", { timeout: 5000, env: getEnvWithPath() });
    return { installed: true, version: stdout.trim() };
  } catch {
    return { installed: false };
  }
}

/**
 * Check if QMD is installed
 */
export async function checkQmdInstalled(): Promise<{ installed: boolean; version?: string }> {
  const qmdScript = getQmdScript();

  // First just check if the file exists
  if (!existsSync(qmdScript)) {
    console.log("QMD check: script not found at", qmdScript);
    return { installed: false };
  }

  // File exists, consider it installed (don't try to execute for version)
  // This avoids issues with bun execution in Raycast sandbox
  return { installed: true, version: "installed" };
}

/**
 * Check if SQLite is installed (macOS only via Homebrew)
 */
export async function checkSqliteInstalled(): Promise<boolean> {
  if (platform() !== "darwin") {
    // On Windows, assume SQLite is available or let QMD handle it
    return true;
  }
  try {
    await execAsync("brew list sqlite", { timeout: 5000, env: getEnvWithPath() });
    return true;
  } catch {
    // SQLite might be available system-wide even if not via Homebrew
    try {
      await execAsync("sqlite3 --version", { timeout: 5000, env: getEnvWithPath() });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check all dependencies
 */
export async function checkAllDependencies(): Promise<DependencyStatus> {
  const [bunResult, qmdResult, sqliteInstalled] = await Promise.all([
    checkBunInstalled(),
    checkQmdInstalled(),
    checkSqliteInstalled(),
  ]);

  return {
    bunInstalled: bunResult.installed,
    qmdInstalled: qmdResult.installed,
    sqliteInstalled,
    bunVersion: bunResult.version,
    qmdVersion: qmdResult.version,
  };
}

// ============================================================================
// QMD Command Execution
// ============================================================================

/**
 * Execute a QMD command and parse JSON output
 */
export async function runQmd<T>(
  args: string[],
  options: { timeout?: number; includeJson?: boolean } = {},
): Promise<QmdResult<T>> {
  const { timeout = 30000, includeJson = true } = options;

  try {
    const fullArgs = includeJson ? [...args, "--json"] : args;
    const command = buildQmdShellCommand(fullArgs);

    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });

    if (includeJson && stdout.trim()) {
      try {
        const data = JSON.parse(stdout) as T;
        return { success: true, data, stderr: stderr || undefined };
      } catch (parseError) {
        return {
          success: false,
          error: `Failed to parse JSON output: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          stderr: stdout, // Include raw output for debugging
        };
      }
    }

    return { success: true, data: stdout as unknown as T, stderr: stderr || undefined };
  } catch (error) {
    const execError = error as { stderr?: string; message?: string; code?: string };
    return {
      success: false,
      error: execError.message || "Command execution failed",
      stderr: execError.stderr,
    };
  }
}

/**
 * Execute a QMD command without JSON parsing (for commands that don't return JSON)
 */
export async function runQmdRaw(args: string[], options: { timeout?: number } = {}): Promise<QmdResult<string>> {
  const { timeout = 30000 } = options;

  try {
    const command = buildQmdShellCommand(args);

    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    return { success: true, data: stdout, stderr: stderr || undefined };
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    return {
      success: false,
      error: execError.message || "Command execution failed",
      stderr: execError.stderr,
    };
  }
}

// ============================================================================
// High-Level QMD Operations (using parsers)
// ============================================================================

/**
 * Get list of collections (parses text output since --json not supported)
 */
export async function getCollections(): Promise<QmdResult<QmdCollection[]>> {
  const result = await runQmdRaw(["collection", "list"]);

  if (!result.success) {
    return { success: false, error: result.error, stderr: result.stderr };
  }

  const collections = parseCollectionList(result.data || "");
  return { success: true, data: collections };
}

/**
 * Get list of contexts (parses text output since --json not supported)
 */
export async function getContexts(): Promise<QmdResult<QmdContext[]>> {
  const result = await runQmdRaw(["context", "list"]);

  if (!result.success) {
    return { success: false, error: result.error, stderr: result.stderr };
  }

  const contexts = parseContextList(result.data || "");
  return { success: true, data: contexts };
}

/**
 * Get list of files in a collection (parses text output since --json not supported)
 */
export async function getCollectionFiles(collectionName: string): Promise<QmdResult<QmdFileListItem[]>> {
  const result = await runQmdRaw(["ls", collectionName]);

  if (!result.success) {
    return { success: false, error: result.error, stderr: result.stderr };
  }

  const files = parseFileList(result.data || "");
  return { success: true, data: files };
}

// ============================================================================
// Background Embedding Process
// ============================================================================

/**
 * Start background embedding process
 */
export function startBackgroundEmbed(
  onProgress?: (message: string) => void,
  onComplete?: (success: boolean, error?: string) => void,
  collectionName?: string,
): () => void {
  if (activeEmbedProcess) {
    onComplete?.(false, "Embedding process already running");
    return () => {};
  }

  const args = ["embed"];
  if (collectionName) {
    args.push("-c", collectionName);
  }

  const command = buildQmdShellCommand(args);
  activeEmbedProcess = spawn("sh", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";

  activeEmbedProcess.stdout?.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) {
      onProgress?.(message);
    }
  });

  activeEmbedProcess.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString();
    const message = data.toString().trim();
    if (message) {
      onProgress?.(message);
    }
  });

  activeEmbedProcess.on("close", (code) => {
    activeEmbedProcess = null;
    if (code === 0) {
      onComplete?.(true);
    } else {
      onComplete?.(false, stderr || `Process exited with code ${code}`);
    }
  });

  activeEmbedProcess.on("error", (error) => {
    activeEmbedProcess = null;
    onComplete?.(false, error.message);
  });

  // Return cancel function
  return () => {
    cancelActiveEmbed();
  };
}

/**
 * Check if embedding is currently running
 */
export function isEmbedRunning(): boolean {
  return activeEmbedProcess !== null;
}

/**
 * Cancel active embedding process
 */
export function cancelActiveEmbed(): boolean {
  if (activeEmbedProcess) {
    activeEmbedProcess.kill("SIGTERM");
    activeEmbedProcess = null;
    return true;
  }
  return false;
}

// ============================================================================
// Score Utilities
// ============================================================================

/**
 * Get score color based on relevance
 */
export function getScoreColor(score: number): ScoreColor {
  if (score > 0.7) return "green";
  if (score >= 0.4) return "yellow";
  return "red";
}

/**
 * Format score as percentage string
 */
export function formatScorePercentage(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get Raycast color for score
 */
export function getScoreRaycastColor(score: number): string {
  const color = getScoreColor(score);
  switch (color) {
    case "green":
      return "#34C759";
    case "yellow":
      return "#FF9500";
    case "red":
      return "#FF3B30";
  }
}

// ============================================================================
// Installation Utilities
// ============================================================================

/**
 * Install QMD via Bun
 */
export async function installQmd(): Promise<QmdResult<string>> {
  try {
    const { stdout, stderr } = await execAsync("bun install -g https://github.com/tobi/qmd", {
      timeout: 120000, // 2 minute timeout for installation
      env: getEnvWithPath(),
    });
    return { success: true, data: stdout, stderr };
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    return {
      success: false,
      error: execError.message || "Installation failed",
      stderr: execError.stderr,
    };
  }
}

/**
 * Install SQLite via Homebrew (macOS only)
 */
export async function installSqlite(): Promise<QmdResult<string>> {
  if (platform() !== "darwin") {
    return { success: false, error: "SQLite installation via Homebrew is only available on macOS" };
  }

  try {
    const { stdout, stderr } = await execAsync("brew install sqlite", {
      timeout: 300000, // 5 minute timeout
      env: getEnvWithPath(),
    });
    return { success: true, data: stdout, stderr };
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    return {
      success: false,
      error: execError.message || "Installation failed",
      stderr: execError.stderr,
    };
  }
}
