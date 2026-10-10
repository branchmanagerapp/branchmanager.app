import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  Linking, Alert, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { currency, phone as fmtPhone } from '../utils/format';
import { fetchClient } from '../api/clients';
import { supabase } from '../api/supabase';
import type { Client } from '../models/types';

export function ClientDetailScreen({ navigation, route }: any) {
  const clientId = route?.params?.id;
  const [client, setClient] = useState<Client | null>(route?.params?.client || null);
  const [loading, setLoading] = useState(!client);
  const [jobs, setJobs] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!client && clientId) {
        const c = await fetchClient(clientId);
        setClient(c);
      }
      const id = clientId || client?.id;
      if (id) {
        const [jRes, qRes, iRes] = await Promise.all([
          supabase.from('jobs').select('*').eq('client_id', id).order('scheduled_date', { ascending: false }).limit(10),
          supabase.from('quotes').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(10),
          supabase.from('invoices').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(10),
        ]);
        setJobs(jRes.data || []);
        setQuotes(qRes.data || []);
        setInvoices(iRes.data || []);
      }
      setLoading(false);
    };
    load();
  }, [clientId]);

  const handleCall = () => {
    if (client?.phone) Linking.openURL(`tel:${client.phone.replace(/\D/g, '')}`);
  };
  const handleText = () => {
    if (client?.phone) Linking.openURL(`sms:${client.phone.replace(/\D/g, '')}`);
  };
  const handleEmail = () => {
    if (client?.email) Linking.openURL(`mailto:${client.email}`);
  };
  const handleDirections = () => {
    if (client?.address) {
      Linking.openURL(`maps://maps.apple.com/?daddr=${encodeURIComponent(client.address)}`);
    }
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

  if (!client) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Client Not Found</Text>
          <View style={{ width: 50 }} />
        </View>
      </SafeAreaView>
    );
  }

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
  const balanceDue = invoices.reduce((s: number, i: any) => s + (i.status !== 'paid' ? (parseFloat(i.balance) || 0) : 0), 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Client</Text>
        <TouchableOpacity><Text style={styles.editBtn}>Edit</Text></TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Profile */}
        <Card style={styles.profileCard}>
          <Avatar name={client.name} size={56} color={client.status === 'lead' ? colors.orange : colors.greenDark} />
          <Text style={styles.name}>{client.name}</Text>
          {client.company && <Text style={styles.company}>{client.company}</Text>}
          <StatusBadge label={client.status} variant={client.status === 'active' ? 'success' : client.status === 'lead' ? 'warning' : 'neutral'} />
        </Card>

        {/* Contact Actions */}
        <View style={styles.contactRow}>
          {client.phone && (
            <>
              <TouchableOpacity style={styles.contactBtn} onPress={handleCall}>
                <Text style={styles.contactIcon}>📞</Text>
                <Text style={styles.contactLabel}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactBtn} onPress={handleText}>
                <Text style={styles.contactIcon}>💬</Text>
                <Text style={styles.contactLabel}>Text</Text>
              </TouchableOpacity>
            </>
          )}
          {client.email && (
            <TouchableOpacity style={styles.contactBtn} onPress={handleEmail}>
              <Text style={styles.contactIcon}>📧</Text>
              <Text style={styles.contactLabel}>Email</Text>
            </TouchableOpacity>
          )}
          {client.address && (
            <TouchableOpacity style={styles.contactBtn} onPress={handleDirections}>
              <Text style={styles.contactIcon}>🗺️</Text>
              <Text style={styles.contactLabel}>Map</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Details */}
        <Card>
          {client.phone && <DetailRow label="Phone" value={fmtPhone(client.phone)} />}
          {client.email && <DetailRow label="Email" value={client.email} />}
          {client.address && <DetailRow label="Address" value={client.address} />}
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{jobs.length}</Text>
            <Text style={styles.statLabel}>Jobs</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.greenDark }]}>{currency(totalRevenue)}</Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, balanceDue > 0 ? { color: colors.red } : {}]}>{currency(balanceDue)}</Text>
            <Text style={styles.statLabel}>Balance</Text>
          </Card>
        </View>

        {/* Jobs */}
        {jobs.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Jobs ({jobs.length})</Text>
            {jobs.slice(0, 5).map((j: any) => (
              <TouchableOpacity key={j.id} style={styles.listRow} onPress={() => navigation?.navigate('JobDetail', { id: j.id })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listPrimary}>#{j.job_number} {j.description || ''}</Text>
                  <Text style={styles.listSecondary}>{j.scheduled_date} · {j.status}</Text>
                </View>
                {j.total > 0 && <Text style={styles.listAmount}>{currency(parseFloat(j.total))}</Text>}
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Quotes */}
        {quotes.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Quotes ({quotes.length})</Text>
            {quotes.slice(0, 5).map((q: any) => (
              <TouchableOpacity key={q.id} style={styles.listRow} onPress={() => navigation?.navigate('QuoteDetail', { quote: q })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listPrimary}>#{q.quote_number} {q.description || ''}</Text>
                  <Text style={styles.listSecondary}>{q.status}</Text>
                </View>
                {q.total > 0 && <Text style={styles.listAmount}>{currency(parseFloat(q.total))}</Text>}
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Invoices ({invoices.length})</Text>
            {invoices.slice(0, 5).map((i: any) => (
              <TouchableOpacity key={i.id} style={styles.listRow} onPress={() => navigation?.navigate('InvoiceDetail', { invoice: i })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listPrimary}>#{i.invoice_number} {i.subject || ''}</Text>
                  <Text style={styles.listSecondary}>{i.status} · Due {i.due_date || '—'}</Text>
                </View>
                <Text style={[styles.listAmount, parseFloat(i.balance) > 0 && { color: colors.red }]}>
                  {currency(parseFloat(i.balance || i.total || 0))}
                </Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* New actions */}
        <View style={styles.newActions}>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation?.navigate('QuoteBuilder', { clientName: client.name, clientId: client.id })}>
            <Text style={styles.newBtnText}>+ New Quote</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation?.navigate('InvoiceBuilder', { clientName: client.name, clientId: client.id })}>
            <Text style={styles.newBtnText}>+ New Invoice</Text>
          </TouchableOpacity>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  editBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  profileCard: { alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSize.xxl, fontWeight: '800' },
  company: { fontSize: fontSize.md, color: colors.accent },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  contactBtn: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  contactIcon: { fontSize: 22 },
  contactLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statValue: { fontSize: fontSize.xl, fontWeight: '800' },
  statLabel: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  listPrimary: { fontSize: fontSize.sm, fontWeight: '600' },
  listSecondary: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
  listAmount: { fontSize: fontSize.sm, fontWeight: '700', color: colors.greenDark },
  newActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  newBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, alignItems: 'center' },
  newBtnText: { fontWeight: '600', color: colors.accent },
});
