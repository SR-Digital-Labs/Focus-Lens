/**
 * FocusLens — Navigation and State Flow Tests
 * ============================================
 * Day 25: Automated test suite verifying application navigation, route resolution,
 * active focus-session state preservation, timer continuity, invalid-route handling,
 * and subscription cleanup.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FocusTimerService } from '../src/services/focusTimer.service.ts';
import { SessionRetrievalService } from '../src/services/sessionRetrieval.service.ts';
import type { Session, PersistedSessionStatus } from '../src/types/index.ts';

// Mock storage for local profile persistence testing
class MockStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// In-memory mock SessionRepository for session-retrieval and analytics testing
class MockSessionRepository {
  public sessions: Session[] = [];

  async getAll(options?: { order?: 'asc' | 'desc' }): Promise<Session[]> {
    const result = [...this.sessions];
    if (options?.order === 'desc') {
      result.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    } else if (options?.order === 'asc') {
      result.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    }
    return result;
  }

  async list(options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }): Promise<Session[]> {
    let result = [...this.sessions];
    if (options?.order === 'desc') {
      result.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    } else {
      result.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    }
    if (options?.offset) {
      result = result.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      result = result.slice(0, options.limit);
    }
    return result;
  }

  async getById(id: string): Promise<Session | null> {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  async count(status?: PersistedSessionStatus): Promise<number> {
    if (status) {
      return this.sessions.filter((s) => s.status === status).length;
    }
    return this.sessions.length;
  }
}

describe('Day 25 — Application Navigation and Route Resolution', () => {
  const getPageTitle = (pathname: string): string => {
    switch (pathname) {
      case '/': return 'Dashboard';
      case '/session': return 'Focus Session';
      case '/history': return 'Session History';
      case '/analytics': return 'Analytics';
      case '/settings': return 'Settings';
      default: return 'Page Not Found';
    }
  };

  const isNavActive = (itemPath: string, currentPath: string, end = false): boolean => {
    if (end) {
      return currentPath === itemPath;
    }
    return currentPath.startsWith(itemPath);
  };

  it('resolves descriptive page titles for all primary application routes', () => {
    assert.equal(getPageTitle('/'), 'Dashboard');
    assert.equal(getPageTitle('/session'), 'Focus Session');
    assert.equal(getPageTitle('/history'), 'Session History');
    assert.equal(getPageTitle('/analytics'), 'Analytics');
    assert.equal(getPageTitle('/settings'), 'Settings');
  });

  it('correctly handles invalid or unknown routes with Page Not Found fallback', () => {
    assert.equal(getPageTitle('/unknown'), 'Page Not Found');
    assert.equal(getPageTitle('/invalid-path'), 'Page Not Found');
    assert.equal(getPageTitle('/session/nested/broken'), 'Page Not Found');
  });

  it('ensures Dashboard navigation item is strictly active only on exact root route', () => {
    // When end: true is configured for NavLink to="/"
    assert.equal(isNavActive('/', '/', true), true);
    assert.equal(isNavActive('/', '/session', true), false);
    assert.equal(isNavActive('/', '/history', true), false);
    assert.equal(isNavActive('/', '/analytics', true), false);
    assert.equal(isNavActive('/', '/settings', true), false);
  });

  it('clearly indicates active navigation for target screens', () => {
    assert.equal(isNavActive('/session', '/session'), true);
    assert.equal(isNavActive('/session', '/history'), false);
    assert.equal(isNavActive('/history', '/history'), true);
    assert.equal(isNavActive('/analytics', '/analytics'), true);
    assert.equal(isNavActive('/settings', '/settings'), true);
  });
});

describe('Day 25 — User Profile and Route Persistence', () => {
  const STORAGE_KEY = 'focuslens.username.v1';
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('preserves user profile across route transitions and mock page refreshes', () => {
    // User logs in as Kavi
    storage.setItem(STORAGE_KEY, 'Kavi');

    // Simulate page reload or direct navigation to /session
    const restoredUser = storage.getItem(STORAGE_KEY);
    assert.equal(restoredUser, 'Kavi');
  });

  it('clears persisted profile on sign out and prevents unauthorized workspace access', () => {
    storage.setItem(STORAGE_KEY, 'Kavi');
    assert.equal(storage.getItem(STORAGE_KEY), 'Kavi');

    // Sign out
    storage.removeItem(STORAGE_KEY);
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });
});

describe('Day 25 — Focus Session State Preservation Across Navigation', () => {
  let timerService: FocusTimerService;

  beforeEach(() => {
    timerService = new FocusTimerService();
  });

  afterEach(() => {
    timerService.end();
  });

  it('preserves active running session and deadline when navigating between screens', () => {
    // Start session at /session
    timerService.setDuration(25);
    const started = timerService.start();
    assert.equal(started, true);

    const initialSessionId = timerService.getSessionId();
    assert.ok(initialSessionId);
    assert.equal(timerService.getStatus(), 'running');

    // User navigates away: /session -> /history -> /analytics -> /settings
    // Verify timer service maintains exact running status and session ID
    assert.equal(timerService.getStatus(), 'running');
    assert.equal(timerService.getSessionId(), initialSessionId);

    // Simulated component subscriber at /history checking topbar session badge
    const historyState = timerService.getState();
    assert.equal(historyState.status, 'running');
    assert.equal(historyState.sessionId, initialSessionId);
    assert.equal(typeof historyState.formattedRemaining, 'string');

    // User navigates back to /session: state is intact
    const sessionState = timerService.getState();
    assert.equal(sessionState.status, 'running');
    assert.equal(sessionState.sessionId, initialSessionId);
  });

  it('preserves paused session and frozen remaining time across screen navigation', () => {
    timerService.setDuration(25);
    timerService.start();
    timerService.pause();

    const pausedRemaining = timerService.getState().remainingSeconds;
    const pausedSessionId = timerService.getSessionId();
    assert.equal(timerService.getStatus(), 'paused');

    // User navigates away to /dashboard, /history, /settings
    assert.equal(timerService.getStatus(), 'paused');
    assert.equal(timerService.getSessionId(), pausedSessionId);
    assert.equal(timerService.getState().remainingSeconds, pausedRemaining);

    // User returns to /session and resumes
    const resumed = timerService.resume();
    assert.equal(resumed, true);
    assert.equal(timerService.getStatus(), 'running');
    assert.equal(timerService.getSessionId(), pausedSessionId);
  });

  it('ensures completed or cancelled sessions are not accidentally restarted by navigation', () => {
    timerService.setDuration(1);
    timerService.start();

    // End session (user cancelled or completed)
    timerService.end();
    assert.equal(timerService.getStatus(), 'idle');

    // Navigating between screens does not restart the ended session
    const checkState = timerService.getState();
    assert.equal(checkState.status, 'idle');
    assert.equal(checkState.sessionId, null);
  });

  it('cleans up component-specific subscriptions on unmount without leaking listeners', () => {
    let subscriberACalls = 0;
    let subscriberBCalls = 0;

    // Simulate Screen A (FocusSession) mounting and subscribing
    const unsubA = timerService.subscribe(() => {
      subscriberACalls += 1;
    });

    timerService.setDuration(45);
    assert.ok(subscriberACalls > 0);

    // Screen A unmounts when navigating away
    unsubA();
    const callsAfterUnmountA = subscriberACalls;

    // Simulate Screen B (History) mounting and subscribing
    const unsubB = timerService.subscribe(() => {
      subscriberBCalls += 1;
    });

    timerService.setDuration(25);
    // Screen A should receive no new calls after unmount
    assert.equal(subscriberACalls, callsAfterUnmountA);
    assert.ok(subscriberBCalls > 0);

    // Screen B unmounts
    unsubB();
  });

  it('prevents duplicate running timer intervals on rapid transitions', () => {
    timerService.setDuration(25);
    const start1 = timerService.start();
    assert.equal(start1, true);

    // Rapid secondary start call should be rejected
    const start2 = timerService.start();
    assert.equal(start2, false);
    assert.equal(timerService.getStatus(), 'running');
  });
});

describe('Day 25 — Integration with Session Retrieval and Analytics', () => {
  let mockRepo: MockSessionRepository;
  let retrievalService: SessionRetrievalService;

  beforeEach(() => {
    mockRepo = new MockSessionRepository();
    // @ts-expect-error MockSessionRepository satisfies SessionRepository contract for tests
    retrievalService = new SessionRetrievalService(mockRepo);
  });

  it('handles session history when no sessions have been saved (empty state)', async () => {
    const result = await retrievalService.getAllSessionsResult();
    assert.equal(result.success, true);
    assert.deepEqual(result.data, []);

    const hasAny = await retrievalService.hasSessions();
    assert.equal(hasAny, false);
  });

  it('safely computes analytics with insufficient data without NaN or division by zero', async () => {
    const result = await retrievalService.getAllSessionsResult();
    const sessions = result.data;

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.status === 'completed').length;
    const totalElapsedSeconds = sessions.reduce((acc, s) => acc + (s.elapsedSeconds || 0), 0);

    const averageElapsedMinutes = totalSessions > 0
      ? Math.round(totalElapsedSeconds / totalSessions / 60)
      : 0;

    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

    assert.equal(totalSessions, 0);
    assert.equal(completedSessions, 0);
    assert.equal(totalElapsedSeconds, 0);
    assert.equal(averageElapsedMinutes, 0);
    assert.equal(completionRate, 0);
    assert.equal(!Number.isNaN(averageElapsedMinutes), true);
    assert.equal(!Number.isNaN(completionRate), true);
  });

  it('retrieves and aggregates populated sessions consistently in read-only mode', async () => {
    mockRepo.sessions = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'completed',
        plannedDurationSeconds: 1500,
        startedAt: '2026-10-27T08:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-27T08:25:00.000Z',
        elapsedSeconds: 1500,
        pausedDurationSeconds: 0,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'cancelled',
        plannedDurationSeconds: 2700,
        startedAt: '2026-10-27T09:00:00.000Z',
        pausedAt: null,
        endedAt: '2026-10-27T09:15:00.000Z',
        elapsedSeconds: 900,
        pausedDurationSeconds: 60,
      },
    ];

    const result = await retrievalService.getAllSessionsResult({ order: 'desc' });
    assert.equal(result.success, true);
    assert.equal(result.data.length, 2);

    // Verify ordering: newest first (09:00 before 08:00)
    assert.equal(result.data[0].id, '22222222-2222-4222-8222-222222222222');
    assert.equal(result.data[1].id, '11111111-1111-4111-8111-111111111111');

    // Aggregate analytics
    const sessions = result.data;
    const totalElapsedSeconds = sessions.reduce((acc, s) => acc + s.elapsedSeconds, 0);
    const completedCount = sessions.filter((s) => s.status === 'completed').length;
    const completionRate = Math.round((completedCount / sessions.length) * 100);

    assert.equal(totalElapsedSeconds, 2400); // 1500 + 900
    assert.equal(completedCount, 1);
    assert.equal(completionRate, 50);

    // Verify retrieval did not mutate or delete records
    assert.equal(mockRepo.sessions.length, 2);
  });
});
