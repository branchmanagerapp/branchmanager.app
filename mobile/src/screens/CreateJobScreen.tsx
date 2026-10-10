import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { createJob } from '../api/jobs';
import { smartInsert } from '../utils/offline';

export function CreateJobScreen({ navigation, route }: any) {
  const fromQuote = route?.params?.fromQuote;
  const [clientName, setClientName] = useState(fromQuote?.clientName || route?.params?.clientName || '');
  const [property, setProperty] = useState(fromQuote?.property || route?.params?.property || '');
  const [description, setDescription] = useState(fromQuote?.description || '');
  const [scheduledDate, setScheduledDate] = useState('');
  const [crew, setCrew] = useState('Doug Brown');
  const [total, setTotal] = useState(fromQuote?.total?.toString() || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert('Required', 'Client name is required.'); return; }
    if (!scheduledDate) { Alert.alert('Required', 'Scheduled date is required.'); return; }
    setSaving(true);
    try {
      const result = await smartInsert('jobs', {
        client_name: clientName.trim(),
        property, description,
        scheduled_date: scheduledDate,
        crew: crew.split(',').map(c => c.trim()).filter(Boolean),
        total: parseFloat(total) || 0,
        notes, status: 'scheduled',
      });
      Alert.alert('Job Created', result._offline ? 'Saved offline — will sync when back online.' : `Job #${result.job_number || ''} scheduled.`);
      navigation?.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>Cancel</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>New Job</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={styles.saveBtn}>{saving ? 'Saving...' : 'Save'}</Text></TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {fromQuote && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>📋 From Quote #{fromQuote.quoteNumber}</Text>
          </View>
        )}
        <Card>
          <Field label="Client Name *" value={clientName} onChange={setClientName} placeholder="Full name" />
          <Field label="Property" value={property} onChange={setProperty} placeholder="Address" />
          <Field label="Description" value={description} onChange={setDescription} placeholder="Work to be done" />
          <Field label="Scheduled Date *" value={scheduledDate} onChange={setScheduledDate} placeholder="YYYY-MM-DD" />
          <Field label="Crew" value={crew} onChange={setCrew} placeholder="Comma separated names" />
          <Field label="Total" value={total} onChange={setTotal} placeholder="0.00" keyboardType="decimal-pad" />
          <View style={fieldStyles.wrap}>
            <Text style={fieldStyles.label}>Notes</Text>
            <TextInput style={[fieldStyles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Job notes..." placeholderTextColor={colors.textLight} multiline />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }: any) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput style={fieldStyles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textLight} keyboardType={keyboardType} />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  saveBtn: { fontSize: fontSize.md, color: colors.greenDark, fontWeight: '700' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  sourceBadge: { backgroundColor: colors.blueBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  sourceText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.accent },
});
