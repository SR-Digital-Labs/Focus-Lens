import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import FocusSession from './pages/FocusSession'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { useState } from 'react'

function App() {
  const [username, setUsername] = useState<string | null>(null)

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={username ? <Navigate to="/" replace /> : <Login onLogin={setUsername} />}
        />
        <Route
          path="/"
          element={
            username
              ? <MainLayout username={username} onLogout={() => setUsername(null)} />
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Dashboard username={username ?? ''} />} />
          <Route path="session" element={<FocusSession />} />
          <Route path="history" element={<History />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
