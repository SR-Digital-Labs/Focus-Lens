import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NavItem } from '../components';
import { LayoutDashboard, Target, History, BarChart3, Settings } from 'lucide-react';

const MainLayout: React.FC = () => {
  const location = useLocation();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard';
      case '/session': return 'Focus Session';
      case '/history': return 'Session History';
      case '/analytics': return 'Analytics';
      case '/settings': return 'Settings';
      default: return 'FocusLens';
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Target size={24} color="var(--accent-color)" />
          <span>FocusLens</span>
        </div>
        <nav className="sidebar-nav">
          <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
          <NavItem to="/session" icon={<Target size={20} />} label="Focus Session" />
          <NavItem to="/history" icon={<History size={20} />} label="Session History" />
          <NavItem to="/analytics" icon={<BarChart3 size={20} />} label="Analytics" />
          <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-title">{getPageTitle()}</div>
          <div className="camera-status">
            <span className="dot"></span>
            Camera Inactive
          </div>
        </header>

        {/* Page Content */}
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
