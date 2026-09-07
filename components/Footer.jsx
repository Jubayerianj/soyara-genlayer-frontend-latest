// components/Footer.jsx
import { useState } from 'react'
import Link from 'next/link'

export default function Footer() {
  const [currentYear] = useState(new Date().getFullYear())

  return (
    <footer className="footer">
      <div className="footer-content">
        {/* Brand Section */}
        <div className="footer-brand">
          <div className="brand-logo">
            <img 
              src="/logo.png"
              alt="Soyara DEX" 
              className="logo-image"
            />
            <span className="logo-text">Soyara DEX</span>
          </div>

          <p className="brand-tagline">
            Next-generation AI-powered decentralized exchange and liquidity infrastructure on GenLayer Testnet.
          </p>
        </div>

        {/* Links Sections */}
        <div className="footer-links">
          <div className="link-section">
            <h4 className="section-title">Navigation</h4>
            <ul className="link-list">
              <li>
                <Link href="/swap" className="footer-link">
                  Swap
                </Link>
              </li>
              <li>
                <Link href="/pools" className="footer-link">
                  Pools & Liquidity
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="footer-link">
                  Portfolio
                </Link>
              </li>
            </ul>
          </div>

          <div className="link-section">
            <h4 className="section-title">Ecosystem</h4>
            <ul className="link-list">
              <li>
                <a 
                  href="https://docs.genlayer.com" 
                  className="footer-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GenLayer Docs
                </a>
              </li>
              <li>
                <a 
                  href="https://explorer.genlayer.com" 
                  className="footer-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Block Explorer
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className="footer-bottom">
        <div className="footer-bottom-content">
          <p className="copyright">
            © {currentYear} Soyara DEX. All rights reserved.
          </p>
        </div>
      </div>

      <style jsx>{`
        .footer {
          background: #000000;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          margin-top: auto;
          position: relative;
          overflow: hidden;
        }

        .footer-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 50px 2rem 40px;
          display: grid;
          grid-template-columns: 1.5fr 2fr;
          gap: 60px;
          align-items: start;
        }

        .footer-brand {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-image {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          object-fit: contain;
        }

        .logo-text {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .brand-tagline {
          color: #64748b;
          line-height: 1.6;
          font-size: 14px;
          max-width: 320px;
        }

        .footer-links {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 40px;
        }

        .link-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .section-title {
          color: white;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .link-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .footer-link {
          color: #64748b;
          text-decoration: none;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .footer-link:hover {
          color: #38bdf8;
          transform: translateX(4px);
        }

        .footer-bottom {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding: 24px 2rem;
          background: rgba(0, 0, 0, 0.3);
        }

        .footer-bottom-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .copyright {
          color: #475569;
          font-size: 13px;
        }

        @media (max-width: 768px) {
          .footer-content {
            grid-template-columns: 1fr;
            gap: 40px;
            padding: 40px 1.5rem 30px;
          }
          .footer-links {
            grid-template-columns: 1fr 1fr;
          }
        }

        :global(html[data-theme='light']) .footer {
          background: #ffffff !important;
          border-top: 1px solid #000000 !important;
        }

        :global(html[data-theme='light']) .logo-text {
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .section-title,
        :global(html[data-theme='light']) .footer-link,
        :global(html[data-theme='light']) .copyright {
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .footer-link:hover {
          color: #0284c7 !important;
        }

        :global(html[data-theme='light']) .footer-bottom {
          background: #ffffff !important;
          border-top: 1px solid #000000 !important;
        }
      `}</style>
    </footer>
  )
}