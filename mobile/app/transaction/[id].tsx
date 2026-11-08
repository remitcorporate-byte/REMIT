import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { api, formatDateTime, formatNaira } from '@/src/api/client';
import { labelFor } from '@/src/lib/labels';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Card, ErrorMessage, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import { transactionTone } from '@/src/components/transaction-row';

export default function TransactionDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const query = useQuery({ queryKey: ['transaction', id], queryFn: () => api.transaction(id), enabled: Boolean(user) && Boolean(id) && can('transaction.read') });
  if (!can('transaction.read')) return <Screen><ErrorMessage message="You do not have permission to view transactions." /></Screen>;
  if (query.isLoading) return <Screen><ActivityIndicator color={colors.primary} /></Screen>;
  const data = query.data;
  if (!data) return <Screen><ErrorMessage message={query.error instanceof Error ? query.error.message : 'Transaction not found'} /></Screen>;
  return <Screen>
    <Card style={styles.hero}><Badge label={labelFor(data.status)} tone={transactionTone(data.status)} /><Text style={styles.amount}>{formatNaira(data.amount)}</Text><Text style={styles.type}>{labelFor(data.type)}</Text></Card>
    <Card style={styles.section}>
      <Info label="Date and time" value={formatDateTime(data.createdAt)} />
      {data.type === 'PAYROLL_DEBIT' || data.type === 'REFUND' ? <Info label="Employee" value={data.employee ? data.employee.firstName + ' ' + data.employee.lastName : 'Not linked'} /> : <Info label="Source" value={data.type === 'DEPOSIT' ? 'Wallet funding' : 'Company wallet'} />}
      <Info label="Description" value={data.description || 'No description'} />
      <Text style={styles.label}>Paystack reference</Text><Text selectable style={styles.reference}>{data.paystackReference || 'Not available'}</Text>
    </Card>
  </Screen>;
}
function Info({ label, value }: { label: string; value: string }) { return <Card style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></Card>; }
const styles = StyleSheet.create({ hero: { alignItems: 'center', gap: 8 }, amount: { color: colors.ink, fontSize: 32, fontWeight: '900' }, type: { color: colors.muted, fontSize: 13, textTransform: 'capitalize' }, section: { gap: 10 }, info: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 }, label: { color: colors.muted, fontSize: 13 }, value: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '800', textAlign: 'right' }, reference: { color: colors.ink, fontSize: 14, fontWeight: '800' } });
