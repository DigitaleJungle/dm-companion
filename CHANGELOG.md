# Changelog

All notable changes to DM Companion. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions: **patch** = a fix or a change to existing functionality, **minor** = new functionality, **major** = an entire set of features.

## [0.5.17] - 2026-10-24

### Added

- Actions tab: Standard actions, Bonus actions and Reactions lines, with the character's own features (Cunning Action (Dash, Disengage, Hide)); each opens its rules
- A time filter under the tabs (Action, Bonus action, Reaction, Other) for the Actions, Spells and Features & traits tabs
- Saving throws panel: resistances and immunities from feats, items in use, class features and species traits, each with its source on hover; an Elf's Magical sleep immunity

### Changed

- Actions tab: features drawing from a pool are bundled under it (Divine Sense and Sacred Weapon under Channel Divinity)
- Condition immunities are listed with the other immunities

### Fixed

- Table columns keep their width when filtered

## [0.5.16] - 2026-10-24

### Added

- Features & traits tab: a table like the Spells tab, with when each is used (A, BA, R), uses to tick off and which rest gives them back
- Features & traits tab: a checkbox to show a feature on the Actions tab; the popup says where it comes from
- Feature popups: a Usage section to fill in once (usage, number of uses, rests, time, range, damage, save, draws from), kept app-wide
- Features that draw from a pool (Turn Undead, Divine Sense, Sacred Weapon from Channel Divinity) tick the pool's uses
- Cast offers a feature's free cast (Paladin's Smite, Magic Initiate) and ticks its use instead of a slot
- A long rest gives Heroic Inspiration with the Human's Resourceful

### Changed

- Actions tab: the Weapons group is called Attacks

### Fixed

- Channel Divinity's short rest gives back one use, not all
- A feature's popup shows that class's feature, not another class's of the same name
- A background's feat saved with its choice (Magic Initiate (Wizard)) now finds its rules text

## [0.5.15] - 2026-10-23

### Added

- Spells tab: a Cast button before each spell; it uses a slot of the spell's level or higher (a menu when there's a choice) and starts concentration for a concentration spell
- Spells tab: the spell being concentrated on glows like the header card, easing in and out
- Actions tab: Unarmed Strike (Damage, Grapple, Shove), its name opening the rule

### Changed

- Spells tab: the same table design as the Actions tab, more compact; long ranges are cut off with … and shown whole on hover
- Actions tab: spells moved to the Spells tab
- A short or long rest ends concentration

## [0.5.14] - 2026-10-23

### Added

- Actions tab: a gold star after a weapon you have mastery in; hovering it shows what the mastery does, with its name in bold
- Actions tab: a round P after a weapon the character is proficient with
- Item preview: reach, range, damage (with the versatile die), damage type, armor class, Strength needed, Stealth, properties, mastery, weight and cost
- Character switcher: + New character, in the same campaign

### Changed

- Actions tab: Hit/DC and Damage columns 72 px with same-size centered boxes, Notes 150 px, notes separated by commas

### Fixed

- Weapon and armor proficiencies from the class were never found, so every weapon showed as not proficient and attack bonuses left out proficiency

## [0.5.13] - 2026-10-23

### Added

- Inventory: item names open a window with all the item's information; custom items can be edited there (weight, price, armor, weapon, description)
- Inventory: buy items with coins, see prices in the search, drag items to reorder them

### Changed

- Inventory: one always-visible add bar with Add and Buy; adding an item again gives a separate line
- Inventory: quantities and coins have + and − buttons; quantity can go to 0, which counts as unequipped; taking a coin you don't have breaks a bigger one
- Action and inventory item names open their rules

## [0.5.12] - 2026-10-23

### Changed

- Subclass cards are tall, shaped like the subclass art, with odd-shaped pictures shown whole on a blurred copy

### Fixed

- Prepared ticks on the Spells tab survive a level change; spells from levels are changed under Edit → Levels
- Spells granted by feats, species and invocations show their real names
- Changing the class no longer drops the new class's own saving throw
- A new avatar is saved before the old original is removed
- Names like Hunter's Mark are capitalized correctly

## [0.5.11] - 2026-10-23

### Added

- Character avatar: pick a picture in Basic info, drag it to center the crop, remove it with the red cross; it shows on the character cards and the sheet
- Clicking the portrait on the character sheet shows the picture at its original size (the full picture is kept beside the character's file)

## [0.5.10] - 2026-10-23

### Added

- Invocations and other optional features ask their own choices: Pact of the Tome's spells, Lessons of the First Ones' feat, the cantrip Agonizing Blast applies to; their spells reach the Spells tab; repeatable ones can be taken again
- Species and background choices in the wizard: a species' feat and lineage spells, background tool choices and the background feat's choices
- Languages: Common plus two standard languages (given ones count), and extra languages; chosen tools and languages show on the sheet

### Changed

- Edit character: every step can be opened directly and saved from any step; steps that need changes get a red dot
- Hit points: Manual roll replaces Type a number and adds CON like a roll

### Fixed

- Editing a character kept its background, ability bonuses and skills
- Weapon masteries and properties stored as objects broke the levels panel

## [0.5.9] - 2026-10-23

### Added

- Starting class step: a Level picker with Configure, which opens the levels panel to make each level's choices while creating or editing a character

### Changed

- Character sheet: the character dropdown is labelled after the campaign's party, or Unassigned characters
- Feats with an ability score prerequisite show (check prerequisite) while the scores aren't chosen yet

## [0.5.8] - 2026-10-23

### Changed

- Campaign sidebar: the campaign switcher lists only campaigns; clicking DM Companion at the top left goes to the Start screen.

## [0.5.7] - 2026-10-23

### Changed

- Characters overview: the card menu shows no copy item when there's no other campaign, and puts several campaigns in a Copy to submenu.

## [0.5.6] - 2026-10-23

### Changed

- Releases: the version bump writes the changelog entries itself, and dates them in local time instead of UTC.

## [0.5.5] - 2026-10-22

### Added

- Campaign sidebar: **Characters** opens the characters of that campaign, with search, filters, sorting, copy, delete and Create character (starting in this campaign).

### Changed

- Character sheet: **Back** returns to the characters list it was opened from.

## [0.5.4] - 2026-10-22

### Added

- Character sheet: **Edit sheet** opens the character wizard filled in, to change name, player, species, class, background, abilities and skills. The species, class and background steps say what changing them affects; saved skill picks and ability bonuses are kept where possible, and everything from play (damage taken, conditions, inventory, notes) stays.

## [0.5.3] - 2026-10-22

### Changed

- Character sheet top bar: the character switcher and the save status sit on the left, next to Back. The save status shows a green dot when saved, a grey dot for unsaved changes and a spinner while saving.

## [0.5.2] - 2026-10-22

### Changed

- Character sheet inventory: matching items show in a list floating below the search field instead of pushing the page down. It closes on Escape or when you click away.

## [0.5.1] - 2026-10-22

### Added

- Notifications: short confirmations (a character copied or deleted, a rest taken, a hit die spent) pop up in the bottom-right corner, one at a time. They go away after 5 seconds or when clicked.

## [0.5.0] - 2026-10-22

### Added

- Character sheet: open a character from the overview. Every change saves on its own; characters in an archived campaign open read-only.
- Header card with conditions (add and remove), speed, Heroic Inspiration, armor class (computed from armor and Dexterity, or set by hand), initiative, proficiency bonus, and hit points with damage, healing, temporary hit points, a colour-coded bar and death saves at 0.
- Abilities, saving throws, passive Perception, Insight and Investigation, armor, weapon, tool and language proficiencies, and skills.
- Tabs: Actions (attacks with equipped weapons), Spells (spellcasting numbers, a Concentrating toggle and spell slots), Inventory (catalog or custom items, equipped, attuned, coins and carrying capacity), Features & traits, and Notes & backstory.
- Short rest (spend hit dice) and Long rest, and a switcher to the other characters in the same campaign.
- Characters overview: delete a character, after a confirmation.

## [0.4.9] - 2026-10-21

### Added

- Characters overview: search by name or class, filter on campaign, class and level, and sort by name, campaign or level.

## [0.4.8] - 2026-10-21

### Changed

- The Settings gear is on every screen, always in the bottom-left corner. The app-wide Characters and Library pages now have it too.
- Library: the book list on the left scrolls on its own, below a fixed title, filter box and buttons, and stops above the corner Settings gear so the gear never covers a book.

## [0.4.7] - 2026-10-21

### Changed

- Library catalog: the Source column shows the book's full name instead of its abbreviation, and sorts by it.
- Entry pages and previews show the book's full name with its abbreviation in brackets, e.g. "Elemental Evil Player's Companion (EEPC), page 12".
- Library and Catalog: a filter box above the book list finds books by name or abbreviation. In the Catalog, Select all / Deselect all act on the books the filter shows.

### Fixed

- Sources that aren't in the archive's book or adventure lists (such as EEPC, the Plane Shift series and Unearthed Arcana) now get their full name on import. They also appear in the Catalog's book list and in Campaign settings → Sourcebooks. Re-import your rules data to pick this up.

## [0.4.6] - 2026-10-21

### Changed

- Library: the catalog table's header row stands apart from the rows, with a tinted background, a stronger divider and small uppercase labels.

## [0.4.5] - 2026-10-21

### Changed

- Library: alphabetical order ignores punctuation and a leading "the", "a" or "an", in the catalog table and the book lists.

## [0.4.4] - 2026-10-21

### Changed

- The sidebar campaign switcher opens a dropdown: Home (back to the Start screen) and your active campaigns, with a green check on the current one.

## [0.4.3] - 2026-10-20

### Changed

- Create character: each step's content sits in a centred panel, and the steps are centred at the top.
- Every required field in the wizard is marked with *.
- The ability cards no longer repeat the bonus line; the bonuses are still counted in the score.

### Fixed

- A double divider under the Features heading of a class entry (also in the Library).

## [0.4.2] - 2026-10-20

### Changed

- Create character opens as a modal over the Characters overview instead of its own page; closing with unsaved input asks first.
- Back and Next sit at the top right of every step; required fields are marked with *; the campaign explanation is an (i) tip.
- Species: a more compact entry, with the lineage select placed under the trait it changes and size or subspecies under the title.
- Abilities: the method is a dropdown, and the six abilities are cards in one row showing the score, bonus, modifier and saving throw as soon as a value is set.
- Skills are modern toggle chips.
- Review names the species by its chosen version, e.g. "Dragonborn (Black)".

## [0.4.1] - 2026-10-20

### Added

- Create character: a seven-step wizard (basic info, species, class, background, abilities, skills, review) that builds a level 1 character from the imported rules data. A campaign limits the choices to its sourcebooks; "No campaign" offers every book.
- Abilities by standard array, manual entry or rolling 4d6 (drop lowest), with background and species bonuses.
- Skill choices from the class, background and species, with the granted skills already ticked.
- Characters without a campaign, stored app-wide and copyable into a campaign.
- A dice roller in the backend for dice notation like 4d6kh3 or 2d20kh1+4.

## [0.4.0] - 2026-10-20

### Added

- Characters overview, opened from a new Characters button on the Start screen: every character from every campaign as a card with avatar (subclass or class art, else a person icon), name, class and subclass (multiclass supported), total level and campaign.
- Copy a character into another active campaign from its card menu.
- A Create character button, coming soon.

## [0.3.5] - 2026-10-20

### Changed

- Development runs (`npm run app`) keep their own data folder, separate from the installed app, and the window title says "(dev)". A debug build without the dev config refuses to start.

## [0.3.4] - 2026-10-20

### Added

- Campaign settings: a search field above the sourcebooks filters them by name or abbreviation; Select all and Deselect all act on the books shown.

## [0.3.3] - 2026-10-20
### Added
- Campaign settings, opened from a cog next to the campaign switcher or from a campaign's cog in Settings → Campaigns: rename inline, archive or restore, choose the campaign's sourcebooks, and delete it permanently (archived or not).
- Campaign library in the campaign sidebar: Reading and Catalog limited to the campaign's sourcebooks. A preview from a book the campaign doesn't use shows a banner with "Add it to this campaign".
### Changed
- Settings → Campaigns lists campaigns with a cog each instead of inline Rename, Archive, Restore and Delete buttons.
- New and existing campaigns start with no sourcebooks; pick them in Campaign settings.

## [0.3.2] - 2026-10-20
### Changed
- The Library Catalog is now a table like a reference site: tabs All, Rules, Player, Reference and DM Tools with category sub-tabs, a search box with result count, filter checkboxes per category, sortable columns specific to each category, and pages of 50. Clicking a row opens the entry; Back returns to the same filters and page.
- A Books column with checkboxes (Select all / Deselect all) hides books from the Catalog; the choice is remembered.
### Fixed
- Creatures with a choice of types (such as the Empyrean) show "Celestial or Fiend" instead of "[object Object]".
- Actions with a written-out time (such as "Varies") no longer show "undefined".

## [0.3.1] - 2026-10-20
### Added
- Settings → Theme → Animations: System, On or Off. System follows the operating system's reduce-motion setting; On animates even when the OS has animations turned off.
### Changed
- Clicking a chapter or section in the Library's contents now scrolls smoothly to it, and a newly opened chapter glides from its top to the section. Your own scrolling interrupts the animation.

## [0.3.0] - 2026-10-20
### Added
- Library, opened from the Library button at the top right of the start screen. The Reading tab has your books, a collapsible table of contents and the chapter text, with tables, insets, embedded stat blocks and imported images. Clicking a section jumps straight to it.
- Catalog tab: browse spells, creatures, items, feats, classes, rules and more by category, with a filter and a full entry view (spell details, creature stat blocks with spellcasting, item rarity, feat prerequisites, class features).
- References in the text open a preview card next to them. References inside the card can be followed and returned from.
- Traps and hazards are now imported.
### Fixed
- Cross-reference and filter tags no longer show stray text (such as "x" or "class=Warlock") in the reader or the search index. Import your data again to update the search index.

## [0.2.2] - 2026-10-20
### Added
- The app remembers its window size (and whether it was maximized) from the last session. It opens at that size straight away, with no visible resize or blank window on startup.

## [0.2.1] - 2026-10-20
### Fixed
- Importing an images archive as rules data, or rules data as images, is now refused within a second with a message saying which import to use. It used to read the whole archive first, or accept the wrong file. Your existing data is never touched.

## [0.2.0] - 2026-10-19
### Added
- Settings → Rules data: import 5etools-format rules data from a .tar.gz file on your computer. It's processed into a local library (books, chapters, spells, creatures, items, classes and more, plus a search index), and a failed import keeps your previous data.
- Optional images, imported from a second .tar.gz and removable.
- A version check against a GitHub repository you choose. It tells you when a newer release is available; you import the new file to update.
- Books and sources table with a filter and checkboxes, to remove what you don't use in one step. Removed sources stay out of future imports until you allow them again.
### Changed
- The Settings dialog is wider, keeps the same size on every tab, and only its content scrolls.
- Settings uses sentence-case headings, with fewer descriptions; the rest are in (i) tooltips.

## [0.1.4] - 2026-10-19
### Added
- A start screen when the app opens: no sidebar, a prominent search bar, your campaigns (most recently opened first) and a field to create a new one, plus the Settings gear and the app version.
- Campaigns are saved locally, each in its own folder. Opening one shows its Home with the sidebar, and the campaign button in the sidebar returns to the start screen.
- Settings → Theme: an Appearance dropdown with System, Light and Dark. System follows the operating system live, and the choice is saved and applied on startup without a flash.
- Settings → Campaigns: add, rename and archive campaigns. Archived campaigns keep their data and can be restored, and only archived campaigns can be deleted permanently, after a confirmation.
- Up and Down arrow keys move between the Settings sections.
### Changed
- Home shows the campaign's name as its title.
- The search bar's placeholder text is smaller and quieter.

## [0.1.3] - 2026-10-19
### Added
- The Home cards can be rearranged. Each card has a ⋯ menu with Move left, Move right and Remove, and a drag handle that shows on hover. Removed cards come back through the "+ Add card" tile, and a removal can be undone.
- The card order is saved and kept between restarts.
### Changed
- The search bar is now at the top of every screen and stays visible while scrolling. Search is no longer a sidebar item.
- Removed the keyboard shortcuts for search (Ctrl K) and for switching screens (F1–F5).

## [0.1.2] - 2026-10-19
### Added
- A Settings panel, opened from the gear button at the bottom left of the sidebar. It has no settings yet.

## [0.1.1] - 2026-10-19
### Changed
- On narrow windows, the sidebar now hides behind a menu button and slides in as a drawer. Escape, clicking outside, or moving to another screen closes it.

## [0.1.0] - 2026-10-19
### Added
- App shell: sidebar with the campaign switcher, navigation with shortcut hints, and the player-screen box. It stacks above the content on narrow windows.
- Home screen layout: the header, a large search bar, and cards for prepared encounters, party, LegendKeeper, session notes, continue where you left off, and quick tools.
- A modern, clean design with light and dark mode that follow the system setting.
- F1 goes to Home.
### Changed
- Features that aren't built yet are shown disabled, with "Coming soon".
- The window opens at 1280×800.

## [0.0.1] - 2026-10-19
### Added
- README and this changelog.
### Changed
- Every commit must now add a changelog entry. The version bump also updates the README version and starts the changelog section.
- Release notes are taken from the changelog.
### Fixed
- Version tags are now pushed with each commit.

## [0.0.0] - 2026-10-19
### Added
- Tauri 2 + SvelteKit app scaffold with Vitest.
- Versioned commit workflow: a pre-commit hook that requires a version bump and passing checks, and the commit and publish skills.
