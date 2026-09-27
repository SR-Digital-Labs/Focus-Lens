import React from 'react';

interface SectionContainerProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const SectionContainer: React.FC<SectionContainerProps> = ({ title, children, className = '' }) => {
  return (
    <section className={`section-container ${className}`} style={{ marginBottom: '24px' }}>
      {title && <h2 className="section-title" style={{ marginBottom: '16px', fontSize: '1.25rem', fontWeight: 600 }}>{title}</h2>}
      <div className="section-content">
        {children}
      </div>
    </section>
  );
};
