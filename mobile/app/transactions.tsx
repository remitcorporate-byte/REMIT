import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, pageCount } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { TransactionRow } from '@/src/components/transaction-row';
import { EmptyState, ErrorMessage } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import type { Transaction } from '@/src/types/api';

type Filter = { key: string; label: string; type?: Transaction['type']; status?: Transaction['status'] };

const FILTERS: Filter[] = [
  { key: 'all', label: 'All' },
  { key: 'payroll', label: 'Salaries', type: 'PAYROLL_DEBIT' },
  { key: 'deposit', label: 'Deposits', type: 'DEPOSIT' },
  { key: 'refund', label: 'Refunds', type: 'REFUND' },
  { key: 'pending', label: 'Pending', status: 'PENDING' },
  { key: 'failed', label: 'Failed', status: 'FAILED' },
];

export default function TransactionsScreen() {
  const { can } = useAuth();
  const [filter, setFilter] = useState<Filter>(FILTERS[0]);

  const query = useInfiniteQuery({
    queryKey: ['transactions', 'feed', filter.key],
    queryFn: ({ pageParam }) => api.transactionPage({ page: pageParam, type: filter.type, status: filter.status }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < pageCount(last.pagination) ? last.pagination.page + 1 : undefined),
    enabled: can('transaction.read'),
  });

  if (!can('transaction.read')) {
    return (
      <View style={styles.container}>
        <EmptyState description="Ask your administrator for transaction access." title="No transaction access" />
      </View>
    );
  }

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total;

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        query.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : query.error ? null : (
          <EmptyState description="Nothing matches this filter yet." title="No transactions" />
        )
      }
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      ListHeaderComponent={
        <View style={styles.header}>
          <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
            {FILTERS.map((item) => {
              const active = item.key === filter.key;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item.key}
                  onPress={() => setFilter(item)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {typeof total === 'number' ? (
            <Text style={styles.count}>
              {total} {total === 1 ? 'transaction' : 'transactions'}
            </Text>
          ) : null}
          <ErrorMessage message={query.error instanceof Error ? query.error.message : null} />
        </View>
      }
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => <TransactionRow transaction={item} />}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.background },
  container: { gap: 10, padding: 20, paddingBottom: 44 },
  header: { gap: 10, marginBottom: 4 },
  filters: { gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  count: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  loader: { marginVertical: 24 },
});
