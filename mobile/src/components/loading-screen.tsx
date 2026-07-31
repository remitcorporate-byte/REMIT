import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/theme';

export function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>R</Text>
      </View>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 18,
    justifyContent: 'center',
  },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 18,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  logoText: { color: colors.accent, fontSize: 30, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 15, fontWeight: '600' },
});
