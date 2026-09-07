// pages/intro.jsx - Responsive HD Cinema Video Experience (SoyaraDex V2 & V3 / Auto-Fit Text)
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Maximize2, 
  Minimize2,
  Bot
} from 'lucide-react';
import { useTheme } from '../components/contexts/ThemeContext';
import styles from '../styles/Intro.module.css';

// Procedural Futuristic Sound FX Synthesizer (Web Audio API)
class VideoAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playTone(freq = 440, type = 'sine', duration = 0.15, gainVal = 0.04) {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  playRobotChirpA() {
    this.playTone(720, 'sine', 0.06, 0.03);
    setTimeout(() => this.playTone(960, 'sine', 0.08, 0.03), 40);
  }

  playRobotChirpB() {
    this.playTone(540, 'triangle', 0.07, 0.03);
    setTimeout(() => this.playTone(820, 'sine', 0.09, 0.03), 50);
  }

  playThreatWarning() {
    this.playTone(160, 'sawtooth', 0.22, 0.05);
    setTimeout(() => this.playTone(130, 'sawtooth', 0.28, 0.06), 100);
  }

  playShieldDeflect() {
    this.playTone(980, 'triangle', 0.16, 0.05);
    setTimeout(() => this.playTone(1450, 'sine', 0.12, 0.03), 50);
  }

  playConsensusChime() {
    this.playTone(440, 'sine', 0.1, 0.03);
    setTimeout(() => this.playTone(554, 'sine', 0.1, 0.03), 60);
    setTimeout(() => this.playTone(659, 'sine', 0.12, 0.03), 120);
    setTimeout(() => this.playTone(880, 'sine', 0.2, 0.04), 180);
  }

  playLaser() {
    this.playTone(700, 'triangle', 0.05, 0.03);
  }
}

const audio = new VideoAudioEngine();

// 5 Story Chapters (Total 54 seconds)
const CHAPTERS = [
  {
    id: 0,
    startTime: 0,
    endTime: 12,
    title: 'A2A Agent Handshake',
    badge: 'ACT I // A2A NEGOTIATION',
    robotStatus: 'A2A ACTIVE'
  },
  {
    id: 1,
    startTime: 12,
    endTime: 23,
    title: 'GenVM Cognitive Shield',
    badge: 'ACT II // MEV DEFENSE',
    robotStatus: 'SHIELD ACTIVE'
  },
  {
    id: 2,
    startTime: 23,
    endTime: 34,
    title: '5-Node Consensus',
    badge: 'ACT III // MULTI-NODE CONSENSUS',
    robotStatus: 'CONSENSUS 100%'
  },
  {
    id: 3,
    startTime: 34,
    endTime: 44,
    title: 'Quantum AGGFlow Routing',
    badge: 'ACT IV // ATOMIC SETTLEMENT',
    robotStatus: 'ROUTING ATOMIC'
  },
  {
    id: 4,
    startTime: 44,
    endTime: 54,
    title: 'Verified Finality',
    badge: 'ACT V // AGENTIC FINALITY',
    robotStatus: 'MISSION COMPLETE'
  }
];

const TOTAL_VIDEO_DURATION = 54; // seconds

export default function ResponsiveAgenticIntroPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const timeRef = useRef(0);
  const isPlayingRef = useRef(true);
  const playbackRateRef = useRef(1);
  const isLightRef = useRef(isLight);

  const [mounted, setMounted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeUI, setCurrentTimeUI] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    isLightRef.current = isLight;
  }, [isLight]);

  // High-DPI 60 FPS HTML5 Canvas Animation Render Loop
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    let lastFrameTime = performance.now();
    let lastUiUpdateTime = 0;
    let lastSoundCheckTime = -1;

    // Floating Hexagons and Star Particles
    const hexParticles = Array.from({ length: 24 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 20 + 8,
      speed: Math.random() * 0.12 + 0.04,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      alpha: Math.random() * 0.35 + 0.1
    }));

    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.8 + 0.6,
      speed: Math.random() * 0.35 + 0.1
    }));

    const render = (now) => {
      const delta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Advance video timeline
      if (isPlayingRef.current) {
        timeRef.current += delta * playbackRateRef.current;
        if (timeRef.current >= TOTAL_VIDEO_DURATION) {
          timeRef.current = 0; // seamless loop
        }
      }

      const t = timeRef.current;
      const lightMode = isLightRef.current;

      // Update UI state throttled to ~10Hz
      if (now - lastUiUpdateTime > 100) {
        lastUiUpdateTime = now;
        setCurrentTimeUI(t);
        const curChap = CHAPTERS.findIndex(c => t >= c.startTime && t < c.endTime);
        const idx = curChap >= 0 ? curChap : CHAPTERS.length - 1;
        setActiveChapterIndex(idx);
      }

      // Audio cues on scene transitions
      const secFloor = Math.floor(t);
      if (secFloor !== lastSoundCheckTime) {
        lastSoundCheckTime = secFloor;
        if (secFloor === 0 || secFloor === 3) audio.playRobotChirpA();
        if (secFloor === 5 || secFloor === 8) audio.playRobotChirpB();
        if (secFloor === 12 || secFloor === 15) audio.playThreatWarning();
        if (secFloor === 17 || secFloor === 20) audio.playShieldDeflect();
        if (secFloor === 23 || secFloor === 28) audio.playConsensusChime();
        if (secFloor === 34 || secFloor === 39) audio.playLaser();
      }

      // Responsive Retina/4K Canvas Configuration
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Dynamic Responsive Scale Factor based on viewport width
      const scaleFactor = Math.max(0.65, Math.min(1.05, width / 880));

      // 1. Clean Background
      if (lightMode) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.05)';
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = '#020409';
        ctx.fillRect(0, 0, width, height);

        // Starfield
        stars.forEach((s) => {
          s.y += s.speed * delta * (1 + (t > 34 ? 1.8 : 0.6));
          if (s.y > 1) s.y = 0;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.beginPath();
          ctx.arc(s.x * width, s.y * height, s.size, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
        ctx.lineWidth = 1;
      }

      // Floating Hexagonal Particle Mesh
      hexParticles.forEach((hp) => {
        hp.y -= hp.speed * delta * 0.4;
        if (hp.y < 0) hp.y = 1;
        hp.rot += hp.rotSpeed;

        ctx.save();
        ctx.translate(hp.x * width, hp.y * height);
        ctx.rotate(hp.rot);
        ctx.strokeStyle = lightMode 
          ? `rgba(2, 132, 199, ${hp.alpha * 0.3})` 
          : `rgba(56, 189, 248, ${hp.alpha * 0.6})`;
        ctx.lineWidth = 1;
        drawHexagon(ctx, 0, 0, hp.size * scaleFactor);
        ctx.stroke();
        ctx.restore();
      });

      const horizonY = height * 0.7;
      const gridVanishingX = width * 0.5;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(gridVanishingX + i * (width * 0.09), height);
        ctx.lineTo(gridVanishingX + i * 20, horizonY);
        ctx.stroke();
      }

      // -------------------------------------------------------------
      // ACT 1: (0s - 12s) A2A Handshake: Trader Bot & Guardian Bot
      // -------------------------------------------------------------
      if (t < 12) {
        const actT = t;
        const bot1X = width * 0.22;
        const bot1Y = height * 0.5 + Math.sin(actT * 2.5) * 6;
        drawTraderBot(ctx, bot1X, bot1Y, 1.1 * scaleFactor, 'proposing', actT, lightMode);

        const bot2X = width * 0.78;
        const bot2Y = height * 0.5 + Math.sin(actT * 2.5 + 1) * 6;
        drawGuardianBot(ctx, bot2X, bot2Y, 1.1 * scaleFactor, 'evaluating', actT, lightMode);

        // Glowing A2A Communication Beam between both bots
        ctx.strokeStyle = lightMode ? 'rgba(2, 132, 199, 0.6)' : 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 2.5 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(bot1X + 35 * scaleFactor, bot1Y - 10 * scaleFactor);
        ctx.lineTo(bot2X - 35 * scaleFactor, bot2Y - 10 * scaleFactor);
        ctx.stroke();

        // Responsive Auto-Fit Holographic Packet Card in Center
        drawHoloCard(ctx, width * 0.5, height * 0.32, 280, 110, 'A2A PROTOCOL V1 // JSON PROPOSAL', [
          'SENDER: ArbitrageAgent_Alpha (0x23D5...)',
          'VALIDATOR: GenLayer GenVM (0xFc77...)',
          'ACTION: SWAP 10,000 USDC ➔ GEN',
          'SLIPPAGE: 0.30% (30 BPS CEILING)'
        ], lightMode, scaleFactor);

        // Data Pulse traveling from Bot 1 to Bot 2
        const pulse = (actT * 1.5) % 1;
        const pulseX = bot1X + (bot2X - bot1X) * pulse;
        ctx.fillStyle = lightMode ? '#0284c7' : '#ffffff';
        ctx.beginPath();
        ctx.arc(pulseX, height * 0.5, 6 * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
      }

      // -------------------------------------------------------------
      // ACT 2: (12s - 23s) GenVM Cognitive Defense (Vaporizing MEV Attack)
      // -------------------------------------------------------------
      else if (t >= 12 && t < 23) {
        const actT = t - 12;
        const bot1X = width * 0.2;
        const bot1Y = height * 0.52 + Math.sin(actT * 2.5) * 6;
        drawTraderBot(ctx, bot1X, bot1Y, 1.0 * scaleFactor, 'idle', actT, lightMode);

        const bot2X = width * 0.5;
        const bot2Y = height * 0.52 + Math.sin(actT * 3) * 6;
        drawGuardianBot(ctx, bot2X, bot2Y, 1.1 * scaleFactor, 'defense', actT, lightMode);

        // Glowing Hexagonal Aegis Shield protecting both agents
        const shieldX = bot2X + 75 * scaleFactor;
        const shieldY = bot2Y - 5 * scaleFactor;
        ctx.save();
        ctx.strokeStyle = lightMode ? '#0284c7' : '#38bdf8';
        ctx.fillStyle = lightMode ? 'rgba(2, 132, 199, 0.1)' : 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = 3.5 * scaleFactor;
        ctx.shadowColor = lightMode ? '#0284c7' : '#38bdf8';
        ctx.shadowBlur = 25;
        drawHexagon(ctx, shieldX, shieldY, (78 + Math.sin(actT * 4) * 4) * scaleFactor);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Red MEV Threat Bot attacking from far right
        const threatX = width * 0.88;
        const threatY = height * 0.44 + Math.sin(actT * 4) * 15;
        drawGlowNode(ctx, threatX, threatY, 26 * scaleFactor, '#ef4444', 'MEV BOT', 'Sandwich Threat', lightMode, scaleFactor);

        // Red Laser hitting shield and shattering
        ctx.strokeStyle = `rgba(239, 68, 68, ${Math.sin(actT * 10) * 0.4 + 0.6})`;
        ctx.lineWidth = 4 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(threatX - 26 * scaleFactor, threatY);
        ctx.lineTo(shieldX + 35 * scaleFactor, shieldY);
        ctx.stroke();

        // Spark particles where laser hits shield
        ctx.fillStyle = lightMode ? '#0284c7' : '#38bdf8';
        for (let i = 0; i < 8; i++) {
          const spAngle = i * (Math.PI / 4) + actT * 8;
          const spX = (shieldX + 35 * scaleFactor) + Math.cos(spAngle) * 16 * scaleFactor;
          const spY = shieldY + Math.sin(spAngle) * 16 * scaleFactor;
          ctx.beginPath();
          ctx.arc(spX, spY, 3.5 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        }

        // Orbiting Python IC Badges (Auto-Fitting Width)
        const pyAngle = actT * 1.5;
        const px1 = shieldX + Math.cos(pyAngle) * 105 * scaleFactor;
        const py1 = shieldY + Math.sin(pyAngle) * 55 * scaleFactor;
        drawGlowPill(ctx, px1, py1, 'AgentValidator.py', '#22c55e', lightMode, scaleFactor);

        const px2 = shieldX + Math.cos(pyAngle + Math.PI) * 105 * scaleFactor;
        const py2 = shieldY + Math.sin(pyAngle + Math.PI) * 55 * scaleFactor;
        drawGlowPill(ctx, px2, py2, '300 BPS HARD CAP', lightMode ? '#0284c7' : '#38bdf8', lightMode, scaleFactor);
      }

      // -------------------------------------------------------------
      // ACT 3: (23s - 34s) 5-Node Optimistic Democracy Swarm
      // -------------------------------------------------------------
      else if (t >= 23 && t < 34) {
        const actT = t - 23;
        const centerX = width * 0.5;
        const centerY = height * 0.52;
        const radius = Math.min(width, height) * 0.32 * scaleFactor;

        // Both Robots collaborating in center
        drawTraderBot(ctx, centerX - 30 * scaleFactor, centerY, 0.8 * scaleFactor, 'proposing', actT, lightMode);
        drawGuardianBot(ctx, centerX + 30 * scaleFactor, centerY, 0.8 * scaleFactor, 'consensus', actT, lightMode);

        // 5 Validator Satellites in Constellation
        const nodeCount = 5;
        const consensusProgress = Math.min(1, actT / 7);

        for (let i = 0; i < nodeCount; i++) {
          const angle = (i * (Math.PI * 2 / nodeCount)) - (Math.PI / 2) + (actT * 0.05);
          const nx = centerX + Math.cos(angle) * radius;
          const ny = centerY + Math.sin(angle) * radius;

          const isApproved = (i / nodeCount) <= consensusProgress;
          const nodeColor = isApproved ? '#22c55e' : (lightMode ? '#0284c7' : '#38bdf8');

          // Lightning connection to center
          ctx.strokeStyle = isApproved 
            ? 'rgba(34, 197, 94, 0.8)' 
            : (lightMode ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.35)');
          ctx.lineWidth = 2.5 * scaleFactor;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(nx, ny);
          ctx.stroke();

          // Satellite Node
          drawValidatorSatellite(ctx, nx, ny, 22 * scaleFactor, nodeColor, `Validator #${i + 1}`, isApproved ? 'Strict Eq Agree' : 'gl.nondet', actT, lightMode, scaleFactor);
        }
      }

      // -------------------------------------------------------------
      // ACT 4: (34s - 44s) Quantum AGGFlow Laser Routing (SoyaraDex V2 & V3)
      // -------------------------------------------------------------
      else if (t >= 34 && t < 44) {
        const actT = t - 34;
        const startX = width * 0.16;
        const midX = width * 0.48;
        const endX = width * 0.84;
        const centerY = height * 0.52;

        // Trader Bot on left receiving settled funds
        drawTraderBot(ctx, startX, centerY, 0.9 * scaleFactor, 'receiving', actT, lightMode);

        // AGGFlow Router Core
        drawGlowNode(ctx, midX, centerY, 36 * scaleFactor, '#0284c7', 'AGGFlow Router', 'Bytecode Aggregator', lightMode, scaleFactor);

        // 3 Settlement Laser Pipes
        const yV2 = centerY - 75 * scaleFactor;
        const yV3 = centerY;
        const yWrap = centerY + 75 * scaleFactor;

        // Stream 1: SoyaraDex V2 (30%)
        ctx.strokeStyle = lightMode ? '#0284c7' : '#38bdf8';
        ctx.lineWidth = 3.5 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(midX + 36 * scaleFactor, centerY);
        ctx.bezierCurveTo(midX + 80 * scaleFactor, centerY, midX + 80 * scaleFactor, yV2, endX - 25 * scaleFactor, yV2);
        ctx.stroke();
        drawGlowNode(ctx, endX, yV2, 22 * scaleFactor, lightMode ? '#0284c7' : '#38bdf8', 'SoyaraDex V2', '30% Classic Pool', lightMode, scaleFactor);

        // Stream 2: SoyaraDex V3 Concentrated (50%)
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 4.5 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(midX + 36 * scaleFactor, centerY);
        ctx.lineTo(endX - 25 * scaleFactor, yV3);
        ctx.stroke();
        drawGlowNode(ctx, endX, yV3, 24 * scaleFactor, '#22c55e', 'SoyaraDex V3', '50% Concentrated', lightMode, scaleFactor);

        // Stream 3: WGEN 1:1 Wrap (20%)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3 * scaleFactor;
        ctx.beginPath();
        ctx.moveTo(midX + 36 * scaleFactor, centerY);
        ctx.bezierCurveTo(midX + 80 * scaleFactor, centerY, midX + 80 * scaleFactor, yWrap, endX - 25 * scaleFactor, yWrap);
        ctx.stroke();
        drawGlowNode(ctx, endX, yWrap, 22 * scaleFactor, '#f59e0b', 'WGEN 1:1', '20% Zero-Fee Wrap', lightMode, scaleFactor);

        // Flowing energy pulses
        const pulse = (actT * 2.5) % 1;
        const pX = startX + (midX - startX) * pulse;
        ctx.fillStyle = lightMode ? '#0284c7' : '#ffffff';
        ctx.beginPath();
        ctx.arc(pX, centerY, 6 * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
      }

      // -------------------------------------------------------------
      // ACT 5: (44s - 54s) Multi-Agent Swarm & Verified Seal
      // -------------------------------------------------------------
      else {
        const actT = t - 44;
        const centerX = width * 0.5;
        const centerY = height * 0.54;

        // Swarm of Autonomous Agent Bots flying across
        const swarmCount = 8;
        for (let i = 0; i < swarmCount; i++) {
          const swAngle = (i * (Math.PI * 2 / swarmCount)) + actT * 0.7;
          const swRadius = (150 + Math.sin(actT * 2 + i) * 25) * scaleFactor;
          const bx = centerX + Math.cos(swAngle) * swRadius;
          const by = centerY + Math.sin(swAngle) * swRadius * 0.55;

          drawMiniBot(ctx, bx, by, i % 2 === 0 ? '#c084fc' : (lightMode ? '#0284c7' : '#38bdf8'), `Agent #${i + 1}`, lightMode, scaleFactor);
        }

        // Both Robots celebrating verified state
        drawTraderBot(ctx, centerX - 36 * scaleFactor, centerY, 1.1 * scaleFactor, 'victory', actT, lightMode);
        drawGuardianBot(ctx, centerX + 36 * scaleFactor, centerY, 1.1 * scaleFactor, 'victory', actT, lightMode);

        // Responsive Verified Stamp
        drawHoloCard(ctx, width * 0.5, height * 0.22, 330, 44, 'A2A EXECUTION VERIFIED // ZERO MEV', [
          'TX HASH: 0x7f2a...4221 // BLOCK #422189'
        ], lightMode, scaleFactor);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [mounted]);

  // =============================================================
  // PROCEDURAL VECTOR ROBOT 1 (TRADER AGENT - PURPLE/CYAN)
  // =============================================================
  function drawTraderBot(ctx, x, y, scale = 1, state = 'idle', time = 0, lightMode = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Dual Plasma Thrusters
    const thrusterFlame = Math.sin(time * 12) * 5 + 16;
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.arc(-10, 44 + thrusterFlame * 0.5, 14, 0, Math.PI * 2);
    ctx.arc(10, 44 + thrusterFlame * 0.5, 14, 0, Math.PI * 2);
    ctx.fill();

    // Torso Armor
    ctx.fillStyle = lightMode ? '#ffffff' : '#0f172a';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = lightMode ? 10 : 18;

    ctx.beginPath();
    ctx.roundRect(-22, 0, 44, 40, 8);
    ctx.fill();
    ctx.stroke();

    // Core
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(0, 20, 8, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = lightMode ? '#f1f5f9' : '#0a0f1d';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-20, -36, 40, 30, 8);
    ctx.fill();
    ctx.stroke();

    // Visor
    ctx.fillStyle = '#c084fc';
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.roundRect(-14, -25, 28, 9, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = lightMode ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRADER AGENT', 0, 56);

    ctx.restore();
  }

  // =============================================================
  // PROCEDURAL VECTOR ROBOT 2 (GENLAYER GUARDIAN BOT - BLUE/GOLD)
  // =============================================================
  function drawGuardianBot(ctx, x, y, scale = 1, state = 'idle', time = 0, lightMode = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Plasma Thruster
    const thrusterFlame = Math.sin(time * 12 + 1) * 5 + 18;
    const grad = ctx.createRadialGradient(0, 48, 2, 0, 48 + thrusterFlame, 28);
    grad.addColorStop(0, lightMode ? '#0284c7' : '#38bdf8');
    grad.addColorStop(0.5, 'rgba(2, 132, 199, 0.5)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 48 + thrusterFlame * 0.5, 24, 0, Math.PI * 2);
    ctx.fill();

    // Armored Torso
    ctx.fillStyle = lightMode ? '#ffffff' : '#0f172a';
    ctx.strokeStyle = lightMode ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = lightMode ? '#0284c7' : '#38bdf8';
    ctx.shadowBlur = lightMode ? 10 : 18;

    ctx.beginPath();
    ctx.roundRect(-24, 0, 48, 44, 10);
    ctx.fill();
    ctx.stroke();

    // Core
    ctx.fillStyle = state === 'defense' ? '#22c55e' : (lightMode ? '#0284c7' : '#38bdf8');
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 22, 9, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = lightMode ? '#f1f5f9' : '#0a0f1d';
    ctx.strokeStyle = lightMode ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-22, -38, 44, 32, 8);
    ctx.fill();
    ctx.stroke();

    // Antennas
    ctx.strokeStyle = lightMode ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, -26);
    ctx.lineTo(-30, -38);
    ctx.moveTo(22, -26);
    ctx.lineTo(30, -38);
    ctx.stroke();

    // Visor
    const visorColor = state === 'defense' ? '#22c55e' : (lightMode ? '#0284c7' : '#38bdf8');
    ctx.fillStyle = visorColor;
    ctx.shadowColor = visorColor;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.roundRect(-16, -26, 32, 10, 5);
    ctx.fill();

    // Label
    ctx.fillStyle = lightMode ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GENVM GUARDIAN', 0, 58);

    ctx.restore();
  }

  function drawMiniBot(ctx, x, y, color, title, lightMode = false, scaleFactor = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.fillStyle = lightMode ? '#ffffff' : '#0f172a';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = lightMode ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, 0, 24);
    ctx.restore();
  }

  function drawValidatorSatellite(ctx, x, y, r, color, title, subtitle, time, lightMode = false, scaleFactor = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;

    ctx.strokeRect(-r - 14 * scaleFactor, -5 * scaleFactor, 10 * scaleFactor, 10 * scaleFactor);
    ctx.strokeRect(r + 4 * scaleFactor, -5 * scaleFactor, 10 * scaleFactor, 10 * scaleFactor);

    ctx.fillStyle = lightMode ? '#ffffff' : 'rgba(10, 16, 30, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 6 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = lightMode ? 'rgba(2, 132, 199, 0.4)' : 'rgba(56, 189, 248, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, r + 8 * scaleFactor, (time * 4) % (Math.PI * 2), ((time * 4) % (Math.PI * 2)) + Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = lightMode ? '#0f172a' : '#ffffff';
    ctx.font = `bold ${Math.max(8, 10 * scaleFactor)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, 0, r + 14 * scaleFactor);

    ctx.fillStyle = lightMode ? '#64748b' : '#94a3b8';
    ctx.font = `${Math.max(7, 8 * scaleFactor)}px monospace`;
    ctx.fillText(subtitle, 0, r + 24 * scaleFactor);

    ctx.restore();
  }

  // Auto-Fitting & Wrapping Holographic Card (No Text Overflow)
  function drawHoloCard(ctx, x, y, minW, minH, title, lines, lightMode = false, scaleFactor = 1) {
    ctx.save();
    const fontSize = Math.max(8, Math.round(9.5 * scaleFactor));
    ctx.font = `bold ${fontSize}px monospace`;
    let maxLineW = ctx.measureText(`⚡ ${title}`).width;

    ctx.font = `${fontSize}px monospace`;
    lines.forEach((l) => {
      const lw = ctx.measureText(l).width;
      if (lw > maxLineW) maxLineW = lw;
    });

    const cardW = Math.max(minW * scaleFactor, maxLineW + 28 * scaleFactor);
    const cardH = Math.max(minH * scaleFactor, 32 * scaleFactor + lines.length * 18 * scaleFactor);

    ctx.translate(x, y);

    ctx.fillStyle = lightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(3, 7, 18, 0.9)';
    ctx.strokeStyle = lightMode ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = lightMode ? 'rgba(2, 132, 199, 0.25)' : '#38bdf8';
    ctx.shadowBlur = 16;

    ctx.beginPath();
    ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10 * scaleFactor);
    ctx.fill();
    ctx.stroke();

    // Header bar
    ctx.fillStyle = lightMode ? 'rgba(2, 132, 199, 0.1)' : 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.roundRect(-cardW / 2, -cardH / 2, cardW, 24 * scaleFactor, [10 * scaleFactor, 10 * scaleFactor, 0, 0]);
    ctx.fill();

    ctx.fillStyle = lightMode ? '#0284c7' : '#38bdf8';
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`⚡ ${title}`, -cardW / 2 + 10 * scaleFactor, -cardH / 2 + 16 * scaleFactor);

    // Body Lines
    ctx.fillStyle = lightMode ? '#0f172a' : '#f8fafc';
    ctx.font = `${fontSize}px monospace`;
    lines.forEach((line, idx) => {
      ctx.fillText(line, -cardW / 2 + 12 * scaleFactor, -cardH / 2 + 38 * scaleFactor + idx * 16 * scaleFactor);
    });

    ctx.restore();
  }

  function drawGlowNode(ctx, x, y, r, color, title, subtitle, lightMode = false, scaleFactor = 1) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = lightMode ? '#ffffff' : 'rgba(10, 16, 30, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = lightMode ? '#0f172a' : '#ffffff';
    ctx.font = `bold ${Math.max(8, 10.5 * scaleFactor)}px Inter, sans-serif`;
    ctx.fillText(title, x, y + r + 13 * scaleFactor);

    if (subtitle) {
      ctx.fillStyle = lightMode ? '#64748b' : '#94a3b8';
      ctx.font = `${Math.max(7, 8.5 * scaleFactor)}px monospace`;
      ctx.fillText(subtitle, x, y + r + 24 * scaleFactor);
    }
    ctx.restore();
  }

  // Auto-Fitting Pill (No Text Overflow)
  function drawGlowPill(ctx, x, y, text, color, lightMode = false, scaleFactor = 1) {
    ctx.save();
    const fontSize = Math.max(8, Math.round(9 * scaleFactor));
    ctx.font = `bold ${fontSize}px monospace`;
    const textW = ctx.measureText(text).width;
    const pillW = textW + 20 * scaleFactor;
    const pillH = 22 * scaleFactor;

    ctx.fillStyle = lightMode ? '#ffffff' : 'rgba(10, 16, 30, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 6 * scaleFactor);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 4 * scaleFactor);
    ctx.restore();
  }

  function drawHexagon(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const hx = x + size * Math.cos(angle);
      const hy = y + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  }

  // Interactive controls
  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const handleScrubberClick = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    timeRef.current = pos * TOTAL_VIDEO_DURATION;
    setCurrentTimeUI(timeRef.current);
    audio.playRobotChirpA();
  };

  const jumpToChapter = (chapter) => {
    timeRef.current = chapter.startTime + 0.1;
    setCurrentTimeUI(timeRef.current);
    audio.playRobotChirpA();
  };

  const toggleSpeed = (e) => {
    e.stopPropagation();
    const speeds = [0.5, 1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    setPlaybackRate(speeds[nextIdx]);
    audio.playRobotChirpA();
  };

  const toggleSound = (e) => {
    e.stopPropagation();
    audio.init();
    audio.enabled = isMuted;
    setIsMuted(!isMuted);
    if (isMuted) audio.playRobotChirpA();
  };

  const toggleFullscreen = (e) => {
    e.stopPropagation();
    setIsFullscreen(!isFullscreen);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeChap = CHAPTERS[activeChapterIndex] || CHAPTERS[0];
  const progressPercent = (currentTimeUI / TOTAL_VIDEO_DURATION) * 100;

  if (!mounted) {
    return (
      <div className={styles.videoPage}>
        <div style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
          Initializing Motion Graphics Cinema Engine...
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Soyara DEX - Agentic AI Cinema Experience (GenLayer 4221)</title>
        <meta name="description" content="Watch autonomous AI agents trade and execute on Soyara DEX with GenLayer Intelligent Contracts." />
      </Head>

      <div className={styles.videoPage}>
        <div className={styles.bgGlowTop} />

        {/* ========================================================== */}
        {/* CLEAN CINEMATIC 16:9 VIDEO CONTAINER */}
        {/* ========================================================== */}
        <div 
          ref={containerRef}
          className={`${styles.cinemaWrapper} ${isFullscreen ? styles.cinemaWrapperFullscreen : ''}`}
          onClick={togglePlay}
        >
          {/* High-DPI HTML5 Canvas Render Layer */}
          <canvas ref={canvasRef} className={styles.motionCanvas} />

          {/* Top Video HUD Bar (Minimal) */}
          <div className={styles.videoHudTop}>
            <div className={styles.hudBrand}>
              <Sparkles size={15} />
              <span>SOYARADEX AGENTIC ENGINE</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={styles.hudStatusPill}>
                <Bot size={12} />
                <span>{activeChap.robotStatus}</span>
              </div>
              <div className={styles.hudChapterBadge}>
                {activeChap.badge}
              </div>
            </div>
          </div>

          {/* Play Splash Button Overlay when Paused */}
          {!isPlaying && (
            <div className={styles.playSplashOverlay}>
              <div className={styles.bigPlayCircle}>
                <Play size={34} style={{ marginLeft: 4 }} />
              </div>
              <div style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.06em' }}>
                CLICK ANYWHERE TO RESUME
              </div>
            </div>
          )}

          {/* Bottom Controls Dock */}
          <div className={styles.videoControlsDock} onClick={(e) => e.stopPropagation()}>
            {/* Scrubber Bar */}
            <div className={styles.scrubberContainer} onClick={handleScrubberClick}>
              <div className={styles.scrubberTrack} style={{ width: `${progressPercent}%` }}>
                <div className={styles.scrubberHead} />
              </div>
              {/* Chapter Pins */}
              {CHAPTERS.map((ch) => (
                <div 
                  key={ch.id} 
                  className={styles.chapterMark} 
                  style={{ left: `${(ch.startTime / TOTAL_VIDEO_DURATION) * 100}%` }}
                  title={ch.title}
                />
              ))}
            </div>

            {/* Buttons Row */}
            <div className={styles.controlRow}>
              <div className={styles.leftControls}>
                <button type="button" onClick={togglePlay} className={styles.ctrlBtn} title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 2 }} />}
                </button>
                <button type="button" onClick={() => jumpToChapter(CHAPTERS[0])} className={styles.ctrlBtn} title="Restart Video">
                  <RotateCcw size={14} />
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    const nextChap = (activeChapterIndex + 1) % CHAPTERS.length;
                    jumpToChapter(CHAPTERS[nextChap]);
                  }} 
                  className={styles.ctrlBtn} 
                  title="Next Chapter"
                >
                  <FastForward size={14} />
                </button>
                <span className={styles.timeTag}>
                  {formatTime(currentTimeUI)} / {formatTime(TOTAL_VIDEO_DURATION)}
                </span>
              </div>

              <div className={styles.rightControls}>
                <button type="button" onClick={toggleSpeed} className={styles.speedBtn} title="Playback Speed">
                  {playbackRate}x Speed
                </button>
                <button type="button" onClick={toggleSound} className={styles.ctrlBtn} title={isMuted ? 'Unmute Audio FX' : 'Mute Audio FX'}>
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <button type="button" onClick={toggleFullscreen} className={styles.ctrlBtn} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
