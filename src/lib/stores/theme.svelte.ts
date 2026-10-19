import { getSettings, setSettings, type Theme } from "$lib/api/settings";
import { errorMessage } from "$lib/api/storage";
import { strings } from "$lib/strings";

// Same key the first-paint script in src/app.html reads.
const CACHE_KEY = "theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function cached(): Theme {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system"; // storage unavailable; the Rust setting still loads below
  }
}

export const theme = $state({ choice: cached(), error: null as string | null });

function apply() {
  const dark = theme.choice === "dark" || (theme.choice === "system" && systemDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem(CACHE_KEY, theme.choice);
  } catch {
    // Only the first-paint cache is lost; the saved setting is unaffected.
  }
}

// "System" follows the OS live.
systemDark.addEventListener("change", apply);

/** Loads the saved theme from Rust at startup. */
export async function loadTheme() {
  try {
    theme.choice = (await getSettings()).theme;
    theme.error = null;
  } catch (e) {
    theme.error = strings.settings.theme.loadError(errorMessage(e));
  }
  apply();
}

export async function chooseTheme(choice: Theme) {
  theme.choice = choice;
  apply();
  try {
    await setSettings({ theme: choice });
    theme.error = null;
  } catch (e) {
    theme.error = strings.settings.theme.saveError(errorMessage(e));
  }
}
