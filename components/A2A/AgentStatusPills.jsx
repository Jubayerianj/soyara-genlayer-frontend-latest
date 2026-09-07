// components/A2A/AgentStatusPills.jsx
import React from 'react';
import { AGENT_REGISTRY } from '../../services/a2a/agents';
import styles from '../../styles/A2A.module.css';

export default function AgentStatusPills({ activeAgentId }) {
  return (
    <div className={styles.agentBar}>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        A2A Swarm:
      </span>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {Object.values(AGENT_REGISTRY).map((agent) => {
          const isWorking = activeAgentId === agent.id;
          return (
            <div 
              key={agent.id} 
              className={styles.agentPill}
              style={{
                borderColor: isWorking ? 'var(--blue-primary, #0284c7)' : undefined,
              }}
            >
              <div 
                className={`${styles.agentDot} ${isWorking ? styles.agentDotWorking : ''}`}
                style={{ background: isWorking ? '#f59e0b' : '#10b981' }}
              />
              <span>{agent.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
