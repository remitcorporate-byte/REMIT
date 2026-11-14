import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/theme';

/**
 * The REMIT mark: a 2x2 grid of squares with one orange tile (top-right),
 * Concept 1 geometry (rounded tiles); matches the web `RemitMark` (frontend/src/pages/LandingPage.tsx).
 */
export function BrandMark({ size = 28, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  const gap = Math.max(2, Math.round(size * 0.073));
  const tile = (size - gap) / 2;
  const base = tone === 'light' ? colors.ivory : colors.aubergine;
  const tiles = [base, colors.accent, base, base];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {tiles.map((color, index) => (
        <View key={index} style={{ width: tile, height: tile, borderRadius: tile * 0.12, backgroundColor: color }} />
      ))}
    </View>
  );
}

/** Mark + REMIT wordmark, as on the web header and footer. */
export function BrandLockup({ size = 26, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <View accessibilityLabel="REMIT" accessibilityRole="image" style={styles.lockup}>
      <BrandMark size={size} tone={tone} />
      <Text style={[styles.wordmark, { fontSize: size * 0.95, color: tone === 'light' ? colors.onDark : colors.aubergine }]}>REMIT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  wordmark: { fontWeight: '900', letterSpacing: 1.6 },
});
