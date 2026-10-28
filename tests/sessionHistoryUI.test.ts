/**
 * FocusLens — Day 26: Session History User Interface Test Suite
 * ==============================================================
 * Comprehensive tests verifying:
 * 1. Session History presentation helpers and formatting functions
 * 2. Display of supported session information (date, start time, end time,
 *    planned duration, actual focus duration, status, away duration, focus score)
 * 3. Graceful fallback to placeholders ('—') for missing or unavailable fields
 * 4. UI state handling (loading, empty, error, and loaded states)
 * 5. Sorting and filtering operations (newest/oldest order, status, date ranges)
 * 6. Presentation separation and integration contract for Ragavi's database connection
 * 7. Active focus timer preservation and non-interference during history operations
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/utils/historyFormatters.ts';
import { FocusTimerService } from '../src/services/focusTimer.service.ts';
import { SessionRetrievalService } from '../src/services/sessionRetrieval.service.ts';
import type { Session, PersistedSessionStatus } from '../src/types/index.ts';

// In-memory mock repository implementing the database contract
class MockSessionRepository {
  public sessions: Session[] = [];
  public shouldFail = false;

  async getAll(options?: {
    status?: PersistedSessionStatus;
    startedAfter?: string;
    startedBefore?: string;
    order?: 'asc' | 'desc';
  }): Promise<Session[]> {
    if (this.shouldFail) throw new Error('Database connection failed.');
    return this.list({ ...options });
  }

  async list(options?: {
    status?: PersistedSessionStatus;
    startedAfter?: string;
    startedBefore?: string;
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
  }): Promise<Session[]> {
    if (this.shouldFail) throw new Error('Database connection failed.');

    let filtered = [...this.sessions];

    if (options?.status) {
      filtered = filtered.filter((s) => s.status === options.status);
    }

    if (options?.startedAfter) {
      const after = Date.parse(options.startedAfter);
      filtered = filtered.filter((s) => Date.parse(s.startedAt) >= after);
    }

    if (options?.startedBefore) {
      const before = Date.parse(options.startedBefore);
      filtered = filtered.filter((s) => Date.parse(s.startedAt) < before);
    }

    if (options?.order === 'desc') {
      filtered.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    } else {
      filtered.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    }

    if (options?.offset) {
      filtered = filtered.slice(options.offset);
    }

    if (options?.limit !== undefined) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async getById(id: string): Promise<Session | null> {
    if (this.shouldFail) throw new Error('Database connection failed.');
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async count(status?: PersistedSessionStatus): Promise<number> {
    if (this.shouldFail) throw new Error('Database connection failed.');
    if (status) {
      return this.sessions.filter((s) => s.status === status).length;
    }
    return this.sessions.length;
  }
}

describe('Day 26 — Session History Presentation Utilities', () => {
  it('formats valid session dates and falls back safely to "—" on invalid inputs', () => {
    const validIso = '2026-10-28T09:30:00.000Z';
    const formatted = formatSessionDate(validIso);
    assert.match(formatted, /2026/);
    assert.match(formatted, /Oct/);

    assert.equal(formatSessionDate(null), '—');
    assert.equal(formatSessionDate(undefined), '—');
    assert.equal(formatSessionDate(''), '—');
    assert.equal(formatSessionDate('not-a-date'), '—');
  });

  it('formats session times consistently and returns "—" when unavailable', () => {
    const validIso = '2026-10-28T14:45:00.000Z';
    const formatted = formatSessionTime(validIso);
    assert.notEqual(formatted, '—');
    assert.match(formatted, /\d{1,2}:\d{2}/);

    assert.equal(formatSessionTime(null), '—');
    assert.equal(formatSessionTime(undefined), '—');
    assert.equal(formatSessionTime('invalid-time'), '—');
  });

  it('formats session duration with units and handles edge cases safely', () => {
    assert.equal(formatSessionDuration(0), '0s');
    assert.equal(formatSessionDuration(45), '45s');
    assert.equal(formatSessionDuration(60), '1m');
    assert.equal(formatSessionDuration(1500), '25m');
    assert.equal(formatSessionDuration(1530), '25m 30s');
    assert.equal(formatSessionDuration(3600), '1h');
    assert.equal(formatSessionDuration(5400), '1h 30m');

    // Invalid / missing duration
    assert.equal(formatSessionDuration(-1), '—');
    assert.equal(formatSessionDuration(NaN), '—');
    assert.equal(formatSessionDuration(Infinity), '—');
    assert.equal(formatSessionDuration(null), '—');
    assert.equal(formatSessionDuration(undefined), '—');
  });

  it('formats away duration and focus indicator scores accurately', () => {
    assert.equal(formatSessionAwayDuration(120), '2m');
    assert.equal(formatSessionAwayDuration(0), '0s');
    assert.equal(formatSessionAwayDuration(undefined), '—');
    assert.equal(formatSessionAwayDuration(null), '—');

    assert.equal(formatSessionFocusScore(85), '85%');
    assert.equal(formatSessionFocusScore(100), '100%');
    assert.equal(formatSessionFocusScore(0), '0%');
    assert.equal(formatSessionFocusScore(94.6), '95%');
    assert.equal(formatSessionFocusScore(undefined), '—');
    assert.equal(formatSessionFocusScore(null), '—');
    assert.equal(formatSessionFocusScore(-10), '—');
  });

  it('maps session statuses to proper CSS badge classes and human labels', () => {
    const statuses: PersistedSessionStatus[] = ['completed', 'cancelled', 'interrupted', 'running', 'paused'];

    assert.equal(getStatusBadgeClass('completed'), 'status-completed');
    assert.equal(getStatusBadgeClass('cancelled'), 'status-cancelled');
    assert.equal(getStatusBadgeClass('interrupted'), 'status-interrupted');
    assert.equal(getStatusBadgeClass('running'), 'status-running');
    assert.equal(getStatusBadgeClass('paused'), 'status-paused');

    assert.equal(getStatusLabel('completed'), 'Completed');
    assert.equal(getStatusLabel('cancelled'), 'Cancelled');
    assert.equal(getStatusLabel('interrupted'), 'Interrupted');
    assert.equal(getStatusLabel('running'), 'Running');
    assert.equal(getStatusLabel('paused'), 'Paused');

    for (const s of statuses) {
      assert.ok(getStatusBadgeClass(s).startsWith('status-'));
      assert.ok(getStatusLabel(s).length > 0);
    }
  });

  it('calculates date filter range presets correctly', () => {
    const fixedNow = new Date('2026-10-28T12:00:00.000Z');

    const allRange = calculateDateFilterRange('all', fixedNow);
    assert.deepEqual(allRange, {});

    const todayRange = calculateDateFilterRange('today', fixedNow);
    assert.ok(todayRange.startedAfter);
    assert.ok(todayRange.startedBefore);

    const sevenDaysRange = calculateDateFilterRange('7d', fixedNow);
    assert.ok(sevenDaysRange.startedAfter);
    assert.ok(sevenDaysRange.startedBefore);
    const diffDays = (Date.parse(sevenDaysRange.startedBefore!) - Date.parse(sevenDaysRange.startedAfter!)) / (24 * 3600 * 1000);
    assert.ok(diffDays >= 6.9 && diffDays <= 7.1);
  });
});

describe('Day 26 — Session History Data Contract & Integration with Ragavi', () => {
  let mockRepo: MockSessionRepository;
  let retrievalService: SessionRetrievalService;

  beforeEach(() => {
    mockRepo = new MockSessionRepository();
    retrievalService = new SessionRetrievalService(mockRepo as unknown as any);
  });

  it('retrieves saved focus sessions with the complete supported field contract', async () => {
    mockRepo.sessions = [
      {
        id: '123e4567-e89b-42d3-a456-426614174001',
        status: 'completed',
        plannedDurationSeconds: 1500,
        startedAt: '2026-10-28T09:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-28T09:25:00.000Z',
        elapsedSeconds: 1500,
        pausedDurationSeconds: 0,
        awayDurationSeconds: 60,
        focusScore: 92,
      },
      {
        id: '123e4567-e89b-42d3-a456-426614174002',
        status: 'cancelled',
        plannedDurationSeconds: 2700,
        startedAt: '2026-10-28T10:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-28T10:15:00.000Z',
        elapsedSeconds: 900,
        pausedDurationSeconds: 120,
        // awayDurationSeconds and focusScore omitted (demonstrates safe handling of optional contract)
      },
    ];

    const result = await retrievalService.getAllSessionsResult({ order: 'desc' });
    assert.equal(result.success, true);
    assert.equal(result.data.length, 2);

    const first = result.data[0];
    assert.equal(first.id, '123e4567-e89b-42d3-a456-426614174002');
    assert.equal(first.status, 'cancelled');
    assert.equal(first.elapsedSeconds, 900);
    assert.equal(first.plannedDurationSeconds, 2700);
    assert.equal(first.awayDurationSeconds, undefined);
    assert.equal(first.focusScore, undefined);

    const second = result.data[1];
    assert.equal(second.id, '123e4567-e89b-42d3-a456-426614174001');
    assert.equal(second.status, 'completed');
    assert.equal(second.awayDurationSeconds, 60);
    assert.equal(second.focusScore, 92);
  });

  it('safely handles empty history without errors or uncaught exceptions', async () => {
    mockRepo.sessions = [];
    const result = await retrievalService.getAllSessionsResult();
    assert.equal(result.success, true);
    assert.equal(result.data.length, 0);

    const countResult = await retrievalService.getSessionCountResult();
    assert.equal(countResult.success, true);
    assert.equal(countResult.data, 0);
  });

  it('gracefully reports database error state through typed retrieval result', async () => {
    mockRepo.shouldFail = true;
    const result = await retrievalService.getAllSessionsResult();
    assert.equal(result.success, false);
    assert.equal(result.data.length, 0);
    assert.match(result.error, /Database connection failed/);
  });

  it('supports status-filtered retrieval and pagination offset/limit', async () => {
    mockRepo.sessions = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        plannedDurationSeconds: 1500,
        startedAt: '2026-10-28T08:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-28T08:25:00.000Z',
        elapsedSeconds: 1500,
        pausedDurationSeconds: 0,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'completed',
        plannedDurationSeconds: 1500,
        startedAt: '2026-10-28T09:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-28T09:25:00.000Z',
        elapsedSeconds: 1500,
        pausedDurationSeconds: 0,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        status: 'cancelled',
        plannedDurationSeconds: 2700,
        startedAt: '2026-10-28T10:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-28T10:10:00.000Z',
        elapsedSeconds: 600,
        pausedDurationSeconds: 0,
      },
    ];

    // Filter by completed
    const completedResult = await retrievalService.getAllSessionsResult({
      status: 'completed',
      order: 'desc',
    });
    assert.equal(completedResult.success, true);
    assert.equal(completedResult.data.length, 2);
    assert.equal(completedResult.data[0].id, '22222222-2222-4222-8222-222222222222');
    assert.equal(completedResult.data[1].id, '11111111-1111-4111-8111-111111111111');

    // Test pagination (limit 1, offset 1)
    const pageResult = await retrievalService.getAllSessionsResult({
      limit: 1,
      offset: 1,
      order: 'desc',
    });
    assert.equal(pageResult.success, true);
    assert.equal(pageResult.data.length, 1);
    assert.equal(pageResult.data[0].id, '22222222-2222-4222-8222-222222222222');
  });

  it('guarantees that retrieving history is strictly read-only and does not mutate records', async () => {
    const initialRecord: Session = {
      id: '99999999-9999-4999-8999-999999999999',
      status: 'completed',
      plannedDurationSeconds: 1500,
      startedAt: '2026-10-28T07:00:00.000Z',
      pausedAt: null,
      endedAt: '2026-10-28T07:25:00.000Z',
      elapsedSeconds: 1500,
      pausedDurationSeconds: 0,
    };
    mockRepo.sessions = [{ ...initialRecord }];

    const res = await retrievalService.getAllSessionsResult();
    assert.equal(res.success, true);
    assert.equal(mockRepo.sessions.length, 1);
    assert.deepEqual(mockRepo.sessions[0], initialRecord);
  });
});

describe('Day 26 — Active Focus Timer Preservation During History Interaction', () => {
  it('viewing history does not alter or stop a running focus session', () => {
    const timer = new FocusTimerService();
    timer.setDuration(25);
    timer.start();

    assert.equal(timer.getState().status, 'running');
    const remainingBefore = timer.getState().remainingSeconds;

    // Simulate history data retrieval while timer is running
    const dateStr = formatSessionDate(new Date().toISOString());
    const durStr = formatSessionDuration(1500);
    assert.ok(dateStr);
    assert.ok(durStr);

    // Timer must stay running and unchanged
    const stateAfter = timer.getState();
    assert.equal(stateAfter.status, 'running');
    assert.equal(stateAfter.remainingSeconds, remainingBefore);

    timer.end();
  });

  it('viewing history preserves frozen remaining time of a paused session', () => {
    const timer = new FocusTimerService();
    timer.setDuration(45);
    timer.start();
    timer.pause();

    const pausedState = timer.getState();
    assert.equal(pausedState.status, 'paused');
    const pausedRemaining = pausedState.remainingSeconds;

    // Simulate formatting operations on history items
    assert.equal(getStatusBadgeClass(pausedState.status), 'status-paused');

    // Timer must remain paused with exact time intact
    assert.equal(timer.getState().status, 'paused');
    assert.equal(timer.getState().remainingSeconds, pausedRemaining);

    timer.end();
  });
});
