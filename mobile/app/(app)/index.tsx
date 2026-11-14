import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { api, formatDate, formatNaira } from '@/src/api/client';
import { labelFor } from '@/src/lib/labels';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Button, Card, EmptyState, ErrorMessage, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function DashboardScreen() {
  const { user, can } = useAuth();
  const router = useRouter();
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    enabled: can('dashboard.read'),
  });

  if (!can('dashboard.read')) {
    return (
      <Screen>
        <PageHeading title={`Hi, ${user?.firstName}`} description="Your account has limited workspace access." />
        <EmptyState title="No dashboard access" description="Your administrator has not enabled the dashboard for this account." />
      </Screen>
    );
  }

  const data = dashboard.data;
  const pendingApproval = data?.pendingApprovalPayrolls?.[0] || data?.upcomingPayrolls.find((payroll) => payroll.status === 'PENDING_APPROVAL');

  return (
    <Screen
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={() => dashboard.refetch()}
          refreshing={dashboard.isRefetching}
          tintColor={colors.primary}
        />
      }>
      <PageHeading
        description={user?.companyName || 'Here is what is happening with your payroll today.'}
        eyebrow="Company overview"
        title={`Good day, ${user?.firstName}`}
        hideTitle
      />
      <ErrorMessage message={dashboard.error instanceof Error ? dashboard.error.message : null} />

      {dashboard.isLoading ? <Card style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.rowMeta}>Loading your workspace…</Text></Card> : null}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available balance</Text>
        <Text style={styles.balance}>{data ? formatNaira(data.availableBalance) : '—'}</Text>
        <View style={styles.balanceMeta}>
          <Text style={styles.balanceMetaText}>Total {data ? formatNaira(data.walletBalance) : '—'}</Text>
          <Text style={styles.balanceMetaText}>Reserved {data ? formatNaira(data.reservedBalance) : '—'}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Card style={styles.stat}>
          <Text style={styles.statValue}>{data?.employeeCount ?? '—'}</Text>
          <Text style={styles.statLabel}>Employees</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.statValue}>{data ? data.upcomingPayrolls.length : '—'}</Text>
          <Text style={styles.statLabel}>Upcoming runs</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actions}>
          {can('wallet.fund') ? <Button onPress={() => router.push('/(app)/wallet')} title="Fund wallet" /> : null}
          {can('employee.manage') ? <Button onPress={() => router.push('/employee/new')} title="Add employee" variant="secondary" /> : null}
          {can('payroll.create') ? <Button onPress={() => router.push('/payroll/new')} title="New payroll" variant="secondary" /> : null}
        </View>
      </View>

      {data && (data.employeeCount < 1 || data.walletBalance < 1 || data.payrollCount < 1) ? <Card style={styles.progress}>
        <Text style={styles.sectionTitle}>Getting started</Text>
        <Text style={styles.rowMeta}>{data.employeeCount > 0 ? '✓ Employees added' : '• Add your first employee'} · {data.walletBalance > 0 ? '✓ Wallet funded' : '• Fund your wallet'} · {data.payrollCount > 0 ? '✓ First payroll created' : '• Create your first payroll'}</Text>
      </Card> : null}

      {can('payroll.approve') && pendingApproval ? <Pressable onPress={() => router.push(`/payroll/${pendingApproval.id}`)} style={({ pressed }) => [styles.approval, pressed && styles.pressed]}><Text style={styles.approvalTitle}>Needs your approval</Text><Text style={styles.approvalAmount}>{formatNaira(pendingApproval.totalAmount)}</Text><Text style={styles.approvalMeta}>{pendingApproval.employeeCount} employees · {formatDate(pendingApproval.scheduledDate)}</Text></Pressable> : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Upcoming payrolls</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(app)/payroll')}><Text style={styles.seeAll}>See all</Text></Pressable></View>
        {dashboard.isLoading ? null : !data?.upcomingPayrolls.length ? (
          <EmptyState title="Nothing scheduled" description="Create a payroll draft to get your next payment run moving." />
        ) : (
          data.upcomingPayrolls.slice(0, 3).map((payroll) => (
            <Pressable key={payroll.id} onPress={() => router.push(`/payroll/${payroll.id}`)} style={({ pressed }) => pressed && styles.pressed}><Card style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{formatNaira(payroll.totalAmount)}</Text>
                <Text style={styles.rowMeta}>{payroll.employeeCount} employees · {formatDate(payroll.scheduledDate)}</Text>
              </View>
              <Badge label={labelFor(payroll.status)} tone={payroll.status === 'FAILED' ? 'danger' : 'warning'} />
            </Card></Pressable>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Recent activity</Text><Pressable accessibilityRole="button" onPress={() => router.push('/transactions')}><Text style={styles.seeAll}>See all</Text></Pressable></View>
        {dashboard.isLoading ? null : !data?.recentTransactions.length ? (
          <EmptyState title="No transactions yet" description="Wallet and payroll activity will appear here." />
        ) : (
          data.recentTransactions.slice(0, 4).map((transaction) => (
            <Pressable key={transaction.id} onPress={() => router.push((`/transaction/${transaction.id}`) as never)} style={({ pressed }) => pressed && styles.pressed}><Card style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{transaction.description || labelFor(transaction.type)}</Text>
                <Text style={styles.rowMeta}>{formatDate(transaction.createdAt)}</Text>
              </View>
              <Text style={styles.amount}>{formatNaira(transaction.amount)}</Text>
            </Card></Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.aubergine, borderRadius: 14, borderRightColor: colors.accent, borderRightWidth: 6, gap: 10, padding: 24, overflow: 'hidden' },
  balanceLabel: { color: colors.onDarkMuted, fontSize: 13, fontWeight: '700' },
  balance: { color: colors.surface, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  balanceMeta: { flexDirection: 'row', gap: 16, marginTop: 8 },
  balanceMetaText: { color: colors.onDarkFaint, fontSize: 12, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, gap: 5 },
  statValue: { color: colors.ink, fontSize: 26, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  section: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  actions: { gap: 10 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 15 },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowMeta: { color: colors.muted, fontSize: 12 },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  progress: { gap: 8 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  seeAll: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  approval: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: 18, borderWidth: 1, gap: 5, padding: 18 },
  approvalTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  approvalAmount: { color: colors.ink, fontSize: 26, fontWeight: '900' },
  approvalMeta: { color: colors.muted, fontSize: 13 },
});
