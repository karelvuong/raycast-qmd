import { useState, useEffect } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  confirmAlert,
  Alert,
  Form,
  useNavigation,
  Color,
} from "@raycast/api";
import { QmdCollection, QmdFileListItem } from "./types";
import { runQmd, runQmdRaw, validateCollectionPath, expandPath, startBackgroundEmbed } from "./utils/qmd";
import { useDependencyCheck } from "./hooks/useDependencyCheck";

export default function Command() {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const [collections, setCollections] = useState<QmdCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCollections = async () => {
    if (!isReady) return;

    setIsLoading(true);
    const result = await runQmd<QmdCollection[]>(["collection", "list"]);

    if (result.success && result.data) {
      // Validate paths and sort alphabetically
      const validated = result.data
        .map((col) => ({
          ...col,
          exists: validateCollectionPath(col.path),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCollections(validated);
    } else {
      setCollections([]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadCollections();
  }, [isReady]);

  if (isDepsLoading) {
    return <List isLoading={true} searchBarPlaceholder="Checking dependencies..." />;
  }

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

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search collections...">
      {collections.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.Folder}
          title="No Collections"
          description="Add a collection to start indexing your markdown files"
          actions={
            <ActionPanel>
              <Action.Push title="Add Collection" icon={Icon.Plus} target={<AddCollectionRedirect />} />
            </ActionPanel>
          }
        />
      )}

      {collections.map((collection) => (
        <CollectionItem key={collection.name} collection={collection} onRefresh={loadCollections} />
      ))}
    </List>
  );
}

function AddCollectionRedirect() {
  const { pop } = useNavigation();
  useEffect(() => {
    // This is a workaround - in real usage, user would use the Add Collection command directly
    pop();
  }, []);
  return <List isLoading={true} />;
}

interface CollectionItemProps {
  collection: QmdCollection;
  onRefresh: () => Promise<void>;
}

function CollectionItem({ collection, onRefresh }: CollectionItemProps) {
  const handleRename = async (newName: string) => {
    if (!newName.trim() || newName === collection.name) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Renaming collection...",
    });

    const result = await runQmdRaw(["collection", "rename", collection.name, newName.trim()]);

    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Collection renamed";
      await onRefresh();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Rename failed";
      toast.message = result.error;
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirmAlert({
      title: "Remove Collection?",
      message: `This will remove "${collection.name}" from the index. The files will not be deleted. Context descriptions will be preserved.`,
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Removing collection...",
    });

    const result = await runQmdRaw(["collection", "remove", collection.name]);

    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Collection removed";
      await onRefresh();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Remove failed";
      toast.message = result.error;
    }
  };

  const handleReembed = async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Generating embeddings...",
      message: collection.name,
    });

    startBackgroundEmbed(
      (message) => {
        toast.message = message;
      },
      (success, error) => {
        if (success) {
          toast.style = Toast.Style.Success;
          toast.title = "Embeddings generated";
          toast.message = collection.name;
        } else {
          toast.style = Toast.Style.Failure;
          toast.title = "Embedding failed";
          toast.message = error;
        }
        onRefresh();
      },
      collection.name,
    );
  };

  const handleUpdate = async (pullFirst: boolean) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: pullFirst ? "Pulling and updating..." : "Updating index...",
      message: collection.name,
    });

    const args = ["update", "-c", collection.name];
    if (pullFirst) {
      args.push("--pull");
    }

    const result = await runQmdRaw(args, { timeout: 60000 });

    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Index updated";
      toast.message = collection.name;
      await onRefresh();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Update failed";
      toast.message = result.error;
    }
  };

  const accessories: List.Item.Accessory[] = [
    { text: `${collection.documentCount} docs` },
    { text: collection.mask !== "**/*.md" ? collection.mask : undefined },
  ].filter((a) => a.text !== undefined);

  if (!collection.exists) {
    accessories.unshift({
      icon: { source: Icon.Warning, tintColor: Color.Orange },
      tooltip: "Path not found",
    });
  }

  return (
    <List.Item
      title={collection.name}
      subtitle={collection.path}
      icon={collection.exists ? Icon.Folder : { source: Icon.Warning, tintColor: Color.Orange }}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push title="List Files" icon={Icon.List} target={<CollectionFiles collection={collection} />} />
            {collection.exists && <Action.ShowInFinder path={expandPath(collection.path)} />}
          </ActionPanel.Section>

          <ActionPanel.Section title="Manage">
            <Action.Push
              title="Rename"
              icon={Icon.Pencil}
              target={<RenameForm currentName={collection.name} onRename={handleRename} />}
            />
            <Action
              title="Re-Embed"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              onAction={handleReembed}
            />
            <Action
              title="Update Index"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "u" }}
              onAction={() => handleUpdate(false)}
            />
            <Action
              title="Pull & Update"
              icon={Icon.Download}
              shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
              onAction={() => handleUpdate(true)}
            />
          </ActionPanel.Section>

          <ActionPanel.Section>
            <Action
              title="Remove Collection"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
              onAction={handleRemove}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

interface RenameFormProps {
  currentName: string;
  onRename: (newName: string) => Promise<void>;
}

function RenameForm({ currentName, onRename }: RenameFormProps) {
  const { pop } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: { name: string }) => {
    setIsSubmitting(true);
    await onRename(values.name);
    setIsSubmitting(false);
    pop();
  };

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="New Name" defaultValue={currentName} />
    </Form>
  );
}

interface CollectionFilesProps {
  collection: QmdCollection;
}

function CollectionFiles({ collection }: CollectionFilesProps) {
  const [files, setFiles] = useState<QmdFileListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFiles = async () => {
      const result = await runQmd<QmdFileListItem[]>(["ls", collection.name]);
      if (result.success && result.data) {
        setFiles(result.data);
      }
      setIsLoading(false);
    };

    loadFiles();
  }, [collection.name]);

  return (
    <List isLoading={isLoading} navigationTitle={`Files in ${collection.name}`}>
      {files.map((file) => {
        const fullPath = `${expandPath(collection.path)}/${file.path}`;
        return (
          <List.Item
            key={file.docid}
            title={file.title || file.path}
            subtitle={file.path}
            icon={file.embedded ? Icon.Document : { source: Icon.Document, tintColor: Color.SecondaryText }}
            accessories={[{ text: file.embedded ? "embedded" : "not embedded" }, { text: `#${file.docid}` }]}
            actions={
              <ActionPanel>
                <Action.Open title="Open File" target={fullPath} />
                <Action.ShowInFinder path={fullPath} />
                <Action.CopyToClipboard title="Copy Path" content={fullPath} />
                <Action.CopyToClipboard title="Copy DocID" content={`#${file.docid}`} />
              </ActionPanel>
            }
          />
        );
      })}

      {files.length === 0 && !isLoading && (
        <List.EmptyView icon={Icon.Document} title="No Files" description="This collection has no indexed files" />
      )}
    </List>
  );
}
