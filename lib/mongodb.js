// lib/mongodb.js - UPDATED VERSION


import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = 'dex_tracker';

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI in .env.local');
}

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Remove all deprecated options - use modern syntax
  const client = new MongoClient(MONGODB_URI, {
    // Add any necessary options here for newer driver versions
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });

  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    cachedClient = client;
    cachedDb = db;

    console.log('✅ MongoDB connected successfully');
    return { client, db };
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

// Helper to get database instance
export async function getDb() {
  const { db } = await connectToDatabase();
  return db;
}