import * as React from 'react'

import { IoMoonSharp, IoSunnyOutline } from 'react-icons/io5'
import cs from 'classnames'

import { navigationLinks, navigationStyle } from '@/lib/config'
import { useDarkMode } from '@/lib/use-dark-mode'

import styles from './styles.module.css'

const ToggleThemeButton = () => {
  const [hasMounted, setHasMounted] = React.useState(false)
  const { isDarkMode, toggleDarkMode } = useDarkMode()

  React.useEffect(() => {
    setHasMounted(true)
  }, [])

  return (
    <div
      className={cs('breadcrumb', 'button', !hasMounted && styles.hidden)}
      onClick={toggleDarkMode}
    >
      {hasMounted && isDarkMode ? <IoMoonSharp /> : <IoSunnyOutline />}
    </div>
  )
}

export const NotionPageHeader: React.FC = () => {
  return (
    <header className='notion-header'>
      <div className='notion-nav-header'>
        <a href="/" className="breadcrumb button notion-nav-home">Home</a>

        <div className='notion-nav-header-rhs breadcrumbs'>
          {navigationStyle === 'custom' && navigationLinks?.map((link, index) => {
            if (!link?.pageId && !link?.url) return null
            const href = link.url || `/${link.pageId}`
            return (
              <a
                href={href}
                key={index}
                className={cs(styles.navLink, 'breadcrumb', 'button')}
              >
                {link.title}
              </a>
            )
          })}

          <ToggleThemeButton />
        </div>
      </div>
    </header>
  )
}
