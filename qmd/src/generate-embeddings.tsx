import { closeMainWindow, showToast, Toast } from "@raycast/api";
import { startBackgroundEmbed, isEmbedRunning, cancelActiveEmbed } from "./utils/qmd";

export default async function Command() {
  // Check if already running
  if (isEmbedRunning()) {
    await showToast({
      style: Toast.Style.Animated,
      title: "Embedding already in progress",
      message: "An embedding process is currently running",
      primaryAction: {
        title: "Cancel",
        onAction: async (toast) => {
          cancelActiveEmbed();
          toast.style = Toast.Style.Success;
          toast.title = "Embedding cancelled";
          toast.message = undefined;
        },
      },
    });
    return;
  }

  // Close the main window
  await closeMainWindow();

  // Show initial toast
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Generating embeddings...",
    message: "This may take a while for large collections",
    primaryAction: {
      title: "Cancel",
      onAction: async (t) => {
        cancelActiveEmbed();
        t.style = Toast.Style.Success;
        t.title = "Embedding cancelled";
        t.message = undefined;
      },
    },
  });

  // Start the background process
  startBackgroundEmbed(
    (message) => {
      // Update toast with progress
      toast.message = message;
    },
    async (success, error) => {
      if (success) {
        toast.style = Toast.Style.Success;
        toast.title = "Embeddings generated";
        toast.message = "Semantic search is ready";
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = "Embedding failed";
        toast.message = error || "Unknown error";
      }
    },
  );
}
