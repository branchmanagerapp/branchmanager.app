import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { currency } from '../utils/format';

export function PayrollConfirmScreen({ navigation, route }: any) {
  const [submitting, setSubmitting] = useState(false);
  const payroll = route?.params?.payroll || {
    startDate: '2026-03-24',
    endDate: '2026-03-30',
    totalGross: 2870,
    employeeCount: 3,
    totalHours: 120,
  };

  const payday = '2026-04-03';
  const deadline = '2026-04-01 5:00 PM';

  const handleSubmit = () => {
    Alert.alert(
      'Submit Payroll',
      `Submit payroll for ${currency(payroll.totalGross)}? This will send to Gusto for processing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Payroll',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            // In production: POST /payroll/submit
            setTimeout(() => {
              setSubmitting(false);
              Alert.alert('Payroll Submitted', 'Payroll has been sent to Gusto for processing.');
              navigation?.goBack();
            }, 2000);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Payroll</Text>
        <Text style={styles.step}>Step 2 of 2</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Deadline Warning */}
        <Card style={styles.deadlineCard}>
          <Text style={styles.deadlineIcon}>⏰</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.deadlineTitle}>Submission Deadline</Text>
            <Text style={styles.deadlineText}>{deadline}</Text>
          </View>
        </Card>

        {/* Summary */}
        <Card>
          <Text style={styles.sectionTitle}>Payroll Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Pay Period</Text>
            <Text style={styles.summaryValue}>{payroll.startDate} – {payroll.endDate}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payday</Text>
            <Text style={styles.summaryValue}>{payday}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Employees</Text>
            <Text style={styles.summaryValue}>{payroll.employeeCount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Hours</Text>
            <Text style={styles.summaryValue}>{payroll.totalHours.toFixed(1)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Gross Pay</Text>
            <Text style={styles.totalValue}>{currency(payroll.totalGross)}</Text>
          </View>
        </Card>

        {/* Checklist */}
        <Card>
          <Text style={styles.sectionTitle}>Pre-Submit Checklist</Text>
          <CheckItem label="All hours approved" checked />
          <CheckItem label="No warnings or issues" checked />
          <CheckItem label="Overtime reviewed" checked />
          <CheckItem label="PTO balances verified" checked />
        </Card>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>🚀 Submit Payroll — {currency(payroll.totalGross)}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Once submitted, payroll will be processed by Gusto. Employees will be paid on {payday}.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <View style={checkStyles.row}>
      <Text style={[checkStyles.icon, checked && checkStyles.iconChecked]}>
        {checked ? '✓' : '○'}
      </Text>
      <Text style={checkStyles.label}>{label}</Text>
    </View>
  );
}

const checkStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  icon: { fontSize: fontSize.lg, color: colors.textLight },
  iconChecked: { color: colors.greenDark, fontWeight: '700' },
  label: { fontSize: fontSize.md, color: colors.text },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  step: { fontSize: fontSize.sm, color: colors.textLight },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  deadlineCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#fef3c7', borderColor: colors.orange,
  },
  deadlineIcon: { fontSize: 32 },
  deadlineTitle: { fontWeight: '700', color: '#92400e' },
  deadlineText: { fontSize: fontSize.lg, fontWeight: '800', color: '#92400e', marginTop: 2 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  summaryLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  summaryValue: { fontSize: fontSize.md, fontWeight: '600' },
  totalRow: { borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md },
  totalLabel: { fontSize: fontSize.lg, fontWeight: '800' },
  totalValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.greenDark },
  submitBtn: {
    backgroundColor: colors.greenDark, paddingVertical: 18, borderRadius: radius.md,
    alignItems: 'center', marginTop: spacing.lg,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  disclaimer: {
    fontSize: fontSize.sm, color: colors.textLight, textAlign: 'center',
    marginTop: spacing.md, lineHeight: 20,
  },
});
