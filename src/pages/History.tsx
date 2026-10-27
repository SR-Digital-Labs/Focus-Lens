import React, { useCallback, useEffect, useState } from 'react';
import { sessionRetrievalService } from '../services/sessionRetrieval.service';
import type { PersistedSessionStatus, Session } from '../types';

const PAGE_SIZE = 10;
const STATUSES: Array<PersistedSessionStatus | 'all'> = ['all', 'completed', 'running', 'paused', 'cancelled', 'interrupted'];

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
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
    if (result.success) setSessions(result.data);
    else { setSessions([]); setError(result.error); }
    setLoading(false);
  }, [page, status]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  return (
    <main className="history-page">
      <header className="history-header">
        <div><h1>Session History</h1><p>Your focus sessions saved on this device.</p></div>
        <label className="history-filter">
          <span>Filter by status</span>
          <select value={status} onChange={(event) => {
            setStatus(event.currentTarget.value as PersistedSessionStatus | 'all');
            setPage(0);
          }}>
            {STATUSES.map((value) => <option key={value} value={value}>{value === 'all' ? 'All sessions' : value}</option>)}
          </select>
        </label>
      </header>
      {loading ? <p className="history-message" role="status">Loading saved sessions…</p>
        : error ? <section className="history-message history-error" role="alert">
          <p>Session history could not be loaded.</p><p>{error}</p>
          <button className="btn" type="button" onClick={() => void loadSessions()}>Try again</button>
        </section>
          : sessions.length === 0 ? <p className="history-message">{page ? 'No more sessions on this page.' : 'No saved sessions yet. Start a focus session and it will appear here.'}</p>
            : <>
              <section className="history-list" aria-label="Saved sessions" aria-live="polite">
                {sessions.map((session) => <article className="card history-session" key={session.id}>
                  <div className="history-session-main">
                    <time dateTime={session.startedAt}>{formatDate(session.startedAt)}</time>
                    <span className={`history-status status-${session.status}`}>{session.status}</span>
                  </div>
                  <dl className="history-session-details">
                    <div><dt>Focused</dt><dd>{formatDuration(session.elapsedSeconds)}</dd></div>
                    <div><dt>Planned</dt><dd>{formatDuration(session.plannedDurationSeconds)}</dd></div>
                    {session.endedAt && <div><dt>Ended</dt><dd>{formatDate(session.endedAt)}</dd></div>}
                    {session.pausedDurationSeconds > 0 && <div><dt>Paused</dt><dd>{formatDuration(session.pausedDurationSeconds)}</dd></div>}
                  </dl>
                </article>)}
              </section>
              <nav className="history-pagination" aria-label="Session history pages">
                <button className="btn" type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button>
                <span>Page {page + 1}</span>
                <button className="btn" type="button" disabled={sessions.length < PAGE_SIZE} onClick={() => setPage((current) => current + 1)}>Next</button>
              </nav>
            </>}
    </main>
  );
};

export default History;

