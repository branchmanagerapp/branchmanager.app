import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { SummaryCard } from '../components/SummaryCard';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';

type Period = 'week' | 'month' | 'quarter' | 'year';

export function ReportsScreen({ navigation }: any) {
  const [period, setPeriod] = useState<Period>('month');
  const [stats, setStats] = useState({
    revenue: 0, invoiced: 0, collected: 0, outstanding: 0,
    jobsCompleted: 0, quotesWon: 0, quotesTotal: 0, newClients: 0,
    expenses: 0,
  });

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      let startDate: string;
      if (period === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        startDate = d.toISOString().split('T')[0];
      } else if (period === 'month') {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      } else if (period === 'quarter') {
        const q = Math.floor(now.getMonth() / 3) * 3;
        startDate = `${now.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`;
      } else {
        startDate = `${now.getFullYear()}-01-01`;
      }

      const [invRes, jobRes, quoteRes, clientRes] = await Promise.all([
        supabase.from('invoices').select('total,balance,status,paid_date').gte('created_at', startDate),
        supabase.from('jobs').select('status,total').gte('created_at', startDate),
        supabase.from('quotes').select('status,total').gte('created_at', startDate),
        supabase.from('clients').select('id').gte('created_at', startDate),
      ]);

      const invoices = invRes.data || [];
      const jobs = jobRes.data || [];
      const quotes = quoteRes.data || [];

      const collected = invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
      const invoiced = invoices.reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
      const outstanding = invoices.reduce((s: number, i: any) => s + (parseFloat(i.balance) || 0), 0);

      setStats({
        revenue: collected,
        invoiced,
        collected,
        outstanding,
        jobsCompleted: jobs.filter((j: any) => j.status === 'completed').length,
        quotesWon: quotes.filter((q: any) => q.status === 'approved').length,
        quotesTotal: quotes.length,
        newClients: (clientRes.data || []).length,
        expenses: 0,
      });
    };
    load();
  }, [period]);

  const conversionRate = stats.quotesTotal > 0 ? Math.round((stats.quotesWon / stats.quotesTotal) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reports</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {(['week', 'month', 'quarter', 'year'] as Period[]).map(p => (
          <TouchableOpacity key={p} style={[styles.periodBtn, period === p && styles.periodActive]} onPress={() => setPeriod(p)}>
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Revenue */}
        <Text style={styles.sectionTitle}>Revenue</Text>
        <View style={styles.summaryRow}>
          <SummaryCard label="Collected" value={currency(stats.collected)} color={colors.greenDark} bgColor={colors.greenBg} />
          <SummaryCard label="Invoiced" value={currency(stats.invoiced)} />
          <SummaryCard label="Outstanding" value={currency(stats.outstanding)} color={stats.outstanding > 0 ? colors.red : colors.text} bgColor={stats.outstanding > 0 ? colors.redBg : colors.bg} />
        </View>

        {/* Activity */}
        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.summaryRow}>
          <SummaryCard label="Jobs Done" value={stats.jobsCompleted.toString()} />
          <SummaryCard label="New Clients" value={stats.newClients.toString()} />
        </View>

        {/* Quotes */}
        <Text style={styles.sectionTitle}>Quotes</Text>
        <Card>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Quotes Sent</Text>
            <Text style={styles.metricValue}>{stats.quotesTotal}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Quotes Won</Text>
            <Text style={[styles.metricValue, { color: colors.greenDark }]}>{stats.quotesWon}</Text>
          </View>
          <View style={[styles.metricRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.metricLabel}>Conversion Rate</Text>
            <Text style={[styles.metricValue, { color: conversionRate >= 50 ? colors.greenDark : colors.orange }]}>
              {conversionRate}%
            </Text>
          </View>
        </Card>

        {/* Profit */}
        <Text style={styles.sectionTitle}>Profit</Text>
        <Card>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Revenue</Text>
            <Text style={[styles.metricValue, { color: colors.greenDark }]}>{currency(stats.collected)}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Expenses</Text>
            <Text style={[styles.metricValue, { color: colors.red }]}>{currency(stats.expenses)}</Text>
          </View>
          <View style={[styles.metricRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.metricLabel, { fontWeight: '800' }]}>Net Profit</Text>
            <Text style={[styles.metricValue, { fontWeight: '800', color: colors.greenDark }]}>
              {currency(stats.collected - stats.expenses)}
            </Text>
          </View>
        </Card>

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
  periodRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  periodActive: { backgroundColor: colors.greenDark, borderColor: colors.greenDark },
  periodText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  periodTextActive: { color: colors.white },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  metricLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  metricValue: { fontSize: fontSize.lg, fontWeight: '700' },
});
