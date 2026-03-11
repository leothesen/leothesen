import { useTheme } from 'next-themes'

export function useDarkMode() {
  const { resolvedTheme, setTheme } = useTheme()

  return {
    isDarkMode: resolvedTheme === 'dark',
    toggleDarkMode: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
  }
}
