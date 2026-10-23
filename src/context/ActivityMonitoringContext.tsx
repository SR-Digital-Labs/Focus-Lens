import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ActivityMonitoringState } from '../services/contracts';
import { ActivityMonitoringContext } from './activityMonitoring.context';
import { ActivitySessionMonitor } from '../services/activitySessionMonitor.service';
import {
  AwayDetectionService,
  getAwayDetectionStorage,
  type AwayDetectionSnapshot,
} from '../services/awayDetection.service';
import { cvService } from '../services/cv.service';
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
    let persistenceAvailable = false;
    let servicesStopped = false;
    let stopServices: (() => void) | null = null;
    let flushPersistence: () => Promise<void> = async () => {};
    let interruptPersistence: () => Promise<void> = flushPersistence;
    let closeApproved = false;
    let closeInProgress = false;
    let unlistenClose: (() => void) | null = null;
    const desktopWindow = isTauri() ? getCurrentWindow() : null;

    const startMonitoring = async () => {
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
          flushPersistence = () => persistence.flush();
          interruptPersistence = () => persistence.interrupt();
          stopServices = () => {
            stopPersistence();
          };
        }
      } catch (error) {
        console.error('Unable to start local away tracking:', error);
      }

      // Manage CV pipeline lifecycle alongside focus sessions
      const unsubscribeTimerCv = focusTimerService.subscribe((timerState) => {
        if (timerState.status === 'running') {
          if (cvService.isAvailable() && !cvService.isRunning()) {
            void cvService.start().catch((err) => {
              console.warn('[ActivityMonitoring] CV pipeline failed to start:', err);
            });
          }
        } else if (timerState.status === 'idle' || timerState.status === 'completed') {
          if (cvService.isRunning()) {
            void cvService.stop().catch((err) => {
              console.warn('[ActivityMonitoring] CV pipeline failed to stop:', err);
            });
          }
        }
      });

      const previousStop = stopServices;
      stopServices = () => {
        if (servicesStopped) {
          return;
        }
        servicesStopped = true;
        unsubscribeTimerCv();
        previousStop?.();
        stopAway();
        unsubscribeAway();
        stopMonitor();
        unsubscribeActivity();
      };
    };

    const startup = startMonitoring();
    if (desktopWindow) {
      void desktopWindow.onCloseRequested(async (event) => {
        if (closeApproved) {
          return;
        }
        event.preventDefault();
        if (closeInProgress) {
          return;
        }
        closeInProgress = true;
        try {
          await startup;
          stopServices?.();
          await interruptPersistence();
          await cvService.stop();
          cvService.teardown();
          if (persistenceAvailable) {
            await sessionService.interruptUnfinished();
          }
          await dbService.close();
          closeApproved = true;
          await desktopWindow.close();
        } catch (error) {
          closeInProgress = false;
          console.error('Unable to safely close FocusLens desktop resources:', error);
        }
      }).then((unlisten) => {
        if (mounted) {
          unlistenClose = unlisten;
        } else {
          unlisten();
        }
      }).catch((error: unknown) => {
        console.error('Unable to register the desktop close handler:', error);
      });
    }

    return () => {
      mounted = false;
      unlistenClose?.();
      stopServices?.();
      if (!closeApproved) {
        void cvService.stop().then(() => cvService.teardown()).catch((error: unknown) => {
          console.warn('[ActivityMonitoring] CV pipeline failed to stop during cleanup:', error);
        });
        void flushPersistence().catch((error: unknown) => {
          console.error('Unable to flush focus-session activity during cleanup:', error);
        });
      }
    };
  }, []);

  return (
    <ActivityMonitoringContext.Provider value={{ activityState, awayState }}>
      {children}
    </ActivityMonitoringContext.Provider>
  );
}
