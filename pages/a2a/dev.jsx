// pages/a2a/dev.jsx
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import AgentStatusPills from '../../components/A2A/AgentStatusPills';
import SwarmWarRoom from '../../components/A2A/SwarmWarRoom';
import DevSecuritySandbox from '../../components/A2A/DevSecuritySandbox';
import AgentPlayground from '../../components/A2A/AgentPlayground';
import { PageHeader, TabBar } from '../../components/A2A/PageShell';
import styles from '../../styles/A2A.module.css';

export default function A2ADevPage() {
  const [tab, setTab] = useState('studio'); // 'studio' | 'sandbox' | 'swarm'

  return (
    <>
      <Head>
        <title>Agent Studio | Soyara DEX</title>
      </Head>

      <main className={styles.container}>
        <PageHeader
          back={{ href: '/a2a', label: 'Swarm' }}
          eyebrow="Developer"
          title="Agent Studio"
          subtitle="Run the swarm with real policy limits, tamper a signed order to watch settlement refuse it, and check the requirement suite against the live contracts."
          actions={
            <>
              <TabBar
                tabs={[
                  { id: 'studio', label: 'Studio' },
                  { id: 'sandbox', label: 'Tamper' },
                  { id: 'swarm', label: 'Requirements' },
                ]}
                active={tab}
                onChange={setTab}
              />
              <Link href="/a2a/user" className={styles.chip}>Trader</Link>
            </>
          }
        />

        <AgentStatusPills />

        {/* Tab Content */}
        {tab === 'studio' && <AgentPlayground />}
        {tab === 'sandbox' && <DevSecuritySandbox />}
        {tab === 'swarm' && <SwarmWarRoom mode="dev" />}
      </main>
    </>
  );
}
