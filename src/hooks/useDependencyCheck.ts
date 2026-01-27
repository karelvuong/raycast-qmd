import { useEffect, useRef } from "react";
import { confirmAlert, showToast, Toast, open } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { platform } from "os";
import { DependencyStatus } from "../types";
import { checkAllDependencies, installQmd, installSqlite } from "../utils/qmd";
import { depsLogger } from "../utils/logger";

interface UseDependencyCheckResult {
  isLoading: boolean;
  isReady: boolean;
  status: DependencyStatus | null;
  recheckDependencies: () => void;
}

async function checkDependencies(): Promise<DependencyStatus> {
  depsLogger.info("Checking all dependencies");
  const status = await checkAllDependencies();
  depsLogger.info("Dependency check complete", status);
  return status;
}

export function useDependencyCheck(): UseDependencyCheckResult {
  const promptShownRef = useRef(false);

  const {
    data: status,
    isLoading,
    revalidate,
  } = useCachedPromise(checkDependencies, [], {
    keepPreviousData: true,
  });

  const isReady = Boolean(
    status?.bunInstalled && status?.qmdInstalled && status?.sqliteInstalled
  );

  // Show prompts for missing deps (only once per session)
  useEffect(() => {
    if (isLoading || !status || promptShownRef.current) return;
    if (isReady) return; // All deps installed, no prompts needed

    promptShownRef.current = true;

    const promptForMissing = async () => {
      if (!status.bunInstalled) {
        depsLogger.warn("Bun not installed");
        await promptBunInstall();
        return;
      }
      if (!status.qmdInstalled) {
        depsLogger.warn("QMD not installed");
        await promptQmdInstall(revalidate);
        return;
      }
      if (!status.sqliteInstalled && platform() === "darwin") {
        depsLogger.warn("SQLite not installed");
        await promptSqliteInstall(revalidate);
      }
    };

    promptForMissing();
  }, [status, isLoading, isReady, revalidate]);

  return {
    isLoading: isLoading && !status, // Only loading if no cached data
    isReady,
    status: status ?? null,
    recheckDependencies: revalidate,
  };
}

async function promptBunInstall() {
  await confirmAlert({
    title: "Bun Not Installed",
    message: "QMD requires Bun. Would you like to visit the installation page?",
    primaryAction: {
      title: "Open Installation Page",
      onAction: () => open("https://bun.sh"),
    },
  });
}

async function promptQmdInstall(revalidate: () => void) {
  const shouldInstall = await confirmAlert({
    title: "QMD Not Installed",
    message: "Would you like to install QMD now?",
    primaryAction: { title: "Install QMD" },
  });

  if (shouldInstall) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Installing QMD...",
    });

    const result = await installQmd();
    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "QMD Installed";
      revalidate();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Installation Failed";
      toast.message = result.error;
    }
  }
}

async function promptSqliteInstall(revalidate: () => void) {
  const shouldInstall = await confirmAlert({
    title: "SQLite Not Installed",
    message: "QMD requires SQLite. Install via Homebrew?",
    primaryAction: { title: "Install SQLite" },
  });

  if (shouldInstall) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Installing SQLite...",
    });

    const result = await installSqlite();
    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "SQLite Installed";
      revalidate();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Installation Failed";
      toast.message = result.error;
    }
  }
}
