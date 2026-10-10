import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { createClient } from '../api/clients';
import { smartInsert } from '../utils/offline';

export function CreateClientScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Client name is required.'); return; }
    setSaving(true);
    try {
      const result = await smartInsert('clients', { name: name.trim(), company, phone, email, address, status: 'lead' });
      Alert.alert('Client Created', result._offline ? `${name} saved offline — will sync when back online.` : `${name} added.`);
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
        <Text style={styles.headerTitle}>New Client</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={styles.saveBtn}>{saving ? 'Saving...' : 'Save'}</Text></TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card>
          <Field label="Name *" value={name} onChange={setName} placeholder="Full name" autoFocus />
          <Field label="Company" value={company} onChange={setCompany} placeholder="Company name (optional)" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="(914) 555-0123" keyboardType="phone-pad" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Address" value={address} onChange={setAddress} placeholder="Street, City, State ZIP" />
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
});
