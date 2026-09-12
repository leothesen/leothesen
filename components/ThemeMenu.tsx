import * as React from 'react'
import { IoCheckmark, IoDesktopOutline, IoMoonOutline, IoSunnyOutline } from 'react-icons/io5'

import { useTheme } from 'next-themes'

import {
  nextMenuIndex,
  THEME_CHOICES,
  type ThemeChoice,
  themeButtonLabel,
  toThemeChoice,
} from '@/lib/theme-choice'

const ICONS: Record<ThemeChoice, React.ComponentType<{ 'aria-hidden'?: boolean }>> = {
  system: IoDesktopOutline,
  light: IoSunnyOutline,
  dark: IoMoonOutline,
}

/**
 * System / Light / Dark, from a button in the header.
 *
 * The button shows the reader's *choice*, not the theme it resolved to: on
 * System it stays a monitor whichever way the device leans, so it is always
 * clear that the page is following the device rather than a setting.
 */
export function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const menuId = React.useId()

  // next-themes only knows the stored choice in the browser. Rendering it on
  // the server would guess, and a wrong guess is a hydration mismatch.
  React.useEffect(() => setMounted(true), [])

  const choice = mounted ? toThemeChoice(theme) : 'system'
  const Icon = ICONS[choice]

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  // Opening puts focus on the current choice, as a radio group would.
  React.useEffect(() => {
    if (!open) return
    const current = THEME_CHOICES.findIndex((c) => c.value === choice)
    itemRefs.current[Math.max(current, 0)]?.focus()
    // Only on opening: moving focus with the arrows must not snap it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A press anywhere outside closes it, without stealing focus from wherever
  // that press was going.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'Tab') {
      close(false)
      return
    }
    const current = itemRefs.current.findIndex((el) => el === document.activeElement)
    const next = nextMenuIndex(current, event.key, THEME_CHOICES.length)
    if (next !== null) {
      event.preventDefault()
      itemRefs.current[next]?.focus()
    }
  }

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const choose = (value: ThemeChoice) => {
    setTheme(value)
    close(true)
  }

  return (
    <div className='notion-theme-menu' ref={rootRef}>
      <button
        ref={buttonRef}
        type='button'
        className='notion-theme-trigger breadcrumb button'
        aria-haspopup='menu'
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={mounted ? themeButtonLabel(choice, resolvedTheme) : 'Theme'}
        title='Theme'
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
      >
        {/* Hidden rather than absent until mounted, so the header does not
            shift when the real icon arrives. */}
        <span className='notion-theme-trigger-icon' style={{ visibility: mounted ? 'visible' : 'hidden' }}>
          <Icon aria-hidden />
        </span>
      </button>

      {open && (
        <div id={menuId} role='menu' aria-label='Theme' className='notion-theme-menu-list' onKeyDown={onMenuKeyDown}>
          {THEME_CHOICES.map(({ value, label }, index) => {
            const ItemIcon = ICONS[value]
            const checked = value === choice
            return (
              <button
                key={value}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                type='button'
                role='menuitemradio'
                aria-checked={checked}
                tabIndex={-1}
                className='notion-theme-menu-item'
                onClick={() => choose(value)}
              >
                <ItemIcon aria-hidden />
                <span>{label}</span>
                <IoCheckmark aria-hidden className='notion-theme-menu-check' />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
