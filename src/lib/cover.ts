// Decode and resize selected photos before embedding them in the offline library.
export async function readCoverImage(file: File): Promise<string> {
  if (file.size > 30_000_000)
    throw new Error("Choose a photo smaller than 30 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "This photo could not be opened. Try a JPG, PNG, or WebP image.",
          ),
        );
      image.src = url;
    });
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Unable to prepare this cover image. Please try again.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const cover = canvas.toDataURL("image/jpeg", 0.85);
    if (!cover.startsWith("data:image/jpeg;base64,"))
      throw new Error("Unable to save this cover image. Please try again.");
    return cover;
  } finally {
    URL.revokeObjectURL(url);
  }
}
