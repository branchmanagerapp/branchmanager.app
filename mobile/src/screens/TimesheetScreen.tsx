import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../theme';
import { WeekSelector } from '../components/WeekSelector';
import { SummaryCard } from '../components/SummaryCard';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { DayDetailModal } from './DayDetailModal';
import { getWeekDates, dayName, dayOfMonth, isToday } from '../utils/date';
import { hours as fmtHours } from '../utils/format';
import { supabase } from '../api/supabase';
import { approveWeek, type ApprovalState } from '../api/approvals';
import { getApprovals, isEmployeeApproved, isDayApproved } from '../api/approvals';
import { addHours } from '../api/timesheets';
import type { HourEntry, Employee } from '../models/types';

export function TimesheetScreen({ navigation }: any) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<HourEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalState>({});
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalEmp, setModalEmp] = useState('');
  const [modalDate, setModalDate] = useState('');

  const dates = getWeekDates(weekOffset);
  const weekStart = dates[0];
  const weekEnd = dates[6];

  const loadData = useCallback(async () => {
    try {
      const [teamRes, entryRes] = await Promise.all([
        supabase.from('team_members').select('*').eq('active', true).order('name'),
        supabase.from('time_entries').select('*').gte('date', weekStart).lte('date', weekEnd),
      ]);
      setEmployees((teamRes.data || []).map((t: any) => ({
        id: t.id, name: t.name, role: t.role || 'employee', payRate: parseFloat(t.rate) || 0, active: true,
      })));
      setEntries((entryRes.data || []).map((e: any) => ({
        id: e.id, employeeId: e.user_name || e.user_id || '', date: e.date,
        clockIn: e.clock_in, clockOut: e.clock_out, hours: parseFloat(e.hours) || 0, type: 'regular' as const,
        notes: e.notes, jobId: e.job_id,
      })));
      const appr = await getApprovals();
      setApprovals(appr);
    } catch (e) { console.warn('Timesheet load error:', e); }
  }, [weekStart, weekEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData().finally(() => setRefreshing(false)); };

  const getEmpEntries = (empName: string, date: string) =>
    entries.filter(e => (e.employeeId === empName || e.employeeId === empName) && e.date === date);

  const handleApproveAll = async () => {
    const ids = employees.map(e => e.name);
    await approveWeek(ids, weekStart);
    const appr = await getApprovals();
    setApprovals(appr);
    Alert.alert('Approved', 'All employees approved for the week.');
  };

  const handleExport = () => {
    let csv = 'Employee,Mon,Tue,Wed,Thu,Fri,Sat,Sun,Total\n';
    employees.forEach(emp => {
      let total = 0;
      const cols = dates.map(d => {
        const h = getEmpEntries(emp.name, d).reduce((s, e) => s + e.hours, 0);
        total += h; return h.toFixed(1);
      });
      csv += `${emp.name},${cols.join(',')},${total.toFixed(1)}\n`;
    });
    Alert.alert('Export', 'CSV copied to clipboard:\n\n' + csv.slice(0, 200) + '...');
  };

  const openDayDetail = (empName: string, date: string) => {
    setModalEmp(empName);
    setModalDate(date);
    setModalVisible(true);
  };

  // Totals
  let totalHours = 0;
  let totalOT = 0;
  let approvedCount = 0;

  employees.forEach(emp => {
    let empH = 0;
    dates.forEach(d => { empH += getEmpEntries(emp.name, d).reduce((s, e) => s + e.hours, 0); });
    totalHours += empH;
    totalOT += Math.max(0, empH - 40);
    if (isEmployeeApproved(approvals, emp.name, weekStart)) approvedCount++;
  });

  const allApproved = approvedCount === employees.length && employees.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Timesheets</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleExport}>
            <Text style={styles.actionBtnText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenDark} />}>
        <View style={styles.content}>
          <WeekSelector weekStart={weekStart} weekEnd={weekEnd} isCurrent={weekOffset === 0}
            onPrev={() => setWeekOffset(o => o - 1)} onNext={() => setWeekOffset(o => o + 1)} onToday={() => setWeekOffset(0)} />

          <View style={styles.bulkRow}>
            <TouchableOpacity style={[styles.bulkBtn, styles.bulkPrimary]} onPress={handleApproveAll}>
              <Text style={styles.bulkPrimaryText}>✓ Approve All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkBtn} onPress={() => navigation?.navigate('PayrollReview')}>
              <Text style={styles.bulkBtnText}>Summary</Text>
            </TouchableOpacity>
          </View>

          <Card style={styles.gridCard}>
            <View style={styles.gridHeader}>
              <View style={styles.nameColHeader}><Text style={styles.colLabel}>Employee</Text></View>
              {dates.map(date => (
                <View key={date} style={[styles.dayColHeader, isToday(date) && styles.dayColToday]}>
                  <Text style={styles.dayLabel}>{dayName(date)}</Text>
                  <Text style={styles.dayNum}>{dayOfMonth(date)}</Text>
                </View>
              ))}
              <View style={styles.totalColHeader}><Text style={styles.colLabel}>Total</Text></View>
            </View>

            {employees.map(emp => {
              let empTotal = 0;
              return (
                <View key={emp.id} style={styles.empRow}>
                  <View style={styles.nameCol}>
                    <Avatar name={emp.name} size={26} />
                    <View style={styles.nameWrap}>
                      <Text style={styles.empName} numberOfLines={1}>{emp.name.split(' ')[0]}</Text>
                      <Text style={styles.empRole}>{emp.role}</Text>
                    </View>
                  </View>

                  {dates.map(date => {
                    const dayEntries = getEmpEntries(emp.name, date);
                    const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
                    empTotal += dayHours;
                    const hasIssues = dayEntries.some(e => e.clockIn && !e.clockOut);
                    const barColor = hasIssues ? colors.red : dayHours > 0 ? colors.greenLight : colors.border;
                    const cellKey = emp.name + '_' + date;

                    return (
                      <TouchableOpacity key={date} style={[styles.dayCell, isToday(date) && styles.dayCellToday]}
                        onPress={() => setExpandedCell(expandedCell === cellKey ? null : cellKey)} activeOpacity={0.6}>
                        <Text style={[styles.cellHours, dayHours > 0 ? styles.cellActive : styles.cellEmpty]}>
                          {dayHours > 0 ? dayHours.toFixed(1) : '—'}
                        </Text>
                        <View style={[styles.cellBar, { backgroundColor: barColor }]} />
                        {expandedCell === cellKey && (
                          <View style={styles.cellExpanded}>
                            <TouchableOpacity style={styles.detailBtn} onPress={() => openDayDetail(emp.name, date)}>
                              <Text style={styles.detailBtnText}>Details</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {(() => {
                    const ot = Math.max(0, empTotal - 40);
                    const weekApproved = isEmployeeApproved(approvals, emp.name, weekStart);
                    return (
                      <View style={[styles.totalCol, weekApproved && { backgroundColor: colors.greenBg }]}>
                        <Text style={styles.totalText}>{fmtHours(empTotal)}</Text>
                        {ot > 0 && <Text style={styles.otText}>{ot.toFixed(1)} OT</Text>}
                        {weekApproved && <Text style={{ fontSize: 9, color: colors.greenDark }}>✓</Text>}
                      </View>
                    );
                  })()}
                </View>
              );
            })}
          </Card>

          <Card style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Weekly Review</Text>
            <View style={styles.summaryRow}>
              <SummaryCard label="Total Hours" value={totalHours.toFixed(1)} />
              <SummaryCard label="Overtime" value={totalOT.toFixed(1)} color={totalOT > 0 ? '#d97706' : colors.text} bgColor={totalOT > 0 ? colors.orangeBg : colors.bg} />
              <SummaryCard label="Approved" value={`${approvedCount}/${employees.length}`}
                color={allApproved ? colors.greenDark : '#d97706'} bgColor={allApproved ? colors.greenBg : colors.orangeBg} />
            </View>

            <View style={[styles.payrollReady, allApproved && { backgroundColor: colors.greenBg, borderColor: colors.greenDark }]}>
              <Text style={styles.payrollIcon}>{allApproved ? '✅' : '⏳'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.payrollTitle, allApproved && { color: colors.greenDark }]}>
                  {allApproved ? 'Payroll Ready' : 'Payroll Not Ready'}
                </Text>
                <Text style={[styles.payrollSub, allApproved && { color: colors.greenDark }]}>
                  {allApproved ? 'All hours approved. Ready to sync with Gusto.' : `${employees.length - approvedCount} employee(s) pending approval`}
                </Text>
              </View>
              {allApproved && (
                <TouchableOpacity style={{ backgroundColor: colors.greenDark, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md }}
                  onPress={() => navigation?.navigate('PayrollReview')}>
                  <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.sm }}>🚀 Payroll</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <DayDetailModal
        visible={modalVisible}
        employeeName={modalEmp}
        date={modalDate}
        entries={getEmpEntries(modalEmp, modalDate)}
        approved={isDayApproved(approvals, modalEmp, modalDate)}
        onClose={() => { setModalVisible(false); loadData(); }}
        onApprove={async () => {
          const { approveDay } = await import('../api/approvals');
          await approveDay(modalEmp, modalDate);
          const appr = await getApprovals();
          setApprovals(appr);
        }}
        onAddHours={async (entry) => {
          await addHours({ employeeId: modalEmp, date: modalDate, hours: entry.hours || 0, type: 'regular', notes: entry.notes });
          loadData();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  bulkRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  bulkBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.white },
  bulkPrimary: { backgroundColor: colors.greenDark, borderColor: colors.greenDark },
  bulkPrimaryText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
  bulkBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  gridCard: { padding: 0, overflow: 'hidden' },
  gridHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: colors.border },
  nameColHeader: { width: 90, padding: spacing.sm, justifyContent: 'center' },
  dayColHeader: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  dayColToday: { backgroundColor: colors.greenBg },
  dayLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNum: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 1 },
  totalColHeader: { width: 55, alignItems: 'center', justifyContent: 'center' },
  colLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  empRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderLight, alignItems: 'stretch' },
  nameCol: { width: 90, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: spacing.sm, borderRightWidth: 1, borderRightColor: colors.borderLight },
  nameWrap: { flex: 1 },
  empName: { fontWeight: '600', fontSize: fontSize.xs },
  empRole: { fontSize: 9, color: colors.textLight },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, minHeight: 50, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#f8f8f8' },
  dayCellToday: { backgroundColor: '#f0fdf4' },
  cellHours: { fontSize: fontSize.md },
  cellActive: { fontWeight: '700', color: colors.text },
  cellEmpty: { fontWeight: '400', color: '#ccc' },
  cellBar: { height: 4, width: '75%', borderRadius: 2, marginTop: 4 },
  cellExpanded: { marginTop: 4 },
  detailBtn: { backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  detailBtnText: { fontSize: 9, color: colors.white, fontWeight: '600' },
  totalCol: { width: 55, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderLeftWidth: 2, borderLeftColor: colors.border },
  totalText: { fontSize: 14, fontWeight: '800' },
  otText: { fontSize: 9, color: colors.red, fontWeight: '600' },
  reviewCard: { marginTop: spacing.lg },
  reviewTitle: { fontSize: fontSize.lg, fontWeight: '800', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  payrollReady: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderRadius: radius.md, backgroundColor: colors.orangeBg, borderWidth: 2, borderColor: colors.orange },
  payrollIcon: { fontSize: 28 },
  payrollTitle: { fontWeight: '700', fontSize: fontSize.md, color: '#92400e' },
  payrollSub: { fontSize: fontSize.sm, color: '#92400e', marginTop: 2 },
});
