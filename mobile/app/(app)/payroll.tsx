import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { api, formatDate, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Card, EmptyState, ErrorMessage, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import type { PayrollStatus } from '@/src/types/api';

function tone(status: PayrollStatus) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger' as const;
  if (status === 'PENDING_APPROVAL' || status === 'PROCESSING') return 'warning' as const;
  return 'neutral' as const;
}

export default function PayrollScreen() {
  const { can } = useAuth();
  const payrolls = useQuery({
    queryKey: ['payrolls'],
    queryFn: api.payrolls,
    enabled: can('payroll.read'),
  });

  if (!can('payroll.read')) {
    return <Screen><EmptyState title="No payroll access" description="Ask your administrator for payroll access." /></Screen>;
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={() => payrolls.refetch()}
          refreshing={payrolls.isRefetching}
          tintColor={colors.primary}
        />
      }>
      <View style={styles.header}>
        <PageHeading description="Prepare, approve and monitor every pay run." title="Payroll" />
        {can('payroll.create') ? (
          <Pressable onPress={() => router.push('/payroll/new')} style={styles.add}>
            <MaterialIcons color={colors.surface} name="add" size={24} />
          </Pressable>
        ) : null}
      </View>
      <ErrorMessage message={payrolls.error instanceof Error ? payrolls.error.message : null} />
      {!payrolls.data?.length ? (
        <EmptyState title="No payrolls yet" description="Create a draft when you are ready to pay your team." />
      ) : (
        payrolls.data.map((payroll) => (
          <Pressable key={payroll.id} onPress={() => router.push(`/payroll/${payroll.id}`)}>
            <Card style={styles.payroll}>
              <View style={styles.topline}>
                <Badge label={payroll.status} tone={tone(payroll.status)} />
                <MaterialIcons color={colors.muted} name="chevron-right" size={22} />
              </View>
              <Text style={styles.amount}>{formatNaira(payroll.totalAmount)}</Text>
              <Text style={styles.meta}>{payroll.employeeCount} employees · scheduled {formatDate(payroll.scheduledDate)}</Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  add: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 14, height: 48, justifyContent: 'center', width: 48 },
  payroll: { gap: 9 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  amount: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  meta: { color: colors.muted, fontSize: 13 },
});
