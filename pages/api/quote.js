// pages/api/quote/quote.js

// pages/api/quote.js
import fetch from 'cross-fetch'

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' })
  }

  try {
    const baseUrl = 'https://li.quest/v1/quote'
    const headers = { 
      'Accept': 'application/json',
      'User-Agent': 'LiquidFi-DEX/1.0'
    }

    // Add API key if available
    if (process.env.LIFI_API_KEY) {
      headers['x-lifi-api-key'] = process.env.LIFI_API_KEY
    }

    const integrator = process.env.INTEGRATOR_ID || 'liquidfi'

    // Validate required parameters
    const queryParams = req.method === 'GET' ? req.query : req.body
    const { fromChain, toChain, fromToken, toToken, fromAmount } = queryParams

    if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount) {
      return res.status(400).json({
        message: 'Missing required parameters: fromChain, toChain, fromToken, toToken, fromAmount',
        code: 'MISSING_PARAMETERS'
      })
    }

    // Build the LiFi quote URL
    let finalUrl
    if (req.method === 'GET') {
      const url = new URL(baseUrl)
      Object.keys(req.query || {}).forEach(k => {
        const v = req.query[k]
        if (v !== undefined && v !== null && String(v) !== '') {
          url.searchParams.append(k, String(v))
        }
      })
      if (integrator && !url.searchParams.has('integrator')) {
        url.searchParams.append('integrator', integrator)
      }
      finalUrl = url.toString()
    } else {
      // Convert POST body to GET query params
      const body = typeof req.body === 'object' ? req.body : {}
      const url = new URL(baseUrl)
      Object.keys(body || {}).forEach(k => {
        const v = body[k]
        if (v !== undefined && v !== null && String(v) !== '') {
          url.searchParams.append(k, String(v))
        }
      })
      if (integrator && !url.searchParams.has('integrator')) {
        url.searchParams.append('integrator', integrator)
      }
      finalUrl = url.toString()
    }

    // Same-chain optimization
    const isSameChain = fromChain === toChain;
    if (isSameChain) {
      console.log(`[LiFi Proxy] Same-chain swap detected: ${fromChain}, optimizing for DEX only`);
    }

    console.log('[LiFi Proxy] Requesting quote ->', finalUrl)

    // Fetch from LiFi with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const lifiResp = await fetch(finalUrl, { 
      method: 'GET', 
      headers,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    let lifiJson
    try {
      lifiJson = await lifiResp.json()
    } catch (e) {
      const txt = await lifiResp.text().catch(() => 'unreadable response')
      console.error('[LiFi Proxy] LiFi returned non-json:', txt)
      
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.status(502).json({ 
        error: 'invalid_response', 
        message: 'LiFi API returned invalid JSON',
        raw: txt.slice(0, 500)
      })
    }

    console.log('[LiFi Proxy] LiFi status:', lifiResp.status)

    if (!lifiResp.ok) {
      console.error('[LiFi Proxy] LiFi API error:', lifiJson)
      
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.status(lifiResp.status).json({
        ...lifiJson,
        proxyError: true
      })
    }

    // ENHANCED: Validate response for both same-chain and cross-chain
    const hasValidRoutes = lifiJson.routes && lifiJson.routes.length > 0;
    const hasDirectRoute = lifiJson.transactionRequest || lifiJson.estimate || lifiJson.includedSteps;
    const hasAlternativeRoute = lifiJson.actions || lifiJson.steps || (lifiJson.fromAmount && lifiJson.toAmount);
    
    if (!lifiJson || (!hasValidRoutes && !hasDirectRoute && !hasAlternativeRoute)) {
      console.warn('[LiFi Proxy] No valid routes found in response')
      
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.status(404).json({
        message: 'No valid routes found for this swap',
        code: 'NO_ROUTES_FOUND',
        details: lifiJson?.warnings || lifiJson?.errors,
        isSameChain: isSameChain
      })
    }

    console.log('[LiFi Proxy] Quote successful:', { 
      routesCount: lifiJson.routes?.length || 'single route',
      isSameChain: isSameChain
    })

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    return res.status(200).json(lifiJson)

  } catch (err) {
    console.error('[LiFi Proxy] Internal error:', err)
    
    let statusCode = 500
    let errorMessage = err.message
    let errorCode = 'INTERNAL_ERROR'

    if (err.name === 'AbortError') {
      statusCode = 504
      errorMessage = 'Request timeout - LiFi API took too long to respond'
      errorCode = 'TIMEOUT'
    } else if (err.message.includes('fetch failed')) {
      statusCode = 503
      errorMessage = 'Network error - unable to reach LiFi API'
      errorCode = 'NETWORK_ERROR'
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(statusCode).json({
      error: errorCode,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    })
  }
}