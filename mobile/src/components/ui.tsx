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
import { labelFor } from '@/src/lib/labels';

export function Screen({ children, refreshControl }: PropsWithChildren<{ refreshControl?: ReactNode }>) {
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
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
        placeholderTextColor="#98A2B3"
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
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.surface} />
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
      <Text style={styles.badgeText}>{labelFor(label)}</Text>
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
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.small,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  multiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.small,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.65 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  buttonSecondaryText: { color: colors.primaryDark },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.small,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: colors.ink, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
});
