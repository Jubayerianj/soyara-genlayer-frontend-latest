// pages/a2a/user.jsx
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AgentStatusPills from '../../components/A2A/AgentStatusPills';
import SwarmWarRoom from '../../components/A2A/SwarmWarRoom';
import { PageHeader, TabBar } from '../../components/A2A/PageShell';
import { useNetworkChoice } from '../../lib/studioNext/network';
import styles from '../../styles/A2A.module.css';

// Studio Next has no EVM layer, so the swarm there works against one
// Intelligent Contract that judges and settles. Loaded only when chosen, and
// never on the server: it signs with the RC SDK in the browser.
const StudioSwarmRoom = dynamic(() => import('../../components/A2A/StudioSwarmRoom'), { ssr: false });

export default function A2AUserPage() {
  // Shared with /ai, so a choice made on one page holds on the other.
  const { network, onStudio, choose } = useNetworkChoice();

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
              <TabBar
                tabs={[
                  { id: 'bradbury', label: 'Bradbury' },
                  { id: 'studio-next', label: 'Studio Next' },
                ]}
                active={network}
                onChange={choose}
              />
              <Link href={onStudio ? '/docs?topic=studio-next' : '/docs?topic=swarm'} className={styles.chip}>How it works</Link>
              <Link href="/a2a/dev" className={styles.chip}>Developer studio</Link>
            </>
          }
        />

        <AgentStatusPills />
        {onStudio ? <StudioSwarmRoom /> : <SwarmWarRoom mode="user" />}
      </main>
    </>
  );
}
