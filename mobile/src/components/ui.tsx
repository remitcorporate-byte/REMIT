import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, shadow } from '@/src/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { labelFor } from '@/src/lib/labels';

export function Screen({ children, refreshControl }: PropsWithChildren<{ refreshControl?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { paddingBottom: 20 + insets.bottom }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl as never}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PageHeading({ eyebrow, title, description, hideTitle }: { eyebrow?: string; title: string; description?: string; hideTitle?: boolean }) {
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {!hideTitle ? <Text style={styles.title}>{title}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={[styles.input, props.multiline && styles.multiline]}
        {...props}
      />
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || disabled || loading) && styles.buttonPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.aubergine : colors.surface} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonSecondaryText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorMessage({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </Card>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'success' && styles.badgeSuccess,
        tone === 'warning' && styles.badgeWarning,
        tone === 'danger' && styles.badgeDanger,
      ]}>
      <Text
        style={[
          styles.badgeText,
          tone === 'success' && styles.badgeTextSuccess,
          tone === 'warning' && styles.badgeTextWarning,
          tone === 'danger' && styles.badgeTextDanger,
        ]}>
        {labelFor(label)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 18, padding: 20, paddingBottom: 44 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.medium,
    borderWidth: 1,
    padding: 18,
    ...shadow,
  },
  heading: { gap: 7, marginBottom: 2 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  title: { color: colors.aubergine, fontSize: 28, fontWeight: '800', letterSpacing: -0.9 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  field: { gap: 7 },
  label: { color: colors.label, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.lineStrong,
    borderRadius: radius.small,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  multiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.small,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 2,
  },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderWidth: 1, elevation: 0, shadowOpacity: 0 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.65 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  buttonSecondaryText: { color: '#40363E', fontWeight: '700' },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.small,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 28 },
  emptyTitle: { color: colors.aubergine, fontSize: 17, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.lineSoft, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeSuccess: { backgroundColor: colors.successSoft, borderColor: colors.successLine, borderWidth: 1 },
  badgeWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warningLine, borderWidth: 1 },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: '#5D545B', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  badgeTextSuccess: { color: colors.success },
  badgeTextWarning: { color: colors.warning },
  badgeTextDanger: { color: colors.danger },
});
