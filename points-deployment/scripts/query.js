const { ethers } = require("ethers");

async function testRpc(url, name) {
  try {
    const provider = new ethers.JsonRpcProvider(url);
    const block = await provider.getBlockNumber();
    console.log(`✅ [${name}] Block Number: ${block}`);
    return true;
  } catch (error) {
    console.log(`❌ [${name}] Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("Testing LitVM RPC Endpoints...");
  await testRpc("https://liteforge.rpc.caldera.xyz/http", "Public RPC");
  await testRpc("https://liteforge.rpc.caldera.xyz/infra-partner-http", "Infra-Partner RPC");
}

main();
