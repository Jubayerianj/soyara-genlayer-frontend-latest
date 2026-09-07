import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/swap');
  }, [router]);

  return (
    <>
      <Head>
        <title>Soyara DEX</title>
        <meta name="description" content="Soyara DEX - AI-Powered Decentralized Exchange on GenLayer Testnet" />
      </Head>
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Redirecting to Swap...</p>
      </div>
    </>
  );
}