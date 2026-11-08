import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { showMessage } from '@/src/lib/confirm';

import { api } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Button, Card, ErrorMessage, Field, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
import type { Employee } from '@/src/types/api';

type Frequency = Employee['paymentFrequency'];

export default function NewEmployeeScreen() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const banks = useQuery({ queryKey: ['banks'], queryFn: api.banks, enabled: can('bank.verify') });
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    position: '',
    salary: '',
    bankName: '',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    nextPaymentDate: '',
  });
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const selectedBank = useMemo(() => banks.data?.find((bank) => bank.code === form.bankCode), [banks.data, form.bankCode]);

  const verify = useMutation({
    mutationFn: () => api.verifyBank({ bankCode: form.bankCode.trim(), accountNumber: form.accountNumber.trim() }),
    onSuccess: (result) => setForm((current) => ({ ...current, accountName: result.account_name })),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createEmployee({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
        position: form.position.trim() || null,
        salary: Math.round(Number(form.salary.replaceAll(',', '')) * 100),
        bankName: form.bankName.trim(),
        bankCode: form.bankCode.trim(),
        accountNumber: form.accountNumber.trim(),
        accountName: form.accountName.trim() || undefined,
        paymentFrequency: frequency,
        nextPaymentDate: form.nextPaymentDate.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    },
  });

  if (!can('employee.manage')) {
    return <Screen><ErrorMessage message="You do not have permission to add employees." /></Screen>;
  }

  const salaryValue = Number(form.salary.replaceAll(',', ''));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const requiredComplete =
    form.firstName && form.lastName && emailValid && Number.isFinite(salaryValue) && salaryValue > 0 && form.bankName && form.bankCode && form.accountNumber.length === 10 && form.accountName;

  function applyKnownBank() {
    if (!selectedBank) {
      showMessage('Bank not found', 'Enter a valid Paystack bank code, or enter the bank name manually.');
      return;
    }
    setForm((current) => ({ ...current, bankName: selectedBank.name }));
  }

  return (
    <Screen>
      <Text style={styles.intro}>Add the employee’s work, salary and payout details.</Text>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Personal details</Text>
        <View style={styles.row}>
          <View style={styles.half}><Field label="First name" onChangeText={set('firstName')} value={form.firstName} /></View>
          <View style={styles.half}><Field label="Last name" onChangeText={set('lastName')} value={form.lastName} /></View>
        </View>
        <Field autoCapitalize="none" keyboardType="email-address" label="Email" onChangeText={set('email')} value={form.email} />
        {!!form.email && !emailValid ? <ErrorMessage message="Enter a valid email address." /> : null}
        <Field keyboardType="phone-pad" label="Phone (optional)" onChangeText={set('phone')} value={form.phone} />
        <View style={styles.row}>
          <View style={styles.half}><Field label="Department" onChangeText={set('department')} value={form.department} /></View>
          <View style={styles.half}><Field label="Position" onChangeText={set('position')} value={form.position} /></View>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Pay schedule</Text>
        <Field keyboardType="numeric" label="Salary (NGN)" onChangeText={set('salary')} placeholder="250,000" value={form.salary} />
        <View style={styles.frequency}>
          {(['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as Frequency[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => setFrequency(option)}
              style={[styles.frequencyOption, frequency === option && styles.frequencySelected]}>
              <Text style={[styles.frequencyText, frequency === option && styles.frequencyTextSelected]}>
                {option === 'BIWEEKLY' ? 'Biweekly' : option.toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field label="Next payment date (optional)" onChangeText={set('nextPaymentDate')} placeholder="2026-08-31" value={form.nextPaymentDate} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Bank account</Text>
        <Text style={styles.hint}>Enter the Paystack bank code. {banks.data?.length ? `${banks.data.length} Nigerian banks loaded.` : ''}</Text>
        <View style={styles.row}>
          <View style={styles.half}><Field label="Bank code" onChangeText={set('bankCode')} value={form.bankCode} /></View>
          <View style={styles.half}><Button onPress={applyKnownBank} title="Find bank" variant="secondary" /></View>
        </View>
        <Field label="Bank name" onChangeText={set('bankName')} value={form.bankName} />
        <Field keyboardType="numeric" label="Account number" maxLength={10} onChangeText={set('accountNumber')} value={form.accountNumber} />
        {can('bank.verify') ? (
          <Button
            disabled={!form.bankCode || form.accountNumber.length !== 10}
            loading={verify.isPending}
            onPress={() => verify.mutate()}
            title="Verify account"
            variant="secondary"
          />
        ) : null}
        <Field editable={false} label="Account name" onChangeText={set('accountName')} placeholder="Verify to resolve name" value={form.accountName} />
        <ErrorMessage message={verify.error instanceof Error ? verify.error.message : null} />
      </Card>

      <ErrorMessage message={create.error instanceof Error ? create.error.message : null} />
      <Button disabled={!requiredComplete} loading={create.isPending} onPress={() => create.mutate()} title="Add employee" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: 14 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  row: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  frequency: { flexDirection: 'row', gap: 8 },
  frequencyOption: { backgroundColor: colors.background, borderColor: colors.line, borderRadius: 10, borderWidth: 1, flex: 1, paddingVertical: 11 },
  frequencySelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  frequencyText: { color: colors.muted, fontSize: 11, fontWeight: '800', textAlign: 'center', textTransform: 'capitalize' },
  frequencyTextSelected: { color: colors.primaryDark },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
