// /pages/api/track.js
import { getDb } from '../../lib/mongodb';

const LitVM_CHAIN_ID = 4441;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📤 API/track: Received request');
    const body = req.body;
    
    console.log('📦 Request body:', {
      address: body.address?.slice(0, 8),
      hash: body.transactionHash?.slice(0, 10),
      fromChain: body.fromChain,
      toChain: body.toChain
    });

    // Check if this is a LitVM transaction
    const isLitVM = body.fromChain == LitVM_CHAIN_ID || body.toChain == LitVM_CHAIN_ID;
    console.log(`🔗 LitVM transaction: ${isLitVM}`);

    // Validation
    const required = ['address', 'transactionHash', 'fromChain', 'toChain'];
    for (const field of required) {
      if (!body[field] && body[field] !== 0) {
        console.error(`❌ Missing required field: ${field}`);
        return res.status(400).json({ 
          success: false,
          error: `Missing required field: ${field}`,
          required
        });
      }
    }

    const db = await getDb();
    console.log('✅ Database connection established');

    // Check duplicate
    const existing = await db.collection('transactions').findOne({
      transactionHash: body.transactionHash.toLowerCase()
    });

    if (existing) {
      console.log('⚠️ Duplicate transaction');
      return res.status(200).json({
        success: true,
        message: 'Transaction already exists',
        duplicate: true
      });
    }

    // Prepare document
    const transaction = {
      userAddress: body.address.toLowerCase(),
      transactionHash: body.transactionHash.toLowerCase(),
      fromChain: Number(body.fromChain),
      toChain: Number(body.toChain),
      fromToken: body.fromToken || {},
      toToken: body.toToken || {},
      amount: body.amount?.toString() || "0",
      usdValue: Number(body.usdValue) || 0,
      status: body.status || 'completed',
      isLitVMTransaction: isLitVM,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Insert transaction
    const result = await db.collection('transactions').insertOne(transaction);
    console.log('✅ Transaction saved:', result.insertedId);

    // Update user stats
    await updateUserStats(db, transaction.userAddress, transaction, isLitVM);

    return res.status(200).json({
      success: true,
      message: 'Transaction tracked successfully',
      transactionId: result.insertedId,
      inserted: true,
      isLitVMTransaction: isLitVM
    });

  } catch (error) {
    console.error('❌ ERROR in /api/track:', error.message);
    console.error(error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function updateUserStats(db, address, transaction, isLitVM) {
  try {
    const volume = transaction.usdValue || 0;
    const chainKey = `chain_${transaction.fromChain}`;

    const update = {
      $inc: {
        totalTransactions: 1,
        totalVolumeUSD: volume
      },
      $set: {
        lastTransaction: transaction.timestamp,
        updatedAt: new Date()
      }
    };

    // Track LitVM transactions
    if (isLitVM) {
      update.$inc.LitVMTransactions = 1;
    }

    // Update chain-specific stats
    update.$inc[`chainStats.${chainKey}.count`] = 1;
    update.$inc[`chainStats.${chainKey}.volumeUSD`] = volume;
    update.$set[`chainStats.${chainKey}.lastTx`] = transaction.timestamp;

    // Add LitVM-specific tracking if applicable
    if (isLitVM) {
      const LitVMChainKey = 'chain_4441';
      update.$inc[`chainStats.${LitVMChainKey}.count`] = 1;
      update.$inc[`chainStats.${LitVMChainKey}.volumeUSD`] = volume;
      update.$set[`chainStats.${LitVMChainKey}.lastTx`] = transaction.timestamp;
    }

    await db.collection('user_stats').updateOne(
      { userAddress: address },
      update,
      { upsert: true }
    );
    
    console.log('✅ User stats updated');
  } catch (error) {
    console.error('❌ Failed to update user stats:', error.message);
  }
}