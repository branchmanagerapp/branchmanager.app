import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import type { RoleKey } from '../models/types';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onDemoLogin: (role: RoleKey) => Promise<void>;
}

export function LoginScreen({ onLogin, onDemoLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (e: any) {
      setError(e.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (role: RoleKey) => {
    setLoading(true);
    try {
      await onDemoLogin(role);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.inner}>
          {/* Logo */}
          <Text style={styles.logo}>🌳</Text>
          <Text style={styles.title}>Branch Manager</Text>
          <Text style={styles.subtitle}>Second Nature Tree Service</Text>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@email.com"
              placeholderTextColor={colors.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textLight}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.loginText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick role login — hidden in production, visible in __DEV__ only */}
          {__DEV__ && (
            <>
              <TouchableOpacity onPress={() => setShowDemo(!showDemo)}>
                <Text style={styles.demoToggle}>Quick login (dev)</Text>
              </TouchableOpacity>
              {showDemo && (
                <View style={styles.demoOptions}>
                  <TouchableOpacity style={[styles.demoBtn, styles.demoBtnOwner]} onPress={() => handleDemo('owner')}>
                    <Text style={styles.demoBtnText}>👑 Owner</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.demoBtn, styles.demoBtnLead]} onPress={() => handleDemo('crew_lead')}>
                    <Text style={styles.demoBtnText}>👷 Crew Lead</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.demoBtn, styles.demoBtnCrew]} onPress={() => handleDemo('crew_member')}>
                    <Text style={styles.demoBtnText}>🧑‍🔧 Crew Member</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: 'center' },
  inner: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.xxxl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: spacing.sm },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.greenDark,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  form: {},
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  error: {
    color: colors.red,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.redBg,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  loginBtn: {
    backgroundColor: colors.greenDark,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  demoToggle: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: spacing.xl,
  },
  demoOptions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  demoBtn: {
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  demoBtnOwner: { backgroundColor: colors.greenBg, borderColor: '#c8e6c9' },
  demoBtnLead: { backgroundColor: colors.blueBg, borderColor: '#bbdefb' },
  demoBtnCrew: { backgroundColor: colors.orangeBg, borderColor: '#ffe0b2' },
  demoBtnText: { fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center' },
});
