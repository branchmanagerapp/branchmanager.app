import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';
import { fetchTodayJobs } from '../api/jobs';
import type { Job } from '../models/types';

export function DashboardScreen({ navigation }: any) {
  const [todayJobs, setTodayJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState({ requests: 0, quotes: 0, jobs: 0, invoices: 0 });
  const [revenue, setRevenue] = useState({ scheduled: 0, receivables: 0, collected: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const jobs = await fetchTodayJobs();
      setTodayJobs(jobs);

      const [reqRes, quoteRes, jobRes, invRes, paidRes] = await Promise.all([
        supabase.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).in('status', ['sent', 'awaiting']),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
        supabase.from('invoices').select('balance').neq('status', 'paid'),
        supabase.from('invoices').select('total').eq('status', 'paid'),
      ]);

      setCounts({
        requests: reqRes.count || 0,
        quotes: quoteRes.count || 0,
        jobs: jobRes.count || 0,
        invoices: (invRes.data || []).length,
      });

      const receivables = (invRes.data || []).reduce((s: number, i: any) => s + (parseFloat(i.balance) || 0), 0);
      const collected = (paidRes.data || []).reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
      const scheduled = jobs.reduce((s, j) => s + (j.total || 0), 0);

      setRevenue({ scheduled, receivables, collected });
    } catch (e) { console.warn('Dashboard load error:', e); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const WORKFLOW_CARDS = [
    { icon: '📥', label: 'Requests', count: counts.requests, screen: 'Search' },
    { icon: '📋', label: 'Quotes', count: counts.quotes, screen: 'Search' },
    { icon: '🔧', label: 'Jobs', count: counts.jobs, screen: 'Schedule' },
    { icon: '💰', label: 'Invoices', count: counts.invoices, screen: 'Search' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData().finally(() => setRefreshing(false)); }} tintColor={colors.greenDark} />}>

        <View style={styles.grid}>
          {WORKFLOW_CARDS.map(wc => (
            <TouchableOpacity key={wc.label} style={styles.workflowCard} activeOpacity={0.7} onPress={() => navigation?.navigate(wc.screen)}>
              <Text style={styles.workflowIcon}>{wc.icon}</Text>
              <Text style={styles.workflowCount}>{wc.count}</Text>
              <Text style={styles.workflowLabel}>{wc.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Today's Jobs ({todayJobs.length})</Text>
        {todayJobs.length === 0 && <Card style={{ alignItems: 'center' as const, paddingVertical: 20 }}><Text style={{ color: colors.textLight }}>No jobs today</Text></Card>}
        {todayJobs.map(job => (
          <TouchableOpacity key={job.id} onPress={() => navigation?.navigate('JobDetail', { id: job.id, job })} activeOpacity={0.7}>
            <Card style={styles.jobCard}>
              <View style={styles.jobTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobNum}>#{job.jobNumber}</Text>
                  <Text style={styles.jobClient}>{job.clientName}</Text>
                  {job.description && <Text style={styles.jobDesc}>{job.description}</Text>}
                </View>
                <View style={styles.jobRight}>
                  <StatusBadge label={job.status.replace('_', ' ')} variant={job.status === 'in_progress' ? 'warning' : job.status === 'completed' ? 'success' : 'info'} />
                  {job.total > 0 && <Text style={styles.jobTotal}>{currency(job.total)}</Text>}
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Revenue</Text>
        <Card>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{currency(revenue.scheduled)}</Text>
              <Text style={styles.summaryLabel}>Scheduled</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, revenue.receivables > 0 ? { color: colors.red } : {}]}>{currency(revenue.receivables)}</Text>
              <Text style={styles.summaryLabel}>Receivables</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.greenDark }]}>{currency(revenue.collected)}</Text>
              <Text style={styles.summaryLabel}>Collected</Text>
            </View>
          </View>
        </Card>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  workflowCard: { width: '48%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  workflowIcon: { fontSize: 28 },
  workflowCount: { fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.sm },
  workflowLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.sm },
  jobCard: { marginBottom: spacing.sm },
  jobTop: { flexDirection: 'row', justifyContent: 'space-between' },
  jobNum: { fontSize: fontSize.xs, fontWeight: '700', color: colors.accent },
  jobClient: { fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  jobDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  jobRight: { alignItems: 'flex-end', gap: 6 },
  jobTotal: { fontSize: fontSize.md, fontWeight: '700' },
  summaryGrid: { flexDirection: 'row', gap: spacing.lg },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: fontSize.xl, fontWeight: '800' },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 4 },
});
