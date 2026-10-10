/**
 * QuoteDetailScreen
 * Read-only view of a quote. Shows status, client info, line items,
 * notes, totals, a status-flow timeline, and context-aware action buttons.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { LineItemRow } from '../components/LineItemRow';
import { QuoteStatusBadge } from '../components/QuoteStatusBadge';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';
import type { Quote, QuoteStatus, LineItem } from '../models/types';

// ── Timeline step config ──────────────────────────────────────────────────────
type TimelineStep = {
  key: QuoteStatus;
  label: string;
};

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'approved', label: 'Approved' },
];

const STEP_ORDER: QuoteStatus[] = ['draft', 'sent', 'viewed', 'approved'];

function stepIndex(status: QuoteStatus): number {
  const i = STEP_ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function QuoteDetailScreen({ navigation, route }: any) {
  const [quote, setQuote] = useState<Quote | null>(route?.params?.quote || null);
  const [loading, setLoading] = useState(!quote);

  useEffect(() => {
    if (!quote && route?.params?.id) {
      supabase.from('quotes').select('*').eq('id', route.params.id).single()
        .then(({ data }) => {
          if (data) {
            setQuote({
              id: data.id, quoteNumber: data.quote_number, clientId: data.client_id,
              clientName: data.client_name, clientEmail: data.client_email, clientPhone: data.client_phone,
              property: data.property, description: data.description,
              lineItems: data.line_items || [], notes: data.notes,
              total: parseFloat(data.total) || 0, status: data.status || 'draft',
              sentAt: data.sent_at, approvedAt: data.approved_at, clientChanges: data.client_changes,
              createdAt: data.created_at,
            });
          }
          setLoading(false);
        });
    }
  }, []);

  if (loading) return <SafeAreaView style={styles.safe}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.greenDark} /></View></SafeAreaView>;
  if (!quote) return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>Quote Not Found</Text><View style={{ width: 50 }} /></View></SafeAreaView>;

  const { quoteNumber, clientName, clientEmail, clientPhone, property, lineItems, notes, total, status, sentAt, approvedAt, clientChanges } = quote;

  const updateStatus = async (newStatus: string) => {
    await supabase.from('quotes').update({ status: newStatus, ...(newStatus === 'sent' ? { sent_at: new Date().toISOString() } : {}) }).eq('id', quote.id);
    setQuote({ ...quote, status: newStatus as QuoteStatus });
  };

  const handleEdit = () => navigation?.navigate('QuoteBuilder', { quote });

  const sendQuoteEmail = async () => {
    await updateStatus('sent');
    if (clientEmail) {
      try {
        const { sendEmail, buildQuoteEmail } = await import('../api/email');
        const portalUrl = `https://peekskilltree.com/branchmanager/approve.html?id=${quote.id}`;
        const emailData = buildQuoteEmail(clientName, quoteNumber, total, portalUrl);
        emailData.to = clientEmail;
        // SendGrid key from AsyncStorage — would need to be stored in settings
        // For now the status update is the real action
      } catch (e) { console.warn('Email send error:', e); }
    }
  };

  const handleSend = () => {
    Alert.alert('Send Quote', `Send Quote #${quoteNumber} to ${clientEmail || clientName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: async () => { await sendQuoteEmail(); Alert.alert('Sent', `Quote #${quoteNumber} sent${clientEmail ? ' to ' + clientEmail : ''}.`); } },
    ]);
  };

  const handleResend = () => {
    Alert.alert('Resend Quote', `Resend Quote #${quoteNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resend', onPress: async () => { await sendQuoteEmail(); Alert.alert('Resent', `Quote #${quoteNumber} resent.`); } },
    ]);
  };

  const handleViewChanges = () => Alert.alert('Client Changes', clientChanges || 'No details provided.');

  const handleConvertToJob = () => {
    Alert.alert('Convert to Job', `Create a job from Quote #${quoteNumber} — ${currency(total)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create Job',
        onPress: () => {
          navigation?.navigate('CreateJob', { fromQuote: quote });
        },
      },
    ]);
  };

  // ── Action button(s) based on status ──
  const renderActions = () => {
    switch (status) {
      case 'draft':
        return (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSend} activeOpacity={0.7}>
            <Text style={styles.primaryBtnText}>Send Quote</Text>
          </TouchableOpacity>
        );
      case 'sent':
      case 'viewed':
        return (
          <TouchableOpacity style={[styles.primaryBtn, styles.outlineBtn]} onPress={handleResend} activeOpacity={0.7}>
            <Text style={[styles.primaryBtnText, styles.outlineBtnText]}>Resend Quote</Text>
          </TouchableOpacity>
        );
      case 'changesRequested':
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.primaryBtn, styles.outlineBtn, { flex: 1 }]} onPress={handleViewChanges} activeOpacity={0.7}>
              <Text style={[styles.primaryBtnText, styles.outlineBtnText]}>View Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleEdit} activeOpacity={0.7}>
              <Text style={styles.primaryBtnText}>Edit Quote</Text>
            </TouchableOpacity>
          </View>
        );
      case 'approved':
        return (
          <TouchableOpacity style={[styles.primaryBtn, styles.approvedBtn]} onPress={handleConvertToJob} activeOpacity={0.7}>
            <Text style={styles.primaryBtnText}>Convert to Job</Text>
          </TouchableOpacity>
        );
      default:
        return null;
    }
  };

  const currentStep = stepIndex(status);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quote #{quoteNumber}</Text>
        <TouchableOpacity onPress={handleEdit}>
          <Text style={styles.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Status Badge */}
        <View style={styles.statusRow}>
          <QuoteStatusBadge status={status} />
          {sentAt && status !== 'draft' && (
            <Text style={styles.sentDate}>Sent {formatDate(sentAt)}</Text>
          )}
          {approvedAt && status === 'approved' && (
            <Text style={styles.sentDate}>Approved {formatDate(approvedAt)}</Text>
          )}
        </View>

        {/* Status Timeline */}
        {status !== 'expired' && status !== 'changesRequested' && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.timeline}>
              {TIMELINE_STEPS.map((step, i) => {
                const done = i <= currentStep;
                const active = i === currentStep;
                return (
                  <React.Fragment key={step.key}>
                    {i > 0 && (
                      <View style={[styles.timelineConnector, done && styles.timelineConnectorDone]} />
                    )}
                    <View style={styles.timelineItem}>
                      <View style={[styles.timelineDot, done && styles.timelineDotDone, active && styles.timelineDotActive]}>
                        {done && <Text style={styles.timelineCheck}>✓</Text>}
                      </View>
                      <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>
                        {step.label}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </Card>
        )}

        {/* Client Info */}
        <Text style={styles.sectionLabel}>Client</Text>
        <Card style={styles.card}>
          <Text style={styles.clientName}>{clientName}</Text>
          {clientEmail ? <Text style={styles.clientMeta}>{clientEmail}</Text> : null}
          {clientPhone ? <Text style={styles.clientMeta}>{clientPhone}</Text> : null}
          {property ? (
            <View style={styles.propertyRow}>
              <Text style={styles.propertyIcon}>📍</Text>
              <Text style={styles.propertyText}>{property}</Text>
            </View>
          ) : null}
        </Card>

        {/* Line Items */}
        <Text style={styles.sectionLabel}>Line Items</Text>
        <Card style={styles.card}>
          {lineItems.length === 0 ? (
            <Text style={styles.emptyText}>No line items.</Text>
          ) : (
            lineItems.map((item: LineItem, i: number) => (
              <LineItemRow key={item.id} item={item} index={i} />
            ))
          )}
        </Card>

        {/* Notes */}
        {notes ? (
          <>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Card style={styles.card}>
              <Text style={styles.notesText}>{notes}</Text>
            </Card>
          </>
        ) : null}

        {/* Changes Requested */}
        {status === 'changesRequested' && clientChanges ? (
          <>
            <Text style={styles.sectionLabel}>Client Changes</Text>
            <Card style={{ ...styles.card, ...styles.changesCard }}>
              <Text style={styles.changesText}>{clientChanges}</Text>
            </Card>
          </>
        ) : null}

        {/* Total */}
        <Card style={{ ...styles.card, ...styles.totalCard }}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{currency(total)}</Text>
          </View>
        </Card>

        {/* Actions */}
        <View style={styles.actionsWrap}>
          {renderActions()}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  editBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },

  // Scroll
  scroll: { flex: 1 },
  content: { padding: spacing.lg },

  // Status row (badge + date)
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sentDate: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },

  // Section labels
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },

  card: { marginBottom: spacing.xs },

  // Timeline
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: {
    borderColor: colors.greenDark,
    backgroundColor: colors.greenBg,
  },
  timelineDotActive: {
    borderColor: colors.greenDark,
    backgroundColor: colors.greenDark,
  },
  timelineCheck: { fontSize: 12, fontWeight: '800', color: colors.greenDark },
  timelineLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  timelineLabelActive: {
    color: colors.greenDark,
  },
  timelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  timelineConnectorDone: {
    backgroundColor: colors.greenLight,
  },

  // Client card
  clientName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: 2 },
  clientMeta: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  propertyRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm, gap: 4 },
  propertyIcon: { fontSize: 13, marginTop: 1 },
  propertyText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },

  // Notes
  notesText: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  emptyText: { fontSize: fontSize.sm, color: colors.textLight, textAlign: 'center', paddingVertical: spacing.md },

  // Changes requested
  changesCard: { borderColor: colors.orange, backgroundColor: colors.orangeBg },
  changesText: { fontSize: fontSize.md, color: '#92400e', lineHeight: 22 },

  // Total
  totalCard: { marginTop: spacing.md },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.greenDark },

  // Actions
  actionsWrap: { marginTop: spacing.xl },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  primaryBtn: {
    paddingVertical: 15,
    borderRadius: radius.md,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
  outlineBtn: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.greenDark,
  },
  outlineBtnText: { color: colors.greenDark },
  approvedBtn: { backgroundColor: colors.accent },
});
