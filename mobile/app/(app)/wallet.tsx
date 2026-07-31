import { useMutation, useQuery } from '@tanstack/react-query';
import { Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { api, formatDate, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function WalletScreen() {
  const { can } = useAuth();
  const [amount, setAmount] = useState('');
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: api.wallet, enabled: can('wallet.read') });
  const transactions = useQuery({
    queryKey: ['transactions'],
    queryFn: api.transactions,
    enabled: can('transaction.read'),
  });
  const deposit = useMutation({
    mutationFn: api.deposit,
    onSuccess: async ({ authorizationUrl }) => {
      setAmount('');
      await Linking.openURL(authorizationUrl);
    },
  });

  if (!can('wallet.read')) {
    return <Screen><EmptyState title="No wallet access" description="Ask your administrator for wallet access." /></Screen>;
  }

  const amountInNaira = Number(amount.replaceAll(',', ''));

  return (
    <Screen
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={async () => {
            await Promise.all([wallet.refetch(), transactions.refetch()]);
          }}
          refreshing={wallet.isRefetching || transactions.isRefetching}
          tintColor={colors.primary}
        />
      }>
      <PageHeading description="Fund payroll and track every company money movement." title="Wallet" />
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available to spend</Text>
        <Text style={styles.balance}>{wallet.data ? formatNaira(wallet.data.availableBalance) : '—'}</Text>
        <View style={styles.balanceRow}>
          <View><Text style={styles.metaLabel}>Balance</Text><Text style={styles.metaValue}>{wallet.data ? formatNaira(wallet.data.balance) : '—'}</Text></View>
          <View><Text style={styles.metaLabel}>Reserved</Text><Text style={styles.metaValue}>{wallet.data ? formatNaira(wallet.data.reservedBalance) : '—'}</Text></View>
        </View>
      </View>
      <ErrorMessage message={wallet.error instanceof Error ? wallet.error.message : null} />

      {can('wallet.fund') ? (
        <Card style={styles.fund}>
          <Text style={styles.sectionTitle}>Fund wallet</Text>
          <Text style={styles.copy}>Enter an amount in naira. Secure payment will open in your browser.</Text>
          <Field
            keyboardType="numeric"
            label="Amount (NGN)"
            onChangeText={setAmount}
            placeholder="100,000"
            value={amount}
          />
          <ErrorMessage message={deposit.error instanceof Error ? deposit.error.message : null} />
          <Button
            disabled={!Number.isFinite(amountInNaira) || amountInNaira <= 0}
            loading={deposit.isPending}
            onPress={() => deposit.mutate(Math.round(amountInNaira * 100))}
            title="Continue to payment"
          />
        </Card>
      ) : null}

      {can('transaction.read') ? (
        <View style={styles.transactions}>
          <Text style={styles.sectionTitle}>Transactions</Text>
          {!transactions.data?.length ? (
            <EmptyState title="No wallet activity" description="Deposits and payroll debits will appear here." />
          ) : (
            transactions.data.slice(0, 20).map((transaction) => (
              <Card key={transaction.id} style={styles.transaction}>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle}>{transaction.description || transaction.type.replaceAll('_', ' ')}</Text>
                  <Text style={styles.copy}>{formatDate(transaction.createdAt)}</Text>
                </View>
                <View style={styles.transactionAmount}>
                  <Text style={styles.amount}>{formatNaira(transaction.amount)}</Text>
                  <Badge label={transaction.status} tone={transaction.status === 'SUCCESS' ? 'success' : transaction.status === 'FAILED' ? 'danger' : 'warning'} />
                </View>
              </Card>
            ))
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.ink, borderRadius: 24, gap: 10, padding: 24 },
  balanceLabel: { color: '#AEB9D1', fontSize: 13, fontWeight: '700' },
  balance: { color: colors.surface, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  balanceRow: { flexDirection: 'row', gap: 32, marginTop: 10 },
  metaLabel: { color: '#8795B3', fontSize: 11, marginBottom: 3 },
  metaValue: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  fund: { gap: 14 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  transactions: { gap: 10 },
  transaction: { alignItems: 'center', flexDirection: 'row', padding: 14 },
  transactionCopy: { flex: 1, gap: 3 },
  transactionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  transactionAmount: { alignItems: 'flex-end', gap: 6 },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '900' },
});
