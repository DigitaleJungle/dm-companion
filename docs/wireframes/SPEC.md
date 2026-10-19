# DM Companion — wireframe spec

A desktop app that helps a Dungeon Master prepare and run D&D sessions at the table.
These wireframes define **layout, navigation and behaviour**, not final visual design.
Open the `.html` files in a browser (all sidebar links work), or see `images/` for screenshots.

## Context

- One DM, playing **in person with two screens**: the DM's laptop (main window) and a TV or second monitor facing the players (player display).
- The ruleset is not fixed yet. Rules data, monsters and encounter difficulty thresholds must come from a swappable data source and a per-campaign ruleset setting.
- Lore lives in the DM's **LegendKeeper** world. The app only **reads** it, never edits it.

## App shell (all DM screens)

- **Left sidebar**
  - App name.
  - Campaign switcher.
  - Navigation: Home, Run encounter, Encounter builder, Characters, LegendKeeper. Search is not a sidebar item.
  - Player-screen status box at the bottom, with a "Blank screen" button.
  - A gear button in the bottom-left corner opens **Settings** as a modal dialog. Escape, the close button or clicking outside closes it. It has no settings yet.
- **Global search**: a search bar is always visible at the top of every DM screen and stays in place while the content scrolls. It has no keyboard shortcut.
- Search results, stat blocks and LegendKeeper pages can be opened in **tabs** (see the Search screen).
- The layout must stay usable on a small laptop. When the window gets narrow, the sidebar hides behind a menu toggle in a top bar and opens as a drawer over the content. Escape, clicking outside, or navigating closes it.

## Screens

| File | Screen | Purpose |
|---|---|---|
| `00-landing.html` | Landing | The start page when the app opens. |
| `01-search.html` | Global search | Search everything and preview a result. |
| `02-run-encounter.html` | Run encounter | The live combat tracker. |
| `03-encounter-builder.html` | Encounter builder | Prepare encounters before the session. |
| `04-characters.html` | Characters | Create and store player characters. |
| `05-legendkeeper-reader.html` | LegendKeeper reader | Browse the world and read pages. |
| `06-player-display.html` | Player display | Second window shown on the TV. |

### 00 · Landing
- **Header**
  - Campaign name and the next session (number, date and time).
  - A link to last session's recap.
  - Buttons: **Start session** (primary, opens Run encounter and the player display) and **Prep mode**.
- **Search**: uses the global search bar at the top (see App shell), with recent searches as chips underneath.
- **Cards** (always editable: each card has one ⋯ menu with Move left, Move right and Remove. Hovering a card shows a drag handle next to the ⋯ menu; drag it to reorder the card; the other cards slide out of the way, and Escape cancels. Removing shows "… removed · Undo". A dashed "+ Add card" tile at the end of the grid adds removed cards back. Each card appears at most once. The order is saved app-wide.)
  - Prepared encounters, each with a "Run" button.
  - Party snapshot (AC, passive Perception).
  - LegendKeeper pinned and recently viewed pages.
  - Notes for the next session.
  - Continue where you left off.
  - Quick tools: dice, conditions reference, random NPC name, blank the player screen.

### 01 · Global search
- **One query searches across** rules, spells, monsters, items and LegendKeeper lore.
- **Filter chips** by type, each showing its result count. Source and sort dropdowns.
- **Results list**, grouped by type, shown next to a **preview pane**.
- **Preview pane**
  - Key stats as a grid.
  - The full text, with inline links to the rules it references.
  - Rollable dice, for example "Roll 8d6" with a slot-level picker.
  - Actions: Pin to session, Open in new tab, Show on player screen.
  - "Mentioned in your world": LegendKeeper pages that reference this result.
- **Tabs** above the content keep several lookups open at once.

### 02 · Run encounter
- **Header**
  - Encounter name, with a link to its LegendKeeper page.
  - Round counter and timer.
  - Buttons: Previous, **Next turn** (Space), + Combatant, End encounter.
- **Initiative column**: one row per combatant.
  - Each row shows initiative, name, PC tag, HP bar, HP and AC, and condition tags with durations.
  - Concentration is shown as a tag.
  - A downed PC shows its death saves.
  - The active turn is highlighted.
- **Stat block** of the active combatant.
  - Every modifier, attack and damage value is **clickable to roll**.
  - DM notes per monster.
- **Target panel**
  - Damage, Heal and Temp HP buttons with an amount field.
  - Condition toggles, plus custom conditions.
  - A duration picker; durations count down per round.
- **Dice roller**
  - Buttons for d4–d20 and d%.
  - A free expression field (e.g. `2d20kh1+4`).
  - A roll log.

### 03 · Encounter builder
- **Monster browser**
  - Search, plus filters for CR, type and environment.
  - Add buttons; hover a monster to preview it.
  - Homebrew monsters are included.
- **Roster**
  - Quantity steppers for each monster.
  - Start options: average or rolled HP, group identical monsters on one initiative, show monster names to players.
  - Setup notes.
  - A linked LegendKeeper page.
- **Party**: checkboxes for which PCs take part.
- **Difficulty meter**: base XP, multiplier, adjusted XP and the next threshold. It follows the campaign's ruleset.
- **Buttons**: Save draft, and **Start encounter**, which loads the encounter into Run encounter.
- The sidebar lists saved encounters.

### 04 · Characters
- **Character list**
  - New character, Import… and a filter.
  - Groups: active party, and retired characters / NPC allies.
- **Sheet header**
  - Portrait, name, class and level, species, background, player.
  - Buttons: Save, Add to encounter, Export PDF.
- **Tabs**: Overview, Features, Spells, Inventory, Backstory & notes.
- **Overview tab**
  - The six ability scores with modifiers.
  - AC, HP, speed, initiative, proficiency, passive Perception.
  - Attacks.
  - Saving throws (proficiency dot) and skills (● proficient, ◆ expertise).

### 05 · LegendKeeper reader
- **Header bar**: world name, connection and sync status, Refresh, Connection settings.
- **Page tree**: a filter, pinned pages, then the full folder hierarchy.
- **Read-only page view**
  - Breadcrumb and a "Read only" badge.
  - Buttons: Pin, Show image on player screen, **Open in LegendKeeper ↗**.
  - Links between pages open inside the app.
- **GM secret blocks** are visible here but must **never** be sent to the player display.
- **Side panel**: page properties, linked app items (for example encounters), and backlinks.

### 06 · Player display (second window)
- A separate full-screen window on display 2, with a dark theme readable from across the table.
- **Content**
  - Round, whose turn it is, and who is up next.
  - The initiative list.
  - A shared handout or image area.
- **What players see**
  - PCs show exact HP.
  - **Monsters show status words only** (Unhurt, Bloodied, Down) plus their conditions.
- **Control**: entirely from the DM screen. The DM can blank it at any time.

## Cross-cutting behaviour

- **Linking**
  - Encounters link to LegendKeeper pages.
  - Search results show the lore pages that mention them.
  - LegendKeeper pages show the encounters linked to them.
- **Pins**: anything can be pinned to the current session.
- **Keyboard**: no global shortcuts for search or for switching screens. Space advances to the next turn.
- **Storage**: characters, encounters, notes and settings are stored locally, per campaign.

## Open questions before building

1. **LegendKeeper access.** Check whether LegendKeeper offers an API or export. If it doesn't, the reader needs an imported export file or an embedded web view.
2. **Rules data source.** Decide which source to use (e.g. SRD data files) and how licensed books or homebrew get added.
3. **Desktop framework.** For example Electron or Tauri. It must support a second window on another display.
4. **Prep mode.** The Landing header lists a Prep mode button, but its behaviour is undefined. It is left out of Home until decided.
