import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/src/lib/confirm';
import { useState } from 'react';

import { api, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { TransactionRow } from '@/src/components/transaction-row';
import { Button, Card, EmptyState, ErrorMessage, Field, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function WalletScreen() {
  const { can } = useAuth();
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: api.wallet, enabled: can('wallet.read') });
  const transactions = useQuery({
    queryKey: ['transactions'],
    queryFn: api.transactions,
    enabled: can('transaction.read'),
  });
  const deposit = useMutation({
    mutationFn: api.deposit,
    onSuccess: async ({ authorizationUrl, reference }) => {
      setAmount('');
      if (authorizationUrl.includes('depositReference=')) {
        const result = await api.verifyDeposit(reference);
        await Promise.all([wallet.refetch(), transactions.refetch()]);
        setMessage(`Deposit verified. New balance: ${formatNaira(result.newBalance)}`);
        return;
      }
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
      <PageHeading description="Fund payroll and track every company money movement." title="Wallet" hideTitle />
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
          {message ? <Text style={styles.success}>{message}</Text> : null}
          <Button
            disabled={!Number.isFinite(amountInNaira) || amountInNaira <= 0}
            loading={deposit.isPending}
            onPress={async () => {
              const kobo = Math.round(amountInNaira * 100);
              if (await confirmAction({ title: 'Confirm wallet funding', message: `Continue to payment for ${formatNaira(kobo)}?`, confirmText: 'Continue' })) deposit.mutate(kobo);
            }}
            title="Continue to payment"
          />
        </Card>
      ) : null}

      {can('transaction.read') ? (
        <View style={styles.transactions}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Pressable accessibilityRole="link" hitSlop={10} onPress={() => router.push('/transactions')}>
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>
          {!transactions.data?.length ? (
            <EmptyState title="No wallet activity" description="Deposits and payroll debits will appear here." />
          ) : (
            transactions.data.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.aubergine, borderRadius: 14, borderRightColor: colors.accent, borderRightWidth: 6, gap: 10, padding: 24, overflow: 'hidden' },
  balanceLabel: { color: colors.onDarkMuted, fontSize: 13, fontWeight: '700' },
  balance: { color: colors.surface, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  balanceRow: { flexDirection: 'row', gap: 32, marginTop: 10 },
  metaLabel: { color: colors.onDarkFaint, fontSize: 11, marginBottom: 3 },
  metaValue: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  fund: { gap: 14 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  transactions: { gap: 10 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  success: { color: colors.success, fontSize: 13, lineHeight: 20 },
});
