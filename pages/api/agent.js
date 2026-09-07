// pages/api/agent.js
import { TOKEN_LIST } from '../../constants/tokens';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../../constants/addresses';

const SUPPORTED_TOKENS = ['GEN', 'WGEN', 'USDC', 'USDT', 'WBTC', 'ETH', 'FSWP'];

function normalizeTokenSymbol(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  if (t === 'gen' || t === 'somi' || t === 'wsomi') return 'GEN';
  if (t === 'wgen') return 'WGEN';
  if (t === 'usdc' || t === 'zkusdc') return 'USDC';
  if (t === 'usdt' || t === 'zkusdt') return 'USDT';
  if (t === 'eth' || t === 'leth' || t === 'ethereum') return 'ETH';
  if (t === 'btc' || t === 'wbtc' || t === 'zkbtc' || t === 'bitcoin') return 'WBTC';
  if (t === 'fswp' || t === 'flipswap') return 'FSWP';
  
  for (const sym of SUPPORTED_TOKENS) {
    if (sym.toLowerCase() === t) return sym;
  }
  return null;
}

function detectModel(text) {
  const t = text.toLowerCase();
  if (t.includes('v3') || t.includes('concentrated') || t.includes('uni-v3') || t.includes('univ3')) return 'v3';
  if (t.includes('v2') || t.includes('classic') || t.includes('uni-v2') || t.includes('univ2')) return 'v2';
  return 'v3'; // Default to optimal V3
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ message: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const text = message.toLowerCase().trim();
    const model = detectModel(text);

    if (text.includes('help') || text.includes('what can you do')) {
      return res.status(200).json({
        action: 'help',
        params: {},
        message: "I am your **Soyara AI Trading Agent** on **GenLayer Testnet**.\n\nHere is how I can assist you:\n- **⚡ Swap**: *\"Swap 100 USDC to GEN\"* or *\"Trade 1 WGEN for USDT on V3\"*\n- **📊 Compare Routes**: *\"Compare V2 vs V3 for 50 WGEN\"*\n- **💧 Add Liquidity**: *\"Add V3 liquidity 10 GEN and 200 USDC\"*\n- **🛡️ Intelligent Contracts**: *\"How does AgentValidator verify trades?\"*\n\nEvery trade is validated on-chain through GenVM consensus before execution!",
      });
    }

    if (text.includes('swap') || text.includes('trade') || text.includes('buy') || text.includes('sell')) {
      const numberMatches = text.match(/\d+(?:\.\d+)?/g);
      const amount = numberMatches ? numberMatches[0] : '100';
      return res.status(200).json({
        action: 'swap',
        params: {
          fromToken: 'USDC',
          toToken: 'GEN',
          fromAmount: amount,
          model,
        },
        message: `I configured an optimal ${model.toUpperCase()} swap proposal: trade **${amount} USDC** for **GEN** on GenLayer. Validate on the right panel to proceed.`,
      });
    }

    return res.status(200).json({
      action: 'info',
      params: {},
      message: `I'm your **Soyara AI Assistant**. You can ask me to swap tokens, compare routes, check pool depths, or explain GenVM Intelligent Contracts validation.`,
    });
  }

  try {
    const prompt = `You are a DeFi AI Agent parsing engine for Soyara DEX on GenLayer Bradbury Testnet (Chain ID 4221).
Supported assets: GEN, WGEN, USDC, USDT, WBTC, ETH, FSWP.
Supported actions: swap, add_liquidity, remove_liquidity, info, help, unknown.

Return strict JSON with:
- action: "swap" | "add_liquidity" | "remove_liquidity" | "info" | "help" | "unknown"
- params: Specific action parameters
- message: A detailed, friendly, and expert explanation of the prepared action or DeFi concept.

User message: "${message.replace(/"/g, '\\"')}"`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(200).json({
      action: 'info',
      params: {},
      message: `I processed your request on Soyara DEX. What token swap or liquidity position would you like to prepare?`,
    });
  }
}
