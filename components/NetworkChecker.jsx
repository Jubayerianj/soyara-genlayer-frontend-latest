// components/NetworkChecker.jsx
import { useChainId } from 'wagmi';

const NetworkChecker = () => {
  const chainId = useChainId();
  
  const SUPPORTED_CHAINS = [4441, 11155111]; // Add both if you want
  
  if (!SUPPORTED_CHAINS.includes(chainId)) {
    return (
      <div className="network-warning">

        ⚠️ You are connected to Network ID: {chainId}. 
        Please switch to LitVM (4441) to use LitVMSwap.

      
      </div>
    );
  }
  
  return null;
};