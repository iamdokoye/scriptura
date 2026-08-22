import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateCheckResult =
  | { status: "up-to-date" }
  | { status: "available"; update: Update };

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const update = await check();
  if (!update) return { status: "up-to-date" };
  return { status: "available", update };
}

export async function downloadAndInstall(
  update: Update,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress(0, total);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress(downloaded, total);
        break;
      case "Finished":
        onProgress(total ?? downloaded, total);
        break;
    }
  });

  await relaunch();
}

export { getVersion };
