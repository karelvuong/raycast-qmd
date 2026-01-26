// QMD Search Result from `qmd search/vsearch/query --json`
export interface QmdSearchResult {
  path: string; // Collection-relative path (e.g., "docs/guide.md")
  docid: string; // 6-character hash (e.g., "a1b2c3")
  title: string; // From first heading or filename
  score: number; // 0.0-1.0 relevance score
  snippet: string; // Context with highlighted terms
  collection: string; // Collection name
  context?: string; // Path context if configured
  line?: number; // Line number of match for jumping
  fullPath?: string; // Absolute filesystem path (computed by extension)
}

// QMD Collection from `qmd collection list --json`
export interface QmdCollection {
  name: string; // Collection identifier
  path: string; // Absolute directory path
  mask: string; // Glob pattern (default: "**/*.md")
  documentCount: number; // Number of indexed documents
  embeddedCount: number; // Number with embeddings
  exists?: boolean; // Path validation result (added by extension)
}

// QMD Context from `qmd context list --json`
export interface QmdContext {
  path: string; // qmd:// virtual path or filesystem path
  description: string; // User-provided description text
}

// QMD Status from `qmd status --json`
export interface QmdStatus {
  version: string; // QMD version string
  databasePath: string; // ~/.cache/qmd/index.sqlite
  collections: QmdCollectionStatus[]; // Array of collection info
  totalDocuments: number; // Total indexed documents
  embeddedDocuments: number; // Documents with embeddings
  pendingEmbeddings: number; // Documents needing embeddings
  indexHealth: "healthy" | "needs-embedding" | "needs-update";
  lastUpdated?: string; // ISO timestamp
}

export interface QmdCollectionStatus {
  name: string;
  path: string;
  documentCount: number;
  embeddedCount: number;
}

// QMD Get Result from `qmd get --json`
export interface QmdGetResult {
  path: string;
  docid: string;
  content: string;
  title: string;
  collection: string;
  suggestions?: string[]; // Array of fuzzy suggestions if no exact match
}

// QMD File List from `qmd ls --json`
export interface QmdFileListItem {
  path: string;
  docid: string;
  title: string;
  embedded: boolean;
}

// Extension Types
export type SearchMode = "search" | "vsearch" | "query";

export interface SearchHistoryItem {
  query: string;
  mode: SearchMode;
  timestamp: number;
}

export interface ExtensionPreferences {
  defaultResultCount: string; // "5" | "10" | "20" | "50"
  defaultMinScore: string; // Numeric string
  defaultSearchMode: SearchMode;
}

export type ScoreColor = "green" | "yellow" | "red";

// Dependency check result
export interface DependencyStatus {
  bunInstalled: boolean;
  qmdInstalled: boolean;
  sqliteInstalled: boolean;
  qmdVersion?: string;
  bunVersion?: string;
}

// QMD command execution result
export interface QmdResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  stderr?: string;
}

// Background process state
export interface EmbedProgress {
  collection?: string;
  current: number;
  total: number;
  message: string;
}
