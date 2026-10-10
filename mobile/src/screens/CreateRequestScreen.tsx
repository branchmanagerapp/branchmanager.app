import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { createRequest } from '../api/requests';
import { smartInsert } from '../utils/offline';

const SOURCES = ['Google Search', 'Facebook', 'Instagram', 'Nextdoor', 'Referral', 'Repeat Client', 'Yelp', 'Phone Call', 'Other'];

export function CreateRequestScreen({ navigation }: any) {
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [property, setProperty] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert('Required', 'Client name is required.'); return; }
    setSaving(true);
    try {
      const result = await smartInsert('requests', { client_name: clientName.trim(), phone, email, property, source, notes, status: 'new' });
      Alert.alert('Request Created', result._offline ? 'Saved offline — will sync when back online.' : 'New request added.');
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
        <Text style={styles.headerTitle}>New Request</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={styles.saveBtn}>{saving ? 'Saving...' : 'Save'}</Text></TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card>
          <Field label="Client Name *" value={clientName} onChange={setClientName} placeholder="Full name" autoFocus />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="(914) 555-0123" keyboardType="phone-pad" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Property Address" value={property} onChange={setProperty} placeholder="Street, City, State ZIP" />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Source</Text>
          <View style={styles.sourceGrid}>
            {SOURCES.map(s => (
              <TouchableOpacity key={s} style={[styles.sourceChip, source === s && styles.sourceChipActive]} onPress={() => setSource(s)}>
                <Text style={[styles.sourceText, source === s && styles.sourceTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput style={styles.textarea} value={notes} onChangeText={setNotes} placeholder="What does the client need?" placeholderTextColor={colors.textLight} multiline />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, autoCapitalize, autoFocus }: any) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput style={fieldStyles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textLight} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoFocus={autoFocus} />
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
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sourceChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  sourceChipActive: { backgroundColor: colors.greenDark, borderColor: colors.greenDark },
  sourceText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  sourceTextActive: { color: colors.white },
  textarea: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text, minHeight: 100, textAlignVertical: 'top' },
});
