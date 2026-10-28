import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RotateCw,
  Calendar,
  Clock,
  AlertCircle,
  History as HistoryIcon,
  ArrowUpDown,
  Filter,
  Play,
} from 'lucide-react';
import { sessionRetrievalService } from '../services/sessionRetrieval.service';
import { useFocusTimer } from '../hooks/useFocusTimer';
import type { PersistedSessionStatus, Session } from '../types';
import {
  formatSessionDate,
  formatSessionTime,
  formatSessionDuration,
  formatSessionAwayDuration,
  formatSessionFocusScore,
  getStatusBadgeClass,
  getStatusLabel,
  calculateDateFilterRange,
  type DateFilterPreset,
} from '../utils/historyFormatters';

const PAGE_SIZE = 10;
const STATUS_OPTIONS: Array<{ value: PersistedSessionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Sessions' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'interrupted', label: 'Interrupted' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
];

const DATE_PRESET_OPTIONS: Array<{ value: DateFilterPreset; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

const History: React.FC = () => {
  const navigate = useNavigate();
  const { status: activeTimerStatus, formattedRemaining } = useFocusTimer();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [status, setStatus] = useState<PersistedSessionStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('all');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isLiveSession = activeTimerStatus === 'running' || activeTimerStatus === 'paused';

  const loadSessions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setLoading(true);
    }
    setError(null);

    const dateRange = calculateDateFilterRange(dateFilter);

    try {
      const [listResult, countResult] = await Promise.all([
        sessionRetrievalService.getAllSessionsResult({
          ...(status === 'all' ? {} : { status }),
          ...dateRange,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          order,
        }),
        sessionRetrievalService.getSessionCountResult(status === 'all' ? undefined : status),
      ]);

      if (listResult.success) {
        setSessions(listResult.data);
      } else {
        setSessions([]);
        setError(listResult.error ?? 'Failed to load focus sessions.');
      }

      if (countResult.success) {
        setTotalCount(countResult.data);
      } else {
        setTotalCount(null);
      }
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred while retrieving history.');
    } finally {
      setLoading(false);
    }
  }, [page, status, dateFilter, order]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleStatusChange = (newStatus: PersistedSessionStatus | 'all') => {
    setStatus(newStatus);
    setPage(0);
  };

  const handleDateFilterChange = (newPreset: DateFilterPreset) => {
    setDateFilter(newPreset);
    setPage(0);
  };

  const handleOrderChange = (newOrder: 'desc' | 'asc') => {
    setOrder(newOrder);
    setPage(0);
  };

  const handleResetFilters = () => {
    setStatus('all');
    setDateFilter('all');
    setOrder('desc');
    setPage(0);
  };

  const totalPages = totalCount !== null && totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : null;
  const isFiltered = status !== 'all' || dateFilter !== 'all';
  const startSessionIndex = totalCount !== null && totalCount > 0 ? page * PAGE_SIZE + 1 : sessions.length > 0 ? page * PAGE_SIZE + 1 : 0;
  const endSessionIndex = totalCount !== null ? Math.min(startSessionIndex + sessions.length - 1, totalCount) : startSessionIndex + sessions.length - 1;

  return (
    <main className="history-page">
      {/* Header */}
      <header className="history-page-header">
        <div>
          <h1>Session History</h1>
          <p>Your focus sessions saved locally on this device.</p>
        </div>
        <div className="history-header-actions">
          <button
            type="button"
            className="btn btn-secondary history-refresh-btn"
            onClick={() => void loadSessions(true)}
            disabled={loading}
            aria-label="Refresh session history"
          >
            <RotateCw size={16} className={loading ? 'spinning' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {/* Active Focus Session Banner (if running or paused) */}
      {isLiveSession && (
        <section className="card analytics-live-card" aria-label="Active focus session notification">
          <div className="live-badge">
            <span className="dot" aria-hidden="true" />
            <span>SESSION IN PROGRESS</span>
          </div>
          <div className="live-content">
            <div>
              <h3>Currently {activeTimerStatus === 'running' ? 'Focusing' : 'Paused'}</h3>
              <p>
                Remaining time: <strong>{formattedRemaining}</strong>. This session will be saved to your local history upon completion.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/session')}
            >
              Return to Session
            </button>
          </div>
        </section>
      )}

      {/* Toolbar: Status Chips, Date Range & Sort Controls */}
      <section className="history-toolbar" aria-label="Session filters and sort controls">
        {/* Status Filter Chips */}
        <div className="history-filters" role="group" aria-label="Filter by session status">
          <span className="filter-label">
            <Filter size={15} aria-hidden="true" />
            Status:
          </span>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`filter-chip ${status === option.value ? 'active' : ''}`}
              onClick={() => handleStatusChange(option.value)}
              aria-pressed={status === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Secondary Controls: Date Filter, Sort, and Reset */}
        <div className="history-controls-row">
          <div className="history-control-group">
            <label className="filter-label" htmlFor="history-date-filter">
              <Calendar size={15} aria-hidden="true" />
              Range:
            </label>
            <select
              id="history-date-filter"
              className="history-select"
              value={dateFilter}
              onChange={(e) => handleDateFilterChange(e.currentTarget.value as DateFilterPreset)}
            >
              {DATE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <label className="filter-label" htmlFor="history-sort-order">
              <ArrowUpDown size={15} aria-hidden="true" />
              Sort:
            </label>
            <select
              id="history-sort-order"
              className="history-select"
              value={order}
              onChange={(e) => handleOrderChange(e.currentTarget.value as 'desc' | 'asc')}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>

          {isFiltered && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.85rem', padding: '4px 10px' }}
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Content States */}
      {loading ? (
        /* 1. Loading State */
        <div className="card history-status-card" role="status" aria-live="polite">
          <div className="history-spinner" aria-hidden="true" />
          <p>Loading saved focus sessions...</p>
        </div>
      ) : error ? (
        /* 2. Error State */
        <section className="card history-status-card error" role="alert" aria-live="assertive">
          <AlertCircle size={36} color="var(--error-color)" aria-hidden="true" />
          <div>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>Session history could not be loaded</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '460px' }}>{error}</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => void loadSessions(true)}>
            Try Again
          </button>
        </section>
      ) : sessions.length === 0 ? (
        /* 3. Empty State */
        <section className="card history-empty-card" aria-label="No sessions found">
          <div className="empty-icon" aria-hidden="true">
            <HistoryIcon size={34} />
          </div>
          <h2>{isFiltered ? 'No Matching Sessions' : 'No Saved Sessions Yet'}</h2>
          <p>
            {isFiltered
              ? 'No focus sessions match the selected status or date range filter. Try adjusting your filter settings.'
              : 'Your completed, cancelled, or paused focus sessions will appear here automatically. All session metrics and privacy-first activity events stay strictly on this computer.'}
          </p>
          {isFiltered ? (
            <button className="btn btn-secondary" type="button" onClick={handleResetFilters}>
              Reset Filters
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => navigate('/session')}>
              <Play size={16} style={{ marginRight: '6px' }} />
              Start a Focus Session
            </button>
          )}
        </section>
      ) : (
        /* 4. Loaded History List */
        <>
          <section className="history-list" aria-label="Saved focus sessions" aria-live="polite">
            {sessions.map((session) => (
              <article className="card history-item-card" key={session.id}>
                <div className="history-item-main">
                  {/* Item Header */}
                  <div className="history-item-header">
                    <div className="history-item-date">
                      <Clock size={16} color="var(--accent-color)" aria-hidden="true" />
                      <time dateTime={session.startedAt}>
                        {formatSessionDate(session.startedAt)} · {formatSessionTime(session.startedAt)}
                      </time>
                    </div>
                    <span className={`session-status-badge ${getStatusBadgeClass(session.status)}`}>
                      {getStatusLabel(session.status)}
                    </span>
                    <span className="session-id-pill" title={`Session ID: ${session.id}`}>
                      #{session.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Metrics DL */}
                  <dl className="history-item-metrics">
                    <div className="metric">
                      <dt className="metric-label">Focus Time</dt>
                      <dd className="metric-value emphasis">{formatSessionDuration(session.elapsedSeconds)}</dd>
                    </div>

                    <div className="metric">
                      <dt className="metric-label">Planned</dt>
                      <dd className="metric-value">{formatSessionDuration(session.plannedDurationSeconds)}</dd>
                    </div>

                    <div className="metric">
                      <dt className="metric-label">Start Time</dt>
                      <dd className="metric-value">{formatSessionTime(session.startedAt)}</dd>
                    </div>

                    <div className="metric">
                      <dt className="metric-label">End Time</dt>
                      <dd className="metric-value">
                        {session.endedAt ? formatSessionTime(session.endedAt) : '—'}
                      </dd>
                    </div>

                    <div className="metric">
                      <dt className="metric-label">Away Duration</dt>
                      <dd className="metric-value">
                        {session.awayDurationSeconds !== undefined
                          ? formatSessionAwayDuration(session.awayDurationSeconds)
                          : '—'}
                      </dd>
                    </div>

                    <div className="metric">
                      <dt className="metric-label">Focus Score</dt>
                      <dd className="metric-value">
                        {session.focusScore !== undefined
                          ? formatSessionFocusScore(session.focusScore)
                          : session.focusIndicatorScore !== undefined
                            ? formatSessionFocusScore(session.focusIndicatorScore)
                            : '—'}
                      </dd>
                    </div>

                    {session.pausedDurationSeconds > 0 && (
                      <div className="metric">
                        <dt className="metric-label">Paused</dt>
                        <dd className="metric-value">{formatSessionDuration(session.pausedDurationSeconds)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </article>
            ))}
          </section>

          {/* Pagination */}
          <nav className="history-pagination" aria-label="Session history pagination">
            <div className="history-pagination-info">
              {totalCount !== null && totalCount > 0 ? (
                <span>
                  Showing {startSessionIndex}–{endSessionIndex} of {totalCount} session{totalCount === 1 ? '' : 's'}
                </span>
              ) : (
                <span>
                  Showing {sessions.length} session{sessions.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="history-pagination-actions">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                aria-label="Previous page"
              >
                Previous
              </button>

              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Page {page + 1}{totalPages !== null ? ` of ${totalPages}` : ''}
              </span>

              <button
                className="btn btn-secondary"
                type="button"
                disabled={sessions.length < PAGE_SIZE || (totalPages !== null && page + 1 >= totalPages)}
                onClick={() => setPage((current) => current + 1)}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </main>
  );
};

export default History;
