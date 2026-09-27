import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({ children, title, className = '' }) => {
  return (
    <div className={`page-container ${className}`}>
      {title && <h1 className="page-title">{title}</h1>}
      <div className="page-content-inner">
        {children}
      </div>
    </div>
  );
};
