import { useContext } from 'react';
import { ActivityMonitoringContext } from './activityMonitoring.context';

export function useActivityMonitoring() {
  const context = useContext(ActivityMonitoringContext);
  if (!context) {
    throw new Error('useActivityMonitoring must be used within ActivityMonitoringProvider.');
  }
  return context;
}
