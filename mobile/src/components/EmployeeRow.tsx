import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Avatar } from './Avatar';
import { DayCell } from './DayCell';
import { hours as fmtHours } from '../utils/format';
import type { HourEntry } from '../models/types';

interface Props {
  name: string;
  role: string;
  dates: string[];
  entries: HourEntry[];
  weekApproved: boolean;
  onDayPress: (date: string) => void;
}

export function EmployeeRow({ name, role, dates, entries, weekApproved, onDayPress }: Props) {
  let weekTotal = 0;

  const dayCells = dates.map(date => {
    const dayEntries = entries.filter(e => e.date === date);
    const dayHours = dayEntries.reduce((s, e) => s + (e.hours || 0), 0);
    weekTotal += dayHours;
    const hasIssues = dayEntries.some(e => e.clockIn && !e.clockOut);
    const hasNotes = dayEntries.some(e => !!e.notes);
    return (
      <DayCell
        key={date}
        date={date}
        hours={dayHours}
        hasIssues={hasIssues}
        hasNotes={hasNotes}
        onPress={() => onDayPress(date)}
      />
    );
  });

  const overtime = Math.max(0, weekTotal - 40);

  return (
    <View style={styles.row}>
      <View style={styles.nameCol}>
        <Avatar name={name} size={28} />
        <View style={styles.nameText}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.role}>{role}</Text>
        </View>
      </View>

      <View style={styles.dayCols}>
        {dayCells}
      </View>

      <View style={[styles.totalCol, weekApproved && styles.totalApproved]}>
        <Text style={styles.totalHours}>{fmtHours(weekTotal)}</Text>
        {overtime > 0 && <Text style={styles.otLabel}>{overtime.toFixed(1)} OT</Text>}
        {weekApproved && <Text style={styles.approvedCheck}>✓</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'stretch',
  },
  nameCol: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  nameText: {
    flex: 1,
  },
  name: {
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  role: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  dayCols: {
    flex: 1,
    flexDirection: 'row',
  },
  totalCol: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingVertical: spacing.sm,
  },
  totalApproved: {
    backgroundColor: colors.greenBg,
  },
  totalHours: {
    fontSize: 15,
    fontWeight: '800',
  },
  otLabel: {
    fontSize: fontSize.xs,
    color: colors.red,
    fontWeight: '600',
  },
  approvedCheck: {
    fontSize: 9,
    color: colors.greenDark,
  },
});
