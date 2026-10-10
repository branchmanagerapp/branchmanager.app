import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { supabase } from '../api/supabase';
import { updateRequest } from '../api/requests';

const STATUS_FLOW = ['new', 'assessment_scheduled', 'assessment_complete', 'converted', 'archived'];
const STATUS_LABELS: Record<string, string> = {
  new: 'New', assessment_scheduled: 'Assessment Scheduled',
  assessment_complete: 'Assessed', converted: 'Converted', archived: 'Archived',
};
const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info', assessment_scheduled: 'warning', assessment_complete: 'warning',
  converted: 'success', archived: 'neutral',
};

export function RequestDetailScreen({ navigation, route }: any) {
  const reqId = route?.params?.id;
  const [req, setReq] = useState<any>(route?.params?.request || null);
  const [loading, setLoading] = useState(!req);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!req && reqId) {
      supabase.from('requests').select('*').eq('id', reqId).single()
        .then(({ data }) => { setReq(data); setLoading(false); });
    }
  }, [reqId]);

  const handleStatusChange = async (newStatus: string) => {
    await updateRequest(req.id, { status: newStatus } as any);
    setReq({ ...req, status: newStatus });
  };

  const handleConvertToQuote = () => {
    Alert.alert('Convert to Quote', 'Create a quote from this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create Quote',
        onPress: () => {
          handleStatusChange('converted');
          navigation?.navigate('QuoteBuilder', {
            clientName: req.client_name,
            clientId: req.client_id,
            property: req.property,
          });
        },
      },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.greenDark} /></View></SafeAreaView>;
  }

  if (!req) {
    return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>Not Found</Text><View style={{ width: 50 }} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request</Text>
        <StatusBadge label={STATUS_LABELS[req.status] || req.status} variant={STATUS_VARIANT[req.status] || 'neutral'} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Client */}
        <Card>
          <Text style={styles.clientName}>{req.client_name}</Text>
          {req.property && (
            <TouchableOpacity onPress={() => Linking.openURL(`maps://maps.apple.com/?daddr=${encodeURIComponent(req.property)}`)}>
              <Text style={styles.property}>{req.property} 📍</Text>
            </TouchableOpacity>
          )}
          {req.phone && <Text style={styles.detail}>{req.phone}</Text>}
          {req.email && <Text style={styles.detail}>{req.email}</Text>}
          {req.source && <Text style={styles.source}>Source: {req.source}</Text>}
        </Card>

        {/* Contact Actions */}
        <View style={styles.contactRow}>
          {req.phone && (
            <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${req.phone.replace(/\D/g, '')}`)}>
              <Text style={styles.contactIcon}>📞</Text>
              <Text style={styles.contactLabel}>Call</Text>
            </TouchableOpacity>
          )}
          {req.phone && (
            <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`sms:${req.phone.replace(/\D/g, '')}`)}>
              <Text style={styles.contactIcon}>💬</Text>
              <Text style={styles.contactLabel}>Text</Text>
            </TouchableOpacity>
          )}
          {req.email && (
            <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`mailto:${req.email}`)}>
              <Text style={styles.contactIcon}>📧</Text>
              <Text style={styles.contactLabel}>Email</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Notes */}
        <Card>
          <Text style={styles.sectionTitle}>Notes</Text>
          {req.notes ? <Text style={styles.notesText}>{req.notes}</Text> : <Text style={styles.emptyText}>No notes</Text>}
        </Card>

        {/* Status Timeline */}
        <Card>
          <Text style={styles.sectionTitle}>Status</Text>
          {STATUS_FLOW.map((s, i) => {
            const current = STATUS_FLOW.indexOf(req.status);
            const done = i <= current;
            const active = i === current;
            return (
              <View key={s} style={styles.timelineRow}>
                <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]} />
                {i < STATUS_FLOW.length - 1 && <View style={[styles.line, done && styles.lineDone]} />}
                <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>
                  {STATUS_LABELS[s]}
                </Text>
              </View>
            );
          })}
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          {req.status === 'new' && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => handleStatusChange('assessment_scheduled')}>
              <Text style={styles.primaryText}>Schedule Assessment</Text>
            </TouchableOpacity>
          )}
          {req.status === 'assessment_scheduled' && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => handleStatusChange('assessment_complete')}>
              <Text style={styles.primaryText}>Complete Assessment</Text>
            </TouchableOpacity>
          )}
          {(req.status === 'assessment_complete' || req.status === 'new') && (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={handleConvertToQuote}>
              <Text style={styles.primaryText}>Convert to Quote →</Text>
            </TouchableOpacity>
          )}
          {req.status !== 'archived' && req.status !== 'converted' && (
            <TouchableOpacity style={styles.outlineBtn} onPress={() => handleStatusChange('archived')}>
              <Text style={styles.outlineText}>Archive</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  clientName: { fontSize: fontSize.xl, fontWeight: '800' },
  property: { fontSize: fontSize.md, color: colors.accent, marginTop: spacing.sm },
  detail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  source: { fontSize: fontSize.sm, color: colors.textLight, marginTop: spacing.sm, fontStyle: 'italic' },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  contactBtn: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  contactIcon: { fontSize: 22 },
  contactLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  notesText: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  emptyText: { fontSize: fontSize.sm, color: colors.textLight },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, position: 'relative' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
  dotDone: { borderColor: colors.greenDark, backgroundColor: colors.greenBg },
  dotActive: { backgroundColor: colors.greenDark },
  line: { position: 'absolute', left: 5, top: 14, width: 2, height: 20, backgroundColor: colors.border },
  lineDone: { backgroundColor: colors.greenLight },
  timelineLabel: { fontSize: fontSize.sm, color: colors.textLight },
  timelineLabelActive: { fontWeight: '700', color: colors.greenDark },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: { backgroundColor: colors.greenDark, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  outlineBtn: { paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  outlineText: { fontWeight: '600', color: colors.textSecondary },
});
