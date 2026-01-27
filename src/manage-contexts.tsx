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
  launchCommand,
  LaunchType,
} from "@raycast/api";
import { QmdContext } from "./types";
import { runQmdRaw, getContexts } from "./utils/qmd";
import { useDependencyCheck } from "./hooks/useDependencyCheck";
import { contextsLogger } from "./utils/logger";

export default function Command() {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const [contexts, setContexts] = useState<QmdContext[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadContexts = async () => {
    if (!isReady) return;

    contextsLogger.info("Loading contexts");
    setIsLoading(true);
    const result = await getContexts();

    if (result.success && result.data) {
      setContexts(result.data);
      contextsLogger.info("Contexts loaded", { count: result.data.length });
    } else {
      contextsLogger.warn("Failed to load contexts", { error: result.error });
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

  const handleAddContext = async () => {
    await launchCommand({ name: "add-context", type: LaunchType.UserInitiated });
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search contexts..."
      actions={
        <ActionPanel>
          <Action
            title="Add Context"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={handleAddContext}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={loadContexts}
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
              <Action title="Add Context" icon={Icon.Plus} onAction={handleAddContext} />
            </ActionPanel>
          }
        />
      )}

      {contexts.map((context, index) => (
        <ContextItem key={`${context.path}-${index}`} context={context} onRefresh={loadContexts} />
      ))}
    </List>
  );
}

interface ContextItemProps {
  context: QmdContext;
  onRefresh: () => Promise<void>;
}

function ContextItem({ context, onRefresh }: ContextItemProps) {
  const handleAddContext = async () => {
    await launchCommand({ name: "add-context", type: LaunchType.UserInitiated });
  };

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

    contextsLogger.info("Removing context", { path: context.path });
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Removing context...",
    });

    const result = await runQmdRaw(["context", "rm", context.path]);

    if (result.success) {
      contextsLogger.info("Context removed", { path: context.path });
      toast.style = Toast.Style.Success;
      toast.title = "Context removed";
      await onRefresh();
    } else {
      contextsLogger.error("Remove failed", { path: context.path, error: result.error });
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
              title="Add Context"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              onAction={handleAddContext}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={onRefresh}
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

    contextsLogger.info("Updating context", { path: context.path });
    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating context...",
    });

    // QMD doesn't have an edit command, so we remove and re-add
    const removeResult = await runQmdRaw(["context", "rm", context.path]);

    if (!removeResult.success) {
      contextsLogger.error("Failed to remove context during update", { error: removeResult.error });
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update context";
      toast.message = removeResult.error;
      setIsSubmitting(false);
      return;
    }

    const addResult = await runQmdRaw(["context", "add", context.path, values.description.trim()]);

    if (addResult.success) {
      contextsLogger.info("Context updated", { path: context.path });
      toast.style = Toast.Style.Success;
      toast.title = "Context updated";
      await onEdit();
      pop();
    } else {
      contextsLogger.error("Failed to add context during update", { error: addResult.error });
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update context";
      toast.message = addResult.error;
    }

    setIsSubmitting(false);
  };

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

    contextsLogger.info("Removing context from edit form", { path: context.path });
    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Removing context...",
    });

    const result = await runQmdRaw(["context", "rm", context.path]);

    if (result.success) {
      contextsLogger.info("Context removed", { path: context.path });
      toast.style = Toast.Style.Success;
      toast.title = "Context removed";
      await onEdit();
      pop();
    } else {
      contextsLogger.error("Remove failed", { path: context.path, error: result.error });
      toast.style = Toast.Style.Failure;
      toast.title = "Remove failed";
      toast.message = result.error;
      setIsSubmitting(false);
    }
  };

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.SubmitForm title="Update Context" onSubmit={handleSubmit} />
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
    >
      <Form.Description title="Path" text={context.path} />
      <Form.TextArea id="description" title="Description" defaultValue={context.description} />
    </Form>
  );
}
