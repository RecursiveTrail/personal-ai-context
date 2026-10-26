import { loadColorMode, type ColorMode } from "./store/settingsStore.js";

const THEME_COLOR: Record<ColorMode, string> = {
  light: "#fff8f5",
  dark: "#1c1917",
};

export function applyColorMode(theme: ColorMode): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

applyColorMode(loadColorMode());
