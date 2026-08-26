import './tokens.css';
import styles from './shell.module.css';
import { Nav } from './nav.js';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'blogEO',
  description: 'Helium content engine',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={styles.page}>
          <aside className={styles.sidebar}>
            <div className={styles.logo}>blogEO</div>
            <Nav />
            <div className={styles.spacer} />
            <div className={styles.footer}>Internal tool · Helium</div>
          </aside>
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
