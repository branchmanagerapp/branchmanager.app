import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../theme';
import { isToday } from '../utils/date';

interface Props {
  date: string;
  hours: number;
  hasIssues: boolean;
  hasNotes: boolean;
  onPress: () => void;
}

export function DayCell({ date, hours, hasIssues, hasNotes, onPress }: Props) {
  const today = isToday(date);
  const barColor = hasIssues ? colors.red : hours > 0 ? colors.greenLight : colors.border;

  return (
    <TouchableOpacity
      style={[styles.cell, today && styles.cellToday]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.hours, hours > 0 ? styles.hoursActive : styles.hoursEmpty]}>
        {hours > 0 ? hours.toFixed(1) : '—'}
      </Text>
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      {hasNotes && <Text style={styles.noteIcon}>📝</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    minHeight: 50,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#f8f8f8',
  },
  cellToday: {
    backgroundColor: '#f0fdf4',
  },
  hours: {
    fontSize: fontSize.md,
  },
  hoursActive: {
    fontWeight: '700',
    color: colors.text,
  },
  hoursEmpty: {
    fontWeight: '400',
    color: '#ccc',
  },
  bar: {
    height: 4,
    width: '80%',
    borderRadius: 2,
    marginTop: 4,
  },
  noteIcon: {
    fontSize: 9,
    position: 'absolute',
    top: 2,
    right: 3,
  },
});
