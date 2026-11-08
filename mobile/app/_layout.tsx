import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/src/auth/auth-provider';
import { colors } from '@/src/constants/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '800' },
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="employee/new" options={{ title: 'Add employee', presentation: 'modal' }} />
          <Stack.Screen name="payroll/new" options={{ title: 'Create payroll', presentation: 'modal' }} />
          <Stack.Screen name="payroll/[id]" options={{ title: 'Payroll details' }} />
          <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
