import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View, TextInput, TextInputProps } from 'react-native';
import { Colors, Spacing, FontSize, Radius } from './theme';

interface ButtonProps { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'lg'; }
export function Button({ title, onPress, loading, disabled, variant = 'primary', size = 'md' }: ButtonProps) {
  const bgColor = variant === 'primary' ? Colors.primary : variant === 'danger' ? Colors.danger : 'transparent';
  const borderColor = variant === 'ghost' ? Colors.border : 'transparent';
  const textColor = variant === 'ghost' ? Colors.textSecondary : Colors.textPrimary;
  const paddingV = size === 'sm' ? Spacing.xs : size === 'lg' ? Spacing.md : Spacing.sm;
  const fontSize = size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} style={[styles.button, { backgroundColor: bgColor, borderColor, borderWidth: variant === 'ghost' ? 1 : 0, paddingVertical: paddingV, opacity: (disabled || loading) ? 0.5 : 1 }]}>
      {loading ? <ActivityIndicator color={Colors.textPrimary} size="small" /> : <Text style={[styles.buttonText, { fontSize, color: textColor }]}>{title}</Text>}
    </TouchableOpacity>
  );
}
interface InputProps extends TextInputProps { label?: string; error?: string; }
export function Input({ label, error, ...props }: InputProps) {
  return (
    <View style={styles.inputContainer}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput style={[styles.input, error ? styles.inputError : null]} placeholderTextColor={Colors.textMuted} {...props} />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}
export function Card({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Badge({ label, color = Colors.primary }: { label: string; color?: string }) { return <View style={[styles.badge, { backgroundColor: color + '33' }]}><Text style={[styles.badgeText, { color }]}>{label}</Text></View>; }
export function SectionHeader({ title }: { title: string }) { return <Text style={styles.sectionHeader}>{title}</Text>; }
export function EmptyState({ message }: { message: string }) { return <View style={styles.emptyState}><Text style={styles.emptyStateText}>{message}</Text></View>; }
export function ErrorMessage({ message }: { message: string }) { return <View style={styles.errorBox}><Text style={styles.errorBoxText}>{message}</Text></View>; }
const styles = StyleSheet.create({
  button: { borderRadius: Radius.md, alignItems: 'center', paddingHorizontal: Spacing.lg },
  buttonText: { fontWeight: '600' },
  inputContainer: { marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.xs, fontWeight: '500' },
  input: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, color: Colors.textPrimary, fontSize: FontSize.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, height: 48 },
  inputError: { borderColor: Colors.danger },
  errorText: { color: Colors.danger, fontSize: FontSize.xs, marginTop: Spacing.xs },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600' },
  sectionHeader: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.lg, paddingHorizontal: Spacing.lg },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyStateText: { color: Colors.textMuted, fontSize: FontSize.md, textAlign: 'center' },
  errorBox: { backgroundColor: Colors.danger + '22', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.danger + '44', marginBottom: Spacing.md, marginHorizontal: Spacing.lg },
  errorBoxText: { color: Colors.danger, fontSize: FontSize.sm },
});
