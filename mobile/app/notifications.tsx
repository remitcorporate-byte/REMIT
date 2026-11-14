import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { api, formatRelative, NOTIFICATIONS_KEY, pageCount } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { EmptyState, ErrorMessage } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import type { AppNotification, NotificationType } from '@/src/types/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TYPE_META: Record<NotificationType, { icon: keyof typeof MaterialIcons.glyphMap; color: string; soft: string }> = {
  PAYROLL_COMPLETED: { icon: 'task-alt', color: colors.success, soft: colors.successSoft },
  DEPOSIT_SUCCESS: { icon: 'savings', color: colors.success, soft: colors.successSoft },
  PAYROLL_FAILED: { icon: 'error-outline', color: colors.danger, soft: colors.dangerSoft },
  LOW_BALANCE: { icon: 'warning-amber', color: colors.warning, soft: colors.warningSoft },
  PAYROLL_SCHEDULED: { icon: 'event', color: colors.primary, soft: colors.primarySoft },
  EMPLOYEE_ADDED: { icon: 'person-add-alt', color: colors.primary, soft: colors.primarySoft },
  GENERAL: { icon: 'notifications-none', color: colors.primary, soft: colors.primarySoft },
};

export default function NotificationsScreen() {
  const { can } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'feed'],
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < pageCount(last.pagination) ? last.pagination.page + 1 : undefined),
    enabled: can('notification.read'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  const markOne = useMutation({ mutationFn: api.markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: api.markAllNotificationsRead, onSuccess: invalidate });

  if (!can('notification.read')) {
    return (
      <View style={[styles.container, { paddingBottom: 20 + insets.bottom }]}>
        <EmptyState description="Ask your administrator for notification access." title="No notification access" />
      </View>
    );
  }

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const unread = query.data?.pages[0]?.unreadCount ?? 0;
  const mutationError = markAll.error ?? markOne.error;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            unread > 0 ? (
              <Pressable
                accessibilityRole="button"
                disabled={markAll.isPending}
                hitSlop={10}
                onPress={() => markAll.mutate()}>
                <Text style={styles.headerAction}>{markAll.isPending ? 'Marking…' : 'Mark all read'}</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        contentContainerStyle={[styles.container, { paddingBottom: 20 + insets.bottom }]}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : query.error ? null : (
            <EmptyState description="Payroll, deposit and balance alerts will show up here." title="You're all caught up" />
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.count}>{unread > 0 ? `${unread} unread` : 'No unread notifications'}</Text>
            <ErrorMessage message={query.error instanceof Error ? query.error.message : null} />
            <ErrorMessage message={mutationError instanceof Error ? mutationError.message : null} />
          </View>
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            onPress={() => {
              if (!item.isRead && !markOne.isPending) markOne.mutate(item.id);
            }}
          />
        )}
        style={styles.list}
      />
    </>
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const meta = TYPE_META[notification.type] ?? TYPE_META.GENERAL;
  return (
    <Pressable
      accessibilityHint={notification.isRead ? undefined : 'Marks this notification as read'}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !notification.isRead && styles.rowUnread, pressed && styles.rowPressed]}>
      <View style={[styles.icon, { backgroundColor: meta.soft }]}>
        <MaterialIcons color={meta.color} name={meta.icon} size={20} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.title, !notification.isRead && styles.titleUnread]}>
            {notification.title}
          </Text>
          <Text style={styles.time}>{formatRelative(notification.createdAt)}</Text>
        </View>
        <Text style={styles.message}>{notification.message}</Text>
      </View>
      {!notification.isRead ? <View accessibilityLabel="Unread" style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.background },
  container: { gap: 10, padding: 20, paddingBottom: 44 },
  header: { gap: 8, marginBottom: 4 },
  count: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  headerAction: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  loader: { marginVertical: 24 },
  row: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  rowUnread: { borderColor: colors.primarySoft, backgroundColor: colors.primarySoft },
  rowPressed: { opacity: 0.7 },
  icon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  copy: { flex: 1, gap: 4 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  title: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '700' },
  titleUnread: { fontWeight: '900' },
  time: { color: colors.muted, fontSize: 11 },
  message: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  dot: { backgroundColor: colors.primary, borderRadius: 4, height: 8, marginTop: 6, width: 8 },
});
