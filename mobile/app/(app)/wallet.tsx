import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/src/lib/confirm';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { TransactionRow } from '@/src/components/transaction-row';
import { Button, Card, EmptyState, ErrorMessage, Field, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import { type DepositOutcome, pollDeposit } from '@/src/lib/deposit-verification';

export default function WalletScreen() {
  const { can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [paymentOutcome, setPaymentOutcome] = useState<DepositOutcome | null>(null);
  const pendingReference = useRef<string | null>(null);
  const verification = useRef<Promise<void> | null>(null);
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: api.wallet, enabled: can('wallet.read') });
  const transactions = useQuery({
    queryKey: ['transactions'],
    queryFn: api.transactions,
    enabled: can('transaction.read'),
  });
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wallet'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  }, [queryClient]);
  const verifyPending = useCallback(() => {
    if (!pendingReference.current || verification.current) return verification.current;
    const reference = pendingReference.current;
    const task = (async () => {
      try {
        const outcome = await pollDeposit(reference, api.verifyDeposit);
        setPaymentOutcome(outcome);
        setMessage(outcome === 'confirmed' ? 'Payment confirmed, wallet updated' : outcome === 'failed' ? 'Payment was not completed' : 'Payment is still processing, we will update your wallet shortly');
        if (outcome !== 'processing' && pendingReference.current === reference) pendingReference.current = null;
      } finally {
        try { await refresh(); } finally { verification.current = null; }
      }
    })();
    verification.current = task;
    return task;
  }, [refresh]);
  useFocusEffect(useCallback(() => {
    void refresh();
    void verifyPending();
  }, [refresh, verifyPending]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
        void verifyPending();
      }
    });
    return () => subscription.remove();
  }, [refresh, verifyPending]);
  const deposit = useMutation({
    mutationFn: api.deposit,
    onSuccess: async ({ authorizationUrl, reference }) => {
      setAmount('');
      setMessage('');
      setPaymentOutcome(null);
      pendingReference.current = reference;
      try {
        await WebBrowser.openAuthSessionAsync(authorizationUrl, 'remit://wallet');
      } finally {
        await verifyPending();
      }
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
          <Text style={styles.copy}>Enter an amount in naira. Secure payment will open in the app.</Text>
          <Field
            keyboardType="numeric"
            label="Amount (NGN)"
            onChangeText={setAmount}
            placeholder="100,000"
            value={amount}
          />
          <ErrorMessage message={deposit.error instanceof Error ? deposit.error.message : null} />
          {message ? <Text style={[styles.paymentMessage, paymentOutcome === 'confirmed' ? styles.confirmed : paymentOutcome === 'failed' ? styles.failed : styles.processing]}>{message}</Text> : null}
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
            <Pressable accessibilityRole="link" onPress={() => router.push('/transactions')} style={styles.linkAction}>
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
  sectionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  linkAction: { justifyContent: 'center', minHeight: 44 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  paymentMessage: { fontSize: 13, lineHeight: 20 },
  confirmed: { color: colors.success },
  failed: { color: colors.danger },
  processing: { color: colors.warning },
});
