import { useCallback, useEffect, useState } from 'react'

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const dark = document.body.classList.contains('dark-mode')
    setIsDarkMode(dark)
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
