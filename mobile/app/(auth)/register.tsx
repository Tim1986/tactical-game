import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Input, ErrorMessage } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function RegisterScreen() {
  const { register, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const validateUsername = (val: string) => {
    if (val.length < 3) { setUsernameError('At least 3 characters'); return false; }
    if (val.length > 20) { setUsernameError('At most 20 characters'); return false; }
    if (!/^[a-zA-Z0-9_]+$/.test(val)) { setUsernameError('Letters, numbers, and underscores only'); return false; }
    setUsernameError(null);
    return true;
  };

  const handleUsernameChange = (val: string) => {
    setUsername(val);
    if (val.length > 0) validateUsername(val);
    else setUsernameError(null);
  };

  const handleRegister = async () => {
    if (!validateUsername(username)) return;
    clearError();
    await register(username, email, password);
  };

  const isValid = username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username)
    && email.includes('@') && password.length >= 8;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the arena</Text>
        </View>
        <View style={styles.form}>
          {error && <ErrorMessage message={error} />}

          <View>
            <Input
              label="Profile Name"
              value={username}
              onChangeText={handleUsernameChange}
              placeholder="e.g. shadow_knight"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldHint}>
              Your unique public handle — visible to opponents. Letters, numbers, underscores. 3–20 characters.
            </Text>
            {usernameError && <Text style={styles.fieldError}>{usernameError}</Text>}
          </View>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
          />
          <Button title="Create Account" onPress={handleRegister} loading={isLoading} disabled={!isValid} size="lg" />
          <Button title="Back to Login" onPress={() => router.back()} variant="ghost" size="lg" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  title: { fontSize: FontSize.title, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  form: { gap: Spacing.sm },
  fieldHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 4, paddingHorizontal: 2 },
  fieldError: { color: Colors.danger, fontSize: FontSize.xs, marginTop: 2, paddingHorizontal: 2 },
});
