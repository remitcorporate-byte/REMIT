import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, formatNaira } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Button, Card, EmptyState, ErrorMessage, Field, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function NewPayrollScreen() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [scheduledDate, setScheduledDate] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const employees = useQuery({ queryKey: ['employees', ''], queryFn: () => api.employees(), enabled: can('payroll.create') });

  const create = useMutation({
    mutationFn: () => api.createPayroll({ scheduledDate, employeeIds: selected, note: note.trim() || undefined }),
    onSuccess: async (payroll) => {
      await queryClient.invalidateQueries({ queryKey: ['payrolls'] });
      router.replace(`/payroll/${payroll.id}`);
    },
  });

  if (!can('payroll.create')) {
    return <Screen><ErrorMessage message="You do not have permission to create payroll." /></Screen>;
  }

  const activeEmployees = employees.data?.filter((employee) => employee.isActive) || [];
  const total = activeEmployees.filter((employee) => selected.includes(employee.id)).reduce((sum, employee) => sum + employee.salary, 0);
  const parsedDate = scheduledDate ? new Date(scheduledDate) : null;
  const dateInvalid = Boolean(scheduledDate && (!parsedDate || Number.isNaN(parsedDate.getTime())));
  // Compare calendar days, so today's date is allowed (MOB-005).
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dateInPast = Boolean(parsedDate && new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()) < startOfToday);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((employeeId) => employeeId !== id) : [...current, id]));
  }

  return (
    <Screen>
      <Text style={styles.intro}>Select employees, schedule the run, then submit the draft for approval.</Text>
      <Card style={styles.summary}>
        <Text style={styles.summaryLabel}>Draft total</Text>
        <Text style={styles.summaryAmount}>{formatNaira(total)}</Text>
        <Text style={styles.summaryMeta}>{selected.length} employees selected</Text>
      </Card>
      <Field label="Scheduled date (YYYY-MM-DD)" onChangeText={setScheduledDate} placeholder="YYYY-MM-DD" value={scheduledDate} />
      {dateInvalid || dateInPast ? <ErrorMessage message={dateInvalid ? 'Enter a valid date.' : 'Choose today or a future date.'} /> : null}
      <Field label="Note (optional)" multiline onChangeText={setNote} placeholder="August monthly payroll" value={note} />
      <View style={styles.employeeHeader}>
        <Text style={styles.sectionTitle}>Employees</Text>
        <Pressable onPress={() => setSelected(selected.length === activeEmployees.length ? [] : activeEmployees.map((employee) => employee.id))}>
          <Text style={styles.selectAll}>{selected.length === activeEmployees.length ? 'Clear all' : 'Select all'}</Text>
        </Pressable>
      </View>
      {!activeEmployees.length ? (
        <EmptyState title="No active employees" description="Add an active employee before creating payroll." />
      ) : (
        activeEmployees.map((employee) => {
          const isSelected = selected.includes(employee.id);
          return (
            <Pressable key={employee.id} onPress={() => toggle(employee.id)}>
              <Card style={[styles.employee, isSelected && styles.employeeSelected]}>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  <Text style={styles.check}>{isSelected ? '✓' : ''}</Text>
                </View>
                <View style={styles.employeeCopy}>
                  <Text style={styles.employeeName}>{employee.firstName} {employee.lastName}</Text>
                  <Text style={styles.employeeMeta}>{employee.department || employee.email}</Text>
                </View>
                <Text style={styles.salary}>{formatNaira(employee.salary)}</Text>
              </Card>
            </Pressable>
          );
        })
      )}
      <ErrorMessage message={create.error instanceof Error ? create.error.message : null} />
      <Button
        disabled={!scheduledDate || dateInvalid || dateInPast || !selected.length}
        loading={create.isPending}
        onPress={() => create.mutate()}
        title="Create payroll draft"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  summary: { backgroundColor: colors.ink, gap: 6 },
  summaryLabel: { color: '#AEB9D1', fontSize: 12, fontWeight: '700' },
  summaryAmount: { color: colors.surface, fontSize: 30, fontWeight: '900' },
  summaryMeta: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  employeeHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  selectAll: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  employee: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 14 },
  employeeSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  checkbox: { alignItems: 'center', borderColor: colors.line, borderRadius: 7, borderWidth: 2, height: 24, justifyContent: 'center', width: 24 },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  employeeCopy: { flex: 1, gap: 3 },
  employeeName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  employeeMeta: { color: colors.muted, fontSize: 11 },
  salary: { color: colors.ink, fontSize: 13, fontWeight: '900' },
});
