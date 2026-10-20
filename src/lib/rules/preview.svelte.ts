import { getContext, setContext } from "svelte";

/** What a clicked reference points at. */
export type Ref = { kind: string; name: string; source?: string };

/** The open preview card: the references followed inside it (newest last) and where it opened. */
export const preview = $state({
  trail: [] as Ref[],
  anchorRect: null as DOMRect | null,
});

let anchor: HTMLElement | null = null;
let card: HTMLElement | null = null;

/** Opening from the page starts a new card; a reference inside the card adds to its trail. */
export function openPreview(ref: Ref, from: HTMLElement) {
  if (card?.contains(from)) {
    preview.trail = [...preview.trail, ref];
  } else {
    anchor = from;
    preview.anchorRect = from.getBoundingClientRect();
    preview.trail = [ref];
  }
}

export function previewBack() {
  preview.trail = preview.trail.slice(0, -1);
}

/** Closes the card and returns focus to the reference that opened it. */
export function closePreview() {
  preview.trail = [];
  anchor?.focus();
  anchor = null;
}

export function setPreviewCard(element: HTMLElement | null) {
  card = element;
}

export function isPreviewAnchor(node: Node) {
  return !!anchor?.contains(node);
}

const ENABLED = Symbol("rules-preview-enabled");

/** References render as clickable links only below a component that called this (the Library page). */
export function enablePreviews() {
  setContext(ENABLED, true);
}

export function previewsEnabled(): boolean {
  return getContext<boolean | undefined>(ENABLED) ?? false;
}
