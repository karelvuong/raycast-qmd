import { List, ActionPanel, Action, Icon, Color } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { runQmdRaw, getQmdDatabasePath } from "./utils/qmd";
import { useDependencyCheck } from "./hooks/useDependencyCheck";
import { parseStatus, ParsedStatus } from "./utils/parsers";
import { logger } from "./utils/logger";

const statusLogger = logger.child("[Status]");

interface StatusResult {
  status: ParsedStatus | null;
  error?: string;
}

async function fetchStatus(): Promise<StatusResult> {
  statusLogger.info("Fetching QMD status");
  const result = await runQmdRaw(["status"]);

  if (result.success && result.data) {
    const parsed = parseStatus(result.data);
    statusLogger.info("Status parsed", { collections: parsed?.collections.length });
    return { status: parsed };
  }

  statusLogger.error("Failed to fetch status", { error: result.error, stderr: result.stderr });

  // Extract more specific error information
  const errorMessage = result.stderr || result.error || "Unknown error";
  return { status: null, error: errorMessage };
}

export default function Command() {
  const { isLoading: isDepsLoading, isReady, status: depStatus } = useDependencyCheck();

  const {
    data: result,
    isLoading,
    revalidate,
  } = useCachedPromise(fetchStatus, [], {
    execute: isReady,
  });

  const status = result?.status;
  const error = result?.error;

  if (isDepsLoading) {
    return <List isLoading={true} searchBarPlaceholder="Checking dependencies..." />;
  }

  if (!isReady) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Dependencies Required"
          description={`Please install: ${[
            !depStatus?.bunInstalled && "Bun",
            !depStatus?.qmdInstalled && "QMD",
            !depStatus?.sqliteInstalled && "SQLite",
          ]
            .filter(Boolean)
            .join(", ")}`}
        />
      </List>
    );
  }

  if (!status && !isLoading) {
    // Detect specific error types for better messaging
    const isDatabaseLocked = error?.includes("SQLITE_BUSY") || error?.includes("database is locked");
    const isEmbedRunning = error?.includes("embed") || error?.includes("embedding");

    let title = "Unable to Load Status";
    let description = "Try running `qmd status` in your terminal to diagnose the issue.";

    if (isDatabaseLocked) {
      title = "Database Temporarily Locked";
      description = isEmbedRunning
        ? "The QMD database is currently locked, likely due to an active embedding process. Please wait a moment and retry."
        : "The QMD database is currently locked by another process. Please wait a moment and retry.";
    }

    return (
      <List>
        <List.EmptyView
          icon={isDatabaseLocked ? Icon.Clock : Icon.XMarkCircle}
          title={title}
          description={description}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={revalidate} />
              {error && <Action.CopyToClipboard title="Copy Error Details" content={error} />}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const healthIcon =
    status?.indexHealth === "healthy"
      ? { source: Icon.CheckCircle, tintColor: Color.Green }
      : { source: Icon.Warning, tintColor: Color.Yellow };

  const healthText =
    status?.indexHealth === "healthy"
      ? "Healthy"
      : status?.indexHealth === "needs-embedding"
        ? "Needs Embedding"
        : "Needs Update";

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search status...">
      {/* Index Overview */}
      <List.Section title="Index">
        <List.Item
          title="Status"
          icon={healthIcon}
          accessories={[{ text: healthText }]}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Database"
          icon={Icon.HardDrive}
          subtitle={status?.databasePath}
          accessories={[{ text: status?.databaseSize }]}
          actions={
            <ActionPanel>
              <Action.ShowInFinder path={getQmdDatabasePath()} title="Show in Finder" />
              <Action.CopyToClipboard title="Copy Path" content={getQmdDatabasePath()} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
        {status?.lastUpdated && (
          <List.Item
            title="Last Updated"
            icon={Icon.Clock}
            accessories={[{ text: status.lastUpdated }]}
          />
        )}
      </List.Section>

      {/* Documents */}
      <List.Section title="Documents">
        <List.Item
          title="Total Files"
          icon={Icon.Document}
          accessories={[{ text: `${status?.totalDocuments ?? 0}` }]}
        />
        <List.Item
          title="Embedded"
          icon={Icon.Stars}
          accessories={[
            {
              text: `${status?.embeddedDocuments ?? 0}`,
              icon:
                status?.pendingEmbeddings === 0
                  ? { source: Icon.CheckCircle, tintColor: Color.Green }
                  : undefined,
            },
          ]}
        />
        {(status?.pendingEmbeddings ?? 0) > 0 && (
          <List.Item
            title="Pending Embeddings"
            icon={{ source: Icon.Clock, tintColor: Color.Yellow }}
            accessories={[{ text: `${status?.pendingEmbeddings}` }]}
          />
        )}
      </List.Section>

      {/* Collections */}
      <List.Section title={`Collections (${status?.collections.length ?? 0})`}>
        {status?.collections.map((collection) => (
          <List.Item
            key={collection.name}
            title={collection.name}
            icon={Icon.Folder}
            subtitle={collection.pattern}
            accessories={[
              { text: `${collection.documentCount} files` },
              collection.lastUpdated ? { text: collection.lastUpdated, icon: Icon.Clock } : {},
              collection.contexts.length > 0
                ? { text: `${collection.contexts.length} contexts`, icon: Icon.Text }
                : {},
            ].filter((a) => Object.keys(a).length > 0)}
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
