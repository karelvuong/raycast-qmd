import { useState } from "react";
import { Form, ActionPanel, Action, Icon, showToast, Toast, popToRoot } from "@raycast/api";
import { runQmdRaw } from "./utils/qmd";
import { useDependencyCheck } from "./hooks/useDependencyCheck";

export default function Command() {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
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
      toast.message = values.path.trim();
      await popToRoot();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to add context";
      toast.message = result.error;
    }

    setIsSubmitting(false);
  };

  if (isDepsLoading) {
    return (
      <Form isLoading={true}>
        <Form.Description text="Checking dependencies..." />
      </Form>
    );
  }

  if (!isReady) {
    return (
      <Form>
        <Form.Description text="Please install the required dependencies to use QMD" />
      </Form>
    );
  }

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
        placeholder="qmd://collection-name or qmd://collection/path/to/file.md"
        info="Use qmd://collection for collection-level context, or qmd://collection/path for document-level context"
        error={pathError}
        onChange={(value) => validatePath(value)}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Description to help improve search relevance..."
        info="This context will be used to enhance search results for the specified path"
      />
    </Form>
  );
}
