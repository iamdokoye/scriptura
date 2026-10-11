/**
 * Reads a picked image and returns a downscaled JPEG data URL, small enough to
 * store in the theme row and relay to the output window on every verse change.
 * Wide photos are capped at `maxWidth`; quality steps down until the result is
 * under `maxBytes`.
 */
export async function fileToBackgroundDataUrl(file: File, maxWidth = 1920, maxBytes = 1_500_000): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let url = "";
    for (const quality of [0.88, 0.78, 0.68, 0.55, 0.4]) {
      url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= maxBytes) return url;
    }
    return url;
  } finally {
    bitmap.close();
  }
}
