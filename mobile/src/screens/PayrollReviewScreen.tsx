import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { SummaryCard } from '../components/SummaryCard';
import { PayrollEmployeeRow } from '../components/PayrollEmployeeRow';
import { currency } from '../utils/format';
import { getPayrollRun } from '../api/payroll';
import { getWeekDates } from '../utils/date';
import type { PayrollRun } from '../models/types';

export function PayrollReviewScreen({ navigation }: any) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [payroll, setPayroll] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);

  const dates = getWeekDates(weekOffset);
  const weekStart = dates[0];
  const weekEnd = dates[6];

  useEffect(() => {
    setLoading(true);
    getPayrollRun(weekStart, weekEnd).then(run => {
      setPayroll(run);
      setLoading(false);
    });
  }, [weekStart, weekEnd]);

  const totalGross = payroll?.totalGross || 0;
  const allApproved = payroll?.employees.every(e => e.approved) || false;
  const approvedCount = payroll?.employees.filter(e => e.approved).length || 0;
  const empCount = payroll?.employees.length || 0;

  const handleContinue = () => {
    if (!allApproved && empCount > 0) {
      Alert.alert('Cannot Submit', 'All employees must be approved before submitting payroll.');
      return;
    }
    navigation?.navigate('PayrollConfirm', {
      payroll: {
        startDate: weekStart,
        endDate: weekEnd,
        totalGross,
        employeeCount: empCount,
        totalHours: (payroll?.totalRegular || 0) + (payroll?.totalOvertime || 0),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payroll Review</Text>
        <Text style={styles.step}>Step 1 of 2</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Period */}
          <View style={styles.periodRow}>
            <TouchableOpacity onPress={() => setWeekOffset(o => o - 1)}>
              <Text style={styles.periodArrow}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.periodText}>{weekStart} — {weekEnd}</Text>
            <TouchableOpacity onPress={() => setWeekOffset(o => o + 1)}>
              <Text style={styles.periodArrow}>{'>'}</Text>
            </TouchableOpacity>
          </View>

          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <SummaryCard label="Total Hours" value={((payroll?.totalRegular || 0) + (payroll?.totalOvertime || 0)).toFixed(1)} />
            <SummaryCard
              label="Overtime"
              value={(payroll?.totalOvertime || 0).toFixed(1)}
              color={(payroll?.totalOvertime || 0) > 0 ? '#d97706' : colors.text}
              bgColor={(payroll?.totalOvertime || 0) > 0 ? colors.orangeBg : colors.bg}
            />
            <SummaryCard
              label="Approved"
              value={`${approvedCount}/${empCount}`}
              color={allApproved ? colors.greenDark : '#d97706'}
              bgColor={allApproved ? colors.greenBg : colors.orangeBg}
            />
          </View>

          {/* Gross Pay */}
          <Card>
            <View style={styles.grossRow}>
              <Text style={styles.grossLabel}>Total Gross Pay</Text>
              <Text style={styles.grossValue}>{currency(totalGross)}</Text>
            </View>
          </Card>

          {/* Employees */}
          <Text style={styles.sectionTitle}>Employees ({empCount})</Text>
          <Card style={{ padding: 0 }}>
            {!payroll || payroll.employees.length === 0 ? (
              <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                <Text style={{ color: colors.textLight }}>No time entries for this period</Text>
              </View>
            ) : (
              <View style={{ padding: spacing.md }}>
                {payroll.employees.map(emp => (
                  <PayrollEmployeeRow key={emp.employeeId} employee={emp} />
                ))}
              </View>
            )}
          </Card>

          {/* Continue */}
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.8}>
            <Text style={styles.continueText}>Continue to Submit →</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  step: { fontSize: fontSize.sm, color: colors.textLight },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  periodArrow: { fontSize: fontSize.xl, fontWeight: '600', color: colors.text, paddingHorizontal: spacing.md },
  periodText: { fontSize: fontSize.md, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  grossRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grossLabel: { fontSize: fontSize.lg, fontWeight: '700' },
  grossValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.greenDark },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  continueBtn: { backgroundColor: colors.greenDark, paddingVertical: 18, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  continueText: { color: colors.white, fontWeight: '800', fontSize: fontSize.lg },
});
