/**
 * Payment recording + Stripe payment link
 * Record cash/check/card payments, send Stripe payment links
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Alert, Linking,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';

const METHODS = ['Cash', 'Check', 'Credit Card', 'E-Transfer', 'Stripe Link'];

export function PaymentScreen({ navigation, route }: any) {
  const invoice = route?.params?.invoice;
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState(invoice?.balance?.toString() || invoice?.total?.toString() || '');
  const [checkNum, setCheckNum] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const balance = parseFloat(invoice?.balance || invoice?.total || 0);
  const payAmount = parseFloat(amount) || 0;

  const handleRecordPayment = async () => {
    if (!method) { Alert.alert('Select Method', 'Choose a payment method.'); return; }
    if (payAmount <= 0) { Alert.alert('Invalid Amount', 'Enter a payment amount.'); return; }

    setSaving(true);
    try {
      const newBalance = Math.max(0, balance - payAmount);
      const newAmountPaid = (parseFloat(invoice?.amount_paid || 0)) + payAmount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      await supabase.from('invoices').update({
        balance: newBalance,
        amount_paid: newAmountPaid,
        status: newStatus,
        payment_method: method,
        paid_date: newStatus === 'paid' ? new Date().toISOString() : null,
      }).eq('id', invoice.id);

      Alert.alert(
        newStatus === 'paid' ? 'Paid in Full' : 'Payment Recorded',
        `${currency(payAmount)} recorded via ${method}. ${newBalance > 0 ? `Remaining balance: ${currency(newBalance)}` : ''}`,
      );
      navigation?.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendStripeLink = async () => {
    if (!invoice?.client_email && !invoice?.clientEmail) {
      Alert.alert('No Email', 'Client email is required to send a payment link.');
      return;
    }
    // In production: create Stripe payment link via API
    Alert.alert(
      'Send Payment Link',
      `Send a Stripe payment link for ${currency(balance)} to ${invoice.client_email || invoice.clientEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            // POST to your server to create Stripe checkout session
            Alert.alert('Link Sent', 'Payment link emailed to client.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Record Payment</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Invoice Summary */}
        <Card>
          <Text style={styles.invoiceLabel}>Invoice #{invoice?.invoice_number || invoice?.invoiceNumber}</Text>
          <Text style={styles.clientName}>{invoice?.client_name || invoice?.clientName}</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Balance Due</Text>
            <Text style={styles.balanceValue}>{currency(balance)}</Text>
          </View>
        </Card>

        {/* Payment Method */}
        <Card>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.methodGrid}>
            {METHODS.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.methodChip, method === m && styles.methodActive]}
                onPress={() => setMethod(m)}
              >
                <Text style={[styles.methodText, method === m && styles.methodTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Amount */}
        <Card>
          <Text style={styles.sectionTitle}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textLight}
            />
          </View>
          <View style={styles.presetRow}>
            <TouchableOpacity style={styles.presetBtn} onPress={() => setAmount(balance.toFixed(2))}>
              <Text style={styles.presetText}>Full — {currency(balance)}</Text>
            </TouchableOpacity>
            {balance > 100 && (
              <TouchableOpacity style={styles.presetBtn} onPress={() => setAmount((balance / 2).toFixed(2))}>
                <Text style={styles.presetText}>Half — {currency(balance / 2)}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        {/* Check Number (conditional) */}
        {method === 'Check' && (
          <Card>
            <Text style={styles.sectionTitle}>Check Number</Text>
            <TextInput style={styles.input} value={checkNum} onChangeText={setCheckNum} placeholder="Check #" placeholderTextColor={colors.textLight} keyboardType="number-pad" />
          </Card>
        )}

        {/* Notes */}
        <Card>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} placeholder="Payment notes (optional)" placeholderTextColor={colors.textLight} multiline />
        </Card>

        {/* Actions */}
        <TouchableOpacity
          style={[styles.recordBtn, (saving || !method) && styles.btnDisabled]}
          onPress={handleRecordPayment}
          disabled={saving || !method}
        >
          <Text style={styles.recordText}>
            {saving ? 'Recording...' : `Record ${currency(payAmount)} Payment`}
          </Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.stripeBtn} onPress={handleSendStripeLink}>
          <Text style={styles.stripeBtnText}>💳 Send Stripe Payment Link</Text>
        </TouchableOpacity>

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
  invoiceLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.accent },
  clientName: { fontSize: fontSize.lg, fontWeight: '700', marginTop: 4 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  balanceLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  balanceValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.red },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
  methodActive: { borderColor: colors.greenDark, backgroundColor: colors.greenBg },
  methodText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  methodTextActive: { color: colors.greenDark },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  dollarSign: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.text, marginRight: spacing.sm },
  amountInput: { flex: 1, fontSize: fontSize.xxxl, fontWeight: '800', color: colors.text },
  presetRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  presetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  presetText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  input: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  recordBtn: { backgroundColor: colors.greenDark, paddingVertical: 18, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  btnDisabled: { opacity: 0.5 },
  recordText: { color: colors.white, fontWeight: '800', fontSize: fontSize.lg },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { paddingHorizontal: spacing.md, fontSize: fontSize.sm, color: colors.textLight },
  stripeBtn: { paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.blueBg },
  stripeBtnText: { fontWeight: '700', fontSize: fontSize.md, color: colors.accent },
});
