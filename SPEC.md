# QMD Raycast Extension - Technical Specification

## Overview

A Raycast extension that provides convenient access to [QMD (Quick Markdown Search)](https://github.com/tobi/qmd) - an on-device search engine for markdown notes, meeting transcripts, documentation, and knowledge bases.

**Goals:**
- Open source and published to Raycast Store
- Cross-platform: macOS + Windows
- Comprehensive QMD functionality exposed through native Raycast UI

---

## Commands

All commands are top-level Raycast commands (not nested submenus).

### Search Commands

| Command | QMD CLI | Description |
|---------|---------|-------------|
| **Search** | `qmd search` | Fast BM25 keyword search |
| **VSearch** | `qmd vsearch` | Vector semantic similarity search |
| **Query** | `qmd query` | Hybrid search with LLM reranking (best quality, uses more resources) |

**Shared Search UX:**
- Identical UI layout across all three commands
- Debounced live search (400ms delay after typing stops)
- Collection filter dropdown (dynamically loaded on each search)
- Min-score text input field (advanced, for power users)
- Recent searches dropdown (last 10) shown when search field is empty

**Search Results Display:**
- Title + snippet preview (primary view)
- Score displayed as percentage with color coding:
  - Green: >70%
  - Yellow: 40-70%
  - Red: <40%
- Snippet highlighting using Raycast's background highlight feature
- Quick Look preview showing rendered markdown
- Stale file indicator (warning icon) if file no longer exists on disk
- Warning banner displayed during active indexing operations

**Search Result Actions:**
- **Primary (Enter):** Open in default editor, jump to match line
- **Copy Path (Cmd+C):** Copy file path to clipboard
- **Copy Content (Cmd+Shift+C):** Copy full document content
- **Reveal in Finder:** Open containing folder
- **Copy DocID:** Copy the 6-character document hash

### Collection Commands

| Command | Description |
|---------|-------------|
| **Add Collection** | Create a new indexed collection |
| **Manage Collections** | List, edit, remove collections |

**Add Collection Form:**
- Name field (required)
- Path field with autocomplete (not file picker)
- Context description field (inline, optional)
- Glob mask field (advanced, collapsed by default)

**Manage Collections View:**
- List sorted alphabetically by name
- Startup validation: check paths exist, show warning icon for missing
- **Actions per collection:**
  - Rename
  - Remove
  - Add/Edit Context (links to Manage Contexts)
  - Re-embed collection
  - Open folder in Finder
  - List files in collection
  - Update (re-index) with "Pull from git first" toggle
    - Show git info (branch, uncommitted changes) only when this action is triggered

**Collection Removal Behavior:**
- Contexts are preserved (not auto-deleted) when collection removed

### Context Commands

| Command | Description |
|---------|-------------|
| **Add Context** | Add a new context description |
| **Manage Contexts** | List, edit, remove context descriptions |

**Add Context Form:**
- Path field (qmd://collection or qmd://collection/path/to/file.md)
- Description field

**Manage Contexts View:**
- List all contexts with their qmd:// paths and descriptions
- Edit existing context descriptions
- Remove context
- "Add Context" action always visible (Cmd+N)

### Utility Commands

| Command | QMD CLI | Description |
|---------|---------|-------------|
| **Get Document** | `qmd get` | Retrieve document by path or docid |
| **Status** | `qmd status` | Dashboard showing index health, collections, embeddings |
| **Generate Embeddings** | `qmd embed` | Generate/update embeddings for semantic search |
| **Cleanup** | `qmd cleanup` | Remove orphaned data and cache |
| **Reset QMD** | N/A | Wipe database and start fresh |

**Get Document:**
- Unified smart input that auto-detects:
  - File path (e.g., `notes/meeting.md`)
  - DocID (e.g., `#abc123`)
- Fuzzy matching: if path doesn't match exactly, show QMD's suggestions as selectable list

**Generate Embeddings:**
- Runs with animated toast during processing
- Shows success message with "up-to-date" or "generated" status
- Displays error details on failure

**Reset QMD:**
- Double confirmation: Alert dialog → Second "This cannot be undone" alert
- Deletes `~/.cache/qmd/index.sqlite`

---

## Dependency Management

### First-Run Checks

1. **Check Bun installed:** If missing, prompt with instructions to install Bun
2. **Check QMD installed:** If missing, offer to run `bun install -g https://github.com/tobi/qmd`
3. **Check SQLite (macOS):** If missing, offer one-click action to run `brew install sqlite`
4. **Windows:** Document Windows-specific SQLite setup in README

### Model Downloads

- Let QMD handle model downloads automatically (~3GB on first semantic search)
- No proactive model management in extension

---

## Data & State

### QMD Data
- Database location: `~/.cache/qmd/index.sqlite`
- All search, collection, and context data managed by QMD

### Extension Local State
- **Search history:** Last 10 searches, stored in Raycast LocalStorage
- **Preferences:** Stored via Raycast Preferences API

### Preferences

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Default Result Count | Dropdown | 10 | Number of results (5, 10, 20, 50) |
| Default Min Score | Text | 0 | Minimum relevance threshold |
| Default Search Mode | Dropdown | Query | Preferred search command |

---

## Technical Implementation

### CLI Interaction
- Always use `--json` flag for parseable output
- Parse JSON responses; handle errors gracefully

### Error Handling
- **View-blocking errors:** Inline error state with recovery suggestions
- **Background operation errors:** Toast with details and "Show Details" action
- **Empty search results:** Suggest alternatives (try different mode, check collections, re-embed)

### Cross-Platform
- macOS: Primary platform
- Windows: Full support, with platform-specific dependency documentation

---

## UI/UX Details

### Keyboard Shortcuts
Core actions only:
- Enter: Open file (primary action)
- Cmd+C: Copy path
- Cmd+Shift+C: Copy content

### Visual Design
- Consistent UI across all search commands
- Score percentages color-coded (green/yellow/red)
- Snippet text with background highlighting for matched terms
- Warning icons for stale/missing files
- Warning banner during indexing

### Onboarding
- No guided onboarding flow
- Comprehensive README documentation

---

## Publishing

### Raycast Store Requirements
- MIT License
- Comprehensive README with:
  - Installation prerequisites (Bun, SQLite)
  - Usage examples for each command
  - Screenshots of each major feature
- Extension icon (already exists: `extension-icon.png`)

### Categories
- Developer Tools
- Documentation
- Productivity

---

## Command Summary

| # | Command | Mode | Description |
|---|---------|------|-------------|
| 1 | Search | view | BM25 keyword search |
| 2 | VSearch | view | Semantic vector search |
| 3 | Query | view | Hybrid search with reranking |
| 4 | Add Collection | view | Create new collection |
| 5 | Manage Collections | view | List and manage collections |
| 6 | Add Context | view | Add context description |
| 7 | Manage Contexts | view | List and manage context descriptions |
| 8 | Get Document | view | Retrieve by path or docid |
| 9 | Status | view | Index health dashboard |
| 10 | Generate Embeddings | no-view | Background embedding generation |
| 11 | Cleanup | no-view | Remove orphaned data |
| 12 | Reset QMD | no-view | Wipe database (double confirm) |

---

## Implementation Status

### Completed

#### Phase 1: Foundation & Utilities

**Types** (`src/types.ts`)
- [x] `QmdSearchResult` - search result with path, docid, title, score, snippet, collection
- [x] `QmdCollection` - collection with name, path, mask, documentCount, embeddedCount
- [x] `QmdContext` - context with path and description
- [x] `QmdStatus` - status info (simplified to raw text due to CLI limitations)
- [x] `QmdFileListItem` - file with path, docid, title, embedded flag
- [x] `QmdGetResult` - get result with path, docid, content, title, collection, suggestions
- [x] `DependencyStatus` - bun/qmd/sqlite installation status
- [x] `SearchMode` - "search" | "vsearch" | "query"
- [x] `SearchHistoryItem` - query, mode, timestamp
- [x] `ExtensionPreferences` - defaultResultCount, defaultMinScore, defaultSearchMode
- [x] `ScoreColor` - "green" | "yellow" | "red"
- [x] `QmdResult<T>` - generic result wrapper with success, data, error, stderr

**Logger** (`src/utils/logger.ts`)
- [x] `logger` - Main logger instance with `[QMD]` prefix
- [x] `depsLogger` - Child logger for dependency operations `[Deps]`
- [x] `searchLogger` - Child logger for search operations `[Search]`
- [x] `collectionsLogger` - Child logger for collection operations `[Collections]`
- [x] `contextsLogger` - Child logger for context operations `[Contexts]`
- [x] `embedLogger` - Child logger for embedding operations `[Embed]`

**QMD CLI Utilities** (`src/utils/qmd.ts`)
- [x] `getEnvWithPath()` - extends PATH for Raycast sandbox
- [x] `getBunExecutable()` - locates bun at `~/.bun/bin/bun`
- [x] `getQmdScript()` - locates qmd at `~/.bun/bin/qmd`
- [x] `buildQmdShellCommand()` - builds shell command with PATH export
- [x] `checkBunInstalled()` - verifies Bun installation
- [x] `checkQmdInstalled()` - verifies QMD installation
- [x] `checkSqliteInstalled()` - verifies SQLite (macOS via Homebrew)
- [x] `checkAllDependencies()` - combined dependency check
- [x] `runQmd<T>()` - execute QMD with JSON parsing
- [x] `runQmdRaw()` - execute QMD without JSON parsing
- [x] `getCollections()` - fetch and parse collection list
- [x] `getContexts()` - fetch and parse context list
- [x] `getCollectionFiles()` - fetch and parse file list
- [x] `runEmbed()` - run embedding process (awaitable)
- [x] `isEmbedRunning()` - returns false (cannot detect cross-command state)
- [x] `getQmdDatabasePath()` - returns `~/.cache/qmd/index.sqlite`
- [x] `validateCollectionPath()` - check if directory exists
- [x] `expandPath()` - expand ~ to home directory
- [x] `getScoreColor()` - score to color mapping
- [x] `formatScorePercentage()` - score to percentage string
- [x] `getScoreRaycastColor()` - score to hex color
- [x] `installQmd()` - install QMD via bun
- [x] `installSqlite()` - install SQLite via Homebrew

**Text Parsers** (`src/utils/parsers/`)
- [x] `parseCollectionList()` - parses `qmd collection list` text output
- [x] `parseContextList()` - parses `qmd context list` text output
- [x] `parseFileList()` - parses `qmd ls` text output
- [x] `parseStatus()` - parses `qmd status` text output into structured data
- [x] `index.ts` - barrel export for all parsers

**Hooks**
- [x] `useDependencyCheck` (`src/hooks/useDependencyCheck.ts`)
  - Uses `useCachedPromise` for instant command loads (stale-while-revalidate)
  - Cached result persists between command runs
  - Shows prompts only once per session via `useRef`
  - Structured logging with `depsLogger`
  - Returns `{ isLoading, isReady, status, recheckDependencies }`
- [x] `useSearchHistory` (`src/hooks/useSearchHistory.ts`)
  - Manages last 10 searches in LocalStorage
  - `history`, `addToHistory()`, `clearHistory()`
- [x] `useIndexingState` (`src/hooks/useIndexingState.ts`)
  - Polls `isEmbedRunning()` every second (always returns false - cross-command state not detectable)
  - Returns `{ isIndexing }`

#### Phase 2: Search Commands

**Components**
- [x] `SearchView` (`src/components/SearchView.tsx`)
  - Shared search component accepting `searchMode` prop
  - 400ms debounced search
  - Collection filter dropdown
  - Recent searches when empty
  - Indexing warning banner
  - Empty state handling
- [x] `SearchResultItem` (`src/components/SearchResultItem.tsx`)
  - Score percentage with color coding
  - Detail panel with markdown preview
  - Actions: Open, Copy Path, Copy Content, Show in Finder, Copy DocID

**Commands**
- [x] `search.tsx` - BM25 keyword search
- [x] `vsearch.tsx` - Semantic vector search
- [x] `query.tsx` - Hybrid search with reranking

#### Phase 3: Collection Commands

- [x] `add-collection.tsx`
  - Name, path, context, glob mask fields
  - Path validation
  - Optional "Generate Embeddings" after creation
- [x] `manage-collections.tsx`
  - List all collections sorted alphabetically
  - Path validation with warning icons
  - Actions: List Files, Show in Finder, Rename, Re-Embed, Update Index, Pull & Update, Remove

#### Phase 4: Context Commands

- [x] `add-context.tsx`
  - Path and description form fields
  - Dependency check on load
  - Success navigates back to root
- [x] `manage-contexts.tsx`
  - List all contexts with paths and descriptions
  - Edit context (via remove + add since QMD has no edit command)
  - Remove context with confirmation
  - "Add Context" action always visible (Cmd+N) even when item selected
  - "Refresh" action (Cmd+R)

#### Phase 5: Utility Commands

- [x] `get-document.tsx`
  - Smart input detection (path vs #docid)
  - Fuzzy suggestions display
  - Document detail view with markdown
- [x] `status.tsx`
  - Displays raw QMD status output (JSON not supported)
  - Refresh action
- [x] `generate-embeddings.tsx`
  - Awaits `runEmbed()` directly with animated toast
  - Shows "up-to-date" or "generated" success message
  - Displays error details on failure
- [x] `cleanup.tsx`
  - Runs `qmd cleanup`
  - Success/failure toast
- [x] `reset.tsx`
  - Double confirmation alerts
  - Deletes database file

#### Phase 6: Package Configuration

- [x] All 12 commands registered in `package.json`
- [x] Preferences configured (defaultResultCount, defaultMinScore, defaultSearchMode)
- [x] Extension metadata (name, description, icon, author, license)

---

### Technical Discoveries & Deviations

#### QMD JSON Support Limitations

**Discovery:** QMD's `--json` flag only works for search commands, not for:
- `qmd status --json` → returns text
- `qmd collection list --json` → returns text
- `qmd context list --json` → returns text
- `qmd ls <collection> --json` → returns text

**Solution:** Created text parsers in `src/utils/parsers/` to parse the text output:
- `parseCollectionList()` - parses collection info from text
- `parseContextList()` - parses context info from text
- `parseFileList()` - parses file list from text

#### Raycast Sandbox PATH Issues

**Discovery:** Raycast doesn't inherit the user's shell PATH, so `bun` and `qmd` commands fail even when installed.

**Solution:**
1. `getEnvWithPath()` adds common paths: `~/.bun/bin`, `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`
2. `buildQmdShellCommand()` builds shell commands with explicit PATH export:
   ```bash
   export PATH="~/.bun/bin:$PATH" && qmd [args]
   ```

#### QMD Shell Script Execution

**Discovery:** QMD is a shell script with shebang `#!/usr/bin/env bun`, not a JavaScript file. Running `bun ~/.bun/bin/qmd` fails with syntax errors.

**Solution:** Use `exec()` with shell mode instead of `execFile()`. The shell interprets the shebang and runs the script correctly.

#### File List DocID Unavailable

**Discovery:** The `qmd ls` text output doesn't include document IDs.

**Solution:** Files use `path` as the unique key instead of `docid`. Removed "Copy DocID" action from file list view.

---

### Outstanding Work

#### High Priority

1. **Manual Testing**
   - [ ] Test all 12 commands end-to-end
   - [ ] Test dependency checks (Bun missing, QMD missing, SQLite missing)
   - [ ] Test search with various queries across all modes
   - [ ] Test collection add/rename/remove workflows
   - [ ] Test context add/edit/remove workflows
   - [ ] Test embedding generation (start, progress, cancel)
   - [ ] Test edge cases (empty collections, no results, stale files)

2. **Bug Fixes (if found during testing)**
   - [ ] Address any issues discovered during manual testing

3. **Status Command Enhancement** ✅
   - [x] Parse `qmd status` text output into structured display
   - [x] Show collections, document counts, embedding status in organized format
   - [x] Native List view with sections for Index, Documents, and Collections

#### Medium Priority

4. **Search Result Improvements** ✅
   - [x] Add Open in Editor as primary action (Enter)
   - [x] Add Copy Path action (Cmd+C)
   - [x] Add Copy Content action (Cmd+Shift+C)
   - [x] Add Reveal in Finder action
   - [x] Add Copy DocID action (Cmd+Option+C)
   - [x] Add stale file indicator (warning icon if file not found)
   - [ ] Verify snippet highlighting works correctly
   - [ ] Test Quick Look markdown preview
   - [ ] Verify "jump to line" in editor works

5. **Collection Path Display** ✅
   - [x] Fixed: Now reads paths from `~/.config/qmd/index.yml` config file
   - [x] Collections display full filesystem path in Manage Collections view

#### Low Priority

6. **Git Info for Pull & Update**
   - [ ] Spec mentions showing git branch and uncommitted changes
   - [ ] Currently just runs the command without git info display

7. **Windows Testing**
   - [ ] Test on Windows (if applicable)
   - [ ] Document Windows-specific SQLite setup

---

### Publishing Checklist

#### README Documentation ✅

- [x] Installation prerequisites
  - [x] Bun installation instructions
  - [x] SQLite installation (macOS: `brew install sqlite`)
  - [x] Windows-specific instructions
- [x] Quick start guide
- [x] Command reference for all 12 commands
- [x] Usage examples
- [x] Preferences documentation
- [x] Troubleshooting section
- [x] Credits (link to tobi/qmd)

#### Screenshots

- [ ] Search results with highlighted snippets
- [ ] Add Collection form
- [ ] Manage Collections list
- [ ] Status dashboard
- [ ] Context management

#### Store Submission

- [x] Verify MIT License file exists
- [x] Verify extension icon (`extension-icon.png`)
- [x] Run `ray build` for production build
- [ ] Submit to Raycast Store

---

### File Structure

```
src/
├── types.ts                    # TypeScript interfaces
├── utils/
│   ├── qmd.ts                  # QMD CLI utilities
│   ├── logger.ts               # Structured logging with child loggers
│   └── parsers/
│       ├── index.ts            # Barrel export
│       ├── collection.ts       # parseCollectionList()
│       ├── context.ts          # parseContextList()
│       ├── file-list.ts        # parseFileList()
│       └── status.ts           # parseStatus()
├── hooks/
│   ├── useDependencyCheck.ts   # Dependency validation
│   ├── useSearchHistory.ts     # Search history in LocalStorage
│   └── useIndexingState.ts     # Embedding process tracking
├── components/
│   ├── SearchView.tsx          # Shared search UI
│   └── SearchResultItem.tsx    # Individual search result
├── keyword-search.tsx          # BM25 keyword search command
├── vsearch.tsx                 # Semantic search command
├── query.tsx                   # Hybrid search command
├── add-collection.tsx          # Add collection form
├── manage-collections.tsx      # Collection management
├── add-context.tsx             # Add context form
├── manage-contexts.tsx         # Context management
├── get-document.tsx            # Document retrieval
├── status.tsx                  # Status dashboard
├── generate-embeddings.tsx     # Background embedding
├── cleanup.tsx                 # Cleanup command
└── reset.tsx                   # Reset command
```

---

### Next Steps

1. ~~**Immediate:** Add logging throughout the codebase~~ ✅
   - [x] Add `searchLogger` calls in SearchView.tsx
   - [x] Add `collectionsLogger` calls in manage-collections.tsx
   - [x] Add `contextsLogger` calls in manage-contexts.tsx
   - [x] Add `embedLogger` calls in generate-embeddings.tsx
2. ~~**Optional:** Add `useCachedState` for UI preferences~~ ✅
   - [x] `showSearchDetail` toggle with Cmd+Shift+D shortcut
3. **Next:** Manual testing of all commands
4. **Then:** Fix any bugs discovered
5. **Then:** Write comprehensive README
6. **Then:** Capture screenshots
7. **Finally:** Submit to Raycast Store
