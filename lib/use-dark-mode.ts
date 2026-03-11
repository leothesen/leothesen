import { useCallback, useEffect, useState } from 'react'

function getInitialDarkMode(): boolean {
  try {
    const stored = localStorage.getItem('darkMode')
    if (stored !== null) return JSON.parse(stored)
  } catch {}

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  return false
}

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const dark = getInitialDarkMode()
    setIsDarkMode(dark)
    document.body.classList.toggle('dark-mode', dark)
    document.body.classList.toggle('light-mode', !dark)
  }, [])

  // Listen for system theme changes (only when no localStorage override)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem('darkMode') !== null) return
      } catch {}

      setIsDarkMode(e.matches)
      document.body.classList.toggle('dark-mode', e.matches)
      document.body.classList.toggle('light-mode', !e.matches)
    }

    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev
      document.body.classList.toggle('dark-mode', next)
      document.body.classList.toggle('light-mode', !next)
      try {
        localStorage.setItem('darkMode', JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  return { isDarkMode, toggleDarkMode }
}
