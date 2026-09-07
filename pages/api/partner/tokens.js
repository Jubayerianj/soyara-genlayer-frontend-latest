import { TOKEN_LIST } from '../../../constants/tokens';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { chainId = '4441' } = req.query;
  const parsedChainId = parseInt(chainId);
  
  if (isNaN(parsedChainId)) {
    return res.status(400).json({ error: 'Invalid chainId' });
  }

  const tokens = TOKEN_LIST[parsedChainId] || [];

  return res.status(200).json({
    chainId: parseInt(chainId),
    tokens: tokens.map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      logoURI: t.logoURI,
      isNative: !!t.isNative
    }))
  });
}
