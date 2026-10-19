import { createContext } from 'react';
import type { ActivityMonitoringState } from '../services/contracts';
import type { AwayDetectionSnapshot } from '../services/awayDetection.service';

export interface ActivityMonitoringContextValue {
  activityState: ActivityMonitoringState;
  awayState: AwayDetectionSnapshot;
}

export const ActivityMonitoringContext =
  createContext<ActivityMonitoringContextValue | null>(null);
