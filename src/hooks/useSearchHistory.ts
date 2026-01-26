import { useEffect, useState } from "react";
import { LocalStorage } from "@raycast/api";
import { SearchHistoryItem, SearchMode } from "../types";

const HISTORY_KEY = "qmd-search-history";
const MAX_HISTORY_ITEMS = 10;

interface UseSearchHistoryResult {
  history: SearchHistoryItem[];
  isLoading: boolean;
  addToHistory: (query: string, mode: SearchMode) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export function useSearchHistory(): UseSearchHistoryResult {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await LocalStorage.getItem<string>(HISTORY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as SearchHistoryItem[];
          setHistory(parsed);
        }
      } catch (error) {
        console.error("Failed to load search history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);

  const addToHistory = async (query: string, mode: SearchMode) => {
    if (!query.trim()) return;

    const newItem: SearchHistoryItem = {
      query: query.trim(),
      mode,
      timestamp: Date.now(),
    };

    // Remove existing entry with same query and mode
    const filtered = history.filter((item) => !(item.query === newItem.query && item.mode === newItem.mode));

    // Add new item at the beginning
    const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);

    setHistory(newHistory);

    try {
      await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error("Failed to save search history:", error);
    }
  };

  const clearHistory = async () => {
    setHistory([]);
    try {
      await LocalStorage.removeItem(HISTORY_KEY);
    } catch (error) {
      console.error("Failed to clear search history:", error);
    }
  };

  return {
    history,
    isLoading,
    addToHistory,
    clearHistory,
  };
}
