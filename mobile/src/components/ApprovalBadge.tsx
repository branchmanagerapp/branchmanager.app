import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, fontSize } from '../theme';

type Status = 'approved' | 'pending' | 'needs_reapproval';

const CONFIG: Record<Status, { icon: string; label: string; color: string; bg: string }> = {
  approved: { icon: '✓', label: 'Approved', color: colors.greenDark, bg: colors.greenBg },
  pending: { icon: '⏳', label: 'Pending', color: '#92400e', bg: colors.orangeBg },
  needs_reapproval: { icon: '⚠', label: 'Re-approval needed', color: '#d97706', bg: colors.orangeBg },
};

interface Props {
  status: Status;
}

export function ApprovalBadge({ status }: Props) {
  const c = CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.color }]}>{c.icon} {c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
