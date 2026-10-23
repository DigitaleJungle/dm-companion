// A picked picture as a small square avatar: a square crop, positioned by the user (dragging the picture), scaled
// down so it can live in the character file. The backend refuses anything over 512 KB.

export const AVATAR_SIZE = 256;
const QUALITY = 0.85;

/** Where the square sits on the picture's longer side: 0 = left/top, 1 = right/bottom. Faces are usually high. */
export type Crop = { x: number; y: number };
export const defaultCrop = (): Crop => ({ x: 0.5, y: 0.25 });

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function avatarFrom(image: ImageBitmap, crop: Crop): string {
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(image, (image.width - side) * crop.x, (image.height - side) * crop.y, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return canvas.toDataURL("image/webp", QUALITY);
}
