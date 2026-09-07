// Empty mock for @mysten/dapp-kit
export const useConnectWallet = () => ({});
export const useCurrentWallet = () => ({});
export const useDisconnectWallet = () => {};
export const useWallets = () => [];
export const createNetworkConfig = () => ({});
export const SuiClientProvider = ({ children }) => children;
export const WalletProvider = ({ children }) => children;
export const SuiClientContext = { Provider: ({ children }) => children };
export default {};