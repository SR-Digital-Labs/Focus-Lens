import React from 'react';

interface StatusIndicatorProps {
  status: 'active' | 'inactive' | 'error' | 'warning';
  label?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'active': return 'var(--success-color, #10b981)';
      case 'error': return 'var(--error-color, #ef4444)';
      case 'warning': return 'var(--warning-color, #f59e0b)';
      case 'inactive':
      default: return 'var(--text-muted, #9ca3af)';
    }
  };

  return (
    <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span 
        className="status-dot" 
        style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          backgroundColor: getStatusColor() 
        }} 
      />
      {label && <span className="status-label" style={{ fontSize: '0.875rem' }}>{label}</span>}
    </div>
  );
};
