import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import cs from 'classnames'

import { navigationLinks, navigationStyle } from '@/lib/config'
import type { SiteSection } from '@/lib/notion-local'
import type { Breadcrumb } from '@/lib/types'

import styles from './styles.module.css'

function BreadcrumbIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http')) {
    return <img src={icon} alt="" className="breadcrumb-icon-image" />
  }
  return <span className="breadcrumb-icon-emoji">{icon}</span>
}

function useScrollDirection() {
  const [hidden, setHidden] = React.useState(false)

  React.useEffect(() => {
    let lastScrollY = window.scrollY

    const onScroll = () => {
      const currentScrollY = window.scrollY
      // Always show header near the top of the page
      if (currentScrollY < 10) {
        setHidden(false)
      } else if (currentScrollY > lastScrollY) {
        setHidden(true)
      } else {
        setHidden(false)
      }
      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return hidden
}

export const NotionPageHeader: React.FC<{
  breadcrumbs?: Breadcrumb[]
  sections?: SiteSection[]
}> = ({ breadcrumbs, sections }) => {
  const hidden = useScrollDirection()
  const router = useRouter()

  return (
    <header className={cs('notion-header', hidden && 'notion-header-hidden')}>
      <div className='notion-nav-header'>
        <nav className="notion-nav-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/" className="breadcrumb button">Home</Link>
          {breadcrumbs?.map((item) => (
            <React.Fragment key={item.href}>
              <span className="breadcrumb-separator" aria-hidden="true">/</span>
              <Link href={item.href} className="breadcrumb button">
                {item.icon && <BreadcrumbIcon icon={item.icon} />}
                {item.title}
              </Link>
            </React.Fragment>
          ))}
        </nav>

        {sections?.length > 0 && (
          <nav className="notion-nav-sections" aria-label="Sections">
            {sections.map((section) => {
              // Also mark the section active while reading anything beneath it.
              const current =
                router.asPath === section.path ||
                router.asPath.startsWith(`${section.path}/`)
              return (
                <Link
                  key={section.path}
                  href={section.path}
                  className={cs('notion-nav-section', current && 'notion-nav-section-current')}
                  aria-current={current ? 'page' : undefined}
                >
                  {section.title}
                </Link>
              )
            })}
          </nav>
        )}

        {navigationStyle === 'custom' && navigationLinks?.length > 0 && (
          <div className='notion-nav-header-rhs'>
            {navigationLinks.map((link, index) => {
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
          </div>
        )}
      </div>
    </header>
  )
}
