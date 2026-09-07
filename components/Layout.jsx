// components/Layout.jsx

import { useState } from 'react'
import { useRouter } from 'next/router'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import NavigationMenu from './NavigationMenu'
import Footer from './Footer'

export default function Layout({ children }) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="layout">
      {/* Global Header */}
      <header className="global-header">
        <div className="header-container">
          {/* Logo */}
          <div 
            className="logo"
            onClick={() => router.push('/swap')}
          >
            <img src="/logo.png" alt="Soyara DEX" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            <span className="logo-text">Soyara DEX</span>
          </div>

          {/* Desktop Navigation - Center */}
          <div className="nav-section">
            <NavigationMenu />
          </div>

          {/* Wallet Connect & Mobile Menu */}
          <div className="right-section">
            <div className="wallet-section">
              <ConnectButton 
                showBalance={false}
                chainStatus="icon"
                accountStatus="address"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>

      <Footer />

      <style jsx>{`
        .layout {
          min-height: 100vh;
          background: #020306;
          color: #ffffff;
        }

        .global-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background: rgba(3, 6, 14, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(56, 189, 248, 0.12);
        }

        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1400px;
          margin: 0 auto;
          padding: 8px 20px;
          height: 60px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }

        .logo:hover {
          transform: scale(1.02);
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #0284c7, #38bdf8);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 0 12px rgba(6, 182, 212, 0.3);
        }

        .logo-text {
          font-size: 18px;
          font-weight: bold;
          background: linear-gradient(135deg, #ffffff, #93c5fd);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          white-space: nowrap;
        }

        .nav-section {
          display: flex;
          align-items: center;
          flex: 1;
          justify-content: center;
          min-width: 0;
        }

        .right-section {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .wallet-section {
          display: flex;
          align-items: center;
        }

        .main-content {
          margin-top: 60px;
          min-height: calc(100vh - 60px);
        }

        @media (max-width: 768px) {
          .header-container {
            padding: 6px 16px;
            height: 56px;
          }

          .logo-text {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}