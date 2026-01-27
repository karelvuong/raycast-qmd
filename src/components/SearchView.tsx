import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDependencyCheck } from "../hooks/useDependencyCheck";
import { useIndexingState } from "../hooks/useIndexingState";
import { useSearchHistory } from "../hooks/useSearchHistory";
import type { ExtensionPreferences, QmdCollection, QmdSearchResult, SearchMode } from "../types";
import { searchLogger } from "../utils/logger";
import { getCollectionPaths, getCollections, runQmd, validateCollectionPath } from "../utils/qmd";
import { SearchResultItem } from "./SearchResultItem";

// Check if search mode requires explicit trigger (expensive AI operations)
const isExpensiveSearch = (mode: SearchMode) => mode === "vsearch" || mode === "query";

/**
 * Parse qmd:// URL to extract collection and path
 * Format: qmd://collection-name/relative/path/to/file.md
 */
function parseQmdUrl(file: string): { collection: string; path: string } | null {
  if (!file?.startsWith("qmd://")) {
    return null;
  }
  const withoutProtocol = file.slice(6); // Remove "qmd://"
  const firstSlash = withoutProtocol.indexOf("/");
  if (firstSlash === -1) {
    return null;
  }
  return {
    collection: withoutProtocol.slice(0, firstSlash),
    path: withoutProtocol.slice(firstSlash + 1),
  };
}

interface SearchViewProps {
  searchMode: SearchMode;
}

// Search mode metadata for dropdown and display
const SEARCH_MODES: {
  value: SearchMode;
  title: string;
  description: string;
}[] = [
  { value: "search", title: "Keyword", description: "Fastest" },
  { value: "vsearch", title: "Semantic", description: "AI-powered" },
  { value: "query", title: "Hybrid", description: "Best Quality" },
];

export function SearchView({ searchMode: initialSearchMode }: SearchViewProps) {
  // Debug logging
  searchLogger.info("SearchView mounted", { initialSearchMode });

  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const { history, addToHistory, clearHistory } = useSearchHistory();
  const { isIndexing } = useIndexingState();

  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<QmdSearchResult[]>([]);
  const [collections, setCollections] = useState<QmdCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [showDetail, setShowDetail] = useCachedState("showSearchDetail", true);
  const [pendingSearch, setPendingSearch] = useState(false); // For expensive search modes
  const [isDebouncing, setIsDebouncing] = useState(false); // Track debounce period for keyword search

  // Search mode as state (allows in-session switching)
  const [searchMode, setSearchMode] = useState<SearchMode>(initialSearchMode);

  // Debug: log actual state value
  useEffect(() => {
    searchLogger.info("searchMode state", { searchMode, initialSearchMode });
  }, [searchMode, initialSearchMode]);

  // Search options (persisted via cached state)
  const [showFullDocument, setShowFullDocument] = useCachedState("searchShowFull", false);
  const [showLineNumbers, setShowLineNumbers] = useCachedState("searchShowLineNumbers", false);
  const [showAllResults, setShowAllResults] = useCachedState("searchShowAll", false);

  // Track search request to ignore stale results
  const searchRequestId = useRef(0);

  // Extract preference values once to avoid re-creating on every render
  const { defaultResultCount, defaultMinScore } = getPreferenceValues<ExtensionPreferences>();

  // Load collections on mount
  useEffect(() => {
    if (!isReady) {
      return;
    }

    const loadCollections = async () => {
      searchLogger.info("Loading collections");
      setCollectionsLoading(true);

      // Get collection paths from qmd config file
      const paths = getCollectionPaths();

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
      if (!(query.trim() && isReady)) {
        setResults([]);
        setPendingSearch(false);
        return;
      }

      // Increment request ID to invalidate any in-flight requests
      const currentRequestId = ++searchRequestId.current;

      searchLogger.info("Performing search", {
        mode: searchMode,
        query,
        collection: selectedCollection,
        requestId: currentRequestId,
      });
      setIsSearching(true);
      setIsDebouncing(false);
      setPendingSearch(false);

      const args = [searchMode, query, "-n", defaultResultCount || "10"];

      // Add collection filter if selected
      if (selectedCollection && selectedCollection !== "all") {
        args.push("-c", selectedCollection);
      }

      // Add min score if set
      if (defaultMinScore && Number.parseFloat(defaultMinScore) > 0) {
        args.push("--min-score", defaultMinScore);
      }

      // Add search option flags
      if (showFullDocument) {
        args.push("--full");
      }
      if (showLineNumbers) {
        args.push("--line-numbers");
      }
      if (showAllResults) {
        args.push("--all");
      }

      const result = await runQmd<QmdSearchResult[]>(args);

      // Ignore stale results - only process if this is still the latest request
      if (currentRequestId !== searchRequestId.current) {
        searchLogger.info("Ignoring stale search result", {
          requestId: currentRequestId,
          latestId: searchRequestId.current,
        });
        return;
      }

      if (result.success && result.data) {
        searchLogger.info("Search complete", { results: result.data.length });
        // Get collection paths for computing full file paths
        const collectionPaths = getCollectionPaths();

        // Parse qmd:// URLs to extract collection and path, compute full filesystem path
        const enrichedResults = result.data.map((r) => {
          const parsed = parseQmdUrl(r.file);
          const collectionBasePath = parsed?.collection
            ? collectionPaths[parsed.collection]
            : undefined;
          const fullPath =
            collectionBasePath && parsed?.path ? `${collectionBasePath}/${parsed.path}` : undefined;

          return {
            ...r,
            collection: parsed?.collection,
            path: parsed?.path,
            fullPath,
          };
        });
        setResults(enrichedResults);
        // Add to history
        await addToHistory(query, searchMode);
      } else {
        searchLogger.warn("Search returned no results or failed", {
          error: result.error,
        });
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
      showFullDocument,
      showLineNumbers,
      showAllResults,
      addToHistory,
    ]
  );

  // Handle search text change
  const onSearchTextChange = (text: string) => {
    setSearchText(text);
    // For expensive searches, mark as pending (user must press Enter)
    if (isExpensiveSearch(searchMode)) {
      if (text.trim()) {
        setPendingSearch(true);
        setResults([]); // Clear previous results
      } else {
        // Don't allow empty searches for expensive modes
        setPendingSearch(false);
        setResults([]);
      }
      setIsDebouncing(false);
    } else if (text.trim()) {
      // For keyword search, mark as debouncing while waiting
      setIsDebouncing(true);
    } else {
      setIsDebouncing(false);
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
    const modeInfo = SEARCH_MODES.find((m) => m.value === searchMode);
    const modeLabel = modeInfo ? `${modeInfo.title}` : getSearchModeTitle();
    if (isExpensiveSearch(searchMode)) {
      return `${modeLabel} Search via QMD...`;
    }
    return `${modeLabel} Search...`;
  };

  // Handle mode switch
  const switchToMode = useCallback(
    (mode: SearchMode) => {
      if (mode !== searchMode) {
        setSearchMode(mode);
        setResults([]); // Clear results when switching modes
        if (searchText.trim()) {
          if (isExpensiveSearch(mode)) {
            setPendingSearch(true);
          } else {
            // Trigger immediate search for keyword mode
            setIsDebouncing(true);
          }
        }
      }
    },
    [searchMode, searchText]
  );

  // Handle dropdown change (mode or collection)
  const handleDropdownChange = useCallback(
    (value: string) => {
      if (value.startsWith("mode:")) {
        const mode = value.replace("mode:", "") as SearchMode;
        switchToMode(mode);
      } else {
        setSelectedCollection(value);
      }
    },
    [switchToMode]
  );

  // Get empty state content based on search mode
  const getEmptyStateContent = () => {
    switch (searchMode) {
      case "search":
        return {
          title: "No Matches Found",
          description:
            "No exact keyword matches. Try Semantic Search (⌘2) for meaning-based results.",
        };
      case "vsearch":
        return {
          title: "No Semantic Matches",
          description:
            "Try different phrasing or Hybrid Search (⌘3) which combines keywords with semantic matching.",
        };
      case "query":
        return {
          title: "No Results Found",
          description:
            "No matches found with hybrid search. Check your collections or try broader terms.",
        };
    }
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
          description="Please install the required dependencies to use QMD"
          icon={Icon.Warning}
          title="Dependencies Required"
        />
      </List>
    );
  }

  const isLoading = isSearching || collectionsLoading || isDebouncing;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={results.length > 0 && showDetail}
      onSearchTextChange={onSearchTextChange}
      searchBarAccessory={
        <List.Dropdown value={`mode:${searchMode}`} onChange={handleDropdownChange} tooltip="Search mode & collection">
          <List.Dropdown.Section title="Search Mode">
            {SEARCH_MODES.map((mode) => (
              <List.Dropdown.Item
                icon={searchMode === mode.value ? Icon.Checkmark : Icon.MagnifyingGlass}
                key={mode.value}
                title={`${mode.title} (${mode.description})`}
                value={`mode:${mode.value}`}
              />
            ))}
          </List.Dropdown.Section>
          <List.Dropdown.Section title="Collection">
            <List.Dropdown.Item
              icon={selectedCollection === "all" ? Icon.Checkmark : Icon.Folder}
              title="All Collections"
              value="all"
            />
            {collections.map((col) => (
              <List.Dropdown.Item
                icon={
                  selectedCollection === col.name
                    ? Icon.Checkmark
                    : col.exists
                      ? Icon.Folder
                      : Icon.Warning
                }
                key={col.name}
                title={col.name}
                value={col.name}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
      searchBarPlaceholder={getPlaceholder()}
      searchText={searchText}
    >
      {/* Indexing warning banner */}
      {isIndexing && (
        <List.Section title="⚠️ Embedding in Progress">
          <List.Item
            icon={{ source: Icon.Clock, tintColor: Color.Yellow }}
            subtitle="Search results may be incomplete until finished"
            title="Embeddings are being generated"
          />
        </List.Section>
      )}

      {/* Pending search prompt for expensive search modes */}
      {pendingSearch && !isSearching && (
        <List.Section title="Ready to Search">
          <List.Item
            actions={
              <ActionPanel>
                <Action icon={Icon.MagnifyingGlass} onAction={triggerSearch} title="Run Search" />
              </ActionPanel>
            }
            icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Blue }}
            subtitle="Press Enter to run search"
            title={`Search for "${searchText}"`}
          />
        </List.Section>
      )}

      {/* Debouncing state - show while waiting for user to stop typing (keyword search only) */}
      {searchText.trim() && isDebouncing && !isSearching && results.length === 0 && (
        <List.Section>
          <List.Item
            icon={{
              source: Icon.MagnifyingGlass,
              tintColor: Color.SecondaryText,
            }}
            subtitle="Waiting for you to finish typing"
            title="Searching..."
          />
        </List.Section>
      )}

      {/* Searching state - show while actively searching */}
      {searchText.trim() && isSearching && results.length === 0 && (
        <List.Section>
          <List.Item
            icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Blue }}
            subtitle={
              searchMode === "search"
                ? "Finding keyword matches"
                : searchMode === "vsearch"
                  ? "Running semantic analysis"
                  : "Running hybrid search"
            }
            title="Searching..."
          />
        </List.Section>
      )}

      {/* Search results */}
      {searchText.trim() && results.length > 0 && (
        <List.Section title={`Results (${results.length})`}>
          {results.map((result, index) => (
            <SearchResultItem
              key={`${result.collection || "unknown"}-${result.docid}-${index}`}
              onSwitchMode={switchToMode}
              onToggleAllResults={() => setShowAllResults(!showAllResults)}
              onToggleDetail={() => setShowDetail(!showDetail)}
              onToggleFullDocument={() => setShowFullDocument(!showFullDocument)}
              onToggleLineNumbers={() => setShowLineNumbers(!showLineNumbers)}
              result={result}
              searchMode={searchMode}
              showAllResults={showAllResults}
              showDetail={showDetail}
              showFullDocument={showFullDocument}
              showLineNumbers={showLineNumbers}
            />
          ))}
        </List.Section>
      )}

      {/* Empty state with query - no results (only show after search completes with no results) */}
      {searchText.trim() &&
        results.length === 0 &&
        !isSearching &&
        !isDebouncing &&
        !pendingSearch &&
        !collectionsLoading && (
          <List.EmptyView
            description={getEmptyStateContent().description}
            icon={Icon.MagnifyingGlass}
            title={getEmptyStateContent().title}
          />
        )}

      {/* Empty state without query - show recent searches */}
      {!searchText.trim() && (
        <>
          {history.length > 0 && (
            <List.Section title="Recent Searches">
              {history.map((item) => (
                <List.Item
                  accessories={[{ text: new Date(item.timestamp).toLocaleDateString() }]}
                  actions={
                    <ActionPanel>
                      <Action
                        icon={Icon.MagnifyingGlass}
                        onAction={() => {
                          setSearchText(item.query);
                          performSearch(item.query);
                        }}
                        title="Search Again"
                      />
                      <Action
                        icon={Icon.Trash}
                        onAction={clearHistory}
                        shortcut={{
                          modifiers: ["cmd", "shift"],
                          key: "backspace",
                        }}
                        style={Action.Style.Destructive}
                        title="Clear History"
                      />
                    </ActionPanel>
                  }
                  icon={Icon.Clock}
                  key={`${item.query}-${item.timestamp}`}
                  subtitle={item.mode}
                  title={item.query}
                />
              ))}
            </List.Section>
          )}

          {collections.length === 0 && !collectionsLoading && (
            <List.EmptyView
              description="Add a collection to start searching your markdown files"
              icon={Icon.Folder}
              title="No Collections"
            />
          )}

          {collections.length > 0 && history.length === 0 && (
            <List.EmptyView
              description={
                searchMode === "search"
                  ? `Fast keyword matching across ${collections.length} collection${collections.length === 1 ? "" : "s"}`
                  : searchMode === "vsearch"
                    ? `AI-powered meaning-based search across ${collections.length} collection${collections.length === 1 ? "" : "s"}`
                    : `Combined keyword + semantic search across ${collections.length} collection${collections.length === 1 ? "" : "s"}`
              }
              icon={Icon.MagnifyingGlass}
              title={getSearchModeTitle()}
            />
          )}
        </>
      )}
    </List>
  );
}
