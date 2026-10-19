import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActivityMonitoringState } from '../services/contracts';
import { ActivityMonitoringContext } from './activityMonitoring.context';
import { ActivitySessionMonitor } from '../services/activitySessionMonitor.service';
import {
  AwayDetectionService,
  getAwayDetectionStorage,
  type AwayDetectionSnapshot,
} from '../services/awayDetection.service';
import { focusLensService } from '../services/focusLensService';
import { focusTimerService } from '../services/focusTimer.service';
import {
  activityEventRepository,
  dbService,
} from '../services/db.service';
import { SessionPersistenceService } from '../services/sessionPersistence.service';
import { sessionService } from '../services/session.service';

const INITIAL_ACTIVITY_STATE: ActivityMonitoringState = {
  sessionId: null,
  status: 'inactive',
  signal: null,
  error: null,
};

const INITIAL_AWAY_STATE: AwayDetectionSnapshot = {
  sessionId: null,
  awayStartedAt: null,
  awayDurationMs: 0,
  thresholdMinutes: 5,
  events: [],
};

export function ActivityMonitoringProvider({ children }: { children: ReactNode }) {
  const [activityState, setActivityState] = useState(INITIAL_ACTIVITY_STATE);
  const [awayState, setAwayState] = useState(INITIAL_AWAY_STATE);

  useEffect(() => {
    let mounted = true;
    let stopServices: (() => void) | null = null;

    const startMonitoring = async () => {
      let persistenceAvailable = false;
      try {
        await dbService.initialize();
        await sessionService.interruptUnfinished();
        persistenceAvailable = true;
      } catch (error) {
        console.error('Unable to initialize local session storage:', error);
      }
      if (!mounted) {
        return;
      }

      const monitor = new ActivitySessionMonitor(focusLensService, focusTimerService);
      const unsubscribeActivity = monitor.subscribe(setActivityState);
      const stopMonitor = monitor.start();
      let unsubscribeAway = () => {};
      let stopAway = () => {};
      try {
        const awayDetector = new AwayDetectionService({
          activity: monitor,
          timer: focusTimerService,
          storage: getAwayDetectionStorage(),
        });
        unsubscribeAway = awayDetector.subscribe(setAwayState);
        stopAway = awayDetector.start();

        if (persistenceAvailable) {
          const persistence = new SessionPersistenceService({
            activity: monitor,
            timer: focusTimerService,
            away: awayDetector,
            sessions: sessionService,
            events: activityEventRepository,
            onError: (error) => {
              console.error('Unable to persist focus-session activity:', error);
            },
          });
          const stopPersistence = persistence.start();
          stopServices = () => {
            stopPersistence();
            void persistence.flush();
          };
        }
      } catch (error) {
        console.error('Unable to start local away tracking:', error);
      }

      const previousStop = stopServices;
      stopServices = () => {
        stopAway();
        unsubscribeAway();
        stopMonitor();
        unsubscribeActivity();
        previousStop?.();
      };
    };

    void startMonitoring();
    return () => {
      mounted = false;
      stopServices?.();
    };
  }, []);

  return (
    <ActivityMonitoringContext.Provider value={{ activityState, awayState }}>
      {children}
    </ActivityMonitoringContext.Provider>
  );
}
