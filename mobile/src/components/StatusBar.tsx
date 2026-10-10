import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme';
import type { TimesheetStatus } from '../models/types';

const STATUS_COLORS: Record<TimesheetStatus, string> = {
  ok: colors.greenLight,
  issues: colors.red,
  approved: colors.greenDark,
  editedAfterApproval: colors.orange,
};

interface Props {
  status: TimesheetStatus;
  height?: number;
}

export function StatusBar({ status, height = 4 }: Props) {
  return (
    <View
      style={[
        styles.bar,
        { height, backgroundColor: STATUS_COLORS[status] || colors.border },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '80%',
    borderRadius: 2,
    alignSelf: 'center',
  },
});
