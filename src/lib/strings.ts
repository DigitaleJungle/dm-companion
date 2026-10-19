// All user-facing text.
export const strings = {
  appName: "DM Companion",
  comingSoon: "Coming soon",

  shell: {
    mainNav: "Main",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    campaign: "Campaign",
    noCampaign: "No campaign",
    nav: {
      home: "Home",
      search: "Search",
      runEncounter: "Run encounter",
      encounterBuilder: "Encounter builder",
      characters: "Characters",
      legendKeeper: "LegendKeeper",
    },
    playerScreen: "Player screen",
    playerScreenStatus: "Not available yet",
    openOnDisplay2: "Open on display 2",
    openSettings: "Settings",
  },

  settings: {
    title: "Settings",
    close: "Close settings",
    empty: "No settings yet.",
  },

  home: {
    noCampaignTitle: "No campaign yet",
    noCampaignText: "Campaigns are coming soon. Your next session, recap and notes will show up here.",
    startSession: "Start session",
    searchLabel: "Search rules, monsters, spells and lore",
    searchPlaceholder: (shortcut: string) => `Search rules, monsters, spells, lore…  (${shortcut})`,
    encounters: {
      title: "Prepared encounters",
      new: "+ New",
      empty: "No prepared encounters yet.",
    },
    party: {
      title: "Party",
      empty: "No characters yet.",
    },
    legendKeeper: {
      title: "LegendKeeper",
      empty: "Not connected.",
    },
    notes: {
      title: "Session notes",
      label: "Notes for the next session",
    },
    continue: {
      title: "Continue where you left off",
      empty: "Nothing yet. Screens you open will show up here.",
    },
    tools: {
      title: "Quick tools",
      rollDice: "Roll dice",
      conditions: "Conditions",
      randomNpcName: "Random NPC name",
      blankPlayerScreen: "Blank player screen",
    },
  },
} as const;
