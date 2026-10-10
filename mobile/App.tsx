import React, { useEffect } from 'react';
import { ActivityIndicator, View, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppNavigator } from './src/navigation/AppNavigator';
import { LoginScreen } from './src/screens/LoginScreen';
import { useAuthState, AuthContext } from './src/hooks/useAuth';
import { registerForPushNotifications, addResponseListener } from './src/api/notifications';
import { resumeTrackingIfEnabled } from './src/tracking/locationTracker'; // registers the background location task at import
import { maybeFlagEndOfDay } from './src/tracking/dayHours';
import { getPendingVerify } from './src/tracking/trackingStore';
import { colors } from './src/theme';

export const navigationRef = createNavigationContainerRef();

function goVerify(date?: string) {
  if (navigationRef.isReady()) {
    (navigationRef.navigate as any)('VerifyHours', { date });
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60 * 1000,
    },
  },
});

function AppContent() {
  const auth = useAuthState();

  // Register for push notifications + sync offline queue once logged in
  useEffect(() => {
    if (auth.user) {
      registerForPushNotifications().catch(() => {});
      // Sync any queued offline actions
      import('./src/utils/offline').then(({ syncQueue }) => {
        syncQueue().then(result => {
          if (result.synced > 0) console.log(`[Offline] Synced ${result.synced} queued actions`);
        }).catch(() => {});
      });
      // If location tracking was previously enabled, make sure it's running after this cold start.
      resumeTrackingIfEnabled(
        auth.user.id ? { id: auth.user.id, name: auth.user.name, role: auth.user.role } : null
      ).catch(() => {});
      // End-of-day check: if hours were tracked and aren't confirmed yet, prompt to verify.
      maybeFlagEndOfDay().then(d => { if (d) goVerify(d); }).catch(() => {});
    }
  }, [auth.user]);

  // Re-check pending hours each time the app comes to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && auth.user) {
        maybeFlagEndOfDay()
          .then(async d => {
            const pending = d || (await getPendingVerify());
            if (pending) goVerify(pending);
          })
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [auth.user]);

  // Handle notification taps — route the "verify hours" prompt to its screen.
  useEffect(() => {
    const sub = addResponseListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.type === 'verify_hours') {
        goVerify(data.date);
      }
    });
    return () => sub.remove();
  }, []);

  if (auth.loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.greenDark} />
      </View>
    );
  }

  if (!auth.user) {
    return <LoginScreen onLogin={auth.login} onDemoLogin={auth.demoLogin} />;
  }

  return (
    <AuthContext.Provider value={auth}>
      <NavigationContainer ref={navigationRef}>
        <AppNavigator />
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
