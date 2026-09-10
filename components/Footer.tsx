import * as React from 'react'
import Link from 'next/link'

import { FaEnvelope, FaGithub, FaLinkedin, FaTwitter, FaYoutube } from 'react-icons/fa'
import { IoMoonSharp, IoSunnyOutline } from 'react-icons/io5'

import * as config from '@/lib/config'
import { useDarkMode } from '@/lib/use-dark-mode'

import styles from './styles.module.css'

export const FooterImpl: React.FC = () => {
  const [hasMounted, setHasMounted] = React.useState(false)
  const { isDarkMode, toggleDarkMode } = useDarkMode()

  const onToggleDarkMode = React.useCallback(() => {
    toggleDarkMode()
  }, [toggleDarkMode])

  React.useEffect(() => {
    setHasMounted(true)
  }, [])

  const d = new Date()
  const year = d.getFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.copyright}>
        Copyright {year} {config.author}
        {' · '}
        {/* The only entry point to the archive — an unlinked page is a page
            nobody finds. */}
        <Link href='/archive' className={styles.footerLink}>Archive</Link>
      </div>

      <div className={styles.settings}>
        {hasMounted && (
          // A real <button>, not an <a href="#"> wearing role="button": links
          // do not respond to Space, and the icon left it with no accessible
          // name at all — `title` is not a reliable one.
          <button
            type='button'
            className={styles.toggleDarkMode}
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? <IoMoonSharp aria-hidden /> : <IoSunnyOutline aria-hidden />}
          </button>
        )}
      </div>

      <div className={styles.social}>
        {config.twitter && (
          <a
            className={styles.twitter}
            href={`https://twitter.com/${config.twitter}`}
            title={`Twitter @${config.twitter}`}
            aria-label={`Twitter @${config.twitter}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            <FaTwitter />
          </a>
        )}

        {config.github && (
          <a
            className={styles.github}
            href={`https://github.com/${config.github}`}
            title={`GitHub @${config.github}`}
            aria-label={`GitHub @${config.github}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            <FaGithub />
          </a>
        )}

        {config.linkedin && (
          <a
            className={styles.linkedin}
            href={`https://www.linkedin.com/in/${config.linkedin}`}
            title={`LinkedIn ${config.author}`}
            aria-label={`LinkedIn ${config.author}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            <FaLinkedin />
          </a>
        )}

        {config.newsletter && (
          <a
            className={styles.newsletter}
            href={`${config.newsletter}`}
            title={`Newsletter ${config.author}`}
            aria-label={`Newsletter ${config.author}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            <FaEnvelope />
          </a>
        )}

        {config.youtube && (
          <a
            className={styles.youtube}
            href={`https://www.youtube.com/${config.youtube}`}
            title={`YouTube ${config.author}`}
            aria-label={`YouTube ${config.author}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            <FaYoutube />
          </a>
        )}
      </div>
    </footer>
  )
}

export const Footer = React.memo(FooterImpl)
