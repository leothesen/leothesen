// @vitest-environment jsdom
import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorPage } from '@/components/ErrorPage'
import { Footer } from '@/components/Footer'
import { Page404 } from '@/components/Page404'

const theme = vi.hoisted(() => ({ resolvedTheme: 'light', setTheme: (() => {}) as any }))
vi.mock('next-themes', () => ({ useTheme: () => theme }))
vi.mock('next/head', () => ({ default: () => null }))

beforeEach(() => {
  theme.resolvedTheme = 'light'
  theme.setTheme = vi.fn()
})

describe('Footer', () => {
  it('links to the archive, its only entry point', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'Archive' }).getAttribute('href')).toBe('/archive')
  })

  it('links each configured social account in a new tab', () => {
    render(<Footer />)
    const expected = {
      'GitHub @leothesen': 'https://github.com/leothesen',
      'LinkedIn Leo Thesen': 'https://www.linkedin.com/in/leothesen',
    }
    for (const [name, href] of Object.entries(expected)) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
    expect(screen.getByRole('link', { name: 'Newsletter Leo Thesen' }).getAttribute('href')).toMatch(/^https:\/\/leothesen\.us14\.list-manage\.com\//)
    // Not configured in site.config.ts, so not rendered.
    expect(screen.queryByRole('link', { name: /Twitter/ })).toBeNull()
  })

  it('names the theme toggle by what it will do, and does it', () => {
    render(<Footer />)
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' })
    fireEvent.click(toggle)
    expect(theme.setTheme).toHaveBeenCalledWith('dark')
  })

  it('switches back to light from dark', () => {
    theme.resolvedTheme = 'dark'
    render(<Footer />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(theme.setTheme).toHaveBeenCalledWith('light')
  })
})

describe('Page404', () => {
  const site = { name: 'Leo Thesen', domain: 'leothesen.com', rootNotionPageId: 'x', rootNotionSpaceId: null }

  it('offers the site sections and a way home', () => {
    render(
      <Page404
        site={site}
        sections={[
          { title: 'Ocean', path: '/ocean' },
          { title: 'Mountains', path: '/mountains' },
        ]}
      />
    )
    const sections = screen.getByRole('navigation', { name: 'Sections' })
    expect([...sections.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/ocean', '/mountains'])
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/')
  })

  it('degrades to just the home link without sections', () => {
    render(<Page404 site={site} />)
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeTruthy()
  })

  it('keeps the diagnostic message, below everything else', () => {
    const { container } = render(<Page404 site={site} error={{ statusCode: 404, message: 'Not found "ocean/nope"' }} />)
    const main = container.querySelector('main')!
    const detail = screen.getByText('Not found "ocean/nope"')
    const home = screen.getByRole('link', { name: 'Go to the home page' })
    expect(main.contains(detail)).toBe(true)
    expect(home.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('ErrorPage', () => {
  it('shows the status code', () => {
    render(<ErrorPage statusCode={500} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Error Loading Page')
    expect(screen.getByText('Error code: 500')).toBeTruthy()
  })
})
