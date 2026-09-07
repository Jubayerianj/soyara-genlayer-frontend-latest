// pages/a2a/index.jsx
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight, Bot, Terminal } from 'lucide-react';
import styles from '../../styles/A2A.module.css';

export default function A2APortalGateway() {
  return (
    <>
      <Head>
        <title>Agent to Agent | Soyara DEX</title>
      </Head>

      <main className={styles.container}>
        <section className={styles.heroHeader}>
          <div className={styles.heroTag}>
            <span>GenLayer consensus</span>
          </div>
          <h1 className={styles.heroTitle}>Agent to agent</h1>
          <p className={styles.heroSubtitle}>
            Seven agents price a trade, argue about it, and settle only against a verdict the contract enforces.
          </p>
        </section>

        <div className={styles.gatewayGrid}>
          {/* User Portal */}
          <Link href="/a2a/user" className={styles.portalCard}>
            <div>
              <div className={styles.portalIcon} style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                <Bot size={26} />
              </div>
              <h2 className={styles.portalTitle}>Trader Swarm</h2>
              <p className={styles.portalDesc}>
                Say what you want to trade. Watch the agents price it, question it, and settle it.
              </p>
            </div>
            <div className={styles.portalAction} style={{ color: '#38bdf8' }}>
              <span>Open</span>
              <ArrowRight size={16} />
            </div>
          </Link>

          {/* Dev Portal */}
          <Link href="/a2a/dev" className={`${styles.portalCard} ${styles.portalCardDev}`}>
            <div>
              <div className={styles.portalIcon} style={{ background: 'rgba(244, 114, 182, 0.12)', color: '#f472b6' }}>
                <Terminal size={26} />
              </div>
              <h2 className={styles.portalTitle}>Agent Studio</h2>
              <p className={styles.portalDesc}>
                Run the swarm under your own limits, tamper an order, and watch settlement refuse it.
              </p>
            </div>
            <div className={styles.portalAction} style={{ color: '#f472b6' }}>
              <span>Open</span>
              <ArrowRight size={16} />
            </div>
          </Link>
        </div>
      </main>
    </>
  );
}
