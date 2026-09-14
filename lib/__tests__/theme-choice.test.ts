import { describe, expect, it } from 'vitest'

import {
  nextMenuIndex,
  THEME_CHOICES,
  THEME_STORAGE_KEY,
  themeButtonLabel,
  toThemeChoice,
} from '@/lib/theme-choice'

describe('THEME_CHOICES', () => {
  it('lists System first, so it is the first thing the menu offers', () => {
    expect(THEME_CHOICES.map((c) => c.value)).toEqual(['system', 'light', 'dark'])
  })
})

describe('THEME_STORAGE_KEY', () => {
  it('is not the key the old two-way toggle wrote to', () => {
    // Choices stored under `theme` came from a button with no System option.
    // Reading them would pin those visitors to light or dark forever.
    expect(THEME_STORAGE_KEY).not.toBe('theme')
  })
})

describe('toThemeChoice', () => {
  it('keeps an explicit light or dark choice', () => {
    expect(toThemeChoice('light')).toBe('light')
    expect(toThemeChoice('dark')).toBe('dark')
  })

  it('treats nothing stored as System', () => {
    expect(toThemeChoice(undefined)).toBe('system')
    expect(toThemeChoice(null)).toBe('system')
  })

  it('treats an unrecognised value as System rather than trusting it', () => {
    expect(toThemeChoice('sepia')).toBe('system')
    expect(toThemeChoice('')).toBe('system')
  })
})

describe('themeButtonLabel', () => {
  it('says what System resolved to', () => {
    expect(themeButtonLabel('system', 'dark')).toBe('Theme: System (currently dark)')
    expect(themeButtonLabel('system', 'light')).toBe('Theme: System (currently light)')
  })

  it('does not guess before the device preference is known', () => {
    expect(themeButtonLabel('system', undefined)).toBe('Theme: System')
  })

  it('names an explicit choice plainly', () => {
    expect(themeButtonLabel('light', 'light')).toBe('Theme: Light')
    expect(themeButtonLabel('dark', 'dark')).toBe('Theme: Dark')
  })
})

describe('nextMenuIndex', () => {
  it('moves down and wraps from the last item to the first', () => {
    expect(nextMenuIndex(0, 'ArrowDown', 3)).toBe(1)
    expect(nextMenuIndex(2, 'ArrowDown', 3)).toBe(0)
  })

  it('moves up and wraps from the first item to the last', () => {
    expect(nextMenuIndex(1, 'ArrowUp', 3)).toBe(0)
    expect(nextMenuIndex(0, 'ArrowUp', 3)).toBe(2)
  })

  it('jumps to the ends on Home and End', () => {
    expect(nextMenuIndex(1, 'Home', 3)).toBe(0)
    expect(nextMenuIndex(1, 'End', 3)).toBe(2)
  })

  it('ignores keys the menu does not handle', () => {
    expect(nextMenuIndex(1, 'a', 3)).toBeNull()
    expect(nextMenuIndex(1, 'Tab', 3)).toBeNull()
  })

  it('does nothing in an empty menu', () => {
    expect(nextMenuIndex(0, 'ArrowDown', 0)).toBeNull()
  })
})
