export const AGGFlowRouter_ABI = [
  {
    "type": "constructor",
    "inputs": [{ "name": "_weth", "type": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Route",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true },
      { "name": "tokenIn", "type": "address", "indexed": false },
      { "name": "tokenOut", "type": "address", "indexed": false },
      { "name": "amountIn", "type": "uint256", "indexed": false },
      { "name": "amountOut", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ApproveFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ApproveResetFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientNativeBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidOpCode",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPoolType",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTokenForUnwrap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTokenForWrap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NativeSendFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Paused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SlippageExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Uint96Overflow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UniV3CallbackInvalidSource",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UniV3CallbackMissed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UniV3CallbackNegativeAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroRouterBalance",
    "inputs": []
  },
  {
    "type": "function",
    "name": "WETH",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeRoute",
    "inputs": [
      { "name": "tokenIn", "type": "address" },
      { "name": "amountIn", "type": "uint256" },
      { "name": "tokenOut", "type": "address" },
      { "name": "minAmountOut", "type": "uint256" },
      { "name": "program", "type": "bytes" }
    ],
    "outputs": [{ "name": "amountOut", "type": "uint256" }],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "uniswapV3SwapCallback",
    "inputs": [
      { "name": "a0", "type": "int256" },
      { "name": "a1", "type": "int256" },
      { "name": "data", "type": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pancakeV3SwapCallback",
    "inputs": [
      { "name": "amount0Delta", "type": "int256" },
      { "name": "amount1Delta", "type": "int256" },
      { "name": "data", "type": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "zfV3SwapCallback",
    "inputs": [
      { "name": "amount0Delta", "type": "int256" },
      { "name": "amount1Delta", "type": "int256" },
      { "name": "data", "type": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "capricornCLSwapCallback",
    "inputs": [
      { "name": "amount0Delta", "type": "int256" },
      { "name": "amount1Delta", "type": "int256" },
      { "name": "data", "type": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "algebraSwapCallback",
    "inputs": [
      { "name": "amount0Delta", "type": "int256" },
      { "name": "amount1Delta", "type": "int256" },
      { "name": "data", "type": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  }
]