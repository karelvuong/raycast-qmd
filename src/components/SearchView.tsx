import { useEffect, useState, useCallback } from "react";
import { List, showToast, Toast, Icon, getPreferenceValues, Color, Action, ActionPanel } from "@raycast/api";
import { useDebouncedCallback } from "use-debounce";
import { SearchMode, QmdSearchResult, QmdCollection, ExtensionPreferences } from "../types";
import { runQmd, getCollections, validateCollectionPath } from "../utils/qmd";
import { useDependencyCheck } from "../hooks/useDependencyCheck";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { useIndexingState } from "../hooks/useIndexingState";
import { SearchResultItem } from "./SearchResultItem";

interface SearchViewProps {
  searchMode: SearchMode;
}

export function SearchView({ searchMode }: SearchViewProps) {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const { history, addToHistory } = useSearchHistory();
  const { isIndexing } = useIndexingState();

  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<QmdSearchResult[]>([]);
  const [collections, setCollections] = useState<QmdCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionPaths, setCollectionPaths] = useState<Record<string, string>>({});

  const preferences = getPreferenceValues<ExtensionPreferences>();

  // Load collections on mount
  useEffect(() => {
    if (!isReady) return;

    const loadCollections = async () => {
      setCollectionsLoading(true);
      const result = await getCollections();
      if (result.success && result.data) {
        // Validate paths and store mapping
        const validated = result.data.map((col) => ({
          ...col,
          exists: col.path ? validateCollectionPath(col.path) : true,
        }));
        setCollections(validated);

        // Create path mapping for full path resolution
        const paths: Record<string, string> = {};
        validated.forEach((col) => {
          if (col.path) {
            paths[col.name] = col.path;
          }
        });
        setCollectionPaths(paths);
      }
      setCollectionsLoading(false);
    };

    loadCollections();
  }, [isReady]);

  // Perform search
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim() || !isReady) {
        setResults([]);
        return;
      }

      setIsSearching(true);

      const args = [searchMode, query, "-n", preferences.defaultResultCount || "10"];

      // Add collection filter if selected
      if (selectedCollection && selectedCollection !== "all") {
        args.push("-c", selectedCollection);
      }

      // Add min score if set
      if (preferences.defaultMinScore && parseFloat(preferences.defaultMinScore) > 0) {
        args.push("--min-score", preferences.defaultMinScore);
      }

      const result = await runQmd<QmdSearchResult[]>(args);

      if (result.success && result.data) {
        setResults(result.data);
        // Add to history
        await addToHistory(query, searchMode);
      } else {
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
      preferences.defaultResultCount,
      preferences.defaultMinScore,
      addToHistory,
    ],
  );

  // Debounced search (400ms)
  const debouncedSearch = useDebouncedCallback((query: string) => {
    performSearch(query);
  }, 400);

  // Handle search text change
  const onSearchTextChange = (text: string) => {
    setSearchText(text);
    debouncedSearch(text);
  };

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
      searchBarPlaceholder={`${getSearchModeTitle()} markdown files...`}
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      throttle
      isShowingDetail={results.length > 0}
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

      {/* Search results */}
      {searchText.trim() && results.length > 0 && (
        <List.Section title={`Results (${results.length})`}>
          {results.map((result) => (
            <SearchResultItem
              key={`${result.collection}-${result.docid}`}
              result={result}
              collectionPath={collectionPaths[result.collection]}
            />
          ))}
        </List.Section>
      )}

      {/* Empty state with query - no results */}
      {searchText.trim() && results.length === 0 && !isLoading && (
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
