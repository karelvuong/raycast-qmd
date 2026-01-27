import { getPreferenceValues } from "@raycast/api";
import { SearchView } from "./components/SearchView";
import type { ExtensionPreferences } from "./types";

export default function Command() {
  const { defaultSearchMode } = getPreferenceValues<ExtensionPreferences>();
  return <SearchView searchMode={defaultSearchMode} />;
}
