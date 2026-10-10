import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Alert, Linking, ActivityIndicator, Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { currency } from '../utils/format';
import { formatDateFull } from '../utils/date';
import { fetchJob, updateJobStatus, updateJob } from '../api/jobs';
import type { Job, JobStatus } from '../models/types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  scheduled: 'info', in_progress: 'warning', completed: 'success', late: 'error', cancelled: 'neutral',
};

const STATUS_ACTIONS: Record<string, { label: string; next: JobStatus; color: string }[]> = {
  scheduled: [
    { label: '▶ Start Job', next: 'in_progress', color: colors.accent },
  ],
  in_progress: [
    { label: '✓ Mark Complete', next: 'completed', color: colors.greenDark },
  ],
  late: [
    { label: '▶ Start Job', next: 'in_progress', color: colors.accent },
    { label: '✗ Cancel', next: 'cancelled', color: colors.red },
  ],
};

export function JobDetailScreen({ navigation, route }: any) {
  const jobId = route?.params?.id;
  const [job, setJob] = useState<Job | null>(route?.params?.job || null);
  const [loading, setLoading] = useState(!job);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!job && jobId) {
      fetchJob(jobId).then(j => { setJob(j); setLoading(false); });
    }
  }, [jobId]);

  const handleStatusChange = (next: JobStatus) => {
    if (!job) return;
    const label = next === 'completed' ? 'Mark this job as complete?' : `Change status to ${next.replace('_', ' ')}?`;
    Alert.alert('Update Status', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setSaving(true);
          await updateJobStatus(job.id, next);
          setJob({ ...job, status: next });
          setSaving(false);
        },
      },
    ]);
  };

  const handleAddNote = async () => {
    if (!note.trim() || !job) return;
    const existing = job.notes || '';
    const timestamp = new Date().toLocaleString();
    const updated = `${existing}\n[${timestamp}] ${note.trim()}`.trim();
    await updateJob(job.id, { notes: updated } as any);
    setJob({ ...job, notes: updated });
    setNote('');
    Alert.alert('Note Added');
  };

  const openDirections = () => {
    if (!job?.property) return;
    const encoded = encodeURIComponent(job.property);
    const url = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?daddr=${encoded}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    Linking.openURL(url);
  };

  const callClient = () => {
    // Would need client phone from a join; for now use the property
    Alert.alert('Call Client', 'Client phone not loaded — navigate to client detail to call.');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Job Not Found</Text>
          <View style={{ width: 50 }} />
        </View>
      </SafeAreaView>
    );
  }

  const actions = STATUS_ACTIONS[job.status] || [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job #{job.jobNumber}</Text>
        <StatusBadge label={job.status.replace('_', ' ')} variant={STATUS_VARIANT[job.status] || 'neutral'} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Client + Property */}
        <Card>
          <TouchableOpacity onPress={() => job.clientId && navigation?.navigate('ClientDetail', { id: job.clientId })}>
            <Text style={styles.clientName}>{job.clientName}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openDirections} style={styles.propertyRow}>
            <Text style={styles.property}>{job.property}</Text>
            <Text style={styles.directionsLink}>📍 Directions</Text>
          </TouchableOpacity>
          {job.scheduledDate && (
            <Text style={styles.date}>{formatDateFull(job.scheduledDate)}</Text>
          )}
        </Card>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickBtn} onPress={openDirections}>
            <Text style={styles.quickIcon}>🗺️</Text>
            <Text style={styles.quickLabel}>Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={callClient}>
            <Text style={styles.quickIcon}>📞</Text>
            <Text style={styles.quickLabel}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={async () => {
            const { pickOrTakePhoto } = await import('../utils/photos');
            const photo = await pickOrTakePhoto();
            if (photo && job) {
              const photos = [...(job.photos || []), photo.uri];
              await updateJob(job.id, { photos } as any);
              setJob({ ...job, photos });
            }
          }}>
            <Text style={styles.quickIcon}>📷</Text>
            <Text style={styles.quickLabel}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('InvoiceBuilder', { fromJob: job })}>
            <Text style={styles.quickIcon}>🧾</Text>
            <Text style={styles.quickLabel}>Invoice</Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        {job.description && (
          <Card>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descText}>{job.description}</Text>
          </Card>
        )}

        {/* Crew */}
        {job.crew && job.crew.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Crew</Text>
            {job.crew.map((member, i) => (
              <View key={i} style={styles.crewRow}>
                <Avatar name={member} size={32} />
                <Text style={styles.crewName}>{member}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Value */}
        {job.total > 0 && (
          <Card>
            <View style={styles.valueRow}>
              <Text style={styles.valueLabel}>Job Value</Text>
              <Text style={styles.valueAmount}>{currency(job.total)}</Text>
            </View>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <Text style={styles.sectionTitle}>Notes</Text>
          {job.notes ? (
            <Text style={styles.notesText}>{job.notes}</Text>
          ) : (
            <Text style={styles.emptyText}>No notes yet</Text>
          )}
          <View style={styles.noteInput}>
            <TextInput
              style={styles.noteField}
              placeholder="Add a note..."
              placeholderTextColor={colors.textLight}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <TouchableOpacity
              style={[styles.noteBtn, !note.trim() && styles.noteBtnDisabled]}
              onPress={handleAddNote}
              disabled={!note.trim()}
            >
              <Text style={styles.noteBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Status Actions */}
        {actions.length > 0 && (
          <View style={styles.statusActions}>
            {actions.map(action => (
              <TouchableOpacity
                key={action.next}
                style={[styles.statusBtn, { backgroundColor: action.color }]}
                onPress={() => handleStatusChange(action.next)}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.statusBtnText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {job.status === 'completed' && (
          <Card style={{ backgroundColor: colors.greenBg }}>
            <Text style={{ textAlign: 'center', fontWeight: '700', color: colors.greenDark, fontSize: fontSize.lg }}>
              ✓ Job Completed
            </Text>
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  clientName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  propertyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  property: { fontSize: fontSize.md, color: colors.textSecondary, flex: 1 },
  directionsLink: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  date: { fontSize: fontSize.sm, color: colors.textLight, marginTop: spacing.sm },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  quickBtn: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  quickIcon: { fontSize: 22 },
  quickLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  descText: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  crewName: { fontSize: fontSize.md, fontWeight: '600' },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  valueAmount: { fontSize: fontSize.xl, fontWeight: '800', color: colors.greenDark },
  notesText: { fontSize: fontSize.md, color: colors.text, lineHeight: 22, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.sm, color: colors.textLight, marginBottom: spacing.md },
  noteInput: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  noteField: {
    flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: 14, color: colors.text, maxHeight: 80,
  },
  noteBtn: { backgroundColor: colors.greenDark, paddingHorizontal: spacing.lg, borderRadius: radius.md, justifyContent: 'center' },
  noteBtnDisabled: { opacity: 0.4 },
  noteBtnText: { color: colors.white, fontWeight: '700' },
  statusActions: { gap: spacing.sm, marginTop: spacing.md },
  statusBtn: { paddingVertical: 16, borderRadius: radius.md, alignItems: 'center' },
  statusBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.lg },
});
