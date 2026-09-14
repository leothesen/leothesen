/**
 * The reader's theme choice, and the small decisions the theme menu makes.
 *
 * Kept free of React so the rules are testable on their own: what counts as a
 * valid stored choice, what the menu button announces, and where arrow keys
 * move focus.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/*
 * Not next-themes' default `theme` key, on purpose. The old footer button
 * could only store `light` or `dark`, and once it had stored one there was no
 * way back to following the device. A new key means every visitor, including
 * everyone who ever pressed that button, starts on System again.
 */
export const THEME_STORAGE_KEY = 'theme-choice'

/** Anything unrecognised — nothing stored, a stale value — means System. */
export function toThemeChoice(value: string | undefined | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * What the menu button is called for a screen reader. System names what it
 * resolved to, because "System" alone does not say what you are looking at.
 */
export function themeButtonLabel(choice: ThemeChoice, resolved: string | undefined): string {
  if (choice === 'system') {
    return resolved === 'light' || resolved === 'dark'
      ? `Theme: System (currently ${resolved})`
      : 'Theme: System'
  }
  return `Theme: ${choice === 'light' ? 'Light' : 'Dark'}`
}

/**
 * Where focus goes inside the open menu for a key press, following the WAI-ARIA
 * menu pattern: arrows wrap, Home and End jump. Null for keys the menu ignores.
 */
export function nextMenuIndex(current: number, key: string, length: number): number | null {
  if (length <= 0) return null
  switch (key) {
    case 'ArrowDown':
      return (current + 1) % length
    case 'ArrowUp':
      return (current - 1 + length) % length
    case 'Home':
      return 0
    case 'End':
      return length - 1
    default:
      return null
  }
}
