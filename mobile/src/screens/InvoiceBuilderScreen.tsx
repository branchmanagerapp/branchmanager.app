import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { LineItemRow } from '../components/LineItemRow';
import { LineItemEditor } from '../components/LineItemEditor';
import { currency } from '../utils/format';
import type { LineItem } from '../models/types';

export function InvoiceBuilderScreen({ navigation, route }: any) {
  const existing = route?.params?.invoice;
  const fromQuote = route?.params?.fromQuote;
  const fromJob = route?.params?.fromJob;

  const [clientName, setClientName] = useState(existing?.clientName || fromQuote?.clientName || fromJob?.clientName || '');
  const [clientEmail, setClientEmail] = useState(existing?.clientEmail || fromQuote?.clientEmail || '');
  const [subject, setSubject] = useState(existing?.subject || 'For Services Rendered');
  const [dueDate, setDueDate] = useState(existing?.dueDate || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existing?.lineItems || fromQuote?.lineItems || []
  );
  const [showEditor, setShowEditor] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);

  const handleSaveItem = (item: Omit<LineItem, 'id'> & { id?: string }) => {
    if (editingIdx !== null) {
      setLineItems(prev => prev.map((li, i) => i === editingIdx ? { ...li, ...item } : li));
      setEditingIdx(null);
    } else {
      setLineItems(prev => [...prev, { ...item, id: item.id || 'li-' + Date.now() } as LineItem]);
    }
    setShowEditor(false);
  };

  const handleDeleteItem = (idx: number) => {
    Alert.alert('Remove Item', 'Delete this line item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setLineItems(prev => prev.filter((_, i) => i !== idx)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{existing ? 'Edit Invoice' : 'New Invoice'}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Source badge */}
        {fromQuote && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>📋 From Quote #{fromQuote.quoteNumber}</Text>
          </View>
        )}
        {fromJob && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>🔧 From Job #{fromJob.jobNumber}</Text>
          </View>
        )}

        {/* Client */}
        <Card>
          <Text style={styles.sectionTitle}>Client</Text>
          <Text style={styles.label}>Client Name</Text>
          <TextInput style={styles.input} value={clientName} onChangeText={setClientName} placeholder="Client name" placeholderTextColor={colors.textLight} />
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={clientEmail} onChangeText={setClientEmail} placeholder="email@example.com" placeholderTextColor={colors.textLight} keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.label}>Subject</Text>
          <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="For Services Rendered" placeholderTextColor={colors.textLight} />
          <Text style={styles.label}>Due Date</Text>
          <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textLight} />
        </Card>

        {/* Line Items */}
        <Card>
          <Text style={styles.sectionTitle}>Line Items</Text>
          {lineItems.map((item, i) => (
            <TouchableOpacity key={item.id} onPress={() => { setEditingIdx(i); setShowEditor(true); }} onLongPress={() => handleDeleteItem(i)}>
              <LineItemRow item={item} index={i} />
            </TouchableOpacity>
          ))}
          {showEditor ? (
            <LineItemEditor
              item={editingIdx !== null ? lineItems[editingIdx] : undefined}
              onSave={handleSaveItem}
              onCancel={() => { setShowEditor(false); setEditingIdx(null); }}
            />
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={() => { setEditingIdx(null); setShowEditor(true); }}>
              <Text style={styles.addBtnText}>+ Add Line Item</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Notes */}
        <Card>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} placeholder="Notes to appear on invoice..." placeholderTextColor={colors.textLight} multiline />
        </Card>

        {/* Total */}
        <Card>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{currency(subtotal)}</Text>
          </View>
        </Card>

        {/* Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.draftBtn} onPress={async () => {
            try {
              const { supabase } = await import('../api/supabase');
              await supabase.from('invoices').insert({ client_name: clientName, client_email: clientEmail, subject, due_date: dueDate, line_items: lineItems, total: subtotal, balance: subtotal, status: 'draft', notes });
              Alert.alert('Saved', 'Invoice draft saved.');
              navigation?.goBack();
            } catch (e: any) { Alert.alert('Error', e.message); }
          }}>
            <Text style={styles.draftText}>Save Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendBtn} onPress={async () => {
            try {
              const { supabase } = await import('../api/supabase');
              await supabase.from('invoices').insert({ client_name: clientName, client_email: clientEmail, subject, due_date: dueDate, line_items: lineItems, total: subtotal, balance: subtotal, status: 'sent', sent_at: new Date().toISOString(), notes });
              Alert.alert('Sent', 'Invoice sent to ' + (clientEmail || clientName));
              navigation?.goBack();
            } catch (e: any) { Alert.alert('Error', e.message); }
          }}>
            <Text style={styles.sendText}>Send Invoice</Text>
          </TouchableOpacity>
        </View>

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
  sourceBadge: {
    backgroundColor: colors.blueBg, padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  sourceText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.accent },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: spacing.md },
  input: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.text, backgroundColor: colors.white,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  addBtn: {
    paddingVertical: spacing.md, borderWidth: 2, borderColor: colors.border,
    borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md,
  },
  addBtnText: { fontSize: fontSize.md, fontWeight: '600', color: colors.accent },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontSize: fontSize.lg, fontWeight: '800' },
  totalValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.greenDark },
  footer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  draftBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  draftText: { fontWeight: '600', color: colors.textSecondary },
  sendBtn: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: colors.greenDark, alignItems: 'center',
  },
  sendText: { fontWeight: '700', color: colors.white },
});
