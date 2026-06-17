import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Input, ErrorMessage } from '../../src/components/ui';
import { Colors, Spacing, FontSize } from '../../src/components/theme';

export default function LoginScreen() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const handleLogin = async () => { if (!usernameOrEmail || !password) return; clearError(); await login(usernameOrEmail, password); };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>TACTICAL</Text>
          <Text style={styles.subtitle}>Strategy. Outplay. Win.</Text>
        </View>
        <View style={styles.form}>
          {error && <ErrorMessage message={error} />}
          <Input label="Username or Email" value={usernameOrEmail} onChangeText={setUsernameOrEmail} placeholder="Enter username or email" autoCapitalize="none" autoCorrect={false} />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="Enter password" secureTextEntry />
          <Button title="Log In" onPress={handleLogin} loading={isLoading} disabled={!usernameOrEmail || !password} size="lg" />
          <Button title="Create Account" onPress={() => router.push('/(auth)/register')} variant="ghost" size="lg" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  title: { fontSize: 48, fontWeight: '900', color: Colors.primary, letterSpacing: 8 },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  form: { gap: Spacing.sm },
});
