import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      className={`card ${className} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      {children}
    </div>
  );
};
