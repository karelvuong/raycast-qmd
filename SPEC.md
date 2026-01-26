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
| **Manage Contexts** | List, add, edit, remove context descriptions |

**Context Management:**
- List all contexts with their qmd:// paths and descriptions
- Add new context (path + description)
- Edit existing context descriptions
- Remove context

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
- Runs in background with toast progress updates
- Cancel button in persistent toast
- If already running: show status toast with cancel option

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
| 6 | Manage Contexts | view | List and manage context descriptions |
| 7 | Get Document | view | Retrieve by path or docid |
| 8 | Status | view | Index health dashboard |
| 9 | Generate Embeddings | no-view | Background embedding generation |
| 10 | Cleanup | no-view | Remove orphaned data |
| 11 | Reset QMD | no-view | Wipe database (double confirm) |
