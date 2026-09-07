// components/A2A/PageShell.jsx
//
// One header and one tab control for every agent page.
//
// Each of these pages had grown its own inline-styled header: a different title
// size, a different icon, its own emoji, its own arrow glyph in the link back.
// Three pages of the same product looked like three products, and the emoji did
// the work a heading should do. This is deliberately plain, so what the page
// actually shows is the thing that stands out.

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from '../../styles/A2A.module.css';

/**
 * @param eyebrow  short context label, uppercased by CSS
 * @param title    plain text, no icon and no emoji
 * @param subtitle one line. If it needs two, it belongs in the page, not here
 * @param back     { href, label } for the link out
 * @param actions  right-aligned controls
 */
export function PageHeader({ eyebrow, title, subtitle, back, actions }) {
  return (
    <header className={styles.pageHead}>
      <div>
        {back && (
          <Link href={back.href} className={styles.backLink}>
            <ArrowLeft size={12} /> {back.label}
          </Link>
        )}
        {eyebrow && <span className={styles.pageEyebrow}>{eyebrow}</span>}
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSub}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

/**
 * @param tabs    [{ id, label }]
 * @param active  id
 * @param onChange (id) => void
 */
export function TabBar({ tabs, active, onChange }) {
  return (
    <div className={styles.segmented} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`${styles.segment} ${active === t.id ? styles.segmentActive : ''}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
