import { Action, ActionPanel, Color, Icon, List, showToast, Toast, open } from "@raycast/api";
import { existsSync } from "fs";
import { join, dirname, basename } from "path";
import { QmdSearchResult, QmdGetResult } from "../types";
import { getScoreColor, formatScorePercentage, runQmd, expandPath } from "../utils/qmd";

interface SearchResultItemProps {
  result: QmdSearchResult;
  collectionPath?: string;
  showDetail?: boolean;
  onToggleDetail?: () => void;
}

/**
 * Detect if a path is inside an Obsidian vault and return vault info
 */
function detectObsidianVault(fullPath: string): { isObsidian: boolean; vaultName?: string; relativePath?: string } {
  if (!fullPath) return { isObsidian: false };

  // Walk up the directory tree looking for .obsidian folder
  let currentDir = dirname(fullPath);
  const maxDepth = 20; // Prevent infinite loops
  let depth = 0;

  while (currentDir && currentDir !== "/" && depth < maxDepth) {
    const obsidianDir = join(currentDir, ".obsidian");
    if (existsSync(obsidianDir)) {
      // Found the vault root
      const vaultName = basename(currentDir);
      // Get the relative path from vault root (without leading slash)
      const relativePath = fullPath.substring(currentDir.length + 1);
      return { isObsidian: true, vaultName, relativePath };
    }
    currentDir = dirname(currentDir);
    depth++;
  }

  return { isObsidian: false };
}

/**
 * Build Obsidian deep link URL
 */
function buildObsidianUrl(vaultName: string, relativePath: string): string {
  // Remove .md extension for Obsidian links
  const pathWithoutExt = relativePath.replace(/\.md$/, "");
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(pathWithoutExt)}`;
}

export function SearchResultItem({ result, collectionPath, showDetail, onToggleDetail }: SearchResultItemProps) {
  // Compute full path if we have the collection path and relative path
  const relativePath = result.path;
  const fullPath = collectionPath && relativePath
    ? join(expandPath(collectionPath), relativePath)
    : result.fullPath;

  // Note: We don't check file existence because qmd normalizes paths
  // (e.g., "3. Logs" becomes "3-logs") and we can't reliably resolve them
  const fileExists = true; // Trust that qmd found valid files

  // Display path - use relative path or extract from file URL
  const displayPath = relativePath || result.file || "Unknown";

  // Check for Obsidian vault
  const obsidian = fullPath ? detectObsidianVault(fullPath) : { isObsidian: false };

  const scoreColor = getScoreColor(result.score);
  const scorePercentage = formatScorePercentage(result.score);

  // Map score color to Raycast Color
  const tagColor = scoreColor === "green" ? Color.Green : scoreColor === "yellow" ? Color.Yellow : Color.Red;

  const accessories: List.Item.Accessory[] = [
    { tag: { value: scorePercentage, color: tagColor } },
  ];

  if (!fileExists) {
    accessories.unshift({ icon: { source: Icon.Warning, tintColor: Color.Orange }, tooltip: "File not found" });
  }

  // Build detail markdown with full snippet (including @@ context)
  const detailMarkdown = `# ${result.title || displayPath}

\`\`\`
${result.snippet || ""}
\`\`\`

---

**Collection:** ${result.collection || "Unknown"}

**Path:** ${displayPath}

**DocID:** \`${result.docid}\`

**Score:** ${scorePercentage}`;

  return (
    <List.Item
      title={result.title || displayPath}
      accessories={accessories}
      icon={obsidian.isObsidian ? Icon.Book : fileExists ? Icon.Document : Icon.Warning}
      detail={<List.Item.Detail markdown={detailMarkdown} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Open">
            {/* Primary action: Open in Obsidian if it's a vault, otherwise default editor */}
            {obsidian.isObsidian && obsidian.vaultName && obsidian.relativePath && (
              <Action
                title="Open in Obsidian"
                icon={Icon.Book}
                onAction={async () => {
                  const url = buildObsidianUrl(obsidian.vaultName!, obsidian.relativePath!);
                  await open(url);
                }}
              />
            )}
            {fullPath && fileExists && (
              <Action
                title="Open in Editor"
                icon={Icon.AppWindow}
                shortcut={obsidian.isObsidian ? { modifiers: ["cmd"], key: "e" } : undefined}
                onAction={async () => {
                  // Try VS Code first with line number
                  const lineArg = result.line ? `:${result.line}` : "";
                  try {
                    await open(`vscode://file${fullPath}${lineArg}`);
                  } catch {
                    // Fall back to system default
                    await open(fullPath);
                  }
                }}
              />
            )}
            {fullPath && fileExists && <Action.ShowInFinder path={fullPath} />}
          </ActionPanel.Section>
          <ActionPanel.Section title="Copy">
            {fullPath && (
              <Action.CopyToClipboard
                title="Copy Path"
                content={fullPath}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
            )}
            <Action
              title="Copy Content"
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={async () => {
                const toast = await showToast({
                  style: Toast.Style.Animated,
                  title: "Fetching content...",
                });

                const getResult = await runQmd<QmdGetResult>(["get", `#${result.docid}`, "--full"]);

                if (getResult.success && getResult.data) {
                  await navigator.clipboard.writeText(getResult.data.content);
                  toast.style = Toast.Style.Success;
                  toast.title = "Content copied";
                } else {
                  toast.style = Toast.Style.Failure;
                  toast.title = "Failed to fetch content";
                  toast.message = getResult.error;
                }
              }}
            />
            <Action.CopyToClipboard
              title="Copy DocID"
              content={result.docid}
              shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {onToggleDetail && (
              <Action
                title={showDetail ? "Hide Detail" : "Show Detail"}
                icon={showDetail ? Icon.EyeDisabled : Icon.Eye}
                shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                onAction={onToggleDetail}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
