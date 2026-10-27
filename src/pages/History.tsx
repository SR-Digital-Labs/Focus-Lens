<<<<<<< HEAD
import React, { useCallback, useEffect, useState } from 'react';
import { sessionRetrievalService } from '../services/sessionRetrieval.service';
import type { PersistedSessionStatus, Session } from '../types';

const PAGE_SIZE = 10;
const STATUS_OPTIONS: Array<{ value: PersistedSessionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All sessions' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'interrupted', label: 'Interrupted' },
];

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const History: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<PersistedSessionStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await sessionRetrievalService.getAllSessionsResult({
      ...(status === 'all' ? {} : { status }),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      order: 'desc',
    });
    if (result.success) {
      setSessions(result.data);
    } else {
      setSessions([]);
      setError(result.error);
    }
    setLoading(false);
  }, [page, status]);
=======
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
>>>>>>> 72d692c492b01401bdf8258be2f16b49e12c31e7

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

<<<<<<< HEAD
  return (
    <main className="history-page">
      <header className="history-header">
        <div>
          <h1>Session History</h1>
          <p>Your focus sessions saved on this device.</p>
        </div>
        <label className="history-filter">
          <span>Filter by status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.currentTarget.value as PersistedSessionStatus | 'all');
              setPage(0);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </header>

      {loading ? (
        <p className="history-message" role="status">Loading saved sessions…</p>
      ) : error ? (
        <section className="history-message history-error" role="alert">
          <p>Session history could not be loaded.</p>
          <p>{error}</p>
          <button className="btn" type="button" onClick={() => void loadSessions()}>Try again</button>
        </section>
      ) : sessions.length === 0 ? (
        <p className="history-message">{page > 0 ? 'No more sessions on this page.' : 'No saved sessions yet. Start a focus session and it will appear here.'}</p>
      ) : (
        <>
          <section className="history-list" aria-label="Saved sessions" aria-live="polite">
            {sessions.map((session) => (
              <article className="card history-session" key={session.id}>
                <div className="history-session-main">
                  <time dateTime={session.startedAt}>{formatDate(session.startedAt)}</time>
                  <span className={`history-status status-${session.status}`}>{session.status}</span>
                </div>
                <dl className="history-session-details">
                  <div><dt>Focused</dt><dd>{formatDuration(session.elapsedSeconds)}</dd></div>
                  <div><dt>Planned</dt><dd>{formatDuration(session.plannedDurationSeconds)}</dd></div>
                  {session.endedAt && <div><dt>Ended</dt><dd>{formatDate(session.endedAt)}</dd></div>}
                </dl>
              </article>
            ))}
          </section>
          <nav className="history-pagination" aria-label="Session history pages">
            <button className="btn" type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {page + 1}</span>
            <button className="btn" type="button" disabled={sessions.length < PAGE_SIZE} onClick={() => setPage((current) => current + 1)}>Next</button>
          </nav>
        </>
      )}
    </main>
=======
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
>>>>>>> 72d692c492b01401bdf8258be2f16b49e12c31e7
  );
};

export default History;
