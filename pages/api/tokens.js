// pages/api/tokens.js

import fetch from 'cross-fetch'

export default async function handler(req, res) {
  const { chainId } = req.query
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
  
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const base = 'https://li.quest/v1/tokens'
  try {
    const headers = { 
      'Accept': 'application/json',
      'User-Agent': 'LiquidFi-Swap-App/1.0'
    }
    
    if (process.env.LIFI_API_KEY) {
      headers['x-lifi-api-key'] = process.env.LIFI_API_KEY
    }

    console.log(`🔄 Fetching tokens from LI.FI API for chain: ${chainId}`)
    const response = await fetch(base, { 
      headers, 
      timeout: 30000 
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('LI.FI tokens API error', response.status, errorText)
      return res.status(response.status).json({ 
        error: `API error: ${response.status}`,
        details: errorText
      })
    }
    
    const data = await response.json()
    console.log('✅ LI.FI API response received, tokens structure:', {
      hasTokens: !!data.tokens,
      tokensType: typeof data.tokens,
      extended: data.extended,
      chainsCount: data.tokens ? Object.keys(data.tokens).length : 0
    })
    
    // If specific chainId requested, filter the response
    if (chainId && data.tokens && data.tokens[chainId]) {
      const filteredTokens = data.tokens[chainId]
      console.log(`✅ Filtered tokens for chain ${chainId}:`, filteredTokens.length)
      return res.status(200).json(filteredTokens)
    }
    
    // Return full response if no chainId filter or if chain not found
    return res.status(200).json(data)
    
  } catch (err) {
    console.error('tokens proxy internal error', err)
    return res.status(500).json({ 
      error: 'internal_error',
      message: err.message 
    })
  }
}