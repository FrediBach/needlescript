/** Rasterize an AI preview SVG in the browser. A null result leaves text spatial context intact. */
export async function rasterizeAiPreview(svg: string, size = 640): Promise<string | null> {
  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  )
    return null;
  let url: string | null = null;
  try {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    url = URL.createObjectURL(blob);
    const imageUrl = url;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Could not rasterize the compiled design preview'));
      next.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
