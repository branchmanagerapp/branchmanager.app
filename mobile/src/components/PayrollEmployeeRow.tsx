import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Avatar } from './Avatar';
import { currency } from '../utils/format';
import type { PayrollEmployee } from '../models/types';

interface Props {
  employee: PayrollEmployee;
  showApproval?: boolean;
}

export function PayrollEmployeeRow({ employee, showApproval = true }: Props) {
  const totalHours = employee.regularHours + employee.overtimeHours + employee.ptoHours;

  return (
    <View style={styles.row}>
      <Avatar name={employee.name} size={36} />
      <View style={styles.info}>
        <Text style={styles.name}>{employee.name}</Text>
        <Text style={styles.detail}>
          {employee.regularHours.toFixed(1)} reg
          {employee.overtimeHours > 0 ? ` + ${employee.overtimeHours.toFixed(1)} OT` : ''}
          {employee.ptoHours > 0 ? ` + ${employee.ptoHours.toFixed(1)} PTO` : ''}
          {' · '}{totalHours.toFixed(1)} hrs
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.pay}>{currency(employee.grossPay)}</Text>
        {showApproval && (
          <Text style={[styles.status, employee.approved ? styles.approved : styles.pending]}>
            {employee.approved ? '✓ Approved' : 'Pending'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  info: { flex: 1 },
  name: { fontSize: fontSize.md, fontWeight: '600' },
  detail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  pay: { fontSize: fontSize.md, fontWeight: '700' },
  status: { fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  approved: { color: colors.greenDark },
  pending: { color: colors.orange },
});
