import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/auth-provider';
import { Button, ErrorMessage, Field } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>R</Text>
          </View>
          <Text style={styles.wordmark}>REMIT</Text>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Payroll, without the friction</Text>
          <Text style={styles.title}>Welcome back.</Text>
          <Text style={styles.subtitle}>Sign in to manage your team, payroll and company wallet from anywhere.</Text>
        </View>

        <View style={styles.form}>
          <Field
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            label="Work email"
            onChangeText={setEmail}
            placeholder="you@company.com"
            value={email}
          />
          <Field
            autoCapitalize="none"
            autoComplete="password"
            label="Password"
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            value={password}
          />
          <ErrorMessage message={error} />
          <Button disabled={!email || !password} loading={loading} onPress={handleLogin} title="Sign in" />
        </View>

        <Text style={styles.footer}>
          New to REMIT? <Link href="/(auth)/register" style={styles.link}>Create your company account</Link>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 42 },
  logo: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  logoText: { color: colors.accent, fontSize: 22, fontWeight: '900' },
  wordmark: { color: colors.ink, fontSize: 21, fontWeight: '900', letterSpacing: 1.5 },
  copy: { gap: 8, marginBottom: 28 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.4 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: 16 },
  footer: { color: colors.muted, fontSize: 14, marginTop: 24, textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '800' },
});
