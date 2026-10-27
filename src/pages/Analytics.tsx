import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Clock,
  Target,
  CheckCircle2,
  TrendingUp,
  Play,
  RotateCw,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { sessionRetrievalService } from '../services/sessionRetrieval.service';
import { useFocusTimer } from '../hooks/useFocusTimer';
import type { Session } from '../types';

function formatHoursMinutes(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const { status: activeTimerStatus, formattedRemaining } = useFocusTimer();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (isRefresh = false) => {
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
      setError(err instanceof Error ? err.message : 'Unable to retrieve analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Compute metrics from retrieved local sessions
  const metrics = useMemo(() => {
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.status === 'completed').length;
    const cancelledSessions = sessions.filter((s) => s.status === 'cancelled').length;
    const interruptedSessions = sessions.filter((s) => s.status === 'interrupted').length;

    const totalElapsedSeconds = sessions.reduce((acc, s) => acc + (s.elapsedSeconds || 0), 0);
    const totalPlannedSeconds = sessions.reduce((acc, s) => acc + (s.plannedDurationSeconds || 0), 0);
    const totalPausedSeconds = sessions.reduce((acc, s) => acc + (s.pausedDurationSeconds || 0), 0);

    const averageElapsedMinutes = totalSessions > 0
      ? Math.round(totalElapsedSeconds / totalSessions / 60)
      : 0;

    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

    return {
      totalSessions,
      completedSessions,
      cancelledSessions,
      interruptedSessions,
      totalElapsedSeconds,
      totalPlannedSeconds,
      totalPausedSeconds,
      averageElapsedMinutes,
      completionRate,
      hasSufficientData: totalSessions > 0,
    };
  }, [sessions]);

  const isLiveSession = activeTimerStatus === 'running' || activeTimerStatus === 'paused';

  return (
    <div className="analytics-page">
      <header className="analytics-page-header">
        <div>
          <h1>Analytics & Focus Trends</h1>
          <p>Local aggregation of focus intervals, completion ratios, and attention metrics.</p>
        </div>
        <div className="analytics-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadData(true)}
            disabled={loading}
            aria-label="Refresh analytics"
          >
            <RotateCw size={16} className={loading ? 'spinning' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {/* Live Session Callout if one is currently active */}
      {isLiveSession && (
        <section className="card analytics-live-card" aria-label="Active focus session status">
          <div className="live-badge">
            <span className="dot" aria-hidden="true" />
            <span>SESSION IN PROGRESS</span>
          </div>
          <div className="live-content">
            <div>
              <h3>Currently {activeTimerStatus === 'running' ? 'Focusing' : 'Paused'}</h3>
              <p>Time remaining: <strong>{formattedRemaining}</strong>. Metrics update upon session completion.</p>
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

      {/* Loading state */}
      {loading && (
        <div className="card analytics-status-card" role="status" aria-live="polite">
          <div className="analytics-spinner" aria-hidden="true" />
          <p>Calculating focus metrics from local records...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="card analytics-status-card error" role="alert">
          <AlertCircle size={24} color="var(--error-color)" aria-hidden="true" />
          <div>
            <h3>Unable to calculate metrics</h3>
            <p>{error}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void loadData()}>
            Retry
          </button>
        </div>
      )}

      {/* Insufficient Data State */}
      {!loading && !error && !metrics.hasSufficientData && (
        <div className="card analytics-insufficient-card" role="region" aria-label="Insufficient data">
          <div className="insufficient-icon" aria-hidden="true">
            <BarChart3 size={44} />
          </div>
          <h2>Insufficient focus data available</h2>
          <p>
            There are no saved focus sessions in your local database yet. Focus analytics, completion
            rates, and session trend charts require at least one completed or logged session.
          </p>
          <div className="insufficient-metrics-preview">
            <div className="preview-stat">
              <span className="val">0h 0m</span>
              <span className="lbl">Total Focus</span>
            </div>
            <div className="preview-stat">
              <span className="val">0</span>
              <span className="lbl">Total Sessions</span>
            </div>
            <div className="preview-stat">
              <span className="val">0%</span>
              <span className="lbl">Completion Rate</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/session')}
          >
            <Play size={16} aria-hidden="true" />
            Start Your First Session
          </button>
        </div>
      )}

      {/* Populated Analytics Dashboard */}
      {!loading && !error && metrics.hasSufficientData && (
        <div className="analytics-dashboard">
          {/* Metric KPI Cards */}
          <div className="grid grid-cols-4 analytics-kpi-grid">
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Clock size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{formatHoursMinutes(metrics.totalElapsedSeconds)}</div>
              <div className="card-label">Total focused time</div>
            </div>

            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Target size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{metrics.totalSessions}</div>
              <div className="card-label">Total recorded sessions</div>
            </div>

            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <CheckCircle2 size={20} color="var(--success-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{metrics.completionRate}%</div>
              <div className="card-label">Completion rate</div>
            </div>

            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <TrendingUp size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{metrics.averageElapsedMinutes}m</div>
              <div className="card-label">Average duration</div>
            </div>
          </div>

          {/* Session Outcome Breakdown */}
          <section className="card analytics-section-card" aria-labelledby="status-breakdown-title">
            <h2 id="status-breakdown-title">Session Outcome Distribution</h2>
            <p className="analytics-section-subtitle">
              Breakdown of how focus sessions concluded across all local history.
            </p>

            <div className="outcome-bars">
              <div className="outcome-row">
                <div className="outcome-info">
                  <span className="outcome-name">Completed</span>
                  <span className="outcome-numbers">
                    {metrics.completedSessions} ({metrics.totalSessions > 0 ? Math.round((metrics.completedSessions / metrics.totalSessions) * 100) : 0}%)
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={metrics.completedSessions} aria-valuemin={0} aria-valuemax={metrics.totalSessions}>
                  <div
                    className="progress-fill completed"
                    style={{
                      width: `${metrics.totalSessions > 0 ? (metrics.completedSessions / metrics.totalSessions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="outcome-row">
                <div className="outcome-info">
                  <span className="outcome-name">Cancelled Early</span>
                  <span className="outcome-numbers">
                    {metrics.cancelledSessions} ({metrics.totalSessions > 0 ? Math.round((metrics.cancelledSessions / metrics.totalSessions) * 100) : 0}%)
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={metrics.cancelledSessions} aria-valuemin={0} aria-valuemax={metrics.totalSessions}>
                  <div
                    className="progress-fill cancelled"
                    style={{
                      width: `${metrics.totalSessions > 0 ? (metrics.cancelledSessions / metrics.totalSessions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="outcome-row">
                <div className="outcome-info">
                  <span className="outcome-name">Interrupted / Shutdown</span>
                  <span className="outcome-numbers">
                    {metrics.interruptedSessions} ({metrics.totalSessions > 0 ? Math.round((metrics.interruptedSessions / metrics.totalSessions) * 100) : 0}%)
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={metrics.interruptedSessions} aria-valuemin={0} aria-valuemax={metrics.totalSessions}>
                  <div
                    className="progress-fill interrupted"
                    style={{
                      width: `${metrics.totalSessions > 0 ? (metrics.interruptedSessions / metrics.totalSessions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Privacy Note */}
          <div className="analytics-privacy-footer">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              All analytics and metrics are computed on-device using local SQLite storage. No session data is transmitted or shared.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
