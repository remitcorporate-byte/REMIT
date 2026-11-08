import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Card, EmptyState, ErrorMessage, PageHeading, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function EmployeesScreen() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const employees = useQuery({
    queryKey: ['employees', search],
    queryFn: () => api.employees(search, can('employee.manage')),
    enabled: can('employee.read'),
  });

  if (!can('employee.read')) {
    return <Screen><EmptyState title="No employee access" description="Ask your administrator for employee access." /></Screen>;
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={() => employees.refetch()}
          refreshing={employees.isRefetching}
          tintColor={colors.primary}
        />
      }>
      <View style={styles.header}>
        <PageHeading description="Your active workforce and salary details." title="Employees" hideTitle />
        {can('employee.manage') ? (
            <Pressable accessibilityLabel="Add employee" accessibilityRole="button" onPress={() => router.push('/employee/new')} style={styles.add}>
            <MaterialIcons color={colors.surface} name="person-add" size={20} />
            <Text style={styles.addText}>Add employee</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.search}>
        <MaterialIcons color={colors.muted} name="search" size={20} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearch}
          placeholder="Search employees"
          placeholderTextColor="#98A2B3"
          style={styles.searchInput}
          value={search}
        />
      </View>
      <ErrorMessage message={employees.error instanceof Error ? employees.error.message : null} />
      {employees.isLoading ? <ActivityIndicator color={colors.primary} /> : employees.error ? null : !employees.data?.length ? (
        <EmptyState title="No employees found" description="Add your first employee or change the search term." />
      ) : (
        employees.data.map((employee) => (
          <Pressable key={employee.id} onPress={() => router.push((`/employee/${employee.id}`) as never)} style={({ pressed }) => pressed && styles.pressed}>
          <Card style={styles.employee}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{employee.firstName[0]}{employee.lastName[0]}</Text>
            </View>
            <View style={styles.employeeCopy}>
              <Text style={styles.employeeName}>{employee.firstName} {employee.lastName}</Text>
              <Text style={styles.meta}>{employee.position || employee.department || employee.email}</Text>
              <Text style={styles.salary}>{formatNaira(employee.salary)} · {employee.paymentFrequency.toLowerCase()}</Text>
            </View>
            <Badge label={employee.isActive ? 'Active' : 'Inactive'} tone={employee.isActive ? 'success' : 'neutral'} />
            <MaterialIcons color={colors.muted} name="chevron-right" size={22} />
          </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  add: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 14, flexDirection: 'row', gap: 6, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  addText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  search: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  searchInput: { color: colors.ink, flex: 1, fontSize: 15, minHeight: 50 },
  employee: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 14 },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  avatarText: { color: colors.primaryDark, fontSize: 14, fontWeight: '900' },
  employeeCopy: { flex: 1, gap: 3 },
  employeeName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12 },
  salary: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
