import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/src/components/loading-screen';
import { useAuth } from '@/src/auth/auth-provider';

export default function IndexScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen label="Loading REMIT..." />;

  return <Redirect href={user ? '/(app)' : '/(auth)/login'} />;
}
