import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import FocusSession from './pages/FocusSession'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import { useState } from 'react'

const USERNAME_STORAGE_KEY = 'focuslens.username.v1';

function App() {
  const [username, setUsername] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(USERNAME_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const handleLogin = (name: string) => {
    try {
      window.localStorage.setItem(USERNAME_STORAGE_KEY, name);
    } catch {
      // Keep usable in-memory if local storage is restricted
    }
    setUsername(name);
  };

  const handleLogout = () => {
    try {
      window.localStorage.removeItem(USERNAME_STORAGE_KEY);
    } catch {
      // Ignore cleanup error
    }
    setUsername(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={username ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
        />
        <Route
          path="/"
          element={
            username
              ? <MainLayout username={username} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Dashboard username={username ?? ''} />} />
          <Route path="session" element={<FocusSession />} />
          <Route path="history" element={<History />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
