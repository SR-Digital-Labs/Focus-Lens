import React from 'react';
import { Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="hero-section">
        <h1>Good morning 👋</h1>
        <p>Ready for a focused session?</p>
        <button className="btn" onClick={() => navigate('/session')}>
          <Target size={18} />
          Start Focus Session
        </button>
      </div>

      <div className="grid grid-cols-4">
        <div className="card">
          <div className="card-value">2h 45m</div>
          <div className="card-label">Today's focus time</div>
        </div>
        <div className="card">
          <div className="card-value">4</div>
          <div className="card-label">Sessions today</div>
        </div>
        <div className="card">
          <div className="card-value">41m</div>
          <div className="card-label">Average duration</div>
        </div>
        <div className="card">
          <div className="card-value">18m</div>
          <div className="card-label">Total away time</div>
        </div>
      </div>

      <div className="card">
        <div className="recent-sessions-header">
          <h2>Recent Sessions</h2>
          <a href="/history" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontSize: '0.875rem' }}>
            View History →
          </a>
        </div>
        
        <div className="session-list">
          <div className="session-item">
            <div className="session-time">09:00</div>
            <div className="session-duration">45 min</div>
            <div className="session-score">Focus Indicator 86%</div>
          </div>
          <div className="session-item">
            <div className="session-time">11:30</div>
            <div className="session-duration">60 min</div>
            <div className="session-score">Focus Indicator 81%</div>
          </div>
          <div className="session-item">
            <div className="session-time">14:00</div>
            <div className="session-duration">30 min</div>
            <div className="session-score">Focus Indicator 90%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
