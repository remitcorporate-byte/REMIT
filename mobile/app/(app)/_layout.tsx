import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/src/auth/auth-provider';
import { LoadingScreen } from '@/src/components/loading-screen';
import { NotificationBell } from '@/src/components/notification-bell';
import { colors } from '@/src/constants/theme';

export default function AppLayout() {
  const { user, isLoading, can } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.aubergine, fontWeight: '800' },
        headerRight: () => (can('notification.read') ? <NotificationBell /> : null),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name="space-dashboard" size={size} />,
        }}
      />
      <Tabs.Screen
        name="employees"
        options={{
          href: can('employee.read') ? undefined : null,
          title: 'Employees',
          tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name="groups" size={size} />,
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          href: can('payroll.read') ? undefined : null,
          title: 'Payroll',
          tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name="payments" size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          href: can('wallet.read') ? undefined : null,
          title: 'Wallet',
          tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name="account-balance-wallet" size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name="more-horiz" size={size} />,
        }}
      />
    </Tabs>
  );
}
