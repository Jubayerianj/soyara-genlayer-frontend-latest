// pages/api/integrator/fees.js
import fetch from 'cross-fetch'

export default async function handler(req, res) {
  const integratorId = process.env.INTEGRATOR_ID
  if (!integratorId) return res.status(400).json({ error: 'no_integrator_id_configured' })
  if (!process.env.LIFI_API_KEY) return res.status(400).json({ error: 'server_missing_api_key' })

  const url = `https://li.quest/v1/integrators/${encodeURIComponent(integratorId)}`
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', 'x-lifi-api-key': process.env.LIFI_API_KEY }, timeout: 15000 })
    const data = await r.json()
    if (!r.ok) {
      console.error('Integrator fees fetch failed', r.status, data)
    }
    return res.status(r.ok ? 200 : r.status).json(data)
  } catch (err) {
    console.error('integrator fees internal error', err)
    return res.status(500).json({ error: 'internal_error' })
  }
}
