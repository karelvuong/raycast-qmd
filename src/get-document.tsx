import { useState } from "react";
import { List, ActionPanel, Action, Icon, Detail } from "@raycast/api";
import { QmdGetResult } from "./types";
import { runQmdRaw } from "./utils/qmd";
import { parseGetDocument } from "./utils/parsers";
import { useDependencyCheck } from "./hooks/useDependencyCheck";

export default function Command() {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const [searchText, setSearchText] = useState("");
  const [result, setResult] = useState<QmdGetResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = async (input: string) => {
    if (!input.trim()) {
      setResult(null);
      setSuggestions([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Auto-detect if it's a docid (starts with #) or path
    const query = input.trim();

    const getResult = await runQmdRaw(["get", query, "--full"]);

    if (getResult.success && getResult.data) {
      // Parse the plain text output using our parser
      const documentResult = parseGetDocument(getResult.data, query);
      setResult(documentResult);
      setSuggestions([]);
    } else {
      setResult(null);
      setSuggestions([]);
      setError(getResult.error || "Document not found");
    }

    setIsLoading(false);
  };

  const handleSelect = (suggestion: string) => {
    setSearchText(suggestion);
    fetchDocument(suggestion);
  };

  if (isDepsLoading) {
    return <List isLoading={true} searchBarPlaceholder="Checking dependencies..." />;
  }

  if (!isReady) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Dependencies Required"
          description="Please install the required dependencies to use QMD"
        />
      </List>
    );
  }

  // If we have a result, show the detail view
  if (result) {
    return (
      <Detail
        markdown={`# ${result.title || result.path}\n\n${result.content}`}
        navigationTitle={result.title || result.path}
        metadata={
          <Detail.Metadata>
            {result.path && <Detail.Metadata.Label title="Path" text={result.path} />}
            {result.docid && <Detail.Metadata.Label title="DocID" text={`#${result.docid}`} />}
            {result.collection && <Detail.Metadata.Label title="Collection" text={result.collection} />}
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Content" content={result.content} />
            {result.path && (
              <Action.CopyToClipboard
                title="Copy Path"
                content={result.path}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
            )}
            {result.docid && (
              <Action.CopyToClipboard
                title="Copy DocID"
                content={`#${result.docid}`}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
            )}
            <Action
              title="Back to Search"
              icon={Icon.ArrowLeft}
              onAction={() => {
                setResult(null);
                setSearchText("");
              }}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Enter path or #docid..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      actions={
        <ActionPanel>
          <Action title="Get Document" icon={Icon.Document} onAction={() => fetchDocument(searchText)} />
        </ActionPanel>
      }
    >
      {/* Show suggestions if we have them */}
      {suggestions.length > 0 && (
        <List.Section title="Did you mean?">
          {suggestions.map((suggestion, index) => (
            <List.Item
              key={index}
              title={suggestion}
              icon={Icon.Document}
              actions={
                <ActionPanel>
                  <Action title="Select" icon={Icon.Document} onAction={() => handleSelect(suggestion)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* Show error if we have one */}
      {error && !suggestions.length && searchText && (
        <List.EmptyView icon={Icon.Warning} title="Document Not Found" description={error} />
      )}

      {/* Initial state - show instructions */}
      {!searchText && !suggestions.length && (
        <List.EmptyView
          icon={Icon.Document}
          title="Get Document"
          description="Enter a file path or #docid to retrieve a document"
        />
      )}

      {/* Searching state */}
      {searchText && !suggestions.length && !error && !isLoading && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Press Enter to Search"
          description={`Search for: ${searchText}`}
          actions={
            <ActionPanel>
              <Action title="Get Document" icon={Icon.Document} onAction={() => fetchDocument(searchText)} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
