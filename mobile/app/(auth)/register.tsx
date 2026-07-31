import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/auth-provider';
import { Button, ErrorMessage, Field, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function handleRegister() {
    setError('');
    setLoading(true);
    try {
      await register(form);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  }

  const complete = Object.values(form).every(Boolean) && form.password.length >= 8;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <Screen>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Start paying smarter</Text>
            <Text style={styles.title}>Create your REMIT account.</Text>
            <Text style={styles.subtitle}>Set up your company workspace. You will become the account owner.</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.half}><Field label="First name" onChangeText={set('firstName')} value={form.firstName} /></View>
            <View style={styles.half}><Field label="Last name" onChangeText={set('lastName')} value={form.lastName} /></View>
          </View>
          <Field label="Company name" onChangeText={set('companyName')} value={form.companyName} />
          <Field
            autoCapitalize="none"
            keyboardType="email-address"
            label="Work email"
            onChangeText={set('email')}
            value={form.email}
          />
          <Field
            autoCapitalize="none"
            label="Password"
            onChangeText={set('password')}
            secureTextEntry
            value={form.password}
          />
          <Text style={styles.hint}>Use at least 8 characters.</Text>
          <ErrorMessage message={error} />
          <Button disabled={!complete} loading={loading} onPress={handleRegister} title="Create account" />
          <Text style={styles.footer}>
            Already registered? <Link href="/(auth)/login" style={styles.link}>Sign in</Link>
          </Text>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  header: { gap: 8, marginBottom: 12, marginTop: 16 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 34, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  hint: { color: colors.muted, fontSize: 12, marginTop: -10 },
  footer: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '800' },
});
