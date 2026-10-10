import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { formatTime } from '../utils/date';
import type { HourEntry } from '../models/types';

interface Props {
  entry: HourEntry;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function HourEntryCard({ entry, onEdit, onDelete }: Props) {
  const timeRange = entry.start && entry.end
    ? `${formatTime(entry.start)} – ${formatTime(entry.end)}`
    : entry.clockIn && entry.clockOut
    ? `${formatTime(entry.clockIn)} – ${formatTime(entry.clockOut)}`
    : entry.clockIn
    ? `${formatTime(entry.clockIn)} (no clock-out)`
    : '';

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.hours}>{(entry.totalHours || entry.hours || 0).toFixed(1)} hrs</Text>
        {timeRange ? <Text style={styles.time}>{timeRange}</Text> : null}
        {entry.type !== 'regular' && (
          <Text style={[styles.type, entry.type === 'overtime' && styles.typeOT]}>
            {entry.type.toUpperCase()}
          </Text>
        )}
        {entry.notes ? <Text style={styles.notes} numberOfLines={1}>📝 {entry.notes}</Text> : null}
      </View>
      <View style={styles.actions}>
        {onEdit && (
          <TouchableOpacity style={styles.actionBtn} onPress={onEdit}>
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={onDelete}>
            <Text style={styles.deleteText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  left: { flex: 1 },
  hours: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  time: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  type: { fontSize: fontSize.xs, fontWeight: '700', color: colors.accent, marginTop: 2 },
  typeOT: { color: colors.orange },
  notes: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  actionText: { fontSize: fontSize.xs, color: colors.textSecondary },
  deleteBtn: { borderColor: colors.red },
  deleteText: { fontSize: fontSize.md, color: colors.red, fontWeight: '600' },
});
