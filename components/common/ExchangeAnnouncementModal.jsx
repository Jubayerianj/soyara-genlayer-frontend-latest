import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, ArrowRight, Flame, Check, Zap, Waves, ShieldCheck } from 'lucide-react';

export default function ExchangeAnnouncementModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowMute, setDontShowMute] = useState(false);
  const [imgSrc, setImgSrc] = useState('/anft.png');

  // Check localStorage on mount for 6-hour mute duration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissUntil = localStorage.getItem('litvm_announcement_mute_until');
      if (!dismissUntil || Date.now() > Number(dismissUntil)) {
        const timer = setTimeout(() => setIsOpen(true), 400);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleClose = () => {
    if (dontShowMute && typeof window !== 'undefined') {
      const MUTE_6_HOURS = Date.now() + 6 * 60 * 60 * 1000;
      localStorage.setItem('litvm_announcement_mute_until', MUTE_6_HOURS.toString());
    }
    setIsOpen(false);
  };

  const handleAction = (href) => {
    handleClose();
    router.push(href);
  };

  const handleImageError = () => {
    if (imgSrc !== '/logo.png') {
      setImgSrc('/logo.png');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="lagoonOverlay" onClick={handleClose}>
        <motion.div 
          className="lagoonModal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Bioluminescent Deep Oceanic Auras */}
          <div className="lagoonAura auraTopLeft" />
          <div className="lagoonAura auraBottomRight" />
          <div className="lagoonAura auraCenterGlow" />

          {/* Animated Water Ripple & Wave Canvas Background */}
          <div className="waterSurface">
            {/* Ambient Water Caustics Glow */}
            <div className="waterCaustics" />

            {/* SVG Animated Wave Layers */}
            <svg className="waveSvg" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path 
                className="wavePath waveBack" 
                d="M0,0 C150,50 350,-40 500,25 C650,90 900,10 1200,45 L1200,120 L0,120 Z" 
              />
              <path 
                className="wavePath waveMid" 
                d="M0,20 C200,70 420,-10 650,40 C850,90 1050,20 1200,60 L1200,120 L0,120 Z" 
              />
              <path 
                className="wavePath waveFront" 
                d="M0,40 C300,10 450,80 750,30 C950,-10 1100,50 1200,35 L1200,120 L0,120 Z" 
              />
            </svg>
          </div>

          {/* Floating Bioluminescent Bubble Particles */}
          <div className="lagoonBubbles">
            <span className="bubble b1" />
            <span className="bubble b2" />
            <span className="bubble b3" />
            <span className="bubble b4" />
            <span className="bubble b5" />
          </div>

          {/* Header Bar */}
          <div className="lagoonHeader">
            <div className="scarcityBadge">
             {/*  <div className="pulseDot" /> */}
              <Flame size={13} className="flameIcon" />
              <span> Ending Soon </span>

            </div>
            <button className="lagoonClose" onClick={handleClose} aria-label="Close modal">
              <X size={15} />
            </button>
          </div>

          {/* Content Layout */}
          <div className="lagoonBody">
            <div className="cardFlex">
              
              {/* Left: Hydro-Encased NFT Artwork Frame */}
              <div className="nftLagoonWrapper">
                <div className="nftLagoonFrame">
                  {/* Holographic Water Sheen */}
                  <div className="lagoonHoloShine" />
                  
                  {/* Outer Glowing Border Ring */}
                  <div className="frameBorderGlow" />

                  {/* NFT Image */}
                  <img 
                    src={imgSrc} 
                    alt="Athes Genesis Pass Super Contributor NFT" 
                    className="nftThumb"
                    onError={handleImageError}
                  />

                  {/* Genesis Hologram Pill */}
                  <div className="genesisLagoonPill">
                    <Zap size={11} className="zapIcon" />
                    <span>GENESIS PASS</span>
                  </div>
                </div>
                {/* Under-Card Lagoon Glow Reflection */}
                <div className="nftWaterReflection" />
              </div>

              {/* Right: Info & Motivation */}
              <div className="infoSection">
                <div className="titleGroup">
                  <div className="kickerRow">
{/*                     <div className="kickerBadge">
                      <Waves size={12} className="wavesIcon" />
                      <span className="kicker">Athes Genesis Pass</span>
                    </div> */}
                  </div>
                  <h3 className="cardHeading">Super Contributor NFT</h3>
                  <p className="motivateText">
                    Once the remaining passes are minted, Genesis membership closes forever. Secure your lifetime tier now!
                  </p>
                </div>

                {/* Perks Section */}
                <div className="perksStack">
                  <div className="perkRow">
                    <div className="checkBubble">
                      <Check size={12} strokeWidth={3.2} />
                    </div>
                    <div className="perkCopy">
                      <strong>Eligible for Future Rewards</strong>
{/*                       <span>Direct qualification for upcoming native distributions & reward pools of LitvmSwap.</span> */}
                    </div>
                  </div>

                  <div className="perkRow">
                    <div className="checkBubble">
                      <Check size={12} strokeWidth={3.2} />
                    </div>
                    <div className="perkCopy">
                      <strong>Partner & Ecosystem Airdrops</strong>
                     {/*  <span>Priority nomination for strategic ecosystem partner drops & whitelist spots.</span> */}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Blue Lagoon Wave Action Button */}
            <button 
              className="lagoonActionBtn"
              onClick={() => handleAction('/mint')}
            >
              <div className="btnWaveShimmer" />
              <Sparkles size={16} className="btnSparkle" />
              <span>Mint Before Ending</span>
              <ArrowRight size={16} className="actionArrow" />
            </button>
          </div>

          {/* Footer Bar with Mute Option */}
          <div className="lagoonFooter">
            <label className="muteLabel">
              <input 
                type="checkbox"
                checked={dontShowMute}
                onChange={(e) => setDontShowMute(e.target.checked)}
              />
              <span className="customCheckmark" />
              <span>Mute announcements for 6 hours</span>
            </label>
          </div>
        </motion.div>
      </div>

      <style jsx global>{`
        /* Modal Overlay & Backdrop */
        .lagoonOverlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(2, 9, 18, 0.86);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        /* Modal Container - Blue Lagoon Glass */
        .lagoonModal {
          position: relative;
          background: linear-gradient(165deg, rgba(6, 22, 38, 0.95) 0%, rgba(3, 13, 24, 0.98) 60%, rgba(2, 8, 16, 0.99) 100%);
          border: 1px solid rgba(34, 211, 238, 0.35);
          border-radius: 22px;
          width: 100%;
          max-width: 530px;
          overflow: hidden;
          box-shadow: 
            0 28px 75px rgba(0, 0, 0, 0.9),
            0 0 50px rgba(6, 182, 212, 0.22),
            0 0 15px rgba(34, 211, 238, 0.15),
            inset 0 1px 1px rgba(255, 255, 255, 0.15),
            inset 0 0 30px rgba(6, 182, 212, 0.08);
          display: flex;
          flex-direction: column;
        }

        /* Ambient Bioluminescent Glow Auras */
        .lagoonAura {
          position: absolute;
          border-radius: 50%;
          filter: blur(55px);
          pointer-events: none;
          z-index: 0;
        }

        .auraTopLeft {
          top: -70px;
          left: -40px;
          width: 280px;
          height: 180px;
          background: radial-gradient(circle, rgba(0, 240, 255, 0.22) 0%, rgba(6, 182, 212, 0.1) 60%, transparent 80%);
        }

        .auraBottomRight {
          bottom: -70px;
          right: -30px;
          width: 260px;
          height: 170px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.2) 0%, rgba(6, 182, 212, 0.08) 50%, transparent 75%);
        }

        .auraCenterGlow {
          top: 35%;
          left: 30%;
          width: 220px;
          height: 140px;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%);
        }

        /* Animated Water & Waves Background Layer */
        .waterSurface {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .waterCaustics {
          position: absolute;
          inset: 0;
          background: 
            radial-gradient(ellipse at 30% 20%, rgba(34, 211, 238, 0.08) 0%, transparent 45%),
            radial-gradient(ellipse at 80% 80%, rgba(6, 182, 212, 0.07) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 60%, rgba(56, 189, 248, 0.06) 0%, transparent 60%);
          animation: causticsDrift 8s infinite alternate ease-in-out;
        }

        @keyframes causticsDrift {
          0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
          50% { transform: scale(1.08) rotate(1deg); opacity: 1; }
          100% { transform: scale(0.95) rotate(-1deg); opacity: 0.85; }
        }

        .waveSvg {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 200%;
          height: 90px;
          opacity: 0.18;
          transform: translate3d(0, 0, 0);
        }

        .wavePath {
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }

        .waveBack {
          fill: #00f0ff;
          animation: waveMove 14s infinite linear;
        }

        .waveMid {
          fill: #06b6d4;
          opacity: 0.7;
          animation: waveMove 9s infinite linear reverse;
        }

        .waveFront {
          fill: #38bdf8;
          opacity: 0.5;
          animation: waveMove 6s infinite linear;
        }

        @keyframes waveMove {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* Bioluminescent Bubble Particles */
        .lagoonBubbles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
        }

        .bubble {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.8), rgba(0, 229, 255, 0.4) 60%, rgba(6, 182, 212, 0.1));
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
          animation: floatBubble 7s infinite ease-in-out;
        }

        .b1 { width: 5px; height: 5px; left: 12%; bottom: 15px; animation-duration: 6.5s; animation-delay: 0s; }
        .b2 { width: 7px; height: 7px; left: 35%; bottom: 25px; animation-duration: 8.5s; animation-delay: 1.5s; }
        .b3 { width: 4px; height: 4px; left: 68%; bottom: 10px; animation-duration: 5.8s; animation-delay: 3s; }
        .b4 { width: 6px; height: 6px; left: 88%; bottom: 30px; animation-duration: 7.2s; animation-delay: 0.8s; }
        .b5 { width: 5px; height: 5px; left: 52%; bottom: 20px; animation-duration: 9s; animation-delay: 2.2s; }

        @keyframes floatBubble {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          20% { opacity: 0.8; }
          80% { opacity: 0.6; }
          100% { transform: translateY(-110px) scale(1.2); opacity: 0; }
        }

        /* Header Bar */
        .lagoonHeader {
          position: relative;
          z-index: 2;
          padding: 13px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(34, 211, 238, 0.16);
          background: rgba(6, 20, 35, 0.7);
          backdrop-filter: blur(8px);
        }

        .scarcityBadge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(6, 182, 212, 0.14);
          border: 1px solid rgba(34, 211, 238, 0.4);
          color: #22d3ee;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.07em;
          padding: 4px 11px;
          border-radius: 9999px;
          text-transform: uppercase;
          box-shadow: 0 0 14px rgba(6, 182, 212, 0.2);
        }

        .pulseDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #00f0ff;
          box-shadow: 0 0 8px #00f0ff;
          animation: dotPulse 1.6s infinite ease-in-out;
        }

        @keyframes dotPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }

        .flameIcon {
          color: #38bdf8;
          animation: pulseFlame 1.8s infinite ease-in-out;
        }

        @keyframes pulseFlame {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.75; }
        }

        .lagoonClose {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(34, 211, 238, 0.25);
          color: #94a3b8;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .lagoonClose:hover {
          background: rgba(6, 182, 212, 0.2);
          color: #ffffff;
          border-color: rgba(34, 211, 238, 0.6);
          transform: scale(1.06);
        }

        /* Modal Body */
        .lagoonBody {
          position: relative;
          z-index: 2;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .cardFlex {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        /* Left NFT Lagoon Frame & Hydro Styling */
        .nftLagoonWrapper {
          position: relative;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .nftLagoonFrame {
          position: relative;
          width: 122px;
          height: 122px;
          border-radius: 16px;
          overflow: hidden;
          background: #030d17;
          border: 1.5px solid rgba(34, 211, 238, 0.5);
          box-shadow: 
            0 12px 28px rgba(0, 0, 0, 0.75), 
            0 0 24px rgba(6, 182, 212, 0.3),
            inset 0 0 15px rgba(0, 240, 255, 0.15);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          animation: lagoonFloat 4s ease-in-out infinite alternate;
        }

        @keyframes lagoonFloat {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-4px) rotate(0.5deg); }
        }

        .nftLagoonFrame:hover {
          border-color: rgba(0, 240, 255, 0.8);
          box-shadow: 
            0 16px 36px rgba(0, 0, 0, 0.85), 
            0 0 35px rgba(0, 240, 255, 0.45);
        }

        .frameBorderGlow {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          box-shadow: inset 0 0 12px rgba(34, 211, 238, 0.3);
          pointer-events: none;
          z-index: 2;
        }

        .lagoonHoloShine {
          position: absolute;
          inset: -100%;
          background: linear-gradient(
            120deg, 
            transparent 30%, 
            rgba(0, 240, 255, 0.25) 45%, 
            rgba(255, 255, 255, 0.45) 50%, 
            rgba(6, 182, 212, 0.25) 55%, 
            transparent 70%
          );
          pointer-events: none;
          z-index: 3;
          animation: lagoonShimmer 4.5s infinite ease-in-out;
        }

        @keyframes lagoonShimmer {
          0% { transform: translateX(-100%) translateY(-100%); }
          30%, 100% { transform: translateX(100%) translateY(100%); }
        }

        .nftThumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s ease;
        }

        .nftLagoonFrame:hover .nftThumb {
          transform: scale(1.06);
        }

        .genesisLagoonPill {
          position: absolute;
          bottom: 5px;
          left: 5px;
          right: 5px;
          background: rgba(3, 14, 25, 0.92);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(34, 211, 238, 0.5);
          border-radius: 7px;
          font-size: 0.59rem;
          font-weight: 800;
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3.5px;
          padding: 2.5px 0;
          letter-spacing: 0.06em;
          z-index: 4;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        }

        .zapIcon {
          color: #00f0ff;
        }

        .nftWaterReflection {
          width: 85%;
          height: 8px;
          background: radial-gradient(ellipse, rgba(0, 240, 255, 0.35) 0%, rgba(6, 182, 212, 0.1) 60%, transparent 80%);
          filter: blur(4px);
          margin-top: 4px;
        }

        /* Right Content Area */
        .infoSection {
          display: flex;
          flex-direction: column;
          gap: 11px;
          flex: 1;
        }

        .titleGroup {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .kickerRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .kickerBadge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #22d3ee;
        }

        .wavesIcon {
          color: #00f0ff;
        }

        .kicker {
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #38bdf8;
          text-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }

        .cardHeading {
          color: #ffffff;
          font-size: 1.15rem;
          font-weight: 800;
          line-height: 1.2;
          margin: 0;
          letter-spacing: -0.015em;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        }

        .motivateText {
          color: #94a3b8;
          font-size: 0.71rem;
          line-height: 1.4;
          margin: 0;
        }

        .perksStack {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .perkRow {
          display: flex;
          align-items: flex-start;
          gap: 8.5px;
        }

        .checkBubble {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(6, 182, 212, 0.16);
          border: 1px solid rgba(34, 211, 238, 0.45);
          color: #00f0ff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1.5px;
          box-shadow: 0 0 8px rgba(6, 182, 212, 0.25);
        }

        .perkCopy {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .perkCopy strong {
          color: #f8fafc;
          font-size: 0.79rem;
          font-weight: 700;
          line-height: 1.25;
        }

        .perkCopy span {
          color: #94a3b8;
          font-size: 0.69rem;
          line-height: 1.35;
        }

        /* Blue Lagoon Primary Action Button */
        .lagoonActionBtn {
          position: relative;
          width: 100%;
          overflow: hidden;
          background: linear-gradient(135deg, #02122c 0%, #010f39 50%, #020950 100%);
          color: #dfeefd;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 13px;
          padding: 12px 18px;
          font-size: 0.88rem;
          font-weight: 800;
          letter-spacing: 0.01em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 
            0 4px 20px rgba(6, 182, 212, 0.4),
            0 0 25px rgba(0, 240, 255, 0.25),
            inset 0 1px 1px rgba(255, 255, 255, 0.5);
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .btnWaveShimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg, 
            transparent 0%, 
            rgba(255, 255, 255, 0.35) 50%, 
            transparent 100%
          );
          transform: translateX(-100%);
          transition: transform 0.6s ease;
          pointer-events: none;
        }

        .lagoonActionBtn:hover .btnWaveShimmer {
          transform: translateX(100%);
        }

        .lagoonActionBtn:hover {
          background: linear-gradient(135deg, #2587b1 0%, #0597a1 60%, #06b6d4 100%);
          transform: translateY(-1.5px);
          box-shadow: 
            0 6px 26px rgba(4, 116, 124, 0.55),
            0 0 35px rgba(5, 128, 150, 0.4);
          color: #020710;
        }

        .lagoonActionBtn:active {
          transform: translateY(0);
        }

        .btnSparkle {
          color: #020b14;
          transition: transform 0.25s ease;
        }

        .lagoonActionBtn:hover .btnSparkle {
          transform: rotate(15deg) scale(1.15);
        }

        .actionArrow {
          transition: transform 0.22s ease;
        }

        .lagoonActionBtn:hover .actionArrow {
          transform: translateX(4px);
        }

        /* Footer */
        .lagoonFooter {
          padding: 10px 18px;
          border-top: 1px solid rgba(34, 211, 238, 0.12);
          background: rgba(4, 15, 28, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .muteLabel {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 500;
          cursor: pointer;
          user-select: none;
          transition: color 0.15s ease;
        }

        .muteLabel:hover {
          color: #38bdf8;
        }

        .muteLabel input[type="checkbox"] {
          accent-color: #06b6d4;
          width: 14px;
          height: 14px;
          cursor: pointer;
          border-radius: 4px;
        }

        @media (max-width: 520px) {
          .cardFlex {
            flex-direction: column;
            text-align: center;
            gap: 14px;
          }
          .kickerRow {
            justify-content: center;
          }
          .perkRow {
            text-align: left;
          }
          .nftLagoonFrame {
            width: 130px;
            height: 130px;
          }
        }

        /* Light Mode Rules - Pure White, Blue, and Black Palette */
        :global(html[data-theme='light']) .lagoonOverlay {
          background: rgba(0, 0, 0, 0.6) !important;
        }

        :global(html[data-theme='light']) .lagoonModal {
          background: #ffffff !important;
          border: 2px solid #000000 !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18) !important;
        }

        :global(html[data-theme='light']) .lagoonAura,
        :global(html[data-theme='light']) .waterSurface,
        :global(html[data-theme='light']) .lagoonBubbles,
        :global(html[data-theme='light']) .lagoonHoloShine,
        :global(html[data-theme='light']) .frameBorderGlow,
        :global(html[data-theme='light']) .nftWaterReflection {
          display: none !important;
        }

        :global(html[data-theme='light']) .lagoonHeader {
          background: #ffffff !important;
          border-bottom: 1px solid #000000 !important;
        }

        :global(html[data-theme='light']) .scarcityBadge {
          background: #ffffff !important;
          border: 1px solid #0284c7 !important;
          color: #0284c7 !important;
          box-shadow: none !important;
        }

        :global(html[data-theme='light']) .flameIcon {
          color: #0284c7 !important;
        }

        :global(html[data-theme='light']) .lagoonClose {
          background: #ffffff !important;
          border: 1px solid #000000 !important;
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .lagoonClose:hover {
          background: #ffffff !important;
          border-color: #0284c7 !important;
          color: #0284c7 !important;
        }

        :global(html[data-theme='light']) .nftLagoonFrame {
          background: #ffffff !important;
          border: 1px solid #000000 !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        }

        :global(html[data-theme='light']) .genesisLagoonPill {
          background: #ffffff !important;
          border: 1px solid #0284c7 !important;
          color: #0284c7 !important;
        }

        :global(html[data-theme='light']) .genesisLagoonPill span {
          color: #0284c7 !important;
        }

        :global(html[data-theme='light']) .cardHeading {
          color: #000000 !important;
          text-shadow: none !important;
        }

        :global(html[data-theme='light']) .motivateText {
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .perkCopy strong {
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .checkBubble {
          background: #ffffff !important;
          border: 1.5px solid #0284c7 !important;
          color: #0284c7 !important;
          box-shadow: none !important;
        }

        :global(html[data-theme='light']) .lagoonActionBtn {
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
          color: #ffffff !important;
          border: 1px solid #0284c7 !important;
          box-shadow: 0 4px 16px rgba(2, 132, 199, 0.3) !important;
        }

        :global(html[data-theme='light']) .lagoonActionBtn:hover {
          background: linear-gradient(135deg, #0369a1 0%, #075985 100%) !important;
          color: #ffffff !important;
        }

        :global(html[data-theme='light']) .btnSparkle {
          color: #ffffff !important;
        }

        :global(html[data-theme='light']) .lagoonFooter {
          background: #ffffff !important;
          border-top: 1px solid #000000 !important;
        }

        :global(html[data-theme='light']) .muteLabel {
          color: #000000 !important;
        }

        :global(html[data-theme='light']) .muteLabel:hover {
          color: #0284c7 !important;
        }

        :global(html[data-theme='light']) .muteLabel input[type="checkbox"] {
          accent-color: #0284c7 !important;
        }
      `}</style>
    </AnimatePresence>
  );
}
