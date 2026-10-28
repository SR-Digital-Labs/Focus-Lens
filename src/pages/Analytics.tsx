import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  UserMinus,
  Eye,
  Activity,
  Zap,
  ArrowRight,
} from 'lucide-react';
import {
  getDashboardMetrics,
  calculateDashboardMetrics,
  type DashboardMetrics,
} from '../services/dashboardMetrics.service';
import { sessionRetrievalService } from '../services/sessionRetrieval.service';
import { useFocusTimer } from '../hooks/useFocusTimer';
import { AnalyticsCharts } from '../components/AnalyticsCharts';
import type { Session } from '../types';
import {
  formatSessionDate,
  formatSessionTime,
  formatSessionDuration,
  formatSessionAwayDuration,
  getStatusBadgeClass,
  getStatusLabel,
} from '../utils/historyFormatters';

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

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch real session records from SessionRetrievalService
      const sessionsResult = await sessionRetrievalService.getAllSessionsResult({ order: 'desc' });
      if (!sessionsResult.success) {
        throw new Error(sessionsResult.error || 'Unable to retrieve saved focus sessions.');
      }
      const loadedSessions = sessionsResult.data.filter((session) =>
        session && typeof session.id === 'string' &&
        Number.isFinite(Date.parse(session.startedAt)) &&
        Number.isFinite(session.elapsedSeconds) && session.elapsedSeconds >= 0 &&
        Number.isFinite(session.plannedDurationSeconds) && session.plannedDurationSeconds > 0,
      );
      setSessions(loadedSessions);

      // 2. Fetch metrics using Ragavi's getDashboardMetrics service implementation
      try {
        const result = await getDashboardMetrics();
        setMetrics(result);
      } catch (metricsErr) {
        // Fallback: If running outside Tauri SQLite environment, compute using pure calculation service
        if (loadedSessions.length > 0) {
          const derived = calculateDashboardMetrics(loadedSessions, []);
          setMetrics(derived);
        } else {
          setMetrics(calculateDashboardMetrics([], []));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to retrieve analytics data from local database.');
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Derived outcome distributions and average Focus Indicator score
  const derivedStats = useMemo(() => {
    const totalSessions = metrics?.sessionCount ?? sessions.length;
    const completedSessions = sessions.filter((s) => s.status === 'completed').length;
    const cancelledSessions = sessions.filter((s) => s.status === 'cancelled').length;
    const interruptedSessions = sessions.filter((s) => s.status === 'interrupted').length;

    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

    // Compute average Focus Indicator score across calculated sessions
    const calculatedScores: number[] = [];
    if (metrics?.focusIndicators) {
      for (const indicator of metrics.focusIndicators) {
        if (
          indicator.status === 'calculated' &&
          typeof indicator.score === 'number' &&
          Number.isFinite(indicator.score)
        ) {
          calculatedScores.push(indicator.score);
        }
      }
    }

    const averageFocusScore = calculatedScores.length > 0
      ? Math.round(calculatedScores.reduce((sum, score) => sum + score, 0) / calculatedScores.length)
      : null;

    return {
      totalSessions,
      completedSessions,
      cancelledSessions,
      interruptedSessions,
      completionRate,
      averageFocusScore,
      hasData: totalSessions > 0,
    };
  }, [metrics, sessions]);

  // Map sessionId to calculated focus score for chart annotations
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>();
    if (metrics?.focusIndicators) {
      for (const fi of metrics.focusIndicators) {
        if (
          fi.sessionId &&
          fi.status === 'calculated' &&
          typeof fi.score === 'number' &&
          Number.isFinite(fi.score)
        ) {
          map.set(fi.sessionId, fi.score);
        }
      }
    }
    return map;
  }, [metrics]);

  const isLiveSession = activeTimerStatus === 'running' || activeTimerStatus === 'paused';
  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="analytics-page">
      {/* Header */}
      <header className="analytics-page-header">
        <div>
          <h1>Analytics & Focus Trends</h1>
          <p>Local aggregation of focus intervals, attention metrics, and session outcomes.</p>
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

      {/* 1. Loading State */}
      {loading && (
        <div className="card analytics-status-card" role="status" aria-live="polite">
          <div className="analytics-spinner" aria-hidden="true" />
          <p>Aggregating focus metrics from local records...</p>
        </div>
      )}

      {/* 2. Error State */}
      {!loading && error && (
        <div className="card analytics-status-card error" role="alert">
          <AlertCircle size={28} color="var(--error-color)" aria-hidden="true" />
          <div>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '4px' }}>Unable to retrieve analytics</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void loadData(true)}>
            Retry
          </button>
        </div>
      )}

      {/* 3. Empty / Insufficient Data State */}
      {!loading && !error && (!metrics || !derivedStats.hasData) && (
        <div className="card analytics-insufficient-card" role="region" aria-label="Insufficient data">
          <div className="insufficient-icon" aria-hidden="true">
            <BarChart3 size={44} />
          </div>
          <h2>No focus sessions recorded yet</h2>
          <p>
            There are no saved focus sessions in your local database yet. Focus analytics, completion
            rates, and session trend charts require at least one completed or logged session.
          </p>
          <div className="insufficient-metrics-preview">
            <div className="preview-stat">
              <span className="val">0m</span>
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

      {/* 4. Populated Analytics Dashboard */}
      {!loading && !error && metrics && derivedStats.hasData && (
        <div className="analytics-dashboard">
          {/* Summary Metric KPI Cards (7 required metrics) */}
          <section className="analytics-kpi-grid" aria-label="Key performance indicators">
            {/* 1. Total Focus Time */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Clock size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{formatHoursMinutes(metrics.totalFocusTimeSeconds)}</div>
              <div className="card-label">Total Focus Time</div>
              <span className="card-subtext">Confirmed elapsed time</span>
            </div>

            {/* 2. Total Number of Sessions */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Target size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{metrics.sessionCount}</div>
              <div className="card-label">Total Sessions</div>
              <span className="card-subtext">Recorded in local DB</span>
            </div>

            {/* 3. Average Session Duration */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <TrendingUp size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">
                {formatHoursMinutes(metrics.averageSessionLengthSeconds)}
              </div>
              <div className="card-label">Average Duration</div>
              <span className="card-subtext">Per recorded session</span>
            </div>

            {/* 4. Total Away Time */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <UserMinus size={20} color="#f59e0b" aria-hidden="true" />
              </div>
              <div className="card-value">
                {metrics.totalAwayTimeSeconds > 0
                  ? formatHoursMinutes(metrics.totalAwayTimeSeconds)
                  : '0m'}
              </div>
              <div className="card-label">Total Away Time</div>
              <span className="card-subtext">Confirmed away periods</span>
            </div>

            {/* 5. Focus Indicator Score */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Zap size={20} color="var(--accent-color)" aria-hidden="true" />
              </div>
              <div className="card-value">
                {derivedStats.averageFocusScore !== null ? `${derivedStats.averageFocusScore}%` : '—'}
              </div>
              <div className="card-label">Focus Indicator</div>
              <span className="card-subtext">
                {derivedStats.averageFocusScore !== null ? 'Average score across sessions' : 'Insufficient data'}
              </span>
            </div>

            {/* 6. Screen-Facing Duration */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Eye size={20} color="var(--text-secondary)" aria-hidden="true" />
              </div>
              <div className={`card-value ${metrics.screenFacingDurationSeconds === null ? 'unavailable' : ''}`}>
                {metrics.screenFacingDurationSeconds !== null
                  ? formatHoursMinutes(metrics.screenFacingDurationSeconds)
                  : '—'}
              </div>
              <div className="card-label">Screen-Facing Time</div>
              <span className="analytics-kpi-badge">
                {metrics.screenFacingDurationSeconds !== null ? 'Observed' : 'Not tracked in local DB'}
              </span>
            </div>

            {/* 7. Posture Events */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <Activity size={20} color="var(--text-secondary)" aria-hidden="true" />
              </div>
              <div className={`card-value ${metrics.postureEventCount === null ? 'unavailable' : ''}`}>
                {metrics.postureEventCount !== null ? metrics.postureEventCount : '—'}
              </div>
              <div className="card-label">Posture Events</div>
              <span className="analytics-kpi-badge">
                {metrics.postureEventCount !== null ? 'Observed' : 'Not tracked in local DB'}
              </span>
            </div>

            {/* 8. Completion Rate */}
            <div className="card analytics-kpi-card">
              <div className="kpi-icon">
                <CheckCircle2 size={20} color="var(--success-color)" aria-hidden="true" />
              </div>
              <div className="card-value">{derivedStats.completionRate}%</div>
              <div className="card-label">Completion Rate</div>
              <span className="card-subtext">
                {derivedStats.completedSessions} of {derivedStats.totalSessions} completed
              </span>
            </div>
          </section>

          {/* Dedicated Visualization Section Prepared for Day 28 */}
          <section className="card analytics-section-card" aria-labelledby="visualization-section-title">
            <h2 id="visualization-section-title">Focus Trends & Distribution</h2>
            <p className="analytics-section-subtitle">
              Breakdown of session completion ratios and timeline trends across your local focus history.
            </p>

            {/* Session Outcome Distribution */}
            <div className="outcome-bars">
              <div className="outcome-row">
                <div className="outcome-info">
                  <span className="outcome-name">Completed</span>
                  <span className="outcome-numbers">
                    {derivedStats.completedSessions} ({derivedStats.totalSessions > 0 ? Math.round((derivedStats.completedSessions / derivedStats.totalSessions) * 100) : 0}%)
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={derivedStats.completedSessions} aria-valuemin={0} aria-valuemax={derivedStats.totalSessions}>
                  <div
                    className="progress-fill completed"
                    style={{
                      width: `${derivedStats.totalSessions > 0 ? (derivedStats.completedSessions / derivedStats.totalSessions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="outcome-row">
                <div className="outcome-info">
                  <span className="outcome-name">Cancelled Early</span>
                  <span className="outcome-numbers">
                    {derivedStats.cancelledSessions} ({derivedStats.totalSessions > 0 ? Math.round((derivedStats.cancelledSessions / derivedStats.totalSessions) * 100) : 0}%)
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={derivedStats.cancelledSessions} aria-valuemin={0} aria-valuemax={derivedStats.totalSessions}>
                  <div
                    className="progress-fill cancelled"
                    style={{
                      width: `${derivedStats.totalSessions > 0 ? (derivedStats.cancelledSessions / derivedStats.totalSessions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="outcome-row">
                <div className="outcome-info">
                  <span className="outcome-name">Interrupted / Shutdown</span>
                  <span className="outcome-numbers">
                    {derivedStats.interruptedSessions} ({derivedStats.totalSessions > 0 ? Math.round((derivedStats.interruptedSessions / derivedStats.totalSessions) * 100) : 0}%)
                  </span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={derivedStats.interruptedSessions} aria-valuemin={0} aria-valuemax={derivedStats.totalSessions}>
                  <div
                    className="progress-fill interrupted"
                    style={{
                      width: `${derivedStats.totalSessions > 0 ? (derivedStats.interruptedSessions / derivedStats.totalSessions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Interactive Daily & Weekly Visualizations (Day 28) */}
          <AnalyticsCharts sessions={sessions} scoreMap={scoreMap} />

          {/* Recent Sessions Summary Section */}
          {recentSessions.length > 0 && (
            <section className="card analytics-section-card" aria-labelledby="recent-sessions-title">
              <div className="analytics-recent-header">
                <div>
                  <h2 id="recent-sessions-title">Recent Focus Sessions</h2>
                  <p className="analytics-section-subtitle" style={{ marginBottom: 0 }}>
                    Overview of your latest sessions saved locally.
                  </p>
                </div>
                <Link to="/history" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                  View All History
                  <ArrowRight size={14} style={{ marginLeft: '4px' }} aria-hidden="true" />
                </Link>
              </div>

              <div className="analytics-recent-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="analytics-recent-item">
                    <div className="analytics-recent-info">
                      <Clock size={16} color="var(--accent-color)" aria-hidden="true" />
                      <div>
                        <strong>{formatSessionDate(session.startedAt)}</strong>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.8rem' }}>
                          {formatSessionTime(session.startedAt)}
                        </span>
                      </div>
                      <span className={`session-status-badge ${getStatusBadgeClass(session.status)}`}>
                        {getStatusLabel(session.status)}
                      </span>
                    </div>

                    <div className="analytics-recent-metrics">
                      <div>
                        Focus: <strong>{formatSessionDuration(session.elapsedSeconds)}</strong>
                      </div>
                      <div>
                        Planned: <strong>{formatSessionDuration(session.plannedDurationSeconds)}</strong>
                      </div>
                      {session.awayDurationSeconds !== undefined && (
                        <div>
                          Away: <strong>{formatSessionAwayDuration(session.awayDurationSeconds)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Privacy Disclaimer Footer */}
          <footer className="analytics-privacy-footer">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              All analytics and metrics are computed on-device using local SQLite storage. No session or biometric data is ever transmitted or uploaded.
            </span>
          </footer>
        </div>
      )}
    </div>
  );
};

export default Analytics;
