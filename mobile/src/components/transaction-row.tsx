import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { formatDateTime, formatNaira } from '@/src/api/client';
import { Badge, Card } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import type { Transaction } from '@/src/types/api';

const TYPE_META: Record<Transaction['type'], { icon: keyof typeof MaterialIcons.glyphMap; label: string; inflow: boolean }> = {
  DEPOSIT: { icon: 'south-west', label: 'Deposit', inflow: true },
  REFUND: { icon: 'undo', label: 'Refund', inflow: true },
  PAYROLL_DEBIT: { icon: 'north-east', label: 'Salary payment', inflow: false },
  WITHDRAWAL: { icon: 'north-east', label: 'Withdrawal', inflow: false },
};

export function transactionTone(status: Transaction['status']) {
  if (status === 'SUCCESS') return 'success' as const;
  if (status === 'FAILED' || status === 'REVERSED') return 'danger' as const;
  return 'warning' as const;
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const meta = TYPE_META[transaction.type];
  const title = transaction.employee
    ? `${transaction.employee.firstName} ${transaction.employee.lastName}`
    : transaction.description || meta.label;

  return (
    <Card style={styles.row}>
      <View style={[styles.icon, meta.inflow ? styles.iconIn : styles.iconOut]}>
        <MaterialIcons color={meta.inflow ? colors.success : colors.primary} name={meta.icon} size={18} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {meta.label} · {formatDateTime(transaction.createdAt)}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text style={[styles.amount, meta.inflow && styles.amountIn]}>
          {meta.inflow ? '+' : '−'}
          {formatNaira(transaction.amount)}
        </Text>
        <Badge label={transaction.status} tone={transactionTone(transaction.status)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 14 },
  icon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  iconIn: { backgroundColor: colors.successSoft },
  iconOut: { backgroundColor: colors.primarySoft },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12 },
  amountCol: { alignItems: 'flex-end', gap: 6 },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  amountIn: { color: colors.success },
});
