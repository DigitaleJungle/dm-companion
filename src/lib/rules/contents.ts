// The table of contents of a book, from the `contents` list in books.json.

export type HeaderNode = { name: string; children: HeaderNode[] };
export type ChapterNode = { index: number; name: string; children: HeaderNode[] };

type RawHeader = string | { header?: string; depth?: number };
type RawChapter = { name?: string; headers?: RawHeader[]; ordinal?: { type?: string; identifier?: string | number } };

/** "Chapter 1: Playing the Game" from the name and its ordinal, as the book prints it. */
function chapterName(chapter: RawChapter, index: number): string {
  const name = chapter.name ?? `Part ${index + 1}`;
  const ord = chapter.ordinal;
  if (!ord?.type || ord.identifier === undefined) return name;
  return `${ord.type.charAt(0).toUpperCase()}${ord.type.slice(1)} ${ord.identifier}: ${name}`;
}

/** Chapters with their headers nested by `depth` (0 = directly under the chapter). */
export function contentsTree(contents: unknown): ChapterNode[] {
  if (!Array.isArray(contents)) return [];
  return (contents as RawChapter[]).map((chapter, index) => {
    const root: HeaderNode[] = [];
    // stack[d] holds the children list for headers at depth d.
    const stack: HeaderNode[][] = [root];
    for (const raw of chapter.headers ?? []) {
      const name = typeof raw === "string" ? raw : raw.header;
      if (!name) continue;
      const depth = Math.min(typeof raw === "string" ? 0 : (raw.depth ?? 0), stack.length - 1);
      const node: HeaderNode = { name, children: [] };
      stack[depth].push(node);
      stack.length = depth + 1;
      stack.push(node.children);
    }
    return { index, name: chapterName(chapter, index), children: root };
  });
}

/** Element id for a heading, shared by the renderer and the contents links. */
export function headingId(name: string): string {
  return "h-" + name.toLowerCase().replace(/\{@\w+\s?/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
