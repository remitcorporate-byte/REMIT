import { useState } from 'react';
import { BrandLockup } from '@/src/components/brand-mark';
import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/src/api/client';
import { Button, ErrorMessage, Field } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit() { setLoading(true); setError(''); try { const result = await api.forgotPassword(email.trim().toLowerCase()); setMessage(result.message || 'If an account exists, reset instructions have been sent.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send reset instructions.'); } finally { setLoading(false); } }
  return <SafeAreaView style={styles.container}><BrandLockup size={24} /><Text style={styles.title}>Forgot password?</Text><Text style={styles.copy}>We will send reset instructions to your work email.</Text><Field autoCapitalize="none" keyboardType="email-address" label="Work email" onChangeText={setEmail} value={email} /><ErrorMessage message={error} />{message ? <Text style={styles.message}>{message}</Text> : null}<Button disabled={!email} loading={loading} onPress={submit} title="Send reset link" /><Link href="/(auth)/login" style={styles.link}>Back to sign in</Link></SafeAreaView>;
}
const styles = StyleSheet.create({ container: { flex: 1, gap: 16, justifyContent: 'center', padding: 24, backgroundColor: colors.ivory }, title: { color: colors.aubergine, fontSize: 32, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 15, lineHeight: 22 }, message: { color: colors.primary, lineHeight: 20 }, link: { color: colors.primary, fontWeight: '800', textAlign: 'center' } });
