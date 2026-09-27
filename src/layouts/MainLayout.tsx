import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Target, History, BarChart3, Settings } from 'lucide-react';
import type { CameraStatus } from '../services/contracts';
import { focusLensService } from '../services/focusLensService';

const MainLayout: React.FC = () => {
  const location = useLocation();
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>({ state: 'unknown' });

  useEffect(() => {
    let mounted = true;

    focusLensService.camera.getStatus()
      .then((status) => {
        if (mounted) setCameraStatus(status);
      })
      .catch(() => {
        if (mounted) setCameraStatus({ state: 'error' });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const cameraLabel = {
    unknown: 'Camera Status Unknown',
    inactive: 'Camera Inactive',
    requesting: 'Camera Starting',
    active: 'Camera Active',
    unavailable: 'Camera Unavailable',
    error: 'Camera Error',
  }[cameraStatus.state];

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
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </NavLink>
          <NavLink to="/session" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Target size={20} /> Focus Session
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <History size={20} /> Session History
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BarChart3 size={20} /> Analytics
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={20} /> Settings
          </NavLink>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-title">{getPageTitle()}</div>
          <div className={`camera-status${cameraStatus.state === 'active' ? ' active' : ''}`}>
            <span className="dot" aria-hidden="true"></span>
            {cameraLabel}
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
