import Link from 'next/link'
import type { Breadcrumb } from '@/lib/types'

function BreadcrumbIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http')) {
    return <img src={icon} alt="" className="breadcrumb-icon-image" />
  }
  return <span className="breadcrumb-icon-emoji">{icon}</span>
}

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link href="/">
            Home
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.href}>
            <span className="breadcrumb-separator" aria-hidden="true">/</span>
            <Link href={item.href}>
              {item.icon && <BreadcrumbIcon icon={item.icon} />}
              {item.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
