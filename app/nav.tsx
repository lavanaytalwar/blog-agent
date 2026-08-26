'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './nav.module.css';

const ITEMS = [
  { href: '/', label: 'Queue' },
  { href: '/generate', label: 'Generate' },
  { href: '/posts', label: 'Posts' },
  { href: '/keywords', label: 'Keywords' },
  { href: '/measurement', label: 'Measurement' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className={styles.nav}>
      {ITEMS.map((item) => {
        const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? `${styles.item} ${styles.active}` : styles.item}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
