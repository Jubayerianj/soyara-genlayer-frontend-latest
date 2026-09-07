import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();
dotenv.config({ path: '.env.local' });

async function main() {
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db('dex_tracker');
  
  const user = '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2'.toLowerCase();
  console.log(`🔎 Inspecting MongoDB transactions for user: ${user}...`);
  const docs = await db.collection('transactions').find({ userAddress: user }).toArray();
  
  console.log(`Found ${docs.length} document(s).`);
  docs.forEach((doc, i) => {
    console.log(`\nDocument #${i + 1}:`);
    console.log(JSON.stringify(doc, null, 2));
  });
  
  await mongoClient.close();
}

main().catch(console.error);
