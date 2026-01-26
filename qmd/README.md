# QMD - Quick Markdown Search for Raycast

Search your markdown files instantly with [QMD](https://github.com/tobi/qmd) - an on-device search engine for markdown notes, meeting transcripts, documentation, and knowledge bases.

## Features

- **Fast Keyword Search**: BM25-powered full-text search across all your markdown files
- **Semantic Search**: Vector similarity search using local embeddings (no data leaves your machine)
- **Hybrid Search**: Best-of-both-worlds combining keyword and semantic search with LLM reranking
- **Collection Management**: Organize your markdown files into named collections
- **Context Descriptions**: Add context to improve search relevance
- **Cross-Platform**: Works on macOS and Windows

## Prerequisites

### 1. Install Bun

QMD is built with Bun. Install it from [bun.sh](https://bun.sh):

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install QMD

```bash
bun install -g https://github.com/tobi/qmd
```

### 3. Install SQLite (macOS only)

If you don't have SQLite installed:

```bash
brew install sqlite
```

### Windows Users

On Windows, you may need to install SQLite separately. Download from [sqlite.org](https://www.sqlite.org/download.html) and add it to your PATH.

## Quick Start

1. **Add a Collection**: Use "Add Collection" to index a folder of markdown files
2. **Generate Embeddings**: Run "Generate Embeddings" to enable semantic search (downloads ~3GB model on first run)
3. **Search**: Use "Search", "Semantic Search", or "Hybrid Search" to find your documents

## Commands

| Command | Description |
|---------|-------------|
| **Search** | Fast BM25 keyword search |
| **Semantic Search** | Vector similarity search using embeddings |
| **Hybrid Search** | Best quality - combines keyword + semantic + LLM reranking |
| **Add Collection** | Create a new collection from a folder |
| **Manage Collections** | View, rename, update, and remove collections |
| **Manage Contexts** | Add descriptions to improve search relevance |
| **Get Document** | Retrieve a document by path or document ID |
| **Status** | View index health and statistics |
| **Generate Embeddings** | Generate embeddings for semantic search |
| **Cleanup** | Remove orphaned data from the index |
| **Reset QMD** | Delete all data (requires double confirmation) |

## Usage Examples

### Adding Your First Collection

1. Open Raycast and search for "Add Collection"
2. Enter a name (e.g., "notes")
3. Enter the path to your markdown folder (e.g., "~/Documents/notes")
4. Optionally add a context description to improve search relevance
5. Click "Add Collection"

### Searching Your Documents

1. Open Raycast and search for "Search" (or "Semantic Search" / "Hybrid Search")
2. Type your search query
3. Use the collection dropdown to filter by collection
4. Press Enter to open a result in your editor
5. Use Cmd+C to copy the file path

### Managing Collections

- **Rename**: Push to rename form
- **Re-embed**: Regenerate embeddings for a single collection
- **Update Index**: Re-scan files for changes
- **Pull & Update**: Git pull then update (for git-tracked collections)
- **Remove**: Delete collection from index (files are not deleted)

### Using Contexts

Contexts help QMD understand what your documents are about:

- **Collection-level context**: Use `qmd://collection-name` as the path
- **Document-level context**: Use the file path

Example: Adding context "Personal notes about programming, productivity, and learning" to `qmd://notes` helps semantic search understand the nature of your notes collection.

## Search Result Actions

| Action | Shortcut | Description |
|--------|----------|-------------|
| Open in Editor | Enter | Opens file at match line |
| Copy Path | Cmd+C | Copies absolute file path |
| Copy Content | Cmd+Shift+C | Copies full document content |
| Reveal in Finder | - | Opens containing folder |
| Copy DocID | Cmd+Option+C | Copies the 6-character document hash |

## Preferences

| Setting | Description | Default |
|---------|-------------|---------|
| Default Result Count | Number of results to show | 10 |
| Default Min Score | Minimum relevance threshold (0-1) | 0 |
| Default Search Mode | Preferred search command | Hybrid Search |

## Score Colors

Search results show relevance scores with color coding:

- **Green** (>70%): High relevance
- **Yellow** (40-70%): Medium relevance
- **Red** (<40%): Low relevance

## Troubleshooting

### "Bun not installed"

Install Bun from [bun.sh](https://bun.sh).

### "QMD not installed"

Run `bun install -g https://github.com/tobi/qmd` in your terminal.

### "SQLite not installed" (macOS)

Run `brew install sqlite` or install SQLite from your system package manager.

### Semantic search not working

Make sure you've run "Generate Embeddings" at least once. The first run downloads a ~3GB embedding model.

### Files not appearing in search

1. Check if the collection path exists in "Manage Collections"
2. Run "Update Index" for the collection
3. If using semantic search, run "Generate Embeddings"

### Index seems corrupted

Use "Reset QMD" to delete all data and start fresh. Then re-add your collections.

## Data Storage

- **Database**: `~/.cache/qmd/index.sqlite`
- **Search History**: Stored in Raycast LocalStorage (last 10 searches)

## Credits

This extension wraps [QMD](https://github.com/tobi/qmd) by Tobi Lutke. QMD is an open-source, on-device markdown search engine.

## License

MIT
