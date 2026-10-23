# DM Companion — wireframe spec

A desktop app that helps a Dungeon Master prepare and run D&D sessions at the table.
These wireframes define **layout, navigation and behaviour**, not final visual design.
Open the `.html` files in a browser (all sidebar links work), or see `images/` for screenshots.

## Context

- One DM, playing **in person with two screens**: the DM's laptop (main window) and a TV or second monitor facing the players (player display).
- The ruleset is not fixed yet. Rules data, monsters and encounter difficulty thresholds must come from a swappable data source and a per-campaign ruleset setting.
- Lore lives in the DM's **LegendKeeper** world. The app only **reads** it, never edits it.

## Start screen (no wireframe)

- The first screen when the app opens. It has no sidebar.
- **App name** at the top, then a **prominent search bar**. Once search works, it searches rules, monsters, spells and lore across every campaign.
- **Campaigns**: your campaigns, most recently opened first, each with when it was last opened. Picking one opens its Landing screen.
- **New campaign**: a name field and a Create button. Names are required, at most 100 characters, and unique (ignoring case). Creating opens the new campaign.
- **Characters** and **Library** buttons sit at the top right, in that order.
- The Settings gear sits in the bottom-left corner, and the app version is shown small at the bottom.
- The Settings gear is on every screen, always in the bottom-left corner: fixed there on the Start screen and the app-wide Characters and Library pages, and at the bottom of the sidebar inside a campaign.
- Empty state: "No campaigns yet." Campaign folders that can't be read are listed in a warning and left untouched.

## Library (no wireframe)

- Opened from a **Library** button at the top right of the Start screen. It replaces the screen (same window); **Back** returns to the Start screen. Where you are is kept in the address, so back/forward work inside the Library.
- **Reading** tab, three columns:
  - **Library**: the imported books, alphabetical (ignoring punctuation and a leading "the", "a" or "an"), with a filter field that narrows them by name or abbreviation.
  - **Contents**: the book's chapters ("Chapter 1: …", "Appendix A: …") with their sections nested and collapsible. Clicking a chapter opens it; clicking a section opens its chapter and scrolls to it.
  - **Reading pane**: the chapter text with headings, lists, tables, insets, quotes and the stat blocks books embed (loaded as they scroll into view). Images show when they were imported in Settings; nothing is fetched from the internet.
- **Catalog** tab:
  - **Books** column: every source with entries, each with a checkbox, plus a filter field (by name or abbreviation), Select all / Deselect all (acting on the books the filter shows) and a shown/total count. Unticked books are hidden from the Catalog only and remembered app-wide.
  - **Tabs**: All, Rules (rules glossary, actions), Player (spells, classes, subclasses, species, backgrounds, feats, optional features), Reference (items, item properties, item masteries, conditions, diseases, languages, skills, senses) and DM Tools (creatures, hazards, traps). Each tab has its categories as sub-tabs; All lists everything with a Category column.
  - Each category is a **table** with its own columns (e.g. spells: Level, School, Cast Time, Range, Components, Tags; creatures: CR, Type, Size, AC, HP; items: Type, Rarity, Attunement, Weight, Value), always starting with Name and ending with Source (the book's full name). Every column sorts both ways; text sorts ignore punctuation and a leading "the", "a" or "an".
  - A **search** box with a result count, and **filters** as checkbox groups per category (e.g. spell Level, School, Concentration/Ritual; creature CR range, Type, Size; item Category, Rarity, Attunement). Options within a filter combine with OR, filters with AND. Filters with a single option are hidden.
  - 50 rows per page with Previous / Next and "Showing 1–50 of N".
  - Clicking a row opens the entry on its own page with "Back to <category>"; the table keeps its search, filters, sort and page.
- **References** in the text (a spell, creature, condition…) open a **preview card** next to them. References inside the card can be followed, with Back; Escape, ✕ or clicking outside closes it and returns focus.
- Entries show a summary for their type: spells (level, school, casting time, range, components, duration), creatures (size, type, alignment, AC, HP, speed, ability scores, saves, skills, senses, languages, CR, then traits, actions, bonus actions, reactions, legendary actions and spellcasting), items (type, rarity, attunement), feats (prerequisite) and classes (hit die, primary ability, features by level).
- Empty state: "No rules data yet", with a button that opens Settings on Rules data.

## Campaign settings (no wireframe)

- A dialog for one campaign, opened from the cog next to the sidebar's campaign switcher or from a campaign's cog in Settings → Campaigns. One scrolling page:
  - **Name**: shown at the top; **Rename** edits it inline (Enter saves, Escape cancels; same name rules as creating).
  - **Status**: Active with **Archive**, or Archived with **Restore**. Archiving the open campaign returns to the Start screen.
  - **Sourcebooks**: checkboxes for every imported book, a search field that filters them by name or abbreviation, Select all / Deselect all (acting on the books shown) and a selected/total count; changes save immediately. New campaigns start with **no** sourcebooks. An archived campaign's books can't be changed until it's restored.
  - **Delete permanently**: for active and archived campaigns alike, after a "This can't be undone" confirmation. Deleting the open campaign returns to the Start screen.

## Campaign library

- A **Campaign library** item in the campaign sidebar opens the same Reading and Catalog screens inside the campaign shell, showing only the campaign's sourcebooks. With no sourcebooks selected it says so, with a **Choose sourcebooks** button that opens Campaign settings.
- A preview card for an entry from a book the campaign doesn't use still opens, with a banner: "From <book>, which isn't active for <campaign>." **Add it to this campaign** activates that book for the campaign immediately; the banner disappears and the card stays open.

## App shell (all DM screens inside a campaign)

- **Left sidebar**
  - App name: clicking it goes back to the Start screen (also in the narrow-window top bar).
  - Campaign switcher: shows the current campaign; clicking it opens a dropdown of the active campaigns, and picking one opens it. The current campaign has a green check. Every dropdown in the app (filters, sort, settings, wizard choices) has this switcher's look: a bordered button, the value on the left, an up-down chevron on the right; its open list looks like the switcher's menu too (rounded panel with a shadow, grey hover, a green check on the right of the picked value) wherever the system allows styling it (Windows), and is the system list elsewhere. A cog wheel next to it opens **Campaign settings** for this campaign.
  - Navigation: Home, Campaign library, Run encounter, Encounter builder, Characters, LegendKeeper. Search is not a sidebar item.
  - Player-screen status box at the bottom, with a "Blank screen" button.
  - A gear button in the bottom-left corner opens **Settings** as a modal dialog. Escape, the close button or clicking outside closes it. Settings has a side panel listing its sections:
    - **Theme**: an Appearance dropdown with System, Light and Dark. System is the default and follows the operating system live. The choice is saved app-wide (not per campaign) and applies from the very first paint. The player display always stays dark. An **Animations** dropdown (System, On, Off) controls all app animations (drawer, menus, card reordering, scrolling to a section); System follows the operating system's reduce-motion setting.
    - **Campaigns**: an **Add campaign** field (the new campaign is added to the list; Settings stays open), and the active and archived campaigns, each with a cog wheel that opens its **Campaign settings**.
    - **Rules data**: import 5etools-format rules data from a `.tar.gz` on your computer (the app never downloads book content). Import processes it into a local library; a failed import keeps the previous data. Each import first checks that the file is the right kind (rules data vs. images) and stops within seconds with a clear message if not. Shows the installed version and import date. **Updates**: you enter a GitHub `owner/repo`; **Check for updates** compares its latest release version with yours and tells you to import the newer `.tar.gz`. **Images** are optional, imported from a second `.tar.gz` and removable. **Books and sources** is a filterable table of everything imported (name, abbreviation, number of entries), grouped, with a checkbox per source and per group; **Remove selected** removes them in one confirmed step. Removed sources are listed separately and skipped on future imports until **Allow again**. The Settings dialog has a fixed size; only the section content scrolls. An attribution line credits Wizards of the Coast.
- **Global search**: a search bar is always visible at the top of every DM screen and stays in place while the content scrolls. It has no keyboard shortcut.
- Search results, stat blocks and LegendKeeper pages can be opened in **tabs** (see the Search screen).
- The layout must stay usable on a small laptop. When the window gets narrow, the sidebar hides behind a menu toggle in a top bar and opens as a drawer over the content. Escape, clicking outside, or navigating closes it.

## Screens

| File | Screen | Purpose |
|---|---|---|
| `00-landing.html` | Landing | A campaign's home page, opened from the Start screen. |
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
- **Characters overview** (no wireframe), opened from the Start screen's **Characters** button. It replaces the screen; **Back** returns to the Start screen.
  - Inside a campaign, the sidebar's **Characters** item opens the same overview within the campaign shell, showing only that campaign's characters: no Campaign filter and no sort by campaign, "No characters in this campaign yet." when empty, and **Create character** starts with this campaign selected. A character sheet opened from here returns to it with **Back**.
  - Every character from every campaign (active and archived), and those without a campaign, as a card sorted by name. A character belongs to at most one campaign and is stored in that campaign's folder; one without a campaign is stored app-wide and its card says "No campaign".
  - Above the cards: a **search** field (matches the name or the class line, subclass included), **filters** for Campaign, Class (a multiclassed character matches each of its classes) and Level (total level), each offering only values some character has, and **Sort by** Name, Campaign or Level (ties go by name). When nothing matches, a message with a **Clear search and filters** button.
  - A card shows the avatar, name, class with subclass ("Fighter (Champion)", or "Fighter 3 (Champion) / Wizard 2" when multiclassed), total level, and the campaign (tagged "Archived" when it is).
  - Avatar: the character's own picture once Create character exists; until then, and when none was added, the imported art for the subclass, else the class, else a neutral person icon.
  - The card's "…" menu copies the character into another active campaign (as a new, separate character): **Copy to <campaign>** when there's one other active campaign, a **Copy to** submenu listing them when there are several, and no copy item when there's none. **Delete…** removes it for good after a confirmation on the card ("Delete <name>? This can't be undone." with Cancel and Delete). A character in an archived campaign can't be deleted until the campaign is restored.
  - Clicking a card (or its name, from the keyboard) opens the character's **sheet**.
- **Create character** (no wireframe): a seven-step wizard in a large modal over the overview. A stepper shows the steps; **Back** and **Next** sit at the top right of each step, Next is enabled once the step is complete, steps already reached can be revisited, and changing an earlier choice clears the choices that depend on it. Closing (Escape or the close button) with unsaved input asks first ("Discard this character?"). Required fields are marked with *.
  1. **Basic info**: name (required, at most 100 characters), player and campaign. An (i) next to Campaign explains that it limits steps 2–4 to its sourcebooks; "No campaign" offers every imported book.
  2. **Species**: picked in two stages. **First** a grid of large cards with a name filter (name or book, abbreviation or full name): one card per option: reprints of it in other books (the rules data's `reprintedAs`, followed through books the campaign doesn't use) are its versions, and the card shows the newest one the campaign allows, with a "+2 versions" badge when there are more; options that only share a name (Aven in two settings) keep their own cards. Each card shows the entry's imported picture (its initial on a tinted panel when there's none, or no images are imported), the name, the book's full name and a few facts to compare (size, speed, darkvision and other movement). **Then**, after clicking a card, an overview replaces the grid: the picture large on the left; next to it the name with a **← Change species** link (no underline) beside it, back to the grid (the current pick stays highlighted), the book's full name (a **Version** dropdown of the books instead, each with its publication year unless the name already has one, like "Volo's Guide to Monsters (2016)", when the option has several printings; switching clears the choices that depend on it, like picking another card), the facts as chips and the choices (lineage, subspecies for older books, size), without a frame. Under them the full rules text, always shown, without a heading. Coming back to a step that already has a pick opens its overview.
  3. **Class** and 4. **Background**: the same two stages. Class cards show the hit die, primary ability and saving throws; background cards the abilities it raises, its skills and its feat. Sidekick classes aren't offered. The Class step also asks for the **Level** (1–20, default 1): maximum hit points are level 1's plus the fixed value (half the hit die + 1, plus CON, at least 1) per level after it, and hit dice, spell slots and proficiency follow the level. Above level 1 a note says choices from later levels (subclass, ability score improvements, more spells) aren't asked yet. Editing can change the level; keeping the class keeps its subclass. When the entry has starting equipment options, a required **Starting equipment** choice shows with the other choices (Option A: the items and gold; Option B: gold…; anything that comes with every option is listed below). On creating, the picked items go into the inventory, looked up in the rules data for weight, armor and attacks (same item from class and background is one line; one not in the library is kept by name; "any musical instrument" style entries are added by that name), and the gold goes into the coins. Editing doesn't ask for or add starting equipment.
  5. **Abilities**: a Method dropdown: Standard array (15, 14, 13, 12, 10, 8), Manual (3–18) or Roll (4d6, drop the lowest, six times, through the dice parser; the dropped die is shown struck through). The six abilities are cards in one row: the score large, bonuses included (a number field for Manual, a value select underneath for array and rolls, one value per ability), and the modifier and saving throw as soon as that ability has a value. Then the bonuses: from the background (2024: +2/+1 or +1/+1/+1 among its abilities) and from the species (older books), each bonus to a different ability; scores can't go above 20.
  6. **Skills**: skills from the background and species are listed as already proficient; then the class's choice and any species or background choice, as toggle chips. A skill can't be picked twice.
  7. **Review**: every choice (the species named by its chosen version, e.g. "Dragonborn (Black)" or "Elf (Drow Lineage)"), the same ability cards, plus saving throws, proficiency bonus, level 1 hit points, skill bonuses, passive Perception and the background's feat. **Create character** saves it and opens the new character's sheet.
  - Characters start at level 1. Equipment, spells, languages, tools, feat choices, subclass, avatar and alignment come later.
  - States: no rules data imported, a campaign without sourcebooks (with a Choose sourcebooks button), empty filter results, and save errors.
  - States: loading, "No characters yet.", a load error with Retry, and a warning listing character files that couldn't be read (left untouched).
- **Character sheet** (`/characters/<id>`, with `?campaign=<id>` for a character in a campaign). Layout follows `Character Sheets/HeaderB.dc.html`. It replaces the screen, and the Settings gear sits in the bottom-left corner.
  - **Top bar**: on the left **Back** to the Characters list it was opened from (the app-wide one or a campaign's), a dropdown that switches to another character of the same campaign (or another character without a campaign), styled like the campaign switcher (the name with up/down arrows; a green check on the open character), and the save status (a green dot for Saved, a grey dot for Unsaved changes, a spinner while saving); on the right **Short rest**, **Long rest** and **Edit sheet**. Nothing on the sheet rolls dice yet except spending hit dice.
    - **Edit sheet** opens the Create character wizard filled in with the character ("Edit character"; the last step saves with **Save changes**, then the sheet reloads and a notification confirms it). Basic info, species, class, background, abilities and skills can be changed; the campaign can't (use Copy to on the Characters page). Closing with changes asks first.
      - The character file keeps results, not where they came from, so editing rebuilds what it can: skill picks are spread back over the choice groups, standard-array scores get their assignment back, rolled scores come back as six values (without their dice), and the ability bonuses are kept as saved totals ("Your saved ability bonuses are kept…", with **Choose again**).
      - The Species, Class and Background steps show what changing them does. Species: its skill choices and (where it gives them) ability bonuses are asked for again, and size, lineage and subspecies are chosen again. Class: saving throws, the class's skill choices and maximum hit points change and spent spell slots reset; check a hand-set armor class. Background: its ability bonuses and skill choices are asked for again and its feat is replaced. As in creation, changing one of these clears the choices that depend on it.
      - Saving keeps everything from play (current damage, temporary hit points, death saves, conditions, inventory, coins, notes, inspiration, concentration). When the maximum hit points change, the damage already taken carries over. Keeping the class keeps its level.
    - **Short rest** is a menu: **Spend a hit die** (shows how many are left of the total, one per level, the class's die; rolls it plus the CON modifier through the dice parser and heals that much) and **Finish short rest** (brings pact slots back).
    - **Long rest** restores hit points, clears temporary hit points and death saves, brings every slot back and regains half the hit dice (at least one).
  - **Saving**: every change is saved on its own about half a second after it's made, and right away when leaving the sheet. There is no Save button; the top bar shows Unsaved changes / Saving… / Saved, or the error with **Retry**. A save only replaces the file once it's valid; the id and creation time never change.
  - **Read-only**: a character in an archived campaign opens with a banner and every control disabled until the campaign is restored.
  - **Header card**: portrait, name, "Species · Class Level · Background · Played by", and the conditions as chips with ✕, plus **+ Add condition** (a menu of the conditions in the rules data). On the right:
    - **Speed** (the species' walking speed) and a **Heroic Inspiration** toggle; while on, the portrait glows gold.
    - The AC, Init and PB boxes are labelled with their abbreviation and an icon (shield, lightning bolt, star); the full name shows on hover and is what screen readers hear.
    - **Armor class** in a shield shape. 10 + DEX without armor; light armor adds DEX, medium adds DEX up to +2, heavy adds none; an equipped shield adds its bonus. Clicking the number sets it by hand (Unarmored Defense, magic armor); empty goes back to computed.
    - **Initiative** (DEX modifier) and **Proficiency** bonus.
    - **Hit points**: current / max, **Temp** (clicking it sets temporary hit points to the amount; they replace, don't stack), an amount field with a red **−** (damage: temporary hit points first, never below 0, damage at 0 is a failed death save) and a green **+** (heal up to max), and a bar showing how much is left, shading from green at full to red as they run out. At 0 hit points the numbers give way to **Death saves**: three Pass and three Fail circles with the status Dying, Stable or Dead. Healing above 0 clears them.
  - **Left column**: two sub-columns. The first holds the six abilities (full name in bold with the modifier under it, and the score large on the right; two per row), **Saving throws** (proficient ones marked), followed by what the species (or its chosen lineage, e.g. a Dragonborn color or a Tiefling legacy) gives: **Advantage** (save advantages from its trait text, shortened: "Advantage: Charmed condition", "Advantage: INT, WIS, CHA saves"; a sentence with a condition attached, like the Tortle's "Until you emerge…", is shown whole on its own line), then Resistances, Immunities, Condition immunities and Vulnerabilities, each only when it has any; **Senses, Proficiencies & languages**: passive Perception, Insight and Investigation, then armor, weapon, tool and language proficiencies from the class, background and species (fixed ones only; choices come with level up; a category without any is left out). The second holds **Skills** with their ability and bonus, proficient ones marked.
  - **Tabs** (right column; arrow keys move between them): Actions, Spells, Inventory, Features & traits, Notes & backstory. The sheet opens on Actions.
  - **Actions tab**: one row per equipped weapon: name, range (or 5 ft reach), attack bonus (STR, DEX for ranged weapons, the better of the two for finesse; proficiency from the class), damage with its type, and its properties ("Not proficient" when it isn't).
  - **Spells tab**: spellcasting ability, spell save DC (8 + modifier + proficiency) and spell attack bonus, a **Concentrating** toggle (the header card glows violet while on), and the spell slots: one box per slot per spell level, from the class table, pact magic slots on their own row. Choosing and preparing spells comes later.
  - **Inventory tab**: coin boxes (CP, SP, EP, GP, PP), carried weight against the carrying capacity (STR × 15 lb, doubled per size above Medium) with a bar, attuned items out of 3, and **+ Add item**, which opens a search of the item catalog (limited to the campaign's sourcebooks) and a custom item field; adding the same catalog item again raises its quantity. The table: Equip, item, quantity, weight, and notes (armor class, weapon damage, and Attuned for items that need it, at most 3 at once).
  - **Features & traits tab**: cards for the class features up to the character's level (names for now), the species traits (with the start of their text) and feats.
  - **Notes & backstory tab**: Personality traits, Ideals, Bonds, Flaws and Backstory.
  - States: loading, not found (with Back to Characters), a load error with Retry, no rules data (tracking works; numbers from the class and species show "—").
  - Later: Add to encounter, Export PDF.

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

- **Dev and installed app**: the development build keeps its own data folder, separate from the installed app, and its window title says "(dev)".
- **Linking**
  - Encounters link to LegendKeeper pages.
  - Search results show the lore pages that mention them.
  - LegendKeeper pages show the encounters linked to them.
- **Pins**: anything can be pinned to the current session.
- **Keyboard**: no global shortcuts for search or for switching screens. Space advances to the next turn.
- **Storage**: characters, encounters, notes and settings are stored locally, per campaign. A character without a campaign is stored app-wide.
- **Notifications**: short confirmations (a character copied or deleted, a rest taken, a hit die spent) pop up in the bottom-right corner of the DM window. Only one shows at a time; a new one replaces it. It goes away after 5 seconds, or when clicked. Errors stay next to the control that failed.
- **Window size**: the main window opens at the size it had when it was last closed (and maximized if it was), fitted to the current screen. It appears only once it is ready, so the resize is never visible.

## Open questions before building

1. **LegendKeeper access.** Check whether LegendKeeper offers an API or export. If it doesn't, the reader needs an imported export file or an embedded web view.
2. ~~**Rules data source.**~~ Decided: 5etools-format data that the user provides as local `.tar.gz` files and imports in Settings → Rules data. Nothing is bundled or downloaded by the app.
3. **Desktop framework.** For example Electron or Tauri. It must support a second window on another display.
4. **Prep mode.** The Landing header lists a Prep mode button, but its behaviour is undefined. It is left out of Home until decided.
