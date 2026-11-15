'use client';

import { useState, type ReactNode } from 'react';
import styles from './ShowMore.module.css';

/** How many items a collapsed list keeps on phones (also in ShowMore.module.css, li:nth-child(n + 6)). */
const LIMIT = 5;

/**
 * Phones only: a long list shows its first five items and a button for the rest. Wider screens, and the page source,
 * keep the whole list. The list must be the first <ul>/<ol> inside.
 */
export function ShowMore({ count, label, children }: { count: number; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count <= LIMIT) return <>{children}</>;
  return (
    <div className={styles.wrap} data-collapsed={open ? undefined : ''}>
      {children}
      {!open && <button type="button" className={styles.more} onClick={() => setOpen(true)}>{label} ({count})</button>}
    </div>
  );
}
