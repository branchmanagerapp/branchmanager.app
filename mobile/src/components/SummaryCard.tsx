import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';

interface Props {
  label: string;
  value: string | number;
  color?: string;
  bgColor?: string;
}

export function SummaryCard({ label, value, color = colors.text, bgColor = colors.bg }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: bgColor }]}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  value: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
});
