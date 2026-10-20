import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

let base: Promise<string> | null = null;

/** URL for an imported 5etools image (`href.path` like "book/XPHB/cover.webp"), served by the asset protocol. */
export async function imageUrl(path: string): Promise<string> {
  base ??= appDataDir().then((dir) => join(dir, "rules", "img"));
  return convertFileSrc(`${await base}/${path}`);
}
