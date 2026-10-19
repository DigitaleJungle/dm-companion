/** Mirrors `StorageError` in src-tauri/src/storage.rs. */
export type StorageError = { kind: "io" | "corrupt" | "invalid" | "notFound"; message: string };

/** Readable reason from a rejected command (a StorageError, or anything else). */
export const errorMessage = (e: unknown): string => (e as StorageError)?.message ?? String(e);
