// /pages/api/stats.js - FIXED IMPORT PATH
import { getDb } from '../../lib/mongodb'; // ← Fixed path

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
    const { address, chainId } = req.query;
    
    if (!address) {
      return res.status(400).json({ 
        success: false,
        error: 'Address is required'
      });
    }

    console.log('📊 Fetching stats for:', address.slice(0, 8));
    
    const db = await getDb();
    const userAddress = address.toLowerCase();

    // Build query
    let query = { userAddress };
    if (chainId) {
      query.$or = [
        { fromChain: Number(chainId) },
        { toChain: Number(chainId) }
      ];
    }

    // Get counts
    const [totalCount, optimismCount] = await Promise.all([
      db.collection('transactions').countDocuments(query),
      db.collection('transactions').countDocuments({
        userAddress,
        $or: [{ fromChain: 10 }, { toChain: 10 }]
      })
    ]);

    // Get volume
    const volumeResult = await db.collection('transactions').aggregate([
      { $match: { userAddress } },
      { $group: { _id: null, totalVolume: { $sum: '$usdValue' } } }
    ]).toArray();
    
    const totalVolume = volumeResult[0]?.totalVolume || 0;

    // Get user stats
    const userStats = await db.collection('user_stats').findOne({ userAddress });

    return res.status(200).json({
      success: true,
      address: userAddress,
      transactionCount: totalCount,
      optimismTransactionCount: optimismCount,
      totalVolumeUSD: totalVolume,
      isEligibleForRewards: optimismCount >= 3,
      userStats: userStats || null,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ERROR in /api/stats:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}