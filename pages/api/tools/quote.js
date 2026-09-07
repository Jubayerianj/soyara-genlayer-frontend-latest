export default async function handler(req, res) {
  const { tokenIn, tokenOut, amountIn, dex = 'best' } = req.query;

  if (!tokenIn || !tokenOut || !amountIn) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Token Map (for resolving symbols if needed)
  const TOKEN_MAP = {
    GEN: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    WGEN: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
    USDC: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
    USDT: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
    WBTC: '0x723534bc6C2B536fF5D0455111513A9431c44e25',
    ETH: '0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C',
    FSWP: '0xA2eC9aAf2235C66491767e69eBBD885469697B3E',
  };

  // Mocking the RPC call since we might not have liquidity on testnet
  // And manual ABI encoding in pure JS without ethers for complex arrays is prone to errors
  // Using high-quality fallback data as requested

  const numAmount = parseFloat(amountIn);
  if (isNaN(numAmount)) {
      return res.status(400).json({ error: 'Invalid amount' });
  }

  const v2Out = numAmount * 0.975;
  const v3Out = numAmount * 0.982;

  const quoteData = {
    v2: {
        amountOut: v2Out.toFixed(4),
        priceImpact: "0.15%",
        fee: "0.30%",
        path: [tokenIn, "WGEN", tokenOut].filter((v, i, a) => a.indexOf(v) === i) // Deduplicate
    },
    v3: {
        amountOut: v3Out.toFixed(4),
        priceImpact: "0.08%",
        fee: "0.05%",
        path: [tokenIn, tokenOut]
    },
    best: 'v3',
    bestAmountOut: v3Out.toFixed(4)
  };

  if (dex === 'v2') {
      return res.status(200).json({ v2: quoteData.v2, best: 'v2', bestAmountOut: v2Out.toFixed(4) });
  } else if (dex === 'v3') {
      return res.status(200).json({ v3: quoteData.v3, best: 'v3', bestAmountOut: v3Out.toFixed(4) });
  }

  return res.status(200).json(quoteData);
}
