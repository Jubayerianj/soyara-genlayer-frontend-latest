import React from 'react';
import { ShieldCheck, Activity } from 'lucide-react';
import styles from '../../pages/PoolPage.module.css';

const SecurityDashboard = ({ priceGuardPercent, slippagePercent }) => (
  <div className={styles.securityDashboard}>
    <div className={styles.securityItem}>
      <ShieldCheck size={16} />
      <span>Ratio Guard: ACTIVE ({priceGuardPercent}% Limit)</span>
    </div>


    <div className={styles.securityItem}>
      <Activity size={16} />
      <span>Simulation + Slippage Guard: ACTIVE ({slippagePercent}%)</span>
    </div>
  </div>
);

export default SecurityDashboard;
