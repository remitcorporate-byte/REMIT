import { useQuery } from '@tanstack/react-query';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { api, formatDate, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Card, EmptyState, ErrorMessage, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function DashboardScreen() {
  const { user, can } = useAuth();
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
      />
      <ErrorMessage message={dashboard.error instanceof Error ? dashboard.error.message : null} />

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
          <Text style={styles.statValue}>{data?.upcomingPayrolls.length ?? '—'}</Text>
          <Text style={styles.statLabel}>Upcoming payrolls</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming payrolls</Text>
        {!data?.upcomingPayrolls.length ? (
          <EmptyState title="Nothing scheduled" description="Create a payroll draft to get your next payment run moving." />
        ) : (
          data.upcomingPayrolls.slice(0, 3).map((payroll) => (
            <Card key={payroll.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{formatNaira(payroll.totalAmount)}</Text>
                <Text style={styles.rowMeta}>{payroll.employeeCount} employees · {formatDate(payroll.scheduledDate)}</Text>
              </View>
              <Badge label={payroll.status} tone={payroll.status === 'FAILED' ? 'danger' : 'warning'} />
            </Card>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {!data?.recentTransactions.length ? (
          <EmptyState title="No transactions yet" description="Wallet and payroll activity will appear here." />
        ) : (
          data.recentTransactions.slice(0, 4).map((transaction) => (
            <Card key={transaction.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{transaction.description || transaction.type.replaceAll('_', ' ')}</Text>
                <Text style={styles.rowMeta}>{formatDate(transaction.createdAt)}</Text>
              </View>
              <Text style={styles.amount}>{formatNaira(transaction.amount)}</Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.ink, borderRadius: 24, gap: 10, padding: 24 },
  balanceLabel: { color: '#AEB9D1', fontSize: 13, fontWeight: '700' },
  balance: { color: colors.surface, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  balanceMeta: { flexDirection: 'row', gap: 16, marginTop: 8 },
  balanceMetaText: { color: '#C9D2E6', fontSize: 12, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, gap: 5 },
  statValue: { color: colors.ink, fontSize: 26, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  section: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 15 },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowMeta: { color: colors.muted, fontSize: 12 },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '900' },
});
