import { existsSync } from "node:fs";
import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import type { QmdGetResult, QmdSearchResult, SearchMode } from "../types";
import { formatScorePercentage, getScoreColor, runQmd } from "../utils/qmd";

interface SearchResultItemProps {
  result: QmdSearchResult;
  showDetail?: boolean;
  onToggleDetail?: () => void;
  // Mode switching
  searchMode: SearchMode;
  onSwitchMode: (mode: SearchMode) => void;
  // Option toggles
  showFullDocument: boolean;
  showLineNumbers: boolean;
  showAllResults: boolean;
  onToggleFullDocument: () => void;
  onToggleLineNumbers: () => void;
  onToggleAllResults: () => void;
}

export function SearchResultItem({
  result,
  showDetail,
  onToggleDetail,
  searchMode,
  onSwitchMode,
  showFullDocument,
  showLineNumbers,
  showAllResults,
  onToggleFullDocument,
  onToggleLineNumbers,
  onToggleAllResults,
}: SearchResultItemProps) {
  // Display path - use relative path or extract from file URL
  const displayPath = result.path || result.file || "Unknown";
  const fullPath = result.fullPath;
  const fileExists = fullPath ? existsSync(fullPath) : false;

  const scoreColor = getScoreColor(result.score);
  const scorePercentage = formatScorePercentage(result.score);

  // Map score color to Raycast Color
  const tagColor =
    scoreColor === "green" ? Color.Green : scoreColor === "yellow" ? Color.Yellow : Color.Red;

  const accessories: List.Item.Accessory[] = [{ tag: { value: scorePercentage, color: tagColor } }];

  // Add stale file indicator if file doesn't exist
  if (fullPath && !fileExists) {
    accessories.unshift({
      icon: { source: Icon.Warning, tintColor: Color.Orange },
      tooltip: "File not found on disk",
    });
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
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {/* Primary action: Open file in editor */}
            {fullPath && fileExists && (
              <Action.Open icon={Icon.Document} target={fullPath} title="Open in Editor" />
            )}
            {/* Show in Finder */}
            {fullPath && fileExists && <Action.ShowInFinder path={fullPath} />}
          </ActionPanel.Section>
          <ActionPanel.Section title="Copy">
            {/* Copy Path - Cmd+C */}
            {fullPath && (
              <Action.CopyToClipboard
                content={fullPath}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
                title="Copy Path"
              />
            )}
            {/* Copy Content - Cmd+Shift+C */}
            <Action
              icon={Icon.Clipboard}
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
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              title="Copy Content"
            />
            {/* Copy DocID - Cmd+Option+C */}
            <Action.CopyToClipboard
              content={result.docid}
              shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
              title="Copy DocID"
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Search Mode">
            <Action
              icon={searchMode === "search" ? Icon.Checkmark : Icon.MagnifyingGlass}
              onAction={() => onSwitchMode("search")}
              shortcut={{ modifiers: ["cmd"], key: "1" }}
              title="Keyword Search"
            />
            <Action
              icon={searchMode === "vsearch" ? Icon.Checkmark : Icon.MagnifyingGlass}
              onAction={() => onSwitchMode("vsearch")}
              shortcut={{ modifiers: ["cmd"], key: "2" }}
              title="Semantic Search"
            />
            <Action
              icon={searchMode === "query" ? Icon.Checkmark : Icon.MagnifyingGlass}
              onAction={() => onSwitchMode("query")}
              shortcut={{ modifiers: ["cmd"], key: "3" }}
              title="Hybrid Search"
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Options">
            <Action
              icon={showFullDocument ? Icon.CheckCircle : Icon.Circle}
              onAction={onToggleFullDocument}
              shortcut={{ modifiers: ["cmd"], key: "f" }}
              title={showFullDocument ? "Hide Full Document" : "Show Full Document"}
            />
            <Action
              icon={showLineNumbers ? Icon.CheckCircle : Icon.Circle}
              onAction={onToggleLineNumbers}
              shortcut={{ modifiers: ["cmd"], key: "l" }}
              title={showLineNumbers ? "Hide Line Numbers" : "Show Line Numbers"}
            />
            <Action
              icon={showAllResults ? Icon.CheckCircle : Icon.Circle}
              onAction={onToggleAllResults}
              shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
              title={showAllResults ? "Limit Results" : "Show All Results"}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="View">
            {onToggleDetail && (
              <Action
                icon={showDetail ? Icon.EyeDisabled : Icon.Eye}
                onAction={onToggleDetail}
                shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                title={showDetail ? "Hide Detail" : "Show Detail"}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
      detail={<List.Item.Detail markdown={detailMarkdown} />}
      icon={fileExists ? Icon.Document : { source: Icon.Document, tintColor: Color.SecondaryText }}
      title={result.title || displayPath}
    />
  );
}
