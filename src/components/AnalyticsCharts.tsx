import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Target,
  UserMinus,
  Zap,
  BarChart2,
} from 'lucide-react';
import type { Session } from '../types';
import {
  aggregateDailyData,
  aggregateWeeklyData,
  getStartOfDay,
  getStartOfWeek,
} from '../utils/analyticsVisualizations';

interface AnalyticsChartsProps {
  sessions: Session[];
  scoreMap?: Map<string, number>;
}

export type AnalyticsViewMode = 'daily' | 'weekly';

function formatHoursMinutes(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ sessions, scoreMap }) => {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('weekly');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const todayStart = useMemo(() => getStartOfDay(new Date()), []);
  const currentWeekStart = useMemo(() => getStartOfWeek(new Date()), []);

  // Compute daily and weekly aggregates
  const dailyData = useMemo(() => {
    return aggregateDailyData(sessions, selectedDate, scoreMap);
  }, [sessions, selectedDate, scoreMap]);

  const weeklyData = useMemo(() => {
    return aggregateWeeklyData(sessions, selectedDate, scoreMap);
  }, [sessions, selectedDate, scoreMap]);

  // Navigation handlers
  const handlePrevPeriod = () => {
    setSelectedDate((current) => {
      const next = new Date(current);
      if (viewMode === 'daily') {
        next.setDate(next.getDate() - 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      return next;
    });
    setHoveredIndex(null);
  };

  const handleNextPeriod = () => {
    setSelectedDate((current) => {
      const next = new Date(current);
      if (viewMode === 'daily') {
        next.setDate(next.getDate() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      return next;
    });
    setHoveredIndex(null);
  };

  const handleJumpToCurrent = () => {
    setSelectedDate(new Date());
    setHoveredIndex(null);
  };

  // Determine if navigating forward should be disabled (prevent future dates)
  const isAtCurrentPeriod = useMemo(() => {
    if (viewMode === 'daily') {
      return getStartOfDay(selectedDate).getTime() >= todayStart.getTime();
    }
    return getStartOfWeek(selectedDate).getTime() >= currentWeekStart.getTime();
  }, [viewMode, selectedDate, todayStart, currentWeekStart]);

  return (
    <section className="card analytics-section-card" aria-labelledby="visualizations-title">
      {/* Visualizations Section Header */}
      <div className="analytics-visualization-header">
        <div>
          <h2 id="visualizations-title">Focus Activity & Trends</h2>
          <p className="analytics-section-subtitle" style={{ marginBottom: 0 }}>
            {viewMode === 'daily'
              ? 'Timeline breakdown of focus intervals and away duration for the selected day.'
              : 'Day-by-day distribution of focus time and score trends across the selected week.'}
          </p>
        </div>

        {/* View Switcher: Daily vs Weekly */}
        <div className="analytics-view-toggle" role="tablist" aria-label="Analytics view mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'daily'}
            className={`btn-view-toggle ${viewMode === 'daily' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('daily');
              setHoveredIndex(null);
            }}
          >
            Daily View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'weekly'}
            className={`btn-view-toggle ${viewMode === 'weekly' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('weekly');
              setHoveredIndex(null);
            }}
          >
            Weekly View
          </button>
        </div>
      </div>

      {/* Date Navigation Strip */}
      <nav className="analytics-period-nav" aria-label="Date navigation">
        <button
          type="button"
          className="btn-period-arrow"
          onClick={handlePrevPeriod}
          aria-label={viewMode === 'daily' ? 'Previous day' : 'Previous week'}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <div className="analytics-period-display">
          <Calendar size={16} color="var(--accent-color)" aria-hidden="true" />
          <span className="analytics-period-label">
            {viewMode === 'daily' ? dailyData.dateLabel : weeklyData.rangeLabel}
          </span>
          {isAtCurrentPeriod && (
            <span className="analytics-period-badge">
              {viewMode === 'daily' ? 'Today' : 'Current Week'}
            </span>
          )}
        </div>

        <div className="analytics-period-actions">
          <button
            type="button"
            className="btn-period-arrow"
            onClick={handleNextPeriod}
            disabled={isAtCurrentPeriod}
            aria-label={viewMode === 'daily' ? 'Next day' : 'Next week'}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>

          {!isAtCurrentPeriod && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
              onClick={handleJumpToCurrent}
            >
              Jump to {viewMode === 'daily' ? 'Today' : 'This Week'}
            </button>
          )}
        </div>
      </nav>

      {/* Summary Metric Strip for Selected Period */}
      <div className="analytics-summary-strip" aria-label="Period summary metrics">
        <div className="analytics-strip-stat">
          <Clock size={16} color="var(--accent-color)" aria-hidden="true" />
          <div>
            <span className="lbl">Focus Time</span>
            <strong className="val">
              {formatHoursMinutes(viewMode === 'daily' ? dailyData.totalFocusSeconds : weeklyData.totalFocusSeconds)}
            </strong>
          </div>
        </div>

        <div className="analytics-strip-stat">
          <Target size={16} color="var(--accent-color)" aria-hidden="true" />
          <div>
            <span className="lbl">Sessions</span>
            <strong className="val">
              {viewMode === 'daily' ? dailyData.sessionCount : weeklyData.totalSessions}
            </strong>
          </div>
        </div>

        <div className="analytics-strip-stat">
          <UserMinus size={16} color="#f59e0b" aria-hidden="true" />
          <div>
            <span className="lbl">Away Time</span>
            <strong className="val">
              {formatHoursMinutes(viewMode === 'daily' ? dailyData.totalAwaySeconds : weeklyData.totalAwaySeconds)}
            </strong>
          </div>
        </div>

        <div className="analytics-strip-stat">
          <Zap size={16} color="#10b981" aria-hidden="true" />
          <div>
            <span className="lbl">Focus Score</span>
            <strong className="val">
              {(viewMode === 'daily' ? dailyData.averageFocusScore : weeklyData.averageFocusScore) !== null
                ? `${viewMode === 'daily' ? dailyData.averageFocusScore : weeklyData.averageFocusScore}%`
                : '—'}
            </strong>
          </div>
        </div>
      </div>

      {/* Charts Area */}
      {viewMode === 'daily' ? (
        /* ================= DAILY VIEW ================= */
        <DailyChartPanel data={dailyData} hoveredIndex={hoveredIndex} onHover={setHoveredIndex} />
      ) : (
        /* ================= WEEKLY VIEW ================= */
        <WeeklyChartPanel data={weeklyData} hoveredIndex={hoveredIndex} onHover={setHoveredIndex} />
      )}
    </section>
  );
};

/* ==========================================================================
   Daily Chart Panel Component
   ========================================================================== */
interface DailyChartPanelProps {
  data: ReturnType<typeof aggregateDailyData>;
  hoveredIndex: number | null;
  onHover: (idx: number | null) => void;
}

const DailyChartPanel: React.FC<DailyChartPanelProps> = ({ data, hoveredIndex, onHover }) => {
  if (!data.hasData) {
    return (
      <div className="analytics-chart-empty" role="region" aria-label="No data for selected day">
        <BarChart2 size={36} color="var(--text-secondary)" aria-hidden="true" />
        <h3>No focus sessions on this day</h3>
        <p>There are no recorded sessions on {data.dateLabel}. Use the navigation arrows to inspect past days.</p>
      </div>
    );
  }

  // Calculate max minutes for SVG Y scale (at least 30 mins)
  const maxFocusMinutes = Math.max(
    ...data.intervals.map((i) => Math.ceil(i.focusSeconds / 60)),
    30,
  );
  const chartHeight = 200;
  const chartWidth = 600;
  const paddingLeft = 45;
  const paddingBottom = 35;
  const paddingTop = 25;
  const availableWidth = chartWidth - paddingLeft - 20;
  const availableHeight = chartHeight - paddingTop - paddingBottom;
  const intervalWidth = availableWidth / data.intervals.length;
  const barWidth = Math.max(12, Math.min(28, intervalWidth * 0.5));

  // Y-axis tick marks
  const yTicks = [0, Math.round(maxFocusMinutes / 2), maxFocusMinutes];

  return (
    <div className="analytics-chart-wrapper" aria-label="Daily focus time chart">
      {/* Legend */}
      <div className="analytics-chart-legend">
        <span className="legend-item">
          <span className="legend-color-dot focus-dot" /> Focus Time (mins)
        </span>
        <span className="legend-item">
          <span className="legend-color-dot away-dot" /> Away Time (mins)
        </span>
        <span className="legend-item">
          <span className="legend-color-dot score-dot" /> Focus Score
        </span>
      </div>

      {/* SVG Daily Chart */}
      <svg
        className="analytics-chart-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Daily focus timeline chart for ${data.dateLabel}`}
      >
        {/* Horizontal gridlines and Y-axis labels */}
        {yTicks.map((tickVal) => {
          const y = paddingTop + availableHeight - (tickVal / maxFocusMinutes) * availableHeight;
          return (
            <g key={tickVal}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - 20}
                y2={y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray={tickVal === 0 ? 'none' : '3 3'}
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-secondary)"
              >
                {tickVal}m
              </text>
            </g>
          );
        })}

        {/* Interval Bars */}
        {data.intervals.map((interval, idx) => {
          const focusMins = Math.round(interval.focusSeconds / 60);
          const awayMins = Math.round(interval.awaySeconds / 60);
          const barHeight = Math.max(
            focusMins > 0 ? 3 : 0,
            (focusMins / maxFocusMinutes) * availableHeight,
          );
          const awayHeight = Math.max(
            awayMins > 0 ? 3 : 0,
            (awayMins / maxFocusMinutes) * availableHeight,
          );

          const centerX = paddingLeft + idx * intervalWidth + intervalWidth / 2;
          const focusX = centerX - barWidth / 2;
          const y = paddingTop + availableHeight - barHeight;
          const isHovered = hoveredIndex === idx;

          return (
            <g
              key={interval.label}
              onMouseEnter={() => onHover(idx)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Highlight background on hover */}
              {isHovered && (
                <rect
                  x={centerX - intervalWidth / 2 + 2}
                  y={paddingTop}
                  width={intervalWidth - 4}
                  height={availableHeight}
                  fill="rgba(255, 255, 255, 0.04)"
                  rx="4"
                />
              )}

              {/* Focus Bar */}
              {barHeight > 0 && (
                <rect
                  x={focusX}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={isHovered ? '#818cf8' : '#6366f1'}
                  rx="3"
                />
              )}

              {/* Away Bar (stacked or small accent marker) */}
              {awayHeight > 0 && (
                <rect
                  x={focusX}
                  y={y - awayHeight - 2}
                  width={barWidth}
                  height={awayHeight}
                  fill="#f59e0b"
                  rx="2"
                  opacity={0.85}
                />
              )}

              {/* Focus Score Indicator Dot */}
              {interval.focusScore !== null && (
                <circle
                  cx={centerX}
                  cy={Math.max(12, y - 8)}
                  r={isHovered ? 4.5 : 3.5}
                  fill="#10b981"
                  stroke="#1e1e2d"
                  strokeWidth="1.5"
                />
              )}

              {/* X-axis Label */}
              <text
                x={centerX}
                y={chartHeight - 12}
                textAnchor="middle"
                fontSize="10"
                fill={isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                fontWeight={isHovered ? '600' : 'normal'}
              >
                {interval.label.split('–')[0]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip on Hover */}
      {hoveredIndex !== null && data.intervals[hoveredIndex] && (
        <div className="analytics-chart-tooltip" role="tooltip">
          <strong>{data.intervals[hoveredIndex].label}</strong>
          <div>
            Focus: <strong>{formatHoursMinutes(data.intervals[hoveredIndex].focusSeconds)}</strong>
          </div>
          {data.intervals[hoveredIndex].awaySeconds > 0 && (
            <div>
              Away: <strong>{formatHoursMinutes(data.intervals[hoveredIndex].awaySeconds)}</strong>
            </div>
          )}
          <div>
            Sessions: <strong>{data.intervals[hoveredIndex].sessionCount}</strong>
          </div>
          {data.intervals[hoveredIndex].focusScore !== null && (
            <div>
              Focus Score: <strong>{data.intervals[hoveredIndex].focusScore}%</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Weekly Chart Panel Component
   ========================================================================== */
interface WeeklyChartPanelProps {
  data: ReturnType<typeof aggregateWeeklyData>;
  hoveredIndex: number | null;
  onHover: (idx: number | null) => void;
}

const WeeklyChartPanel: React.FC<WeeklyChartPanelProps> = ({ data, hoveredIndex, onHover }) => {
  if (!data.hasData) {
    return (
      <div className="analytics-chart-empty" role="region" aria-label="No data for selected week">
        <BarChart2 size={36} color="var(--text-secondary)" aria-hidden="true" />
        <h3>No focus sessions for this week</h3>
        <p>No focus activity was recorded during {data.rangeLabel}. Navigate back to inspect previous weeks.</p>
      </div>
    );
  }

  const maxDailyMinutes = Math.max(
    ...data.days.map((d) => Math.ceil(d.focusSeconds / 60)),
    30,
  );
  const chartHeight = 220;
  const chartWidth = 600;
  const paddingLeft = 45;
  const paddingBottom = 40;
  const paddingTop = 30;
  const availableWidth = chartWidth - paddingLeft - 20;
  const availableHeight = chartHeight - paddingTop - paddingBottom;
  const colWidth = availableWidth / 7;
  const barWidth = Math.max(16, Math.min(32, colWidth * 0.45));

  const yTicks = [0, Math.round(maxDailyMinutes / 2), maxDailyMinutes];

  // Coordinates for Focus Score Trendline across the 7 days
  const scoreTrendPoints: Array<{ x: number; y: number; score: number }> = [];
  data.days.forEach((day, idx) => {
    if (day.focusScore !== null) {
      const x = paddingLeft + idx * colWidth + colWidth / 2;
      // Score scaled to top 25% of chart
      const y = paddingTop + 10 + (1 - day.focusScore / 100) * 35;
      scoreTrendPoints.push({ x, y, score: day.focusScore });
    }
  });

  return (
    <div className="analytics-chart-wrapper" aria-label="Weekly focus time chart">
      {/* Legend */}
      <div className="analytics-chart-legend">
        <span className="legend-item">
          <span className="legend-color-dot focus-dot" /> Focus Time (mins)
        </span>
        <span className="legend-item">
          <span className="legend-color-dot away-dot" /> Away Time (mins)
        </span>
        <span className="legend-item">
          <span className="legend-color-dot score-dot" /> Focus Score Trend (%)
        </span>
      </div>

      {/* SVG Weekly Chart */}
      <svg
        className="analytics-chart-svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Weekly focus distribution chart for ${data.rangeLabel}`}
      >
        {/* Horizontal gridlines and Y-axis labels */}
        {yTicks.map((tickVal) => {
          const y = paddingTop + availableHeight - (tickVal / maxDailyMinutes) * availableHeight;
          return (
            <g key={tickVal}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - 20}
                y2={y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray={tickVal === 0 ? 'none' : '3 3'}
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-secondary)"
              >
                {tickVal}m
              </text>
            </g>
          );
        })}

        {/* 7 Daily Columns */}
        {data.days.map((day, idx) => {
          const focusMins = Math.round(day.focusSeconds / 60);
          const awayMins = Math.round(day.awaySeconds / 60);
          const barHeight = Math.max(
            focusMins > 0 ? 3 : 0,
            (focusMins / maxDailyMinutes) * availableHeight,
          );
          const awayHeight = Math.max(
            awayMins > 0 ? 3 : 0,
            (awayMins / maxDailyMinutes) * availableHeight,
          );

          const centerX = paddingLeft + idx * colWidth + colWidth / 2;
          const focusX = centerX - barWidth / 2;
          const y = paddingTop + availableHeight - barHeight;
          const isHovered = hoveredIndex === idx;

          return (
            <g
              key={day.dayName}
              onMouseEnter={() => onHover(idx)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Column Hover Highlight */}
              {isHovered && (
                <rect
                  x={centerX - colWidth / 2 + 2}
                  y={paddingTop}
                  width={colWidth - 4}
                  height={availableHeight}
                  fill="rgba(255, 255, 255, 0.04)"
                  rx="6"
                />
              )}

              {/* Focus Bar */}
              {barHeight > 0 && (
                <rect
                  x={focusX}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={isHovered ? '#818cf8' : '#6366f1'}
                  rx="4"
                />
              )}

              {/* Away Bar */}
              {awayHeight > 0 && (
                <rect
                  x={focusX}
                  y={y - awayHeight - 2}
                  width={barWidth}
                  height={awayHeight}
                  fill="#f59e0b"
                  rx="2"
                  opacity={0.85}
                />
              )}

              {/* Score Badge Label over column */}
              {day.focusScore !== null && (
                <text
                  x={centerX}
                  y={Math.max(14, y - (awayHeight > 0 ? awayHeight + 6 : 6))}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#10b981"
                  fontWeight="600"
                >
                  {day.focusScore}%
                </text>
              )}

              {/* Day Name */}
              <text
                x={centerX}
                y={chartHeight - 22}
                textAnchor="middle"
                fontSize="11"
                fill={isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                fontWeight={isHovered ? '600' : '500'}
              >
                {day.dayName}
              </text>

              {/* Date Number Label */}
              <text
                x={centerX}
                y={chartHeight - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#71717a"
              >
                {day.fullDateLabel.split(' ')[1]}
              </text>
            </g>
          );
        })}

        {/* Score Trendline connecting scored days */}
        {scoreTrendPoints.length > 1 && (
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="4 4"
            points={scoreTrendPoints.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        )}
      </svg>

      {/* Tooltip on Hover */}
      {hoveredIndex !== null && data.days[hoveredIndex] && (
        <div className="analytics-chart-tooltip" role="tooltip">
          <strong>{data.days[hoveredIndex].dayName} ({data.days[hoveredIndex].fullDateLabel})</strong>
          <div>
            Focus Time: <strong>{formatHoursMinutes(data.days[hoveredIndex].focusSeconds)}</strong>
          </div>
          {data.days[hoveredIndex].awaySeconds > 0 && (
            <div>
              Away Time: <strong>{formatHoursMinutes(data.days[hoveredIndex].awaySeconds)}</strong>
            </div>
          )}
          <div>
            Sessions: <strong>{data.days[hoveredIndex].sessionCount}</strong>
          </div>
          {data.days[hoveredIndex].focusScore !== null && (
            <div>
              Focus Score: <strong>{data.days[hoveredIndex].focusScore}%</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
