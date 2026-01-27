import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useDependencyCheck } from "./hooks/useDependencyCheck";
import { logger } from "./utils/logger";
import { type ParsedStatus, parseStatus } from "./utils/parsers";
import { getQmdDatabasePath, runQmdRaw } from "./utils/qmd";

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
    statusLogger.info("Status parsed", {
      collections: parsed?.collections.length,
    });
    return { status: parsed };
  }

  statusLogger.error("Failed to fetch status", {
    error: result.error,
    stderr: result.stderr,
  });

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
          description={`Please install: ${[
            !depStatus?.bunInstalled && "Bun",
            !depStatus?.qmdInstalled && "QMD",
            !depStatus?.sqliteInstalled && "SQLite",
          ]
            .filter(Boolean)
            .join(", ")}`}
          icon={Icon.Warning}
          title="Dependencies Required"
        />
      </List>
    );
  }

  if (!(status || isLoading)) {
    // Detect specific error types for better messaging
    const isDatabaseLocked =
      error?.includes("SQLITE_BUSY") || error?.includes("database is locked");
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
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Retry" />
              {error && <Action.CopyToClipboard content={error} title="Copy Error Details" />}
            </ActionPanel>
          }
          description={description}
          icon={isDatabaseLocked ? Icon.Clock : Icon.XMarkCircle}
          title={title}
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
          accessories={[{ text: healthText }]}
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Refresh" />
            </ActionPanel>
          }
          icon={healthIcon}
          title="Status"
        />
        <List.Item
          accessories={[{ text: status?.databaseSize }]}
          actions={
            <ActionPanel>
              <Action.ShowInFinder path={getQmdDatabasePath()} title="Show in Finder" />
              <Action.CopyToClipboard content={getQmdDatabasePath()} title="Copy Path" />
              <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Refresh" />
            </ActionPanel>
          }
          icon={Icon.HardDrive}
          subtitle={status?.databasePath}
          title="Database"
        />
        {status?.lastUpdated && (
          <List.Item
            accessories={[{ text: status.lastUpdated }]}
            icon={Icon.Clock}
            title="Last Updated"
          />
        )}
      </List.Section>

      {/* Documents */}
      <List.Section title="Documents">
        <List.Item
          accessories={[{ text: `${status?.totalDocuments ?? 0}` }]}
          icon={Icon.Document}
          title="Total Files"
        />
        <List.Item
          accessories={[
            {
              text: `${status?.embeddedDocuments ?? 0}`,
              icon:
                status?.pendingEmbeddings === 0
                  ? { source: Icon.CheckCircle, tintColor: Color.Green }
                  : undefined,
            },
          ]}
          icon={Icon.Stars}
          title="Embedded"
        />
        {(status?.pendingEmbeddings ?? 0) > 0 && (
          <List.Item
            accessories={[{ text: `${status?.pendingEmbeddings}` }]}
            icon={{ source: Icon.Clock, tintColor: Color.Yellow }}
            title="Pending Embeddings"
          />
        )}
      </List.Section>

      {/* Collections */}
      <List.Section title={`Collections (${status?.collections.length ?? 0})`}>
        {status?.collections.map((collection) => (
          <List.Item
            accessories={[
              { text: `${collection.documentCount} files` },
              collection.lastUpdated ? { text: collection.lastUpdated, icon: Icon.Clock } : {},
              collection.contexts.length > 0
                ? {
                    text: `${collection.contexts.length} contexts`,
                    icon: Icon.Text,
                  }
                : {},
            ].filter((a) => Object.keys(a).length > 0)}
            actions={
              <ActionPanel>
                <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Refresh" />
              </ActionPanel>
            }
            icon={Icon.Folder}
            key={collection.name}
            subtitle={collection.pattern}
            title={collection.name}
          />
        ))}
      </List.Section>
    </List>
  );
}
