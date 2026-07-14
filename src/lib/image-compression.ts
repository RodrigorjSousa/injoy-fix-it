import imageCompression from "browser-image-compression";

/**
 * Comprime uma imagem no cliente para no máximo ~300 KB, redimensionando para
 * até 1920px no maior lado. Se o arquivo não for imagem ou já for menor que
 * 300 KB, retorna o original sem processar.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const MAX_KB = 300;
  if (file.size <= MAX_KB * 1024) return file;

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: MAX_KB / 1024, // ~0.293 MB
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      initialQuality: 0.8,
      fileType: file.type === "image/png" ? "image/jpeg" : file.type,
    });

    // Garante que seja um File (imageCompression retorna Blob em alguns casos)
    if (compressed instanceof File) return compressed;
    const blob = compressed as Blob;
    const name = file.name.replace(/\.(png|heic|heif|webp)$/i, ".jpg");
    return new File([blob], name, {
      type: blob.type || "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("[compressImage] falhou, enviando original", err);
    return file;
  }
}
