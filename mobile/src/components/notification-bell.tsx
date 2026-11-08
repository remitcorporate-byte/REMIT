import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, NOTIFICATIONS_KEY } from '@/src/api/client';
import { colors } from '@/src/constants/theme';

export function NotificationBell() {
  const router = useRouter();
  const unread = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'summary'],
    queryFn: () => api.notifications(1),
    select: (page) => page.unreadCount,
    refetchInterval: 60_000,
  });
  const count = unread.data ?? 0;

  return (
    <Pressable
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      accessibilityRole="button"
      hitSlop={10}
      onPress={() => router.push('/notifications')}
      style={styles.button}>
      <MaterialIcons color={colors.ink} name="notifications-none" size={24} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { marginRight: 16, padding: 2 },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.background,
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  badgeText: { color: colors.surface, fontSize: 10, fontWeight: '900' },
});
