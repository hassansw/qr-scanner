import jsQR from "jsqr";
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";

const zxingReader = new QRCodeReader();

const hintsNormal = new Map();
hintsNormal.set(DecodeHintType.POSSIBLE_FORMATS, []);
hintsNormal.set(DecodeHintType.TRY_HARDER, false);

const hintsHarder = new Map();
hintsHarder.set(DecodeHintType.POSSIBLE_FORMATS, []);
hintsHarder.set(DecodeHintType.TRY_HARDER, true);

// zxing's RGBLuminanceSource treats a Uint8ClampedArray as a ready-made
// luminance plane (one byte per pixel), so RGBA canvas data must be converted
// first — otherwise it decodes garbage and never finds a code.
function toLuminance(data: Uint8ClampedArray, width: number, height: number) {
  const size = width * height;
  const luminances = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i++) {
    const offset = i * 4;
    luminances[i] =
      (data[offset] * 306 + data[offset + 1] * 601 + data[offset + 2] * 117) >> 10;
  }
  return luminances;
}

export function decodeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tryHarder = false
): string | null {
  try {
    const source = new RGBLuminanceSource(toLuminance(data, width, height), width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = zxingReader.decode(bitmap, tryHarder ? hintsHarder : hintsNormal);
    return result.getText();
  } catch {
    /* not found by zxing */
  }

  try {
    const qr = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
    if (qr?.data) return qr.data;
  } catch {
    /* not found by jsQR */
  }

  return null;
}

export function imageDataFromUrl(
  url: string
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 2048;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        resolve({ data: imageData.data, width, height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
