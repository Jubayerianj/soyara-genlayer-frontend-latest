// components/common/Header.jsx
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { 
  useAccount, 
  useChainId, 
  useSwitchChain
} from 'wagmi'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Zap, Droplets, User, Sun, Moon, Bot, Sparkles, BookOpen, Terminal, Package } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

import styles from './Header.module.css'

function GlobalMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()

  const menuItems = [
    // One icon treatment for every row. Colouring three of them turned a nav
    // into a set of badges and made the rest look unfinished.
    { label: 'Intro Animation', href: '/intro', icon: <Sparkles size={16} /> },
    { label: 'Swap', href: '/swap', icon: <Zap size={16} /> },
    { label: 'Swarm', href: '/a2a', icon: <Bot size={16} /> },
    { label: 'AI Trading', href: '/ai', icon: <Sparkles size={16} /> },
    { label: 'Pools', href: '/pools', icon: <Droplets size={16} /> },
    { label: 'Portfolio', href: '/portfolio', icon: <User size={16} /> },
    { label: 'Docs', href: '/docs', icon: <BookOpen size={16} /> },
    { label: 'Build Agents', href: '/sdk', icon: <Package size={16} /> },
    { label: 'Dev Portal', href: '/dev', icon: <Terminal size={16} /> },
  ]

  useEffect(() => {
    const handleClickOutside = (event) => {
      const menuEl = document.querySelector(`.${styles.moreMenu}`);
      if (menuEl && !menuEl.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <div className={styles.moreMenu}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsMenuOpen(!isMenuOpen);
        }}
        className={styles.moreButton}
        aria-expanded={isMenuOpen}
        aria-label="Toggle Menu"
      >
        {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={styles.moreDropdown}
          >
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={styles.moreItem}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {(router.pathname === item.href || (item.href === '/swap' && router.pathname === '/')) && <div className={styles.activeDot} />}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const { isConnected, chain } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Brand Area */}
        <div className={styles.brandCluster}>
          <Link href="/swap" className={styles.brandLink}>
            <div className={styles.logoWrap}>
              <img
                src="/logo.png"
                alt="Soyara DEX"
                className={styles.logo}
              />
            </div>
            <div className={styles.brandText}>
              <strong>Soyara DEX</strong>
              <span>GenLayer</span>
            </div>
          </Link>
        </div>

        {/* Desktop-only Navigation Links */}
        <nav className={styles.desktopNav}>
          <Link
            href="/swap"
            className={`${styles.navLink} ${router.pathname === '/swap' || router.pathname === '/' ? styles.navLinkActive : ''}`}
          >
            Swap
          </Link>
          <Link
            href="/a2a"
            className={`${styles.navLink} ${router.pathname.startsWith('/a2a') ? styles.navLinkActive : ''}`}
          >
            Swarm
          </Link>
          <Link
            href="/ai"
            className={`${styles.navLink} ${router.pathname === '/ai' ? styles.navLinkActive : ''}`}
          >
            AI Trading
          </Link>
          <Link
            href="/pools"
            className={`${styles.navLink} ${router.pathname === '/pools' ? styles.navLinkActive : ''}`}
          >
            Pools
          </Link>
          <Link
            href="/portfolio"
            className={`${styles.navLink} ${router.pathname === '/portfolio' ? styles.navLinkActive : ''}`}
          >
            Portfolio
          </Link>
          <Link
            href="/docs"
            className={`${styles.navLink} ${router.pathname === '/docs' ? styles.navLinkActive : ''}`}
          >
            Docs
          </Link>
          <Link
            href="/sdk"
            className={`${styles.navLink} ${router.pathname === '/sdk' ? styles.navLinkActive : ''}`}
          >
            Build Agents
          </Link>
          <Link
            href="/dev"
            className={`${styles.navLink} ${router.pathname === '/dev' ? styles.navLinkActive : ''}`}
          >
            Dev
          </Link>
        </nav>

        {/* Global Actions Area */}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={toggleTheme}
            className={styles.themeToggleBtn}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div className={styles.walletWrap}>
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== 'loading';
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus || authenticationStatus === 'authenticated');

                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            type="button"
                            className={styles.connectWalletBtn}
                          >
                            Connect Wallet
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className={styles.unsupportedChainBtn}
                          >
                            Wrong Network
                          </button>
                        );
                      }

                      return (
                        <div className={styles.connectedCluster}>
                          <button
                            onClick={openChainModal}
                            type="button"
                            className={styles.networkIconOnlyBtn}
                            title={`Network: ${chain.name || 'GenLayer'}`}
                            aria-label="Network"
                          >
                            <img
                              src="https://docs.genlayer.com/assets/genlayer.png"
                              alt={chain.name || 'GenLayer'}
                              className={styles.networkLogoImg}
                              onError={(e) => {
                                e.target.src = '/logo.png';
                              }}
                            />
                          </button>

                          <button
                            onClick={openAccountModal}
                            type="button"
                            className={styles.accountBtn}
                          >
                            {account.displayName}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>

          <GlobalMenu />
        </div>
      </div>
    </header>
  )
}