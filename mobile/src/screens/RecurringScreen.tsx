import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';

type Tab = 'jobs' | 'invoices';

const FREQUENCIES = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annually'];

export function RecurringScreen({ navigation }: any) {
  const [tab, setTab] = useState<Tab>('jobs');
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    // Load recurring items
    supabase.from('jobs').select('*').not('recurring_schedule', 'is', null).order('scheduled_date').limit(50)
      .then(({ data }) => setJobs(data || []));
    supabase.from('invoices').select('*').not('recurring_schedule', 'is', null).order('due_date').limit(50)
      .then(({ data }) => setInvoices(data || []));
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recurring</Text>
        <TouchableOpacity>
          <Text style={styles.addBtn}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === 'jobs' && styles.tabActive]} onPress={() => setTab('jobs')}>
          <Text style={[styles.tabLabel, tab === 'jobs' && styles.tabLabelActive]}>Jobs ({jobs.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'invoices' && styles.tabActive]} onPress={() => setTab('invoices')}>
          <Text style={[styles.tabLabel, tab === 'invoices' && styles.tabLabelActive]}>Invoices ({invoices.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === 'jobs' && jobs.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🔄</Text>
            <Text style={styles.emptyTitle}>No Recurring Jobs</Text>
            <Text style={styles.emptyText}>Set up recurring jobs for regular clients like lawn care, snow removal, or seasonal pruning.</Text>
          </Card>
        )}

        {tab === 'jobs' && jobs.map(j => (
          <Card key={j.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemClient}>{j.client_name}</Text>
                <Text style={styles.itemDesc}>{j.description}</Text>
              </View>
              <StatusBadge label={j.recurring_schedule || 'Monthly'} variant="info" />
            </View>
            <View style={styles.itemBottom}>
              <Text style={styles.itemMeta}>Next: {j.scheduled_date || '—'}</Text>
              {j.total > 0 && <Text style={styles.itemAmount}>{currency(parseFloat(j.total))}</Text>}
            </View>
          </Card>
        ))}

        {tab === 'invoices' && invoices.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🔄</Text>
            <Text style={styles.emptyTitle}>No Recurring Invoices</Text>
            <Text style={styles.emptyText}>Auto-generate invoices on a schedule for retainer clients.</Text>
          </Card>
        )}

        {tab === 'invoices' && invoices.map(i => (
          <Card key={i.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemClient}>{i.client_name}</Text>
                <Text style={styles.itemDesc}>{i.subject}</Text>
              </View>
              <StatusBadge label={i.recurring_schedule || 'Monthly'} variant="info" />
            </View>
            <View style={styles.itemBottom}>
              <Text style={styles.itemMeta}>Next: {i.due_date || '—'}</Text>
              <Text style={styles.itemAmount}>{currency(parseFloat(i.total || 0))}</Text>
            </View>
          </Card>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  addBtn: { fontSize: fontSize.md, color: colors.greenDark, fontWeight: '700' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.greenDark },
  tabLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  tabLabelActive: { color: colors.greenDark },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  itemCard: { marginBottom: spacing.sm },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemClient: { fontSize: fontSize.md, fontWeight: '700' },
  itemDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  itemMeta: { fontSize: fontSize.sm, color: colors.textLight },
  itemAmount: { fontSize: fontSize.md, fontWeight: '700', color: colors.greenDark },
});
