import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { api, formatDateTime } from '@/src/api/client';
import { deviceLabel, roleLabel } from '@/src/lib/labels';
import { useAuth } from '@/src/auth/auth-provider';
import { Button, Card, ErrorMessage, Field, PageHeading, Screen } from '@/src/components/ui';
import { confirmAction } from '@/src/lib/confirm';
import { colors } from '@/src/constants/theme';

export default function SettingsScreen() {
  const { user, logoutAll } = useAuth();
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions, enabled: Boolean(user) });
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const change = useMutation({ mutationFn: () => api.changePassword(passwords.current, passwords.next), onSuccess: () => { setPasswords({ current: '', next: '', confirm: '' }); setPasswordSuccess(true); } });
  const policy = passwords.next.length >= 10 && /[A-Za-z]/.test(passwords.next) && /\d/.test(passwords.next);
  return <Screen><PageHeading title="Settings" description="Profile, password and active sessions." hideTitle />
    <Card style={styles.section}><Text style={styles.title}>Profile</Text><Text style={styles.value}>{user?.firstName} {user?.lastName}</Text><Text style={styles.muted}>{user?.email}</Text><Text style={styles.muted}>{user ? roleLabel(user.role) : ''}</Text></Card>
    <Card style={styles.section}><Text style={styles.title}>Change password</Text>{passwordSuccess ? <Text style={styles.success}>Password changed successfully.</Text> : null}<Field label="Current password" secureTextEntry value={passwords.current} onChangeText={(current) => { setPasswordSuccess(false); setPasswords({ ...passwords, current }); }} /><Field label="New password" secureTextEntry value={passwords.next} onChangeText={(next) => { setPasswordSuccess(false); setPasswords({ ...passwords, next }); }} /><Field label="Confirm new password" secureTextEntry value={passwords.confirm} onChangeText={(confirm) => { setPasswordSuccess(false); setPasswords({ ...passwords, confirm }); }} /><Text style={styles.muted}>At least 10 characters with a letter and number.</Text>{passwords.confirm && passwords.confirm !== passwords.next ? <ErrorMessage message="Passwords do not match." /> : null}<ErrorMessage message={change.error instanceof Error ? change.error.message : null} /><Button disabled={!passwords.current || !policy || passwords.next !== passwords.confirm} loading={change.isPending} onPress={() => change.mutate()} title="Change password" /></Card>
    <Card style={styles.section}><Text style={styles.title}>Active sessions</Text>{sessions.isLoading ? <ActivityIndicator color={colors.primary} /> : sessions.error ? <ErrorMessage message={sessions.error instanceof Error ? sessions.error.message : 'Could not load sessions'} /> : sessions.data?.map((session) => <Card key={session.id} style={styles.session}><Text style={styles.value}>{deviceLabel(session.userAgent, session.deviceName)} {session.current ? '· This device' : ''}</Text><Text style={styles.muted}>Last used {formatDateTime(session.lastUsedAt)}</Text>{!session.current ? <Button title="Revoke" variant="secondary" onPress={async () => { await api.revokeSession(session.id); await queryClient.invalidateQueries({ queryKey: ['sessions'] }); }} /> : null}</Card>)}</Card>
    <Button title="Sign out of all devices" variant="danger" onPress={async () => { if (await confirmAction({ title: 'Sign out everywhere?', message: 'All active sessions will be signed out.', confirmText: 'Sign out', destructive: true })) await logoutAll(); }} />
  </Screen>;
}
const styles = StyleSheet.create({ section: { gap: 10 }, title: { color: colors.ink, fontSize: 18, fontWeight: '900' }, value: { color: colors.ink, fontSize: 15, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 13 }, success: { color: colors.success, fontSize: 14, fontWeight: '800' }, session: { gap: 5, padding: 12 } });
