// Parses 5etools inline markup such as "Cast {@spell Fireball|XPHB}" into renderable segments.

export type Style = "b" | "i" | "u" | "s" | "note";

export type Segment =
  | { type: "text"; text: string }
  | { type: "style"; style: Style; children: Segment[] }
  /** A reference to a library entry; clicking it opens a preview card. */
  | { type: "link"; kind: string; name: string; source?: string; text: string };

const STYLES: Record<string, Style> = { b: "b", bold: "b", i: "i", italic: "i", u: "u", underline: "u", s: "s", strike: "s", note: "note" };

/** Tag name → library entity kind. */
export const LINK_KINDS: Record<string, string> = {
  spell: "spell",
  item: "item",
  creature: "creature",
  condition: "condition",
  status: "condition",
  disease: "disease",
  feat: "feat",
  background: "background",
  race: "species",
  class: "class",
  variantrule: "variantrule",
  action: "action",
  sense: "sense",
  skill: "skill",
  language: "language",
  itemProperty: "itemProperty",
  itemMastery: "itemMastery",
  optfeature: "optionalfeature",
  hazard: "hazard",
  trap: "trap",
};

const ABILITIES: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

const ATTACK_ROLLS: Record<string, string> = {
  m: "Melee Attack Roll:",
  r: "Ranged Attack Roll:",
  "m,r": "Melee or Ranged Attack Roll:",
  "r,m": "Melee or Ranged Attack Roll:",
};

const ATTACKS_2014: Record<string, string> = {
  mw: "Melee Weapon Attack:",
  rw: "Ranged Weapon Attack:",
  ms: "Melee Spell Attack:",
  rs: "Ranged Spell Attack:",
  "mw,rw": "Melee or Ranged Weapon Attack:",
  "ms,rs": "Melee or Ranged Spell Attack:",
};

/** Splits a tag body on "|" without splitting inside nested tags. */
function splitParts(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

/** Display text for tags that render as plain text (dice, DCs, stat block action labels, …). */
function displayText(tag: string, parts: string[]): string {
  const first = parts[0] ?? "";
  switch (tag) {
    case "dc":
      return `DC ${first}`;
    case "hit":
      return /^[+-]/.test(first) ? first : `+${first}`;
    case "atkr":
      return ATTACK_ROLLS[first] ?? "Attack Roll:";
    case "atk":
      return ATTACKS_2014[first] ?? "Attack:";
    case "h":
      return "Hit: ";
    case "hom":
      return "Hit or Miss: ";
    case "actSave":
      return `${ABILITIES[first] ?? first} Saving Throw:`;
    case "actSaveFail":
      return first ? `Failure by ${first} or More:` : "Failure:";
    case "actSaveFailBy":
      return `Failure by ${first} or More:`;
    case "actSaveSuccess":
      return "Success:";
    case "actSaveSuccessOrFail":
      return "Failure or Success:";
    case "actTrigger":
      return "Trigger:";
    case "actResponse":
      return "Response:";
    case "recharge":
      return !first || first === "6" ? "(Recharge 6)" : `(Recharge ${first}–6)`;
    case "chance":
      return parts[1] || `${first} percent`;
    // These show their first part; the rest is a link target or filter, not text.
    case "filter":
    case "book":
    case "adventure":
    case "link":
    case "quickref":
    case "area": // `{@area text|id|x}`: "x" marks a cross-reference
      return first;
    default:
      // `{@tag name|source|display}`: a third part, when present, is the text to show.
      return parts[2] || first;
  }
}

/** Parses markup into segments. Unclosed tags are kept as plain text. */
export function parseTags(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) segments.push({ type: "text", text: plain });
    plain = "";
  };
  while (i < text.length) {
    if (text.startsWith("{@", i)) {
      // Find the matching closing brace, allowing nested tags.
      let depth = 0;
      let end = -1;
      for (let j = i; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}" && --depth === 0) {
          end = j;
          break;
        }
      }
      if (end === -1) {
        plain += text.slice(i);
        break;
      }
      const inner = text.slice(i + 2, end);
      const space = inner.indexOf(" ");
      const tag = space === -1 ? inner : inner.slice(0, space);
      const body = space === -1 ? "" : inner.slice(space + 1);
      flush();
      segments.push(...tagSegments(tag, body));
      i = end + 1;
    } else {
      plain += text[i++];
    }
  }
  flush();
  return segments;
}

function tagSegments(tag: string, body: string): Segment[] {
  const style = STYLES[tag];
  if (style) return [{ type: "style", style, children: parseTags(body) }];
  const parts = splitParts(body);
  const kind = LINK_KINDS[tag];
  if (kind && parts[0]) {
    const display = plainText(parts[2] || parts[0]);
    // Item properties are tagged by abbreviation ("F"); the entry is named after its display text.
    const name = kind === "itemProperty" && parts[2] ? parts[2] : parts[0];
    return [{ type: "link", kind, name, source: parts[1] || undefined, text: display }];
  }
  return parseTags(displayText(tag, parts));
}

/** Markup as plain readable text (for alt text, titles and summaries). */
export function plainText(text: string): string {
  const out = (segments: Segment[]): string =>
    segments.map((s) => (s.type === "text" ? s.text : s.type === "link" ? s.text : out(s.children))).join("");
  return out(parseTags(text));
}
