"use client";

import { MoonIcon, SunIcon } from "./icons";

/**
 * Flips data-theme on <html> and remembers the choice. The icon is chosen in
 * CSS, so there is no theme state to hydrate.
 */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage unavailable (private mode); the toggle still works for this page view.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:bg-panel-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      aria-label="Toggle light and dark theme"
      title="Toggle theme"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </button>
  );
}
