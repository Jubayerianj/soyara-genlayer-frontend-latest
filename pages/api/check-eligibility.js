// /pages/api/check-eligibility.js
import { getDb } from '../../lib/mongodb';

const LitVM_CHAIN_ID = 4441;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ 
        success: false,
        error: 'Address is required'
      });
    }

    console.log('🎯 Checking eligibility for:', address.slice(0, 8));
    
    const db = await getDb();
    const userAddress = address.toLowerCase();

    // Get LitVM transactions count
    const LitVMCount = await db.collection('transactions').countDocuments({
      userAddress,
      $or: [
        { fromChain: LitVM_CHAIN_ID },
        { toChain: LitVM_CHAIN_ID },
        { isLitVMTransaction: true }
      ]
    });

    // Get user stats
    const userStats = await db.collection('user_stats').findOne({ userAddress });

    const isEligible = LitVMCount >= 3;

    return res.status(200).json({
      success: true,
      address: userAddress,
      LitVMTransactionCount: LitVMCount,
      isEligible,
      requirements: {
        minLitVMTransactions: 3,
        currentCount: LitVMCount,
        remaining: Math.max(0, 3 - LitVMCount)
      },
      userStats: userStats || null,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ERROR in /api/check-eligibility:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}