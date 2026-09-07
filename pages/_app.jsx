import '../styles/globals.css'
import '@rainbow-me/rainbowkit/styles.css'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { connectorsForWallets, RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { 
  injectedWallet,
  rainbowWallet, 
  coinbaseWallet, 
  walletConnectWallet,
  trustWallet,
  phantomWallet
} from '@rainbow-me/rainbowkit/wallets'
import { createConfig, http } from 'wagmi'

// Import components & contexts
import Header from '../components/common/Header'
import Footer from '../components/Footer'
import { TokenProvider } from '../components/contexts/TokenContext'
import { ThemeProvider, useTheme } from '../components/contexts/ThemeContext'

// GenLayer Network definition
const GenLayer = {
  id: 4221,
  name: 'GenLayer Testnet',
  network: 'genlayer-testnet',
  iconUrl: 'https://docs.genlayer.com/assets/genlayer.png',
  iconBackground: '#000000',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc-bradbury.genlayer.com'],
    },
    public: {
      http: ['https://rpc-bradbury.genlayer.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'GenLayer Explorer',
      url: 'https://explorer-bradbury.genlayer.com',
    },
  },
  testnet: true,
}

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id'

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        injectedWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
        trustWallet,
        phantomWallet
      ],
    },
  ],
  {
    appName: 'Soyara DEX',
    projectId: projectId,
  }
)

const config = createConfig({
  connectors,
  chains: [GenLayer],
  transports: {
    [GenLayer.id]: http('https://rpc-bradbury.genlayer.com'),
  },
  ssr: true,
})

function AppInner({ Component, pageProps }) {
  const router = useRouter()
  const { theme } = useTheme()

  const rkTheme = theme === 'light' 
    ? lightTheme({
        accentColor: '#0284c7',
        accentColorForeground: 'white',
        borderRadius: 'large',
        fontStack: 'system',
      })
    : darkTheme({
        accentColor: '#38bdf8',
        accentColorForeground: '#020306',
        borderRadius: 'large',
        fontStack: 'system',
        overlayBlur: 'large',
      });

  return (
    <RainbowKitProvider theme={rkTheme}>
      <TokenProvider>
        <div className="app-container">
          <Header />
          <main className="main-content">
            <Component {...pageProps} />
          </main>
          <Footer />
        </div>
      </TokenProvider>
    </RainbowKitProvider>
  );
}

export default function App(props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
          },
        },
      })
  )

  return (
    <>
      <Head>
        <title>Soyara DEX - AI-Powered Intelligent AMM on GenLayer</title>
        <meta
          name="description"
          content="Soyara DEX - Decentralized Exchange built on GenLayer Testnet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#020306" />
      </Head>

      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppInner {...props} />
          </ThemeProvider>
        </QueryClientProvider>
      </WagmiProvider>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html,
        body {
          height: 100%;
          margin: 0;
          padding: 0;
          background: var(--background, #000000);
          color: var(--text-primary, #ffffff);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          transition: background-color 0.25s ease, color 0.25s ease;
        }

        html[data-theme='light'],
        body.light-mode,
        .light-mode {
          --background: #ffffff;
          --card-bg: #ffffff;
          --border-color: #000000;
          --text-primary: #000000;
          --text-secondary: #000000;
          background: #ffffff !important;
          color: #000000 !important;
        }

        html[data-theme='light'] body {
          background: #ffffff !important;
          color: #000000 !important;
        }

        html[data-theme='light'] .app-container {
          background: #ffffff !important;
        }

        html[data-theme='light'] .global-header,
        html[data-theme='light'] header {
          background: #ffffff !important;
          border-bottom: 1px solid #000000 !important;
        }

        html[data-theme='light'] footer {
          background: #ffffff !important;
          border-top: 1px solid #000000 !important;
          color: #000000 !important;
        }

        #__next {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .app-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: var(--background, #020306);
          transition: background-color 0.25s ease;
        }

        .main-content {
          flex: 1;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          padding: 0;
        }

        /* RainbowKit Customizations */
        .rk-modal-overlay {
          backdrop-filter: blur(12px) !important;
        }

        ::selection {
          background: rgba(56, 189, 248, 0.35);
          color: #ffffff;
        }

        button, a {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.25);
          border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #38bdf8;
        }
      `}</style>
    </>
  )
}
