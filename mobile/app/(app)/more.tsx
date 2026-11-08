import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { API_URL, api, NOTIFICATIONS_KEY } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Button, Card, ErrorMessage, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function MoreScreen() {
  const { user, logout, can } = useAuth();
  const router = useRouter();
  const unread = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'summary'],
    queryFn: () => api.notifications(1),
    enabled: can('notification.read'),
    select: (page) => page.unreadCount,
  });
  const status = useQuery({
    queryKey: ['system-status'],
    queryFn: api.systemStatus,
    enabled: can('system.read'),
  });

  return (
    <Screen>
      <PageHeading description="Your account, permissions and app connection." title="More" />
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.firstName[0]}{user?.lastName[0]}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Badge label={user?.role || 'User'} />
        </View>
      </Card>

      <Card style={styles.menu}>
        {can('notification.read') ? (
          <MenuRow
            badge={unread.data ? String(unread.data) : undefined}
            icon="notifications-none"
            label="Notifications"
            onPress={() => router.push('/notifications')}
          />
        ) : null}
        {can('transaction.read') ? (
          <MenuRow icon="receipt-long" label="Transactions" onPress={() => router.push('/transactions')} />
        ) : null}
      </Card>

      <Card style={styles.permissions}>
        <View style={styles.sectionHeader}>
          <MaterialIcons color={colors.primary} name="verified-user" size={22} />
          <Text style={styles.sectionTitle}>Your access</Text>
        </View>
        <Text style={styles.copy}>{user?.permissions.length || 0} capabilities enabled for this account.</Text>
        <View style={styles.permissionList}>
          {user?.permissions.slice(0, 8).map((permission) => (
            <Text key={permission} style={styles.permission}>• {permission.replace('.', ' ')}</Text>
          ))}
        </View>
      </Card>

      {can('system.read') ? (
        <Card style={styles.permissions}>
          <View style={styles.sectionHeader}>
            <MaterialIcons color={colors.primary} name="dns" size={22} />
            <Text style={styles.sectionTitle}>System status</Text>
          </View>
          <ErrorMessage message={status.error instanceof Error ? status.error.message : null} />
          <StatusRow label="API" online={status.data?.apiConnected} />
          <StatusRow label="Database" online={status.data?.databaseConnected} />
          <StatusRow label={`Queue · ${status.data?.queueMode || 'checking'}`} online={status.data?.queueConnected} />
          <Text numberOfLines={1} style={styles.apiUrl}>{API_URL}</Text>
        </Card>
      ) : null}

      <Button onPress={() => void logout()} title="Sign out" variant="secondary" />
      <Text style={styles.version}>REMIT Mobile · Expo SDK 54</Text>
    </Screen>
  );
}

function MenuRow({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}>
      <MaterialIcons color={colors.primary} name={icon} size={22} />
      <Text style={styles.menuLabel}>{label}</Text>
      {badge ? <Badge label={badge} tone="danger" /> : null}
      <MaterialIcons color={colors.muted} name="chevron-right" size={22} />
    </Pressable>
  );
}

function StatusRow({ label, online }: { label: string; online?: boolean }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Badge label={online ? 'Connected' : 'Unavailable'} tone={online ? 'success' : 'danger'} />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  avatar: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 18, height: 58, justifyContent: 'center', width: 58 },
  avatarText: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  profileCopy: { flex: 1, gap: 5 },
  name: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  email: { color: colors.muted, fontSize: 13 },
  permissions: { gap: 12 },
  menu: { paddingVertical: 4 },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 12 },
  menuPressed: { opacity: 0.6 },
  menuLabel: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '700' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  permissionList: { gap: 5 },
  permission: { color: colors.ink, fontSize: 13, textTransform: 'capitalize' },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  apiUrl: { color: colors.muted, fontSize: 11, marginTop: 4 },
  version: { color: colors.muted, fontSize: 11, textAlign: 'center' },
});
