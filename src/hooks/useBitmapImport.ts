import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { BitmapImportSource } from '@/components/BitmapImportDialog.tsx';

type AddMsg = (text: string, type?: 'info' | 'ok' | 'err' | 'print' | 'warn' | 'time') => void;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 4096;

interface Options {
  addMsg: AddMsg;
}

async function decode(file: File): Promise<BitmapImportSource> {
  if (file.size > MAX_FILE_BYTES) throw new Error('images must be 20 MB or smaller');
  let width: number;
  let height: number;
  let draw: (ctx: CanvasRenderingContext2D) => void;

  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    width = bitmap.width;
    height = bitmap.height;
    draw = (ctx) => {
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    };
  } else {
    const url = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('the image could not be decoded'));
      element.src = url;
    });
    width = image.naturalWidth;
    height = image.naturalHeight;
    draw = (ctx) => {
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
    };
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION)
    throw new Error('images must be no larger than 4096 × 4096 pixels');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('could not create an image canvas');
  draw(context);
  const pixels = context.getImageData(0, 0, width, height);
  return { filename: file.name, width, height, data: pixels.data };
}

export function useBitmapImport({ addMsg }: Options) {
  const bitmapFileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<BitmapImportSource | null>(null);

  const openFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        addMsg('choose a PNG, JPEG, GIF, WebP, or BMP image', 'err');
        return;
      }
      try {
        setSource(await decode(file));
      } catch (error) {
        addMsg(`Bitmap import failed: ${error instanceof Error ? error.message : error}`, 'err');
      }
    },
    [addMsg],
  );

  const requestImport = useCallback(() => bitmapFileRef.current?.click(), []);
  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void openFile(file);
      event.target.value = '';
    },
    [openFile],
  );

  return {
    bitmapFileRef,
    bitmapSource: source,
    requestBitmapImport: requestImport,
    handleBitmapFileInput: handleFileInput,
    openBitmapFile: openFile,
    closeBitmapImport: () => setSource(null),
  };
}
