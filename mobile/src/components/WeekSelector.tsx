import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { formatDateRange } from '../utils/date';

interface Props {
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekSelector({ weekStart, weekEnd, isCurrent, onPrev, onNext, onToday }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onPrev} style={styles.btn}>
        <Text style={styles.arrow}>{'<'}</Text>
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.title}>Week of {formatDateRange(weekStart, weekEnd)}</Text>
        {isCurrent ? (
          <Text style={styles.currentLabel}>Current Week</Text>
        ) : (
          <TouchableOpacity onPress={onToday}>
            <Text style={styles.todayLink}>Go to current week</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={onNext} style={styles.btn}>
        <Text style={styles.arrow}>{'>'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  btn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  arrow: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  center: {
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  currentLabel: {
    fontSize: fontSize.xs,
    color: colors.greenDark,
    fontWeight: '600',
    marginTop: 2,
  },
  todayLink: {
    fontSize: fontSize.xs,
    color: colors.accent,
    textDecorationLine: 'underline',
    marginTop: 2,
  },
});
