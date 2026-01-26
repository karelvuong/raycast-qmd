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
} from "@raycast/api";
import { QmdContext } from "./types";
import { runQmd, runQmdRaw } from "./utils/qmd";
import { useDependencyCheck } from "./hooks/useDependencyCheck";

export default function Command() {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const [contexts, setContexts] = useState<QmdContext[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadContexts = async () => {
    if (!isReady) return;

    setIsLoading(true);
    const result = await runQmd<QmdContext[]>(["context", "list"]);

    if (result.success && result.data) {
      setContexts(result.data);
    } else {
      setContexts([]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadContexts();
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
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search contexts..."
      actions={
        <ActionPanel>
          <Action.Push
            title="Add Context"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={<AddContextForm onAdd={loadContexts} />}
          />
        </ActionPanel>
      }
    >
      {contexts.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.Text}
          title="No Contexts"
          description="Add context descriptions to improve search relevance"
          actions={
            <ActionPanel>
              <Action.Push title="Add Context" icon={Icon.Plus} target={<AddContextForm onAdd={loadContexts} />} />
            </ActionPanel>
          }
        />
      )}

      {contexts.map((context) => (
        <ContextItem key={context.path} context={context} onRefresh={loadContexts} />
      ))}
    </List>
  );
}

interface ContextItemProps {
  context: QmdContext;
  onRefresh: () => Promise<void>;
}

function ContextItem({ context, onRefresh }: ContextItemProps) {
  const handleRemove = async () => {
    const confirmed = await confirmAlert({
      title: "Remove Context?",
      message: `This will remove the context description for "${context.path}".`,
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Removing context...",
    });

    const result = await runQmdRaw(["context", "rm", context.path]);

    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Context removed";
      await onRefresh();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Remove failed";
      toast.message = result.error;
    }
  };

  return (
    <List.Item
      title={context.path}
      subtitle={context.description}
      icon={context.path.startsWith("qmd://") ? Icon.Link : Icon.Document}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push
              title="Edit"
              icon={Icon.Pencil}
              target={<EditContextForm context={context} onEdit={onRefresh} />}
            />
            <Action.CopyToClipboard title="Copy Path" content={context.path} />
            <Action.CopyToClipboard
              title="Copy Description"
              content={context.description}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          </ActionPanel.Section>

          <ActionPanel.Section>
            <Action
              title="Remove Context"
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

interface AddContextFormProps {
  onAdd: () => Promise<void>;
}

function AddContextForm({ onAdd }: AddContextFormProps) {
  const { pop } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pathError, setPathError] = useState<string | undefined>();

  const validatePath = (value: string | undefined) => {
    if (!value || !value.trim()) {
      setPathError("Path is required");
      return false;
    }
    setPathError(undefined);
    return true;
  };

  const handleSubmit = async (values: { path: string; description: string }) => {
    if (!validatePath(values.path)) return;
    if (!values.description.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Description is required",
      });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding context...",
    });

    const result = await runQmdRaw(["context", "add", values.path.trim(), values.description.trim()]);

    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Context added";
      await onAdd();
      pop();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to add context";
      toast.message = result.error;
    }

    setIsSubmitting(false);
  };

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Context" onSubmit={handleSubmit} icon={Icon.Plus} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="path"
        title="Path"
        placeholder="qmd://collection-name or path/to/file.md"
        info="Use qmd:// prefix for collection-level context, or a file path for document-level context"
        error={pathError}
        onChange={(value) => validatePath(value)}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Description to help improve search relevance..."
        info="This context will be used to enhance search results"
      />
    </Form>
  );
}

interface EditContextFormProps {
  context: QmdContext;
  onEdit: () => Promise<void>;
}

function EditContextForm({ context, onEdit }: EditContextFormProps) {
  const { pop } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: { description: string }) => {
    if (!values.description.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Description is required",
      });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating context...",
    });

    // QMD doesn't have an edit command, so we remove and re-add
    const removeResult = await runQmdRaw(["context", "rm", context.path]);

    if (!removeResult.success) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update context";
      toast.message = removeResult.error;
      setIsSubmitting(false);
      return;
    }

    const addResult = await runQmdRaw(["context", "add", context.path, values.description.trim()]);

    if (addResult.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Context updated";
      await onEdit();
      pop();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update context";
      toast.message = addResult.error;
    }

    setIsSubmitting(false);
  };

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Update Context" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Path" text={context.path} />
      <Form.TextArea id="description" title="Description" defaultValue={context.description} />
    </Form>
  );
}
