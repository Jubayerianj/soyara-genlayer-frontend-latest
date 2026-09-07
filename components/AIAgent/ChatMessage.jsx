// components/AIAgent/ChatMessage.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

function renderFormattedContent(content, isDark) {
  if (!content) return null;

  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const strongColor = isDark ? '#ffffff' : '#0f172a';
  const headerColor = isDark ? '#f8fafc' : '#0f172a';

  // Simple paragraph & markdown bold renderer
  const lines = content.split('\n');
  return lines.map((line, lineIdx) => {
    if (!line.trim()) {
      return <div key={lineIdx} style={{ height: '8px' }} />;
    }

    // Process bold text **text**
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, partIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={partIdx} style={{ color: strongColor, fontWeight: 700 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return (
          <em key={partIdx} style={{ color: '#0284c7' }}>
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });

    if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
      return (
        <div key={lineIdx} style={{ display: 'flex', gap: '8px', marginLeft: '4px', marginY: '2px', color: textColor }}>
          <span style={{ color: '#0284c7' }}>•</span>
          <span>{formattedLine}</span>
        </div>
      );
    }

    if (line.trim().startsWith('### ')) {
      return (
        <div key={lineIdx} style={{ fontSize: '1rem', fontWeight: 750, color: headerColor, margin: '8px 0 4px 0' }}>
          {line.replace('### ', '')}
        </div>
      );
    }

    return (
      <p key={lineIdx} style={{ margin: '0 0 6px 0', lineHeight: 1.6, color: textColor }}>
        {formattedLine}
      </p>
    );
  });
}

const ChatMessage = ({ role, content, toolsUsed }) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: '12px',
        width: '100%',
      }}
    >
      {/* Avatar Icon */}
      <div style={{
        width: '34px',
        height: '34px',
        borderRadius: '10px',
        background: isUser
          ? 'linear-gradient(135deg, #0284c7, #0369a1)'
          : isDark
            ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.25))'
            : '#e0f2fe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: isUser ? 'none' : isDark ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid #bae6fd',
        color: isUser ? '#ffffff' : '#0284c7',
        flexShrink: 0,
      }}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      {/* Bubble Content */}
      <div style={{
        maxWidth: '85%',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <div style={{
          padding: '12px 16px',
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          background: isUser
            ? 'linear-gradient(135deg, #0284c7, #0369a1)'
            : isDark
              ? 'rgba(255, 255, 255, 0.04)'
              : '#f1f5f9',
          border: isUser 
            ? 'none' 
            : isDark 
              ? '1px solid rgba(255, 255, 255, 0.08)' 
              : '1px solid #e2e8f0',
          backdropFilter: isUser ? 'none' : 'blur(10px)',
          color: isUser ? '#ffffff' : isDark ? '#e2e8f0' : '#0f172a',
          fontSize: '0.92rem',
          wordBreak: 'break-word',
          boxShadow: isUser ? '0 4px 14px rgba(2, 132, 199, 0.25)' : 'none',
        }}>
          {renderFormattedContent(content, isDark)}
        </div>

        {/* Tool badges */}
        {toolsUsed && toolsUsed.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            marginTop: '2px',
          }}>
            {toolsUsed.map((tool, idx) => (
              <span key={idx} style={{
                fontSize: '0.68rem',
                padding: '2px 8px',
                borderRadius: '12px',
                background: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)',
                border: isDark ? '1px solid rgba(56, 189, 248, 0.2)' : '1px solid rgba(2, 132, 199, 0.2)',
                color: isDark ? '#38bdf8' : '#0284c7',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
              }}>
                <Sparkles size={10} />
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
