/**
 * FocusLens — useActivityEvents Hook
 * ==================================
 * Day 17: React hook providing ergonomic access to ActivityEventTrackerService.
 * Automatically synchronizes with the event tracker service, tracking
 * state transitions, recent events, and active session event counts.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  activityEventTracker,
  type TrackedStateSnapshot,
} from '../services/activityEventTracker.service';
import type { ActivityEvent, ActivityEventCategory } from '../types';

export interface UseActivityEventsResult {
  events: ActivityEvent[];
  latestEvent: ActivityEvent | null;
  eventCount: number;
  trackedStates: TrackedStateSnapshot;
  isTracking: boolean;
  activeSessionId: string | null;
  getEventsByCategory: (category: ActivityEventCategory) => ActivityEvent[];
  clearEvents: () => void;
}

export function useActivityEvents(sessionId?: string): UseActivityEventsResult {
  const [events, setEvents] = useState<ActivityEvent[]>(() =>
    activityEventTracker.getEvents(sessionId)
  );
  const [trackedStates, setTrackedStates] = useState<TrackedStateSnapshot>(() =>
    activityEventTracker.getCurrentTrackedStates()
  );
  const [isTracking, setIsTracking] = useState<boolean>(() =>
    activityEventTracker.isTracking()
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    activityEventTracker.getActiveSessionId()
  );

  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    setEvents(activityEventTracker.getEvents(sessionId));
    setTrackedStates(activityEventTracker.getCurrentTrackedStates());
    setIsTracking(activityEventTracker.isTracking());
    setActiveSessionId(activityEventTracker.getActiveSessionId());
  }

  useEffect(() => {
    const unsubscribe = activityEventTracker.subscribe((newEvent) => {
      if (!sessionId || newEvent.sessionId === sessionId) {
        setEvents((prev) => [...prev, newEvent]);
      }
      setTrackedStates(activityEventTracker.getCurrentTrackedStates());
      setIsTracking(activityEventTracker.isTracking());
      setActiveSessionId(activityEventTracker.getActiveSessionId());
    });

    return () => {
      unsubscribe();
    };
  }, [sessionId]);

  const getEventsByCategory = useCallback(
    (category: ActivityEventCategory) => {
      return activityEventTracker.getEventsByCategory(category, sessionId);
    },
    [sessionId]
  );

  const clearEvents = useCallback(() => {
    activityEventTracker.clearEvents();
    setEvents([]);
  }, []);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    events,
    latestEvent,
    eventCount: events.length,
    trackedStates,
    isTracking,
    activeSessionId,
    getEventsByCategory,
    clearEvents,
  };
}
