import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api, formatDate, formatNaira } from '@/src/api/client';
import { labelFor } from '@/src/lib/labels';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Button, Card, ErrorMessage, Field, Screen } from '@/src/components/ui';
import { confirmAction } from '@/src/lib/confirm';
import { colors } from '@/src/constants/theme';

export default function EmployeeDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const employee = useQuery({ queryKey: ['employee', id], queryFn: () => api.employee(id), enabled: Boolean(user) && Boolean(id) && can('employee.read') });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const data = employee.data;
  const startEdit = () => { if (!data) return; setForm({ firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone || '', department: data.department || '', position: data.position || '', salary: String(data.salary / 100), bankName: data.bankName, bankCode: data.bankCode, accountNumber: data.accountNumber, nextPaymentDate: data.nextPaymentDate ? data.nextPaymentDate.slice(0, 10) : '' }); setEditing(true); };
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || '');
  const update = useMutation({
    mutationFn: () => api.updateEmployee(id, { firstName: form.firstName, lastName: form.lastName, email: form.email.trim().toLowerCase(), phone: form.phone || null, department: form.department || null, position: form.position || null, salary: Math.round(Number(form.salary) * 100), bankName: form.bankName, bankCode: form.bankCode, accountNumber: form.accountNumber, paymentFrequency: data?.paymentFrequency, nextPaymentDate: form.nextPaymentDate ? new Date(form.nextPaymentDate + 'T00:00:00.000Z').toISOString() : undefined }),
    onSuccess: async () => { setEditing(false); await queryClient.invalidateQueries({ queryKey: ['employee', id] }); await queryClient.invalidateQueries({ queryKey: ['employees'] }); },
  });
  const toggle = useMutation({
    mutationFn: async () => { if (data?.isActive) { await api.deactivateEmployee(id); return data; } return api.reactivateEmployee(id); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employee', id] }); await queryClient.invalidateQueries({ queryKey: ['employees'] }); },
  });

  if (!can('employee.read')) return <Screen><ErrorMessage message="You do not have permission to view employees." /></Screen>;
  if (employee.isLoading) return <Screen><ActivityIndicator color={colors.primary} /></Screen>;
  if (!data) return <Screen><ErrorMessage message={employee.error instanceof Error ? employee.error.message : 'Employee not found'} /></Screen>;

  return <Screen>
    <Card style={styles.hero}><View style={styles.avatar}><Text style={styles.avatarText}>{data.firstName[0]}{data.lastName[0]}</Text></View><View style={styles.copy}><Text style={styles.name}>{data.firstName} {data.lastName}</Text><Text style={styles.muted}>{data.email}</Text></View><Badge label={data.isActive ? 'Active' : 'Inactive'} tone={data.isActive ? 'success' : 'neutral'} /></Card>
    {editing ? <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Edit employee</Text>
      <View style={styles.row}><View style={styles.half}><Field label="First name" value={form.firstName || ''} onChangeText={set('firstName')} /></View><View style={styles.half}><Field label="Last name" value={form.lastName || ''} onChangeText={set('lastName')} /></View></View>
      <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={form.email || ''} onChangeText={set('email')} /><ErrorMessage message={form.email && !emailValid ? 'Enter a valid email address.' : null} />
      <View style={styles.row}><View style={styles.half}><Field label="Department" value={form.department || ''} onChangeText={set('department')} /></View><View style={styles.half}><Field label="Position" value={form.position || ''} onChangeText={set('position')} /></View></View>
      <Field label="Salary (NGN)" keyboardType="numeric" value={form.salary || ''} onChangeText={set('salary')} />
      <Field label="Bank name" value={form.bankName || ''} onChangeText={set('bankName')} /><Field label="Bank code" value={form.bankCode || ''} onChangeText={set('bankCode')} /><Field label="Account number" keyboardType="numeric" maxLength={10} value={form.accountNumber || ''} onChangeText={set('accountNumber')} /><Text style={styles.hint}>Changing bank details triggers server-side re-verification.</Text>
      <ErrorMessage message={update.error instanceof Error ? update.error.message : null} /><View style={styles.row}><Button disabled={!form.firstName || !form.lastName || !emailValid || Number(form.salary) <= 0 || form.accountNumber?.length !== 10} loading={update.isPending} onPress={() => update.mutate()} title="Save changes" /><Button onPress={() => setEditing(false)} title="Cancel" variant="secondary" /></View>
    </Card> : <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Employment and payout</Text>
      <Info label="Department" value={data.department || 'Not set'} /><Info label="Position" value={data.position || 'Not set'} /><Info label="Salary" value={formatNaira(data.salary)} /><Info label="Frequency" value={labelFor(data.paymentFrequency)} /><Info label="Next payment" value={formatDate(data.nextPaymentDate)} /><Info label="Bank" value={data.bankName} /><Info label="Account" value={'••••' + data.accountNumber.slice(-4)} />
      {can('employee.manage') ? <View style={styles.row}><Button onPress={startEdit} title="Edit employee" /><Button onPress={async () => { const ok = await confirmAction({ title: data.isActive ? 'Deactivate employee?' : 'Reactivate employee?', message: data.isActive ? 'They will no longer be included in new payrolls.' : 'They can be included in future payrolls.', confirmText: data.isActive ? 'Deactivate' : 'Reactivate', destructive: data.isActive }); if (ok) toggle.mutate(); }} title={data.isActive ? 'Deactivate' : 'Reactivate'} variant={data.isActive ? 'danger' : 'secondary'} /></View> : null}
    </Card>}
    <Card style={styles.section}><Text style={styles.sectionTitle}>Recent payments</Text>{data.transactions?.filter((item) => item.type === 'PAYROLL_DEBIT' || item.type === 'REFUND').length ? data.transactions.filter((item) => item.type === 'PAYROLL_DEBIT' || item.type === 'REFUND').map((item) => <View key={item.id} style={styles.payment}><Text style={styles.name}>{formatNaira(item.amount)}</Text><Text style={styles.muted}>{formatDate(item.createdAt)} · {labelFor(item.status)}</Text></View>) : <Text style={styles.muted}>No completed or attempted payments recorded yet.</Text>}</Card>
  </Screen>;
}
function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.muted}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ hero: { alignItems: 'center', flexDirection: 'row', gap: 12 }, avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 18, height: 56, justifyContent: 'center', width: 56 }, avatarText: { color: colors.primaryDark, fontWeight: '900' }, copy: { flex: 1, gap: 4 }, name: { color: colors.ink, fontSize: 16, fontWeight: '900' }, muted: { color: colors.muted, fontSize: 13 }, section: { gap: 12 }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, row: { flexDirection: 'row', gap: 10 }, half: { flex: 1 }, info: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, value: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' }, hint: { color: colors.muted, fontSize: 12 }, payment: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingVertical: 8 } });
