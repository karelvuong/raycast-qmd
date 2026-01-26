import { useState, useEffect } from "react";
import { Detail, ActionPanel, Action, Icon } from "@raycast/api";
import { runQmdRaw, getQmdDatabasePath } from "./utils/qmd";
import { useDependencyCheck } from "./hooks/useDependencyCheck";

export default function Command() {
  const { isLoading: isDepsLoading, isReady, status: depStatus } = useDependencyCheck();
  const [statusOutput, setStatusOutput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!isReady) return;

    setIsLoading(true);
    setError(null);

    // qmd status doesn't support --json, so we get raw text output
    const result = await runQmdRaw(["status"]);

    if (result.success && result.data) {
      setStatusOutput(result.data);
    } else {
      setError(result.error || "Failed to fetch status");
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, [isReady]);

  if (isDepsLoading || isLoading) {
    return <Detail isLoading={true} markdown="Loading QMD status..." />;
  }

  if (!isReady) {
    return (
      <Detail
        markdown={`# Dependencies Required

Please install the required dependencies to use QMD:

${!depStatus?.bunInstalled ? "- **Bun**: Visit [bun.sh](https://bun.sh) to install\n" : ""}
${!depStatus?.qmdInstalled ? "- **QMD**: Run \`bun install -g https://github.com/tobi/qmd\`\n" : ""}
${!depStatus?.sqliteInstalled ? "- **SQLite**: Run \`brew install sqlite\` (macOS)\n" : ""}
`}
      />
    );
  }

  if (error || !statusOutput) {
    return (
      <Detail
        markdown={`# Error Loading Status

${error || "Unknown error occurred"}

Try running \`qmd status\` in your terminal to diagnose the issue.`}
        actions={
          <ActionPanel>
            <Action title="Retry" icon={Icon.ArrowClockwise} onAction={loadStatus} />
          </ActionPanel>
        }
      />
    );
  }

  // Format the raw output as markdown
  const markdown = `# QMD Status

\`\`\`
${statusOutput}
\`\`\`
`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={loadStatus} />
          <Action.CopyToClipboard
            title="Copy Database Path"
            content={getQmdDatabasePath()}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.ShowInFinder path={getQmdDatabasePath()} title="Show Database in Finder" />
        </ActionPanel>
      }
    />
  );
}
