import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/auth/auth-provider';
import { LoadingScreen } from '@/src/components/loading-screen';

export default function AuthLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (user) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
