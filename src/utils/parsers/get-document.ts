import { QmdGetResult } from "../../types";

/**
 * Parse the output of `qmd get <path> --full`
 *
 * The output format is just the plain text content of the document.
 * We need to extract metadata from the path and create a structured result.
 */
export function parseGetDocument(output: string, queryPath: string): QmdGetResult {
  // Extract collection name from qmd:// path if present
  let collection = "";
  let path = queryPath;

  if (queryPath.startsWith("qmd://")) {
    const pathParts = queryPath.slice(6).split("/");
    collection = pathParts[0] || "";
    path = queryPath;
  }

  // Extract filename for title
  const pathSegments = queryPath.split("/");
  const filename = pathSegments[pathSegments.length - 1] || queryPath;
  const title = filename.replace(/\.md$/, "");

  // The output is just the document content
  const content = output.trim();

  return {
    path,
    docid: "", // qmd get doesn't return docid in plain text mode
    content,
    title,
    collection,
  };
}
