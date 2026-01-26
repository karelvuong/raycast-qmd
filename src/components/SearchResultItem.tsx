import { Action, ActionPanel, Color, Icon, List, showToast, Toast, open } from "@raycast/api";
import { existsSync } from "fs";
import { join } from "path";
import { QmdSearchResult, QmdGetResult } from "../types";
import { getScoreColor, formatScorePercentage, runQmd, expandPath } from "../utils/qmd";

interface SearchResultItemProps {
  result: QmdSearchResult;
  collectionPath?: string;
}

export function SearchResultItem({ result, collectionPath }: SearchResultItemProps) {
  // Compute full path if we have the collection path
  const fullPath = collectionPath ? join(expandPath(collectionPath), result.path) : result.fullPath;
  const fileExists = fullPath ? existsSync(fullPath) : true;

  const scoreColor = getScoreColor(result.score);
  const scorePercentage = formatScorePercentage(result.score);

  // Map score color to Raycast Color
  const tagColor = scoreColor === "green" ? Color.Green : scoreColor === "yellow" ? Color.Yellow : Color.Red;

  const accessories: List.Item.Accessory[] = [
    { tag: { value: scorePercentage, color: tagColor } },
    { tag: result.collection },
  ];

  if (!fileExists) {
    accessories.unshift({ icon: { source: Icon.Warning, tintColor: Color.Orange }, tooltip: "File not found" });
  }

  return (
    <List.Item
      title={result.title || result.path}
      subtitle={result.snippet}
      accessories={accessories}
      icon={fileExists ? Icon.Document : Icon.Warning}
      detail={
        <List.Item.Detail
          markdown={`# ${result.title || result.path}\n\n${result.snippet || ""}\n\n---\n\n**Collection:** ${result.collection}\n\n**DocID:** \`${result.docid}\`\n\n**Score:** ${scorePercentage}`}
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {fullPath && fileExists && (
              <Action
                title="Open in Editor"
                icon={Icon.AppWindow}
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
            {fullPath && fileExists && <Action.ShowInFinder path={fullPath} />}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy DocID"
              content={`#${result.docid}`}
              shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
