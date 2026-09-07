// Empty mock for @solana/wallet-adapter-react
export const useWallet = () => ({});
export const ConnectionProvider = ({ children }) => children;
export const WalletProvider = ({ children }) => children;
export const ConnectionContext = { Provider: ({ children }) => children };
export default {};