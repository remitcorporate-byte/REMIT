import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandLockup } from '@/src/components/brand-mark';
import { colors } from '@/src/constants/theme';

/** Matches the native splash (aubergine + mark) so launch feels continuous. */
export function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <BrandLockup size={34} tone="light" />
      <ActivityIndicator color={colors.accent} size="small" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.aubergineDeep,
    flex: 1,
    gap: 22,
    justifyContent: 'center',
  },
  label: { color: colors.onDarkMuted, fontSize: 14, fontWeight: '600' },
});
