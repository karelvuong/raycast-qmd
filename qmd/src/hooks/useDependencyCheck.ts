import { useEffect, useState } from "react";
import { Alert, confirmAlert, showToast, Toast, open } from "@raycast/api";
import { platform } from "os";
import { DependencyStatus } from "../types";
import { checkAllDependencies, installQmd, installSqlite } from "../utils/qmd";

interface UseDependencyCheckResult {
  isLoading: boolean;
  isReady: boolean;
  status: DependencyStatus | null;
  recheckDependencies: () => Promise<void>;
}

export function useDependencyCheck(): UseDependencyCheckResult {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<DependencyStatus | null>(null);

  const checkAndPrompt = async () => {
    setIsLoading(true);
    const depStatus = await checkAllDependencies();
    setStatus(depStatus);

    // Check Bun first
    if (!depStatus.bunInstalled) {
      await confirmAlert({
        title: "Bun Not Installed",
        message: "QMD requires Bun to be installed. Would you like to visit the Bun installation page?",
        primaryAction: {
          title: "Open Installation Page",
          onAction: () => {
            open("https://bun.sh");
          },
        },
        dismissAction: {
          title: "Cancel",
        },
      });
      setIsLoading(false);
      setIsReady(false);
      return;
    }

    // Check QMD
    if (!depStatus.qmdInstalled) {
      const shouldInstall = await confirmAlert({
        title: "QMD Not Installed",
        message: "Would you like to install QMD now?",
        primaryAction: {
          title: "Install QMD",
          style: Alert.ActionStyle.Default,
        },
        dismissAction: {
          title: "Cancel",
        },
      });

      if (shouldInstall) {
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Installing QMD...",
          message: "This may take a moment",
        });

        const result = await installQmd();

        if (result.success) {
          toast.style = Toast.Style.Success;
          toast.title = "QMD Installed";
          toast.message = "Ready to use";
          // Recheck dependencies
          const newStatus = await checkAllDependencies();
          setStatus(newStatus);
          if (newStatus.qmdInstalled && newStatus.sqliteInstalled) {
            setIsReady(true);
          }
        } else {
          toast.style = Toast.Style.Failure;
          toast.title = "Installation Failed";
          toast.message = result.error || "Unknown error";
          setIsLoading(false);
          setIsReady(false);
          return;
        }
      } else {
        setIsLoading(false);
        setIsReady(false);
        return;
      }
    }

    // Check SQLite (macOS only)
    if (!depStatus.sqliteInstalled && platform() === "darwin") {
      const shouldInstall = await confirmAlert({
        title: "SQLite Not Installed",
        message: "QMD requires SQLite. Would you like to install it via Homebrew?",
        primaryAction: {
          title: "Install SQLite",
          style: Alert.ActionStyle.Default,
        },
        dismissAction: {
          title: "Cancel",
        },
      });

      if (shouldInstall) {
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Installing SQLite...",
          message: "This may take a moment",
        });

        const result = await installSqlite();

        if (result.success) {
          toast.style = Toast.Style.Success;
          toast.title = "SQLite Installed";
          toast.message = "Ready to use";
          const newStatus = await checkAllDependencies();
          setStatus(newStatus);
          setIsReady(newStatus.bunInstalled && newStatus.qmdInstalled && newStatus.sqliteInstalled);
        } else {
          toast.style = Toast.Style.Failure;
          toast.title = "Installation Failed";
          toast.message = result.error || "Unknown error";
          setIsLoading(false);
          setIsReady(false);
          return;
        }
      } else {
        setIsLoading(false);
        setIsReady(false);
        return;
      }
    }

    setIsReady(depStatus.bunInstalled && depStatus.qmdInstalled && depStatus.sqliteInstalled);
    setIsLoading(false);
  };

  useEffect(() => {
    checkAndPrompt();
  }, []);

  return {
    isLoading,
    isReady,
    status,
    recheckDependencies: checkAndPrompt,
  };
}
