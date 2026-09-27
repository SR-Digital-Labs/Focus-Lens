import React from 'react';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  to: string;
  icon?: React.ReactNode;
  label: string;
}

export const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      {icon && <span className="nav-icon" style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {label}
    </NavLink>
  );
};
