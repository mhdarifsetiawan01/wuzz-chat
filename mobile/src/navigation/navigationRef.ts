/**
 * Global Navigation Reference
 * Allows navigation calls from background tasks, deep-links, and notification handlers.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName]
) {
  if (navigationRef.isReady()) {
    (navigationRef.navigate as any)(name, params);
  }
}
