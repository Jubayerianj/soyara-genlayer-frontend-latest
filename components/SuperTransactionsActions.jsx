import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { useSuperTxWrite, FEE } from '../hooks/useSuperTransactions';
import { toast } from 'react-hot-toast';
import styles from './SuperTransactionsActions.module.css';

const ActionButton = ({ title, description, icon, functionName }) => {
  const [inputValues, setInputValues] = useState({});
  const [showInputs, setShowInputs] = useState(false);
  const { write, isLoading, isSuccess, error } = useSuperTxWrite(functionName, []);

  const needsInputs = functionName === 'deployToken' || functionName === 'deployCollection';

  const handleClick = () => {
    if (needsInputs && !showInputs) {
      setShowInputs(true);
      return;
    }
    if (functionName === 'deployToken') {
      const { name, symbol, supply } = inputValues;
      if (!name || !symbol || !supply) {
        toast.error('Please fill all fields');
        return;
      }
      write([name, symbol, BigInt(supply)]);
    } else if (functionName === 'deployCollection') {
      const { name, symbol } = inputValues;
      if (!name || !symbol) {
        toast.error('Please fill name and symbol');
        return;
      }
      write([name, symbol]);
    } else {
      write([]);
    }
  };

  if (isSuccess && showInputs) setTimeout(() => setShowInputs(false), 2000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={styles.card}
    >
      <div className={styles.cardHeader}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.feeBadge}>Live</span>
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>

      <AnimatePresence>
        {showInputs && needsInputs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={styles.inputContainer}
          >
            {functionName === 'deployToken' && (
              <>
                <input
                  className={styles.input}
                  placeholder="Token Name"
                  value={inputValues.name || ''}
                  onChange={(e) => setInputValues({ ...inputValues, name: e.target.value })}
                />
                <input
                  className={styles.input}
                  placeholder="Symbol (e.g., TOKEN)"
                  value={inputValues.symbol || ''}
                  onChange={(e) => setInputValues({ ...inputValues, symbol: e.target.value })}
                />
                <input
                  className={styles.input}
                  placeholder="Initial Supply"
                  type="number"
                  value={inputValues.supply || ''}
                  onChange={(e) => setInputValues({ ...inputValues, supply: e.target.value })}
                />
              </>
            )}
            {functionName === 'deployCollection' && (
              <>
                <input
                  className={styles.input}
                  placeholder="Collection Name"
                  value={inputValues.name || ''}
                  onChange={(e) => setInputValues({ ...inputValues, name: e.target.value })}
                />
                <input
                  className={styles.input}
                  placeholder="Symbol (e.g., NFT)"
                  value={inputValues.symbol || ''}
                  onChange={(e) => setInputValues({ ...inputValues, symbol: e.target.value })}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={`${styles.button} ${isLoading ? styles.loading : ''} ${isSuccess ? styles.success : ''}`}
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className={styles.spinner}>⟳</span>
        ) : isSuccess ? (
          '✓ Done'
        ) : needsInputs && !showInputs ? (
          'Configure'
        ) : (
          'Execute'
        )}
      </button>
      {error && <p className={styles.error}>{error.message.includes('user rejected') ? 'Transaction cancelled' : error.message.slice(0, 80)}</p>}
    </motion.div>
  );
};

const SuperTransactionsActions = () => {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.connectPrompt}>
        <span className={styles.connectIcon}>🔌</span>
        <h2>Connect Your Wallet</h2>
        <p>Start performing on‑chain actions</p>
      </motion.div>
    );
  }

  const actions = [
    { title: 'GM', description: 'Say Good Morning', icon: '🌅', functionName: 'gm' },
    { title: 'GN', description: 'Say Good Night', icon: '🌙', functionName: 'gn' },
    { title: 'Deploy Token', description: 'Launch ERC20', icon: '🪙', functionName: 'deployToken' },
    { title: 'Deploy Collection', description: 'Launch ERC721', icon: '🖼️', functionName: 'deployCollection' },
    { title: 'Mint Token', description: 'Get 1000 SUPERXP', icon: '💰', functionName: 'mintToken' },
    { title: 'Mint NFT', description: 'Get platform NFT', icon: '🎨', functionName: 'mintNFT' },
    { title: 'Deploy Contract', description: 'Simple storage', icon: '📄', functionName: 'deployContract' },
  ];

  return (
    <div className={styles.grid}>
      {actions.map((action) => (
        <ActionButton key={action.functionName} {...action} />
      ))}
    </div>
  );
};

export default SuperTransactionsActions;