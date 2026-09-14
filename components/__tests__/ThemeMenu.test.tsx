// @vitest-environment jsdom
import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeMenu } from '@/components/ThemeMenu'

const theme = vi.hoisted(() => ({
  theme: 'system' as string | undefined,
  resolvedTheme: 'light' as string | undefined,
  setTheme: (() => {}) as any,
}))
vi.mock('next-themes', () => ({ useTheme: () => theme }))

beforeEach(() => {
  theme.theme = 'system'
  theme.resolvedTheme = 'light'
  theme.setTheme = vi.fn()
})

const menuButton = () => screen.getByRole('button', { name: /^Theme/ })
const item = (name: string) => screen.getByRole('menuitemradio', { name })

describe('ThemeMenu', () => {
  it('names the button by the choice, and says what System resolved to', () => {
    render(<ThemeMenu />)
    expect(menuButton().getAttribute('aria-label')).toBe('Theme: System (currently light)')
    expect(menuButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('names an explicit choice plainly', () => {
    theme.theme = 'dark'
    theme.resolvedTheme = 'dark'
    render(<ThemeMenu />)
    expect(menuButton().getAttribute('aria-label')).toBe('Theme: Dark')
  })

  it('treats a value it does not recognise as System', () => {
    theme.theme = 'sepia'
    render(<ThemeMenu />)
    expect(menuButton().getAttribute('aria-label')).toBe('Theme: System (currently light)')
  })

  it('opens on the current choice, with only that one checked', () => {
    theme.theme = 'light'
    render(<ThemeMenu />)
    fireEvent.click(menuButton())

    expect(menuButton().getAttribute('aria-expanded')).toBe('true')
    expect(menuButton().getAttribute('aria-controls')).toBe(screen.getByRole('menu').id)
    expect(screen.getAllByRole('menuitemradio').map((el) => el.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ])
    expect(document.activeElement).toBe(item('Light'))
  })

  it('applies a choice, closes, and hands focus back to the button', () => {
    render(<ThemeMenu />)
    fireEvent.click(menuButton())
    fireEvent.click(item('Dark'))

    expect(theme.setTheme).toHaveBeenCalledWith('dark')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(menuButton())
  })

  it('can go back to System, which the old toggle never could', () => {
    theme.theme = 'dark'
    render(<ThemeMenu />)
    fireEvent.click(menuButton())
    fireEvent.click(item('System'))
    expect(theme.setTheme).toHaveBeenCalledWith('system')
  })

  it('moves focus with the arrow keys, wrapping at both ends', () => {
    render(<ThemeMenu />)
    fireEvent.click(menuButton())
    const menu = screen.getByRole('menu')

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(item('Dark'))
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(item('System'))
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(item('Dark'))
  })

  it('opens from the arrow keys on the button', () => {
    render(<ThemeMenu />)
    fireEvent.keyDown(menuButton(), { key: 'ArrowDown' })
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('closes on Escape without choosing, and returns focus', () => {
    render(<ThemeMenu />)
    fireEvent.click(menuButton())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(menuButton())
    expect(theme.setTheme).not.toHaveBeenCalled()
  })

  it('closes on a press outside, without choosing', () => {
    render(
      <>
        <ThemeMenu />
        <p>elsewhere</p>
      </>
    )
    fireEvent.click(menuButton())
    fireEvent.pointerDown(screen.getByText('elsewhere'))

    expect(screen.queryByRole('menu')).toBeNull()
    expect(theme.setTheme).not.toHaveBeenCalled()
  })

  it('stays open for a press inside it', () => {
    render(<ThemeMenu />)
    fireEvent.click(menuButton())
    fireEvent.pointerDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeTruthy()
  })
})
