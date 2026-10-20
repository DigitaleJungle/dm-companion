import { getSettings, setSettings, type Animations, type Theme } from "$lib/api/settings";
import { errorMessage } from "$lib/api/storage";
import { strings } from "$lib/strings";

// Same keys the first-paint script in src/app.html reads.
const THEME_KEY = "theme";
const MOTION_KEY = "animations";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const systemReduce = matchMedia("(prefers-reduced-motion: reduce)");

function cached<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback; // storage unavailable; the Rust setting still loads below
  }
}

/** Appearance settings: colour theme and animations. Both follow the OS when set to "system". */
export const theme = $state({
  choice: cached<Theme>(THEME_KEY, ["system", "light", "dark"], "system"),
  animations: cached<Animations>(MOTION_KEY, ["system", "on", "off"], "system"),
  error: null as string | null,
});

/** True when animations should be skipped (the user's choice, or the OS's reduce-motion setting). */
export function reduceMotion(): boolean {
  return theme.animations === "off" || (theme.animations === "system" && systemReduce.matches);
}

function apply() {
  const root = document.documentElement;
  const dark = theme.choice === "dark" || (theme.choice === "system" && systemDark.matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.motion = reduceMotion() ? "reduce" : "full";
  try {
    localStorage.setItem(THEME_KEY, theme.choice);
    localStorage.setItem(MOTION_KEY, theme.animations);
  } catch {
    // Only the first-paint cache is lost; the saved settings are unaffected.
  }
}

// "System" follows the OS live.
systemDark.addEventListener("change", apply);
systemReduce.addEventListener("change", apply);

/** Loads the saved appearance settings from Rust at startup. */
export async function loadTheme() {
  try {
    const saved = await getSettings();
    theme.choice = saved.theme;
    theme.animations = saved.animations;
    theme.error = null;
  } catch (e) {
    theme.error = strings.settings.theme.loadError(errorMessage(e));
  }
  apply();
}

async function save(changes: { theme?: Theme; animations?: Animations }) {
  apply();
  try {
    await setSettings(changes);
    theme.error = null;
  } catch (e) {
    theme.error = strings.settings.theme.saveError(errorMessage(e));
  }
}

export function chooseTheme(choice: Theme) {
  theme.choice = choice;
  return save({ theme: choice });
}

export function chooseAnimations(choice: Animations) {
  theme.animations = choice;
  return save({ animations: choice });
}
