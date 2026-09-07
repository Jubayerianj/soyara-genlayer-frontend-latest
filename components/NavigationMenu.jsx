// components/NavigationMenu.jsx

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

const NavigationMenu = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [activePage, setActivePage] = useState('')
  const router = useRouter()

  useEffect(() => {
    setActivePage(router.pathname)
  }, [router.pathname])

  const menuItems = [
    { name: 'Home', path: '/', icon: '🏠' },
    { name: 'Swap', path: '/swap', icon: '🔄' },
    { name: 'AI Agent', path: '/ai', icon: '🤖' },
    { name: 'L1 Swap', path: '/l1', icon: '⚡' },
    { name: 'Pools', path: '/pools', icon: '💧' },
    { name: 'Portfolio', path: '/portfolio', icon: '👤' },
    { name: 'Explore', path: '/explore', icon: '🔍' },
    { name: 'Launch', path: '/launch', icon: '🚀' },
    { name: 'Memefolio', path: '/memefolio', icon: '🔥' },
    { name: 'About', path: '/about', icon: '📊' },
  ]

  return (
    <>
      {/* Desktop Menu - Horizontal */}
      <nav className="desktop-menu">
        <div className="menu-items">
          {menuItems.map((item) => (
            <Link 
              key={item.name}
              href={item.path}
              className={`menu-item ${activePage === item.path ? 'active' : ''}`}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-text">{item.name}</span>
              <div className="active-indicator"></div>
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile Menu Button */}
      <button 
        className="mobile-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        <div className={`hamburger ${isOpen ? 'active' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>

      {/* Mobile Menu - Vertical */}
      <nav className={`mobile-menu ${isOpen ? 'active' : ''}`}>
        <div className="mobile-menu-items">
          {menuItems.map((item) => (
            <Link 
              key={item.name}
              href={item.path}
              className={`mobile-menu-item ${activePage === item.path ? 'active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              <span className="mobile-menu-icon">{item.icon}</span>
              <span className="mobile-menu-text">{item.name}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="menu-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}

      <style jsx>{`
        /* Desktop Menu Styles */
        .desktop-menu {
          display: flex;
          align-items: center;
        }

        .menu-items {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(10, 16, 30, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(56, 189, 248, 0.12);
          border-radius: 16px;
          padding: 5px;
        }

        .menu-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 12px;
          text-decoration: none;
          color: #94a3b8;
          font-weight: 500;
          font-size: 0.85rem;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          white-space: nowrap;
        }

        .menu-item:hover {
          background: rgba(56, 189, 248, 0.08);
          color: #ffffff;
          transform: translateY(-1px);
        }

        .menu-item.active {
          background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(59, 130, 246, 0.25));
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.35);
          font-weight: 600;
        }

        .menu-icon {
          font-size: 0.95rem;
          transition: transform 0.2s ease;
        }

        .menu-item:hover .menu-icon {
          transform: scale(1.1);
        }

        .active-indicator {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 2px;
          background: linear-gradient(135deg, #0284c7, #38bdf8);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .menu-item.active .active-indicator {
          width: 16px;
        }

        /* Mobile Menu Button */
        .mobile-menu-button {
          display: none;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          width: 40px;
          height: 40px;
          background: rgba(10, 16, 30, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .mobile-menu-button:hover {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.4);
        }

        .hamburger {
          display: flex;
          flex-direction: column;
          width: 20px;
          height: 14px;
          position: relative;
        }

        .hamburger span {
          display: block;
          height: 2px;
          width: 100%;
          background: #38bdf8;
          border-radius: 2px;
          transition: all 0.3s ease;
          transform-origin: center;
        }

        .hamburger span:nth-child(1) {
          margin-bottom: 4px;
        }

        .hamburger span:nth-child(2) {
          margin-bottom: 4px;
        }

        .hamburger.active span:nth-child(1) {
          transform: rotate(45deg) translate(6px, 6px);
        }

        .hamburger.active span:nth-child(2) {
          opacity: 0;
        }

        .hamburger.active span:nth-child(3) {
          transform: rotate(-45deg) translate(6px, -6px);
        }

        /* Mobile Menu Styles */
        .mobile-menu {
          position: fixed;
          top: 0;
          right: -100%;
          width: 280px;
          height: 100vh;
          background: rgba(3, 5, 10, 0.98);
          backdrop-filter: blur(20px);
          border-left: 1px solid rgba(56, 189, 248, 0.15);
          z-index: 999;
          transition: right 0.3s ease;
          padding: 80px 20px 20px;
        }

        .mobile-menu.active {
          right: 0;
        }

        .mobile-menu-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .mobile-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-radius: 12px;
          text-decoration: none;
          color: #94a3b8;
          font-weight: 500;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
        }

        .mobile-menu-item:hover {
          background: rgba(56, 189, 248, 0.1);
          color: white;
          transform: translateX(-4px);
        }

        .mobile-menu-item.active {
          background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(59, 130, 246, 0.25));
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.4);
        }

        .mobile-menu-icon {
          font-size: 1.1rem;
        }

        .menu-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(6px);
          z-index: 998;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .desktop-menu {
            display: none;
          }

          .mobile-menu-button {
            display: flex;
          }
        }

        @media (min-width: 769px) {
          .mobile-menu-button,
          .mobile-menu {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .mobile-menu {
            width: 100%;
          }
        }

        :global(html[data-theme='light']) .menu-items {
          background: #ffffff !important;
          border: 1px solid rgba(2, 132, 199, 0.18) !important;
          box-shadow: 0 4px 16px rgba(2, 132, 199, 0.08) !important;
        }

        :global(html[data-theme='light']) .menu-item {
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .menu-item:hover {
          color: #0284c7 !important;
          background: #ffffff !important;
        }

        :global(html[data-theme='light']) .menu-item.active {
          color: #0284c7 !important;
          background: #ffffff !important;
          border: 1px solid #0284c7 !important;
        }

        :global(html[data-theme='light']) .mobile-menu-button {
          background: #ffffff !important;
          border: 1px solid #000000 !important;
        }

        :global(html[data-theme='light']) .hamburger span {
          background: #000000 !important;
        }

        :global(html[data-theme='light']) .mobile-menu {
          background: #ffffff !important;
          border-left: 2px solid #000000 !important;
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.15) !important;
        }

        :global(html[data-theme='light']) .mobile-menu-item {
          color: #000000 !important;
          background: #ffffff !important;
          border: 1px solid #000000 !important;
        }

        :global(html[data-theme='light']) .mobile-menu-item.active {
          color: #0284c7 !important;
          background: #ffffff !important;
          border-color: #0284c7 !important;
        }
      `}</style>
    </>
  )
}

export default NavigationMenu