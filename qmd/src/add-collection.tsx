import { useState } from "react";
import { Form, ActionPanel, Action, showToast, Toast, useNavigation, Icon } from "@raycast/api";
import { useDependencyCheck } from "./hooks/useDependencyCheck";
import { runQmdRaw, validateCollectionPath, expandPath } from "./utils/qmd";

interface FormValues {
  name: string;
  path: string;
  context: string;
  showAdvanced: boolean;
  mask: string;
}

export default function Command() {
  const { isLoading: isDepsLoading, isReady } = useDependencyCheck();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pathError, setPathError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const { pop } = useNavigation();

  const validatePath = (value: string | undefined) => {
    if (!value) {
      setPathError("Path is required");
      return false;
    }
    if (!validateCollectionPath(value)) {
      setPathError("Directory does not exist");
      return false;
    }
    setPathError(undefined);
    return true;
  };

  const validateName = (value: string | undefined) => {
    if (!value || !value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setNameError("Name can only contain letters, numbers, hyphens, and underscores");
      return false;
    }
    setNameError(undefined);
    return true;
  };

  async function handleSubmit(values: FormValues) {
    if (!validateName(values.name) || !validatePath(values.path)) {
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding collection...",
    });

    try {
      // Build the add command
      const addArgs = ["collection", "add", expandPath(values.path), "--name", values.name.trim()];

      // Add custom mask if different from default
      if (values.mask && values.mask !== "**/*.md") {
        addArgs.push("--mask", values.mask);
      }

      const addResult = await runQmdRaw(addArgs);

      if (!addResult.success) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to add collection";
        toast.message = addResult.error || "Unknown error";
        setIsSubmitting(false);
        return;
      }

      // Add context if provided
      if (values.context && values.context.trim()) {
        const contextPath = `qmd://${values.name.trim()}`;
        const contextResult = await runQmdRaw(["context", "add", contextPath, values.context.trim()]);

        if (!contextResult.success) {
          // Collection was added but context failed - still show partial success
          toast.style = Toast.Style.Success;
          toast.title = "Collection added";
          toast.message = "Warning: Failed to add context description";
          setIsSubmitting(false);
          pop();
          return;
        }
      }

      toast.style = Toast.Style.Success;
      toast.title = "Collection added";
      toast.message = values.name;

      // Offer to generate embeddings
      await showToast({
        style: Toast.Style.Success,
        title: "Collection added successfully",
        message: "Run 'Generate Embeddings' to enable semantic search",
        primaryAction: {
          title: "Generate Embeddings",
          onAction: async (toast) => {
            toast.hide();
            // Trigger embed via importing the generate-embeddings command
            // For now, just show instructions
            await showToast({
              style: Toast.Style.Animated,
              title: "Starting embedding generation...",
            });
            const embedResult = await runQmdRaw(["embed", "-c", values.name.trim()], { timeout: 300000 });
            if (embedResult.success) {
              await showToast({
                style: Toast.Style.Success,
                title: "Embeddings generated",
              });
            } else {
              await showToast({
                style: Toast.Style.Failure,
                title: "Embedding failed",
                message: embedResult.error,
              });
            }
          },
        },
      });

      setIsSubmitting(false);
      pop();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Error";
      toast.message = error instanceof Error ? error.message : "Unknown error";
      setIsSubmitting(false);
    }
  }

  if (isDepsLoading) {
    return (
      <Form>
        <Form.Description text="Checking dependencies..." />
      </Form>
    );
  }

  if (!isReady) {
    return (
      <Form>
        <Form.Description text="Please install the required dependencies to use QMD." />
      </Form>
    );
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Collection" onSubmit={handleSubmit} icon={Icon.Plus} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="notes"
        info="Identifier for this collection (letters, numbers, hyphens, underscores)"
        error={nameError}
        onChange={(value) => validateName(value)}
        onBlur={(event) => validateName(event.target.value)}
      />

      <Form.TextField
        id="path"
        title="Path"
        placeholder="~/Documents/notes"
        info="Directory containing markdown files"
        error={pathError}
        onChange={(value) => validatePath(value)}
        onBlur={(event) => validatePath(event.target.value)}
      />

      <Form.TextArea
        id="context"
        title="Context (Optional)"
        placeholder="Personal notes and ideas about various topics..."
        info="Description to help improve search relevance"
      />

      <Form.Separator />

      <Form.Checkbox id="showAdvanced" label="Show Advanced Options" value={showAdvanced} onChange={setShowAdvanced} />

      {showAdvanced && (
        <Form.TextField
          id="mask"
          title="Glob Mask"
          placeholder="**/*.md"
          defaultValue="**/*.md"
          info="File pattern to index (e.g., **/*.md, docs/**/*.markdown)"
        />
      )}
    </Form>
  );
}
