import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History as HistoryIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCw,
  Clock,
  Pause,
  Filter,
} from 'lucide-react';
import { sessionRetrievalService } from '../services/sessionRetrieval.service';
import type { PersistedSessionStatus, Session } from '../types';

type FilterOption = 'all' | PersistedSessionStatus;

function formatDurationSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatSessionDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return isoString;
  }
}

const History: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');

  const loadSessions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await sessionRetrievalService.getAllSessionsResult({ order: 'desc' });
      if (result.success) {
        setSessions(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to retrieve session history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const filteredSessions = activeFilter === 'all'
    ? sessions
    : sessions.filter((s) => s.status === activeFilter);

  const renderStatusBadge = (status: PersistedSessionStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="session-status-badge status-completed">
            <CheckCircle2 size={14} aria-hidden="true" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="session-status-badge status-cancelled">
            <XCircle size={14} aria-hidden="true" />
            Cancelled
          </span>
        );
      case 'interrupted':
        return (
          <span className="session-status-badge status-interrupted">
            <AlertTriangle size={14} aria-hidden="true" />
            Interrupted
          </span>
        );
      case 'running':
        return (
          <span className="session-status-badge status-running">
            <Play size={14} aria-hidden="true" />
            Running
          </span>
        );
      case 'paused':
        return (
          <span className="session-status-badge status-paused">
            <Pause size={14} aria-hidden="true" />
            Paused
          </span>
        );
      default:
        return <span className="session-status-badge">{status}</span>;
    }
  };

  return (
    <div className="history-page">
      <header className="history-page-header">
        <div>
          <h1>Session History</h1>
          <p>Review your past focus sessions, durations, and local productivity records.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary history-refresh-btn"
          onClick={() => void loadSessions(true)}
          disabled={loading}
          aria-label="Refresh sessions"
        >
          <RotateCw size={16} className={loading ? 'spinning' : ''} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {/* Filter Tabs */}
      <div className="history-filters" role="group" aria-label="Filter sessions by status">
        <span className="filter-label">
          <Filter size={15} aria-hidden="true" />
          Filter:
        </span>
        {(['all', 'completed', 'cancelled', 'interrupted'] as const).map((filter) => {
          const count = filter === 'all'
            ? sessions.length
            : sessions.filter((s) => s.status === filter).length;
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${isActive ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
              aria-pressed={isActive}
            >
              <span className="filter-name">
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </span>
              <span className="filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Content States */}
      {loading && (
        <div className="card history-status-card" role="status" aria-live="polite">
          <div className="history-spinner" aria-hidden="true" />
          <p>Loading session records...</p>
        </div>
      )}

      {!loading && error && (
        <div className="card history-status-card error" role="alert">
          <AlertTriangle size={24} color="var(--error-color)" aria-hidden="true" />
          <div>
            <h3>Unable to load sessions</h3>
            <p>{error}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void loadSessions()}>
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="card history-empty-card" role="region" aria-label="No sessions recorded">
          <div className="empty-icon" aria-hidden="true">
            <HistoryIcon size={44} />
          </div>
          <h2>No focus sessions saved yet</h2>
          <p>
            When you complete or end a focus session, its details, planned duration, and elapsed focus
            time are stored locally on your device and will appear here.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/session')}
          >
            <Play size={16} aria-hidden="true" />
            Start Focus Session
          </button>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && filteredSessions.length === 0 && (
        <div className="card history-empty-card" role="region" aria-label="No matching sessions">
          <p>No {activeFilter} sessions found.</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setActiveFilter('all')}
          >
            Show All Sessions
          </button>
        </div>
      )}

      {!loading && !error && filteredSessions.length > 0 && (
        <div className="history-list" role="feed" aria-label="List of past sessions">
          {filteredSessions.map((session) => (
            <article key={session.id} className="card history-item-card">
              <div className="history-item-main">
                <div className="history-item-header">
                  <span className="history-item-date">
                    <Clock size={15} aria-hidden="true" />
                    {formatSessionDateTime(session.startedAt)}
                  </span>
                  {renderStatusBadge(session.status)}
                </div>

                <div className="history-item-metrics">
                  <div className="metric">
                    <span className="metric-label">Planned</span>
                    <span className="metric-value">
                      {Math.round(session.plannedDurationSeconds / 60)}m
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Elapsed Focus</span>
                    <span className="metric-value emphasis">
                      {formatDurationSeconds(session.elapsedSeconds)}
                    </span>
                  </div>
                  {session.pausedDurationSeconds > 0 && (
                    <div className="metric">
                      <span className="metric-label">Paused</span>
                      <span className="metric-value">
                        {formatDurationSeconds(session.pausedDurationSeconds)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="history-item-meta">
                <code className="session-id-pill" title={`Session ID: ${session.id}`}>
                  ID: {session.id.slice(0, 8)}...
                </code>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;
