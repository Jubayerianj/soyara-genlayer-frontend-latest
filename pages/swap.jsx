import { useAccount, useChainId } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import Swap from '../components/swapComponents/Swap';
import { GenLayer } from '../wagmi.config';
import { AlertTriangle } from 'lucide-react';

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const isGenLayer = !chainId || chainId === GenLayer.id;

  return (
    <div className="pageContainer">
      <Head>
        <title>Swap Tokens | Soyara DEX</title>
        <meta name="description" content="Instant low-fee token swaps powered by Soyara DEX on GenLayer. Trade native GEN and verified ERC20 assets with smart routing." />
      </Head>

      {/* Animated background gradient */}
      <div className="bgGradient" />

      {/* Top network warning (if wrong network) */}
      <AnimatePresence>
        {!isGenLayer && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="networkWarning"
          >
            <AlertTriangle size={18} />
            <span>Please switch to GenLayer Testnet to trade</span>
            <button className="warningClose" onClick={() => window.location.reload()}>
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="contentWrapper">
        {/* Main Swap Section */}
        <div className="swapSection">
          <Swap />
        </div>
      </div>

      {/* Global Styles */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #020306;
          color: #f8fafc;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .pageContainer {
          position: relative;
          min-height: calc(100vh - 70px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem 3rem;
          isolation: isolate;
          width: 100%;
          box-sizing: border-box;
        }

        /* Animated gradient background */
        .bgGradient {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #000000;
          z-index: -2;
        }

        .bgGradient::before {
          content: '';
          position: absolute;
          top: 10%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(ellipse, rgba(56, 189, 248, 0.05), transparent 70%);
          animation: pulse 8s ease infinite alternate;
        }

        @keyframes pulse {
          0% { opacity: 0.2; transform: translateX(-50%) scale(0.95); }
          100% { opacity: 0.5; transform: translateX(-50%) scale(1.05); }
        }

        /* Network warning */
        .networkWarning {
          position: fixed;
          top: 1rem;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(90deg, #ef4444, #f97316);
          backdrop-filter: blur(8px);
          border-radius: 60px;
          padding: 0.65rem 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          font-size: 0.82rem;
          z-index: 200;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.2);
        }

        .warningClose {
          background: rgba(0,0,0,0.25);
          border: none;
          color: white;
          padding: 0.2rem 0.65rem;
          border-radius: 40px;
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 600;
        }

        /* Main layout */
        .contentWrapper {
          max-width: 520px;
          width: 100%;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          box-sizing: border-box;
        }

        .swapSection {
          width: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /* Mobile Breakpoints */
        @media (max-width: 768px) {
          .pageContainer {
            padding: 1rem 0.5rem 2.5rem;
          }
          .networkWarning {
            width: 90%;
            text-align: center;
            top: 0.5rem;
            padding: 0.45rem 0.9rem;
            font-size: 0.74rem;
          }
        }
      `}</style>
    </div>
  );
}