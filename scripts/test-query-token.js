const { ethers } = require('ethers');

const RPC_URL = 'https://liteforge.rpc.caldera.xyz/infra-partner-http';
const ENTRYPOINT = '0xF69E64804000d28aA695eB5c594B996100fb3B49';
const TOKEN_ADDRESS = '0x0B779FF5855bc4E6937EbFa64aBE7AB8207f09c3'.toLowerCase();
const START_BLOCK = 17948281;

const AGGFlowSwapEventAbi = [
  "event AGGFlowSwap(address indexed user, address indexed referrer, address tokenIn, address tokenOut, bool isFeeInInput, uint256 amountIn, uint256 amountOut, uint256 referrerFeeBps, uint256 totalFeeBps)"
];

async function main() {
  console.log(`Connecting to LitVM RPC: ${RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const latestBlock = await provider.getBlockNumber();
  console.log(`Latest block: ${latestBlock}`);
  
  // Scan backward in chunks to avoid RPC timeout
  const CHUNK_SIZE = 200000;
  const MAX_SCAN_BLOCKS = 1000000; // Scan last 1M blocks by default
  const scanLimitBlock = Math.max(START_BLOCK, latestBlock - MAX_SCAN_BLOCKS);
  
  console.log(`Scanning backward from ${latestBlock} to ${scanLimitBlock} (contract deployed at ${START_BLOCK})...`);
  
  let currentBlock = latestBlock;
  let logs = [];
  
  while (currentBlock > scanLimitBlock) {
    const fromBlock = Math.max(scanLimitBlock, currentBlock - CHUNK_SIZE);
    const toBlock = currentBlock;
    
    console.log(`Fetching logs for range ${fromBlock} -> ${toBlock}...`);
    try {
      const filter = {
        address: ENTRYPOINT,
        topics: [
          ethers.id("AGGFlowSwap(address,address,address,address,bool,uint256,uint256,uint256,uint256)")
        ],
        fromBlock,
        toBlock
      };
      
      const chunkLogs = await provider.getLogs(filter);
      logs = logs.concat(chunkLogs);
      console.log(`Found ${chunkLogs.length} events in range. Total collected: ${logs.length}`);
    } catch (err) {
      console.warn(`Warning: Range ${fromBlock} -> ${toBlock} timed out or failed. Skipping:`, err.message);
    }
    
    currentBlock = fromBlock - 1;
  }

  console.log(`Total events collected: ${logs.length}`);

  const iface = new ethers.Interface(AGGFlowSwapEventAbi);
  let matchedCount = 0;
  let totalAmountIn = 0n;
  let totalAmountOut = 0n;
  let uniqueUsers = new Set();
  let tokenSymbol = 'UNKNOWN';
  let tokenDecimals = 18;

  // Fetch token details
  try {
    const erc20 = new ethers.Contract(
      TOKEN_ADDRESS, 
      [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
      ], 
      provider
    );
    tokenSymbol = await erc20.symbol().catch(() => 'UNKNOWN');
    tokenDecimals = Number(await erc20.decimals().catch(() => 18));
    console.log(`Token Metadata: Symbol=${tokenSymbol}, Decimals=${tokenDecimals}`);
  } catch (e) {
    console.log(`Failed to fetch ERC20 metadata for ${TOKEN_ADDRESS}, using default.`);
  }

  const matches = [];

  for (const log of logs) {
    try {
      const parsed = iface.parseLog({
        topics: [...log.topics],
        data: log.data
      });
      
      if (parsed) {
        const { user, tokenIn, tokenOut, amountIn, amountOut } = parsed.args;
        const inLower = tokenIn.toLowerCase();
        const outLower = tokenOut.toLowerCase();

        if (inLower === TOKEN_ADDRESS || outLower === TOKEN_ADDRESS) {
          matchedCount++;
          uniqueUsers.add(user);
          
          const isSold = inLower === TOKEN_ADDRESS;
          const amount = isSold ? amountIn : amountOut;
          if (isSold) {
            totalAmountIn += BigInt(amountIn.toString());
          } else {
            totalAmountOut += BigInt(amountOut.toString());
          }

          matches.push({
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            user,
            type: isSold ? 'SELL' : 'BUY',
            amount: ethers.formatUnits(amount, tokenDecimals),
            otherToken: isSold ? tokenOut : tokenIn
          });
        }
      }
    } catch (err) {
      // silent parse error
    }
  }

  console.log('\n=======================================');
  console.log(`SUMMARY FOR TOKEN: ${TOKEN_ADDRESS} (${tokenSymbol})`);
  console.log(`Total Swaps: ${matchedCount}`);
  console.log(`Unique Wallets (Participants): ${uniqueUsers.size}`);
  console.log(`Total Amount Sold: ${ethers.formatUnits(totalAmountIn, tokenDecimals)} ${tokenSymbol}`);
  console.log(`Total Amount Bought: ${ethers.formatUnits(totalAmountOut, tokenDecimals)} ${tokenSymbol}`);
  console.log('=======================================');
  
  if (matches.length > 0) {
    console.log('\nRecent Swaps (Newest First):');
    matches.sort((a, b) => b.blockNumber - a.blockNumber);
    matches.slice(0, 10).forEach(m => {
      console.log(`- Tx: ${m.txHash} | User: ${m.user} | ${m.type} ${m.amount} ${tokenSymbol}`);
    });
  } else {
    console.log('\nNo swaps found for this token address in the scanned block range.');
  }
}

main();
