import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, fontSize } from '../theme';

type Variant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const COLORS: Record<Variant, { bg: string; text: string }> = {
  success: { bg: colors.greenBg, text: colors.greenDark },
  warning: { bg: colors.orangeBg, text: '#92400e' },
  error: { bg: colors.redBg, text: colors.red },
  info: { bg: colors.blueBg, text: colors.accent },
  neutral: { bg: '#f3f4f6', text: colors.textSecondary },
};

interface Props {
  label: string;
  variant?: Variant;
}

export function StatusBadge({ label, variant = 'neutral' }: Props) {
  const c = COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
