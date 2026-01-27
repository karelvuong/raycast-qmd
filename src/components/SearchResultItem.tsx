import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { QmdSearchResult, QmdGetResult } from "../types";
import { getScoreColor, formatScorePercentage, runQmd } from "../utils/qmd";

interface SearchResultItemProps {
  result: QmdSearchResult;
  showDetail?: boolean;
  onToggleDetail?: () => void;
}

export function SearchResultItem({ result, showDetail, onToggleDetail }: SearchResultItemProps) {
  // Display path - use relative path or extract from file URL
  const displayPath = result.path || result.file || "Unknown";

  const scoreColor = getScoreColor(result.score);
  const scorePercentage = formatScorePercentage(result.score);

  // Map score color to Raycast Color
  const tagColor = scoreColor === "green" ? Color.Green : scoreColor === "yellow" ? Color.Yellow : Color.Red;

  const accessories: List.Item.Accessory[] = [
    { tag: { value: scorePercentage, color: tagColor } },
  ];

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
      icon={Icon.Document}
      detail={<List.Item.Detail markdown={detailMarkdown} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Copy">
            <Action
              title="Copy Content"
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
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
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
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
