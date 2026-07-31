import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { api, formatDate, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Button, Card, EmptyState, ErrorMessage, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function PayrollDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const payroll = useQuery({ queryKey: ['payroll', id], queryFn: () => api.payroll(id), enabled: Boolean(id) && can('payroll.read') });

  const action = useMutation({
    mutationFn: async (name: 'submit' | 'approve' | 'cancel' | 'retry') => {
      if (name === 'submit') return api.submitPayroll(id);
      if (name === 'approve') return api.approvePayroll(id);
      if (name === 'cancel') return api.cancelPayroll(id);
      return api.retryPayroll(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payroll', id] }),
        queryClient.invalidateQueries({ queryKey: ['payrolls'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });

  if (!can('payroll.read')) {
    return <Screen><ErrorMessage message="You do not have permission to view payroll." /></Screen>;
  }

  const data = payroll.data;

  return (
    <Screen>
      <ErrorMessage message={payroll.error instanceof Error ? payroll.error.message : null} />
      {data ? (
        <>
          <Card style={styles.hero}>
            <Badge label={data.status} tone={data.status === 'COMPLETED' ? 'success' : data.status === 'FAILED' || data.status === 'CANCELLED' ? 'danger' : 'warning'} />
            <Text style={styles.amount}>{formatNaira(data.totalAmount)}</Text>
            <Text style={styles.meta}>{data.employeeCount} employees · {formatDate(data.scheduledDate)}</Text>
            {data.note ? <Text style={styles.note}>{data.note}</Text> : null}
            {data.failureReason ? <ErrorMessage message={data.failureReason} /> : null}
          </Card>

          <View style={styles.actions}>
            {data.status === 'DRAFT' && can('payroll.submit') ? (
              <Button loading={action.isPending} onPress={() => action.mutate('submit')} title="Submit for approval" />
            ) : null}
            {data.status === 'PENDING_APPROVAL' && can('payroll.approve') ? (
              <Button loading={action.isPending} onPress={() => action.mutate('approve')} title="Approve payroll" />
            ) : null}
            {data.status === 'FAILED' && can('payroll.retry') ? (
              <Button loading={action.isPending} onPress={() => action.mutate('retry')} title="Retry failed payments" />
            ) : null}
            {['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(data.status) && can('payroll.cancel') ? (
              <Button loading={action.isPending} onPress={() => action.mutate('cancel')} title="Cancel payroll" variant="danger" />
            ) : null}
          </View>
          <ErrorMessage message={action.error instanceof Error ? action.error.message : null} />

          <Text style={styles.sectionTitle}>Payment recipients</Text>
          {!data.payrollEmployees?.length ? (
            <EmptyState title="Recipient details unavailable" description="Pull to refresh after the draft has been created." />
          ) : (
            data.payrollEmployees.map((item) => (
              <Card key={item.id} style={styles.employee}>
                <View style={styles.employeeCopy}>
                  <Text style={styles.employeeName}>{item.employee.firstName} {item.employee.lastName}</Text>
                  <Text style={styles.meta}>{item.employee.bankName} · ••••{item.employee.accountNumber.slice(-4)}</Text>
                </View>
                <View style={styles.employeeAmount}>
                  <Text style={styles.salary}>{formatNaira(item.amount)}</Text>
                  <Badge label={item.status} tone={item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'warning'} />
                </View>
              </Card>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 10 },
  amount: { color: colors.ink, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  meta: { color: colors.muted, fontSize: 12 },
  note: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 5 },
  actions: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  employee: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 14 },
  employeeCopy: { flex: 1, gap: 4 },
  employeeName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  employeeAmount: { alignItems: 'flex-end', gap: 5 },
  salary: { color: colors.ink, fontSize: 13, fontWeight: '900' },
});
