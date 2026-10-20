import { invoke } from "@tauri-apps/api/core";

// Mirrors src-tauri/src/rules/library.rs and src-tauri/src/commands/rules.rs. All calls reject with a StorageError.

export type SourceInfo = { id: string; name: string; group: string; published: string | null; isBook: boolean; entities: number };
export type LibraryInfo = { version: string; importedAt: number; sources: SourceInfo[] };
export type RemovedSource = { id: string; name: string };
export type ImagesInfo = { files: number; importedAt: number };
export type RulesStatus = { library: LibraryInfo | null; removed: RemovedSource[]; images: ImagesInfo | null };

/** Payload of the `rules-import-progress` event. */
export type ImportProgress = { task: "data" | "images"; done: number; total: number };

export type Book = { id: string; name: string; group: string; contents: unknown };
export type Entity = { id: number; kind: string; source: string; name: string; page: number | null; data: Record<string, unknown> };

export function rulesStatus(): Promise<RulesStatus> {
  return invoke("rules_status");
}

/** Imports a 5etools data .tar.gz the user picked. Replaces the library only if the import succeeds. */
export function importRules(path: string): Promise<RulesStatus> {
  return invoke("rules_import", { path });
}

export function importRuleImages(path: string): Promise<RulesStatus> {
  return invoke("rules_import_images", { path });
}

export function removeRuleImages(): Promise<RulesStatus> {
  return invoke("rules_remove_images");
}

/** Removes sources (books or others) from the library; later imports skip them until allowed again. */
export function removeRuleSources(ids: string[]): Promise<RulesStatus> {
  return invoke("rules_remove_sources", { ids });
}

export function allowRuleSource(id: string): Promise<RulesStatus> {
  return invoke("rules_allow_source", { id });
}

export function getBook(id: string): Promise<Book | null> {
  return invoke("rules_book", { id });
}

export function getChapter(book: string, index: number): Promise<unknown | null> {
  return invoke("rules_chapter", { book, index });
}

export function getEntity(id: number): Promise<Entity | null> {
  return invoke("rules_entity", { id });
}

/** Looks an entity up the way inline tags name it; without a matching source, the newest one wins. */
export function findEntity(kind: string, name: string, source?: string): Promise<Entity | null> {
  return invoke("rules_find", { kind, name, source: source ?? null });
}


/** A Catalog table row: the entry's identity plus only the fields its columns and filters need. */
export type CatalogRow = { id: number; kind: string; source: string; name: string; data: Record<string, unknown> };

/** Every entry of a kind (or of all kinds when `kind` is null) with the given top-level fields. */
export function catalogRows(kind: string | null, keys: string[]): Promise<CatalogRow[]> {
  return invoke("rules_catalog", { kind, keys });
}
