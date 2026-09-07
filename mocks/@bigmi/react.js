// Empty mock for @bigmi/react
export const useConfig = () => ({});
export const useAccount = () => ({});
export const useConnect = () => ({});
export const useReconnect = () => {};
export const BigmiProvider = ({ children }) => children;
export const BigmiContext = { Provider: ({ children }) => children };
export default {};