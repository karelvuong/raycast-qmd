import { useEffect, useState, useCallback, useRef } from "react";
import { List, showToast, Toast, Icon, getPreferenceValues, Color, Action, ActionPanel } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { SearchMode, QmdSearchResult, QmdCollection, ExtensionPreferences } from "../types";
import { runQmd, getCollections, validateCollectionPath, getCollectionPaths } from "../utils/qmd";
import { useDependencyCheck } from "../hooks/useDependencyCheck";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { useIndexingState } from "../hooks/useIndexingState";
import { SearchResultItem } from "./SearchResultItem";
import { searchLogger } from "../utils/logger";

// Check if search mode requires explicit trigger (expensive AI operations)
const isExpensiveSearch = (mode: SearchMode) => mode === "vsearch" || mode === "query";

/**
 * Parse qmd:// URL to extract collection and path
 * Format: qmd://collection-name/relative/path/to/file.md
 */
function parseQmdUrl(file: string): { collection: string; path: string } | null {
  if (!file?.startsWith("qmd://")) return null;
  const withoutProtocol = file.slice(6); // Remove "qmd://"
  const firstSlash = withoutProtocol.indexOf("/");
  if (firstSlash === -1) return null;
  return {
    collection: withoutProtocol.slice(0, firstSlash),
    path: withoutProtocol.slice(firstSlash + 1),
  };
}

interface SearchViewProps {
  searchMode: SearchMode;
}

export function SearchView({ searchMode }: SearchViewProps) {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const { history, addToHistory, clearHistory } = useSearchHistory();
  const { isIndexing } = useIndexingState();

  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<QmdSearchResult[]>([]);
  const [collections, setCollections] = useState<QmdCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionPaths, setCollectionPaths] = useState<Record<string, string>>({});
  const [showDetail, setShowDetail] = useCachedState("showSearchDetail", true);
  const [pendingSearch, setPendingSearch] = useState(false); // For expensive search modes

  // Track search request to ignore stale results
  const searchRequestId = useRef(0);

  // Extract preference values once to avoid re-creating on every render
  const { defaultResultCount, defaultMinScore } = getPreferenceValues<ExtensionPreferences>();

  // Load collections on mount
  useEffect(() => {
    if (!isReady) return;

    const loadCollections = async () => {
      searchLogger.info("Loading collections");
      setCollectionsLoading(true);

      // Get collection paths from qmd config file
      const paths = getCollectionPaths();
      console.log("[SearchView] Collection paths from config:", paths);
      setCollectionPaths(paths);

      const result = await getCollections();
      if (result.success && result.data) {
        // Validate paths using the config-based paths
        const validated = result.data.map((col) => ({
          ...col,
          path: paths[col.name] || col.path, // Use config path if available
          exists: paths[col.name] ? validateCollectionPath(paths[col.name]) : true,
        }));
        setCollections(validated);
        searchLogger.info("Collections loaded", { count: validated.length });
      }
      setCollectionsLoading(false);
    };

    loadCollections();
  }, [isReady]);

  // Perform search with request tracking to ignore stale results
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim() || !isReady) {
        setResults([]);
        setPendingSearch(false);
        return;
      }

      // Increment request ID to invalidate any in-flight requests
      const currentRequestId = ++searchRequestId.current;

      searchLogger.info("Performing search", { mode: searchMode, query, collection: selectedCollection, requestId: currentRequestId });
      setIsSearching(true);
      setPendingSearch(false);

      const args = [searchMode, query, "-n", defaultResultCount || "10"];

      // Add collection filter if selected
      if (selectedCollection && selectedCollection !== "all") {
        args.push("-c", selectedCollection);
      }

      // Add min score if set
      if (defaultMinScore && parseFloat(defaultMinScore) > 0) {
        args.push("--min-score", defaultMinScore);
      }

      const result = await runQmd<QmdSearchResult[]>(args);

      // Ignore stale results - only process if this is still the latest request
      if (currentRequestId !== searchRequestId.current) {
        searchLogger.info("Ignoring stale search result", { requestId: currentRequestId, latestId: searchRequestId.current });
        return;
      }

      if (result.success && result.data) {
        searchLogger.info("Search complete", { results: result.data.length });
        // Parse qmd:// URLs to extract collection and path
        const enrichedResults = result.data.map((r) => {
          const parsed = parseQmdUrl(r.file);
          return {
            ...r,
            collection: parsed?.collection,
            path: parsed?.path,
          };
        });
        setResults(enrichedResults);
        // Add to history
        await addToHistory(query, searchMode);
      } else {
        searchLogger.warn("Search returned no results or failed", { error: result.error });
        setResults([]);
        if (result.error && !result.error.includes("No results")) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Search failed",
            message: result.error,
          });
        }
      }

      setIsSearching(false);
    },
    [
      isReady,
      searchMode,
      selectedCollection,
      defaultResultCount,
      defaultMinScore,
      addToHistory,
    ],
  );

  // Handle search text change
  const onSearchTextChange = (text: string) => {
    setSearchText(text);
    // For expensive searches, mark as pending (user must press Enter)
    if (isExpensiveSearch(searchMode) && text.trim()) {
      setPendingSearch(true);
      setResults([]); // Clear previous results
    }
  };

  // Debounce search via useEffect - only for keyword search
  useEffect(() => {
    // Only auto-search for keyword search mode
    if (isExpensiveSearch(searchMode)) {
      return; // Don't auto-search for semantic/hybrid
    }

    if (!searchText.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(searchText);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchText, performSearch, searchMode]);

  // Trigger search manually (for expensive search modes)
  const triggerSearch = useCallback(() => {
    if (searchText.trim()) {
      performSearch(searchText);
    }
  }, [searchText, performSearch]);

  // Get search mode display name
  const getSearchModeTitle = () => {
    switch (searchMode) {
      case "search":
        return "Search";
      case "vsearch":
        return "Semantic Search";
      case "query":
        return "Hybrid Search";
    }
  };

  // Get search bar placeholder
  const getPlaceholder = () => {
    if (isExpensiveSearch(searchMode)) {
      return `${getSearchModeTitle()} (type and press Enter)...`;
    }
    return `${getSearchModeTitle()} markdown files...`;
  };

  // Show loading state while checking dependencies
  if (isDepsLoading) {
    return <List isLoading={true} searchBarPlaceholder="Checking dependencies..." />;
  }

  // Show error if dependencies not ready
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

  const isLoading = isSearching || collectionsLoading;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={getPlaceholder()}
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      isShowingDetail={results.length > 0 && showDetail}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by collection" value={selectedCollection} onChange={setSelectedCollection}>
          <List.Dropdown.Item title="All Collections" value="all" />
          <List.Dropdown.Section title="Collections">
            {collections.map((col) => (
              <List.Dropdown.Item
                key={col.name}
                title={col.name}
                value={col.name}
                icon={col.exists ? Icon.Folder : Icon.Warning}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {/* Indexing warning banner */}
      {isIndexing && (
        <List.Section title="⚠️ Embedding in Progress">
          <List.Item
            title="Embeddings are being generated"
            subtitle="Search results may be incomplete until finished"
            icon={{ source: Icon.Clock, tintColor: Color.Yellow }}
          />
        </List.Section>
      )}

      {/* Pending search prompt for expensive search modes */}
      {pendingSearch && !isSearching && (
        <List.Section title="Ready to Search">
          <List.Item
            title={`Search for "${searchText}"`}
            subtitle="Press Enter to run search"
            icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Blue }}
            actions={
              <ActionPanel>
                <Action
                  title="Run Search"
                  icon={Icon.MagnifyingGlass}
                  onAction={triggerSearch}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {/* Search results */}
      {searchText.trim() && results.length > 0 && (
        <List.Section title={`Results (${results.length})`}>
          {results.map((result, index) => (
            <SearchResultItem
              key={`${result.collection || "unknown"}-${result.docid}-${index}`}
              result={result}
              collectionPath={collectionPaths[result.collection]}
              showDetail={showDetail}
              onToggleDetail={() => setShowDetail(!showDetail)}
            />
          ))}
        </List.Section>
      )}

      {/* Empty state with query - no results (only show if not pending and not loading) */}
      {searchText.trim() && results.length === 0 && !isLoading && !pendingSearch && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No Results Found"
          description={`Try a different search term or check your collections. ${
            searchMode !== "vsearch" ? "You can also try Semantic Search for broader matches." : ""
          }`}
        />
      )}

      {/* Empty state without query - show recent searches */}
      {!searchText.trim() && (
        <>
          {history.length > 0 && (
            <List.Section title="Recent Searches">
              {history.map((item) => (
                <List.Item
                  key={`${item.query}-${item.timestamp}`}
                  title={item.query}
                  subtitle={item.mode}
                  icon={Icon.Clock}
                  accessories={[{ text: new Date(item.timestamp).toLocaleDateString() }]}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Search Again"
                        icon={Icon.MagnifyingGlass}
                        onAction={() => {
                          setSearchText(item.query);
                          performSearch(item.query);
                        }}
                      />
                      <Action
                        title="Clear History"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
                        onAction={clearHistory}
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}

          {collections.length === 0 && !collectionsLoading && (
            <List.EmptyView
              icon={Icon.Folder}
              title="No Collections"
              description="Add a collection to start searching your markdown files"
            />
          )}

          {collections.length > 0 && history.length === 0 && (
            <List.EmptyView
              icon={Icon.MagnifyingGlass}
              title={`${getSearchModeTitle()}`}
              description={`Type to search across ${collections.length} collection${collections.length === 1 ? "" : "s"}`}
            />
          )}
        </>
      )}
    </List>
  );
}
