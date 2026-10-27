import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft, Target } from 'lucide-react';
import { useFocusTimer } from '../hooks/useFocusTimer';

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const { status, formattedRemaining } = useFocusTimer();
  const isSessionActive = status === 'running' || status === 'paused';

  return (
    <div className="not-found-page" role="region" aria-label="Page not found">
      <div className="card not-found-card">
        <div className="not-found-icon" aria-hidden="true">
          <Compass size={48} />
        </div>
        <h1>Page Not Found</h1>
        <p>
          The screen you are looking for does not exist or has been moved. Use the navigation sidebar or return to the main dashboard.
        </p>

        {isSessionActive && (
          <div className="not-found-session-notice" role="status" aria-live="polite">
            <span className="dot" aria-hidden="true" />
            <span>
              Active focus session in progress ({status === 'running' ? 'Focusing' : 'Paused'} · {formattedRemaining}).
            </span>
          </div>
        )}

        <div className="not-found-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Return to Dashboard
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/session')}
          >
            <Target size={16} aria-hidden="true" />
            Go to Focus Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
