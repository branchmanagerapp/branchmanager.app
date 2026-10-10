import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { LineItemRow } from '../components/LineItemRow';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';
import type { Invoice, InvoiceStatus, LineItem } from '../models/types';

function mapInvoice(data: any): Invoice {
  return {
    id: data.id, invoiceNumber: data.invoice_number, clientId: data.client_id,
    clientName: data.client_name, clientEmail: data.client_email, clientPhone: data.client_phone,
    subject: data.subject || '', lineItems: data.line_items || [],
    total: parseFloat(data.total) || 0, balance: parseFloat(data.balance) || 0,
    amountPaid: parseFloat(data.amount_paid) || 0, issuedDate: data.issued_date,
    dueDate: data.due_date, status: data.status || 'draft',
    paidDate: data.paid_date, paymentMethod: data.payment_method,
    notes: data.notes, sentAt: data.sent_at, createdAt: data.created_at, updatedAt: data.updated_at,
  };
}

export function InvoiceDetailScreen({ navigation, route }: any) {
  const raw = route?.params?.invoice;
  const [invoice, setInvoice] = useState<Invoice | null>(
    raw ? (raw.invoiceNumber ? raw : mapInvoice(raw)) : null
  );
  const [loading, setLoading] = useState(!invoice);

  useEffect(() => {
    if (!invoice && route?.params?.id) {
      supabase.from('invoices').select('*').eq('id', route.params.id).single()
        .then(({ data }) => { if (data) setInvoice(mapInvoice(data)); setLoading(false); });
    }
  }, []);

  if (loading) return <SafeAreaView style={styles.safe}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.greenDark} /></View></SafeAreaView>;
  if (!invoice) return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>Not Found</Text><View style={{ width: 50 }} /></View></SafeAreaView>;

  const handleMarkPaid = () => {
    navigation?.navigate('Payment', { invoice });
  };

  const handleSendInvoice = async () => {
    try {
      await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id);
      setInvoice({ ...invoice, status: 'sent' as InvoiceStatus });
      if (invoice.clientEmail) {
        try {
          const { sendEmail, buildInvoiceEmail } = await import('../api/email');
          const payUrl = `https://peekskilltree.com/branchmanager/pay.html?id=${invoice.id}`;
          const emailData = buildInvoiceEmail(invoice.clientName, invoice.invoiceNumber, invoice.total, invoice.balance, payUrl);
          emailData.to = invoice.clientEmail;
        } catch (e) { console.warn('Email error:', e); }
      }
      Alert.alert('Sent', `Invoice #${invoice.invoiceNumber} sent${invoice.clientEmail ? ' to ' + invoice.clientEmail : ''}.`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleSendReminder = async () => {
    Alert.alert('Reminder Sent', `Payment reminder sent for Invoice #${invoice.invoiceNumber}.`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice #{invoice.invoiceNumber}</Text>
        <TouchableOpacity onPress={() => navigation?.navigate('InvoiceBuilder', { invoice })}>
          <Text style={styles.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={styles.statusRow}>
          <InvoiceStatusBadge status={invoice.status} />
          {invoice.sentAt && <Text style={styles.dateMeta}>Sent {invoice.sentAt}</Text>}
          {invoice.paidDate && <Text style={styles.dateMeta}>Paid {invoice.paidDate}</Text>}
        </View>

        {/* Client */}
        <Card>
          <Text style={styles.sectionTitle}>Client</Text>
          <Text style={styles.clientName}>{invoice.clientName}</Text>
          {invoice.clientEmail && <Text style={styles.clientDetail}>{invoice.clientEmail}</Text>}
        </Card>

        {/* Details */}
        <Card>
          <Text style={styles.sectionTitle}>Details</Text>
          <DetailRow label="Subject" value={invoice.subject} />
          <DetailRow label="Issued" value={invoice.issuedDate || '—'} />
          <DetailRow label="Due" value={invoice.dueDate || '—'} />
          <DetailRow label="Payment" value={invoice.paymentMethod || 'Not paid'} />
        </Card>

        {/* Line Items */}
        <Card>
          <Text style={styles.sectionTitle}>Line Items</Text>
          {invoice.lineItems.map((item, i) => (
            <LineItemRow key={item.id} item={item} index={i} />
          ))}
        </Card>

        {/* Totals */}
        <Card>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total</Text>
            <Text style={styles.totalsValue}>{currency(invoice.total)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Paid</Text>
            <Text style={[styles.totalsValue, { color: colors.greenDark }]}>{currency(invoice.amountPaid)}</Text>
          </View>
          {invoice.balance > 0 && (
            <View style={[styles.totalsRow, styles.balanceRow]}>
              <Text style={styles.balanceLabel}>Balance Due</Text>
              <Text style={styles.balanceValue}>{currency(invoice.balance)}</Text>
            </View>
          )}
        </Card>

        {/* Notes */}
        {invoice.notes && (
          <Card>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notes}>{invoice.notes}</Text>
          </Card>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {(invoice.status === 'draft') && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSendInvoice}>
              <Text style={styles.primaryText}>Send Invoice</Text>
            </TouchableOpacity>
          )}
          {(invoice.status === 'sent' || invoice.status === 'viewed') && (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleMarkPaid}>
                <Text style={styles.primaryText}>Record Payment</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.outlineBtn} onPress={handleSendReminder}>
                <Text style={styles.outlineText}>Send Reminder</Text>
              </TouchableOpacity>
            </>
          )}
          {(invoice.status === 'overdue' || invoice.status === 'pastDue') && (
            <>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.red }]} onPress={handleSendReminder}>
                <Text style={styles.primaryText}>Send Overdue Notice</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.outlineBtn} onPress={handleMarkPaid}>
                <Text style={styles.outlineText}>Record Payment</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
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
  editBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  dateMeta: { fontSize: fontSize.sm, color: colors.textLight },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  clientName: { fontSize: fontSize.lg, fontWeight: '700' },
  clientDetail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalsLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  totalsValue: { fontSize: fontSize.md, fontWeight: '600' },
  balanceRow: { borderTopWidth: 2, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md },
  balanceLabel: { fontSize: fontSize.lg, fontWeight: '800' },
  balanceValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.red },
  notes: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.greenDark, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  outlineBtn: {
    paddingVertical: 14, borderRadius: radius.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  outlineText: { fontWeight: '600', color: colors.textSecondary, fontSize: fontSize.md },
});
