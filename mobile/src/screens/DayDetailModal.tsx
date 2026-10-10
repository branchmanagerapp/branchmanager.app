import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { ApprovalBadge } from '../components/ApprovalBadge';
import { HourEntryCard } from '../components/HourEntryCard';
import { formatDateFull, formatTime } from '../utils/date';
import { hours as fmtHours, currency } from '../utils/format';
import type { HourEntry } from '../models/types';

interface Props {
  visible: boolean;
  employeeName: string;
  date: string;
  entries: HourEntry[];
  approved: boolean;
  onClose: () => void;
  onApprove: () => void;
  onAddHours: (entry: Partial<HourEntry>) => void;
}

export function DayDetailModal({
  visible,
  employeeName,
  date,
  entries,
  approved,
  onClose,
  onApprove,
  onAddHours,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addHoursVal, setAddHoursVal] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const issues = entries.filter(e => e.clockIn && !e.clockOut);

  const handleSaveHours = () => {
    const h = parseFloat(addHoursVal);
    if (!h || h <= 0) return;
    onAddHours({
      employeeId: '',
      date,
      hours: h,
      notes: addNotes || undefined,
      type: 'regular',
    });
    setAddHoursVal('');
    setAddNotes('');
    setShowAddForm(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Done</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{employeeName}</Text>
              <Text style={styles.headerSub}>{formatDateFull(date)}</Text>
            </View>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {/* Summary */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{fmtHours(totalHours)}</Text>
                <Text style={styles.summaryLabel}>Total Hours</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: entries.length > 0 ? colors.greenDark : colors.textLight }]}>
                  {entries.length}
                </Text>
                <Text style={styles.summaryLabel}>Entries</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: issues.length > 0 ? colors.red : colors.textLight }]}>
                  {issues.length}
                </Text>
                <Text style={styles.summaryLabel}>Issues</Text>
              </View>
            </View>

            {/* Issues */}
            {issues.map(issue => (
              <View key={issue.id} style={styles.issueBar}>
                <Text style={styles.issueText}>Missing clock-out</Text>
              </View>
            ))}

            {/* Hour Entries */}
            {entries.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>No hours recorded</Text>
              </Card>
            ) : (
              entries.map(entry => (
                <HourEntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={() => {
                    setAddHoursVal(entry.hours?.toString() || '');
                    setAddNotes(entry.notes || '');
                    setShowAddForm(true);
                  }}
                  onDelete={async () => {
                    const { supabase } = await import('../api/supabase');
                    await supabase.from('time_entries').delete().eq('id', entry.id);
                    onClose(); // Refresh parent
                  }}
                />
              ))
            )}

            {/* Add Hours Form */}
            {showAddForm ? (
              <Card style={styles.addForm}>
                <Text style={styles.addFormTitle}>Add Hours</Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Hours</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="8.0"
                    placeholderTextColor={colors.textLight}
                    keyboardType="decimal-pad"
                    value={addHoursVal}
                    onChangeText={setAddHoursVal}
                    autoFocus
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Notes</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextarea]}
                    placeholder="Optional notes..."
                    placeholderTextColor={colors.textLight}
                    multiline
                    value={addNotes}
                    onChangeText={setAddNotes}
                  />
                </View>
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={styles.cancelFormBtn}
                    onPress={() => setShowAddForm(false)}
                  >
                    <Text style={styles.cancelFormText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveFormBtn} onPress={handleSaveHours}>
                    <Text style={styles.saveFormText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setShowAddForm(true)}
                >
                  <Text style={styles.addBtnText}>+ Add Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noteBtn}>
                  <Text style={styles.noteBtnText}>Add Note</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Approval */}
            <View style={styles.approvalSection}>
              {approved ? (
                <ApprovalBadge status="approved" />
              ) : (
                <TouchableOpacity style={styles.approveBtn} onPress={onApprove}>
                  <Text style={styles.approveBtnText}>Approve Day</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  headerSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 4 },
  issueBar: {
    backgroundColor: colors.redBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.red,
  },
  issueText: { fontSize: fontSize.sm, color: colors.red, fontWeight: '600' },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyText: { color: colors.textLight },
  entryCard: { marginBottom: spacing.sm },
  entryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryHours: { fontSize: fontSize.lg, fontWeight: '700' },
  entryTime: { fontSize: fontSize.sm, color: colors.textSecondary },
  entryJob: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
  entryNotes: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  entryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  editBtnText: { fontSize: fontSize.sm, color: colors.textSecondary },
  deleteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.redBg,
    borderRadius: radius.sm,
  },
  deleteBtnText: { fontSize: fontSize.sm, color: colors.red },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  addBtn: {
    flex: 1,
    backgroundColor: colors.greenDark,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  noteBtn: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteBtnText: { fontWeight: '600', fontSize: fontSize.md, color: colors.textSecondary },
  approvalSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  approveBtn: {
    backgroundColor: colors.greenDark,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxxl,
    borderRadius: radius.md,
    width: '100%',
    alignItems: 'center',
  },
  approveBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.lg },
  addForm: { marginTop: spacing.md },
  addFormTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  formField: { marginBottom: spacing.md },
  formLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  formInput: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    backgroundColor: colors.white,
  },
  formTextarea: { minHeight: 80, textAlignVertical: 'top' },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  cancelFormBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelFormText: { fontWeight: '600', color: colors.textSecondary },
  saveFormBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.greenDark,
  },
  saveFormText: { fontWeight: '700', color: colors.white },
});
