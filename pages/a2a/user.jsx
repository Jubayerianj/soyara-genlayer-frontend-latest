// pages/a2a/user.jsx
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AgentStatusPills from '../../components/A2A/AgentStatusPills';
import SwarmWarRoom from '../../components/A2A/SwarmWarRoom';
import { PageHeader } from '../../components/A2A/PageShell';
import styles from '../../styles/A2A.module.css';

export default function A2AUserPage() {
  return (
    <>
      <Head>
        <title>Trader Swarm | Soyara DEX</title>
      </Head>

      <main className={styles.container}>
        <PageHeader
          back={{ href: '/a2a', label: 'Swarm' }}
          eyebrow="Agent to agent"
          title="Trader Swarm"
          actions={
            <>
              <Link href="/docs?topic=swarm" className={styles.chip}>How it works</Link>
              <Link href="/a2a/dev" className={styles.chip}>Developer studio</Link>
            </>
          }
        />

        <AgentStatusPills />
        <SwarmWarRoom mode="user" />
      </main>
    </>
  );
}
