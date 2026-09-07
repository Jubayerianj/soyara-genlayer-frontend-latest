// components/doppler/DopplerStatus.jsx
// Shows a notice when Doppler contracts are not yet deployed on the current chain

import styles from './DopplerStatus.module.css';

export default function DopplerStatus({ deployed, chainId }) {
  if (deployed) return null;

  return (
    <div className={styles.banner}>
      <span className={styles.icon}>⚠️</span>
      <div className={styles.text}>
        <strong>LitVMSWAP Liquidity Engine contracts are not yet deployed on LitVM (Chain {chainId}).</strong>
        <p>
          Run the Foundry deploy script first, then update{' '}
          <code>constants/doppler/addresses.js</code> with the resulting addresses.
        </p>
        <pre className={styles.cmd}>
          forge script script/deploy/DeployLitVM.s.sol:DeployLitVMScript \{'\n'}
          {'  '}--rpc-url litvm --broadcast --private-key $DEPLOYER_PRIVATE_KEY
        </pre>
      </div>
    </div>
  );
}
