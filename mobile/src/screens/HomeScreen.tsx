import React, { useState, useCallback, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { formatTime, today as getToday } from '../utils/date';
import { currency } from '../utils/format';
import { fetchTodayJobs } from '../api/jobs';
import { supabase } from '../api/supabase';
import { useAuth } from '../hooks/useAuth';
import type { Job } from '../models/types';

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  late: 'error',
};

export function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState('Branch Manager');
  const [refreshing, setRefreshing] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState({ unpaid: 0, todayValue: 0, clients: 0 });
  const [workflow, setWorkflow] = useState({ requests: 0, quotes: 0, jobs: 0, invoices: 0 });
  const [receivables, setReceivables] = useState<Array<{ id: string; client_name: string; balance: number; due_date: string; days_late: number }>>([]);
  const [approvedQuotes, setApprovedQuotes] = useState<Array<{ id: string; client_name: string; total: number; quote_number: number }>>([]);
  const [needsInvoicing, setNeedsInvoicing] = useState<Array<{ id: string; client_name: string; total: number; job_number: number }>>([]);

  useEffect(() => {
    AsyncStorage.getItem('bm-co-name').then(v => { if (v) setCompanyName(v); });
  }, []);

  const loadData = useCallback(async () => {
    try {
      const todayJobs = await fetchTodayJobs();
      setJobs(todayJobs);

      const [invRes, clientRes, reqRes, quoteRes, jobRes, unpaidInvRes, approvedRes, needsInvRes] = await Promise.all([
        supabase.from('invoices').select('balance,status').neq('status', 'paid'),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).in('status', ['sent', 'awaiting']),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
        supabase.from('invoices').select('id,client_name,balance,due_date,status').neq('status', 'paid'),
        supabase.from('quotes').select('id,client_name,total,quote_number').eq('status', 'approved').limit(5),
        supabase.from('jobs').select('id,client_name,total,job_number').eq('status', 'completed').is('invoice_id', null).limit(5),
      ]);
      const unpaid = (invRes.data || []).filter((i: any) => parseFloat(i.balance) > 0).length;
      const todayValue = todayJobs.reduce((s, j) => s + (j.total || 0), 0);
      setStats({ unpaid, todayValue, clients: clientRes.count || 0 });

      // Workflow counts
      setWorkflow({
        requests: reqRes.count || 0,
        quotes: quoteRes.count || 0,
        jobs: jobRes.count || 0,
        invoices: unpaid,
      });

      // Receivables
      const now = new Date();
      const recv = (unpaidInvRes.data || [])
        .filter((i: any) => parseFloat(i.balance) > 0)
        .map((i: any) => {
          const due = new Date(i.due_date);
          const daysLate = Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
          return { id: i.id, client_name: i.client_name || 'Unknown', balance: parseFloat(i.balance), due_date: i.due_date, days_late: daysLate };
        })
        .sort((a: any, b: any) => b.days_late - a.days_late)
        .slice(0, 10);
      setReceivables(recv);

      // Conversion cards
      setApprovedQuotes((approvedRes.data || []).map((q: any) => ({ id: q.id, client_name: q.client_name, total: parseFloat(q.total || 0), quote_number: q.quote_number })));
      setNeedsInvoicing((needsInvRes.data || []).map((j: any) => ({ id: j.id, client_name: j.client_name, total: parseFloat(j.total || 0), job_number: j.job_number })));
    } catch (e) {
      console.warn('Home load error:', e);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }, [loadData]);

  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  const handleClockIn = async () => {
    try {
      const { clockIn } = await import('../api/timesheets');
      const entry = await clockIn('owner');
      setActiveEntryId(entry.id);
      setClockedIn(true);
      setClockInTime(new Date().toISOString());
    } catch (e) {
      console.warn('Clock in error:', e);
      // Offline fallback
      const { enqueue } = await import('../utils/offline');
      await enqueue({ table: 'time_entries', type: 'insert', data: { user_name: user?.name || 'Unknown', date: new Date().toISOString().split('T')[0], clock_in: new Date().toISOString(), hours: 0 } });
      setClockedIn(true);
      setClockInTime(new Date().toISOString());
    }
  };

  const handleClockOut = async () => {
    try {
      if (activeEntryId) {
        const { clockOut } = await import('../api/timesheets');
        await clockOut(activeEntryId);
      }
    } catch (e) {
      console.warn('Clock out error:', e);
    }
    setClockedIn(false);
    setClockInTime(null);
    setActiveEntryId(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Header — clean like Jobber */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Branch Manager</Text>
          <Text style={styles.headerSub}>{companyName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => navigation.navigate('CreateRequest')} style={{ backgroundColor: colors.greenLight, borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Assistant')}>
            <Ionicons name="sparkles" size={22} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenDark} />}
      >
        {/* Clock In/Out Card */}
        <Card style={styles.clockCard}>
          <View style={styles.clockHeader}>
            <Text style={styles.clockEmoji}>Clock</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.clockTitle}>
                {clockedIn ? 'Clocked In' : 'Ready to Work'}
              </Text>
              {clockedIn && clockInTime && (
                <Text style={styles.clockSince}>
                  Since {formatTime(clockInTime)}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.clockBtn, clockedIn ? styles.clockOutBtn : styles.clockInBtn]}
            onPress={clockedIn ? handleClockOut : handleClockIn}
            activeOpacity={0.8}
          >
            <Text style={styles.clockBtnText}>
              {clockedIn ? '⏹  Clock Out' : '▶  Clock In'}
            </Text>
          </TouchableOpacity>
        </Card>

        {/* Workflow Cards */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workflow</Text>
        </View>
        <View style={styles.workflowGrid}>
          {([
            { label: 'Requests', count: workflow.requests, screen: 'RequestsList', bg: colors.blueBg, fg: colors.blue },
            { label: 'Quotes', count: workflow.quotes, screen: 'QuotesList', bg: colors.orangeBg, fg: colors.orange },
            { label: 'Jobs', count: workflow.jobs, screen: 'JobsList', bg: colors.greenBg, fg: colors.greenDark },
            { label: 'Invoices', count: workflow.invoices, screen: 'InvoicesList', bg: colors.redBg, fg: colors.red },
          ] as const).map(item => (
            <TouchableOpacity
              key={item.label}
              style={[styles.workflowCard, { backgroundColor: item.bg }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Text style={[styles.workflowCount, { color: item.fg }]}>{item.count}</Text>
              <Text style={[styles.workflowLabel, { color: item.fg }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Conversion Cards */}
        {(approvedQuotes.length > 0 || needsInvoicing.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: spacing.md }}>
            {approvedQuotes.length > 0 && (
              <Card style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: colors.greenDark }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.greenDark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Ready to Convert ({approvedQuotes.length})
                </Text>
                {approvedQuotes.slice(0, 3).map(q => (
                  <TouchableOpacity key={q.id} onPress={() => navigation.navigate('QuoteDetail', { id: q.id })} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{q.client_name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textLight }}>{currency(q.total)}</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}
            {needsInvoicing.length > 0 && (
              <Card style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: colors.orange }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Ready to Invoice ({needsInvoicing.length})
                </Text>
                {needsInvoicing.slice(0, 3).map(j => (
                  <TouchableOpacity key={j.id} onPress={() => navigation.navigate('JobDetail', { id: j.id })} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{j.client_name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textLight }}>{currency(j.total)}</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </View>
        )}

        {/* Today's Jobs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Jobs</Text>
          <Text style={styles.sectionCount}>{jobs.length}</Text>
        </View>

        {jobs.map(job => (
          <TouchableOpacity
            key={job.id}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('JobDetail', { id: job.id, job })}
          >
            <Card style={styles.jobCard}>
              <View style={styles.jobTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobNumber}>#{job.jobNumber}</Text>
                  <Text style={styles.jobClient}>{job.clientName}</Text>
                  <Text style={styles.jobAddress} numberOfLines={1}>{job.property}</Text>
                </View>
                <View style={styles.jobRight}>
                  <StatusBadge
                    label={job.status.replace('_', ' ')}
                    variant={STATUS_VARIANT[job.status] || 'neutral'}
                  />
                  <Text style={styles.jobTotal}>{currency(job.total)}</Text>
                </View>
              </View>

              {job.description && (
                <Text style={styles.jobDesc}>{job.description}</Text>
              )}

              <View style={styles.crewRow}>
                {job.crew.map((c, i) => (
                  <View key={i} style={styles.crewChip}>
                    <Text style={styles.crewChipText}>{c.split(' ')[0]}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Receivables */}
        {receivables.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Receivables</Text>
              <Text style={styles.sectionCount}>{receivables.length}</Text>
            </View>
            {receivables.map(inv => (
              <TouchableOpacity
                key={inv.id}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })}
              >
                <Card style={styles.receivableCard}>
                  <View style={styles.receivableRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.receivableName}>{inv.client_name}</Text>
                      {inv.days_late > 0 ? (
                        <Text style={styles.receivableLate}>{inv.days_late} day{inv.days_late !== 1 ? 's' : ''} overdue</Text>
                      ) : (
                        <Text style={styles.receivableDue}>Due {inv.due_date}</Text>
                      )}
                    </View>
                    <Text style={[styles.receivableAmount, inv.days_late > 0 ? { color: colors.red } : {}]}>
                      {currency(inv.balance)}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.greenDark,
  },
  header: {
    backgroundColor: colors.greenDark,
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + spacing.md : spacing.sm,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.white,
  },
  headerSub: {
    fontSize: fontSize.sm,
    color: colors.white + '99',
    marginTop: 2,
  },
  avatarBtn: {
    opacity: 0.8,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  content: {
    padding: spacing.lg,
  },
  clockCard: {
    marginBottom: spacing.lg,
  },
  clockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  clockEmoji: {
    fontSize: 32,
  },
  clockTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  clockSince: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clockBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  clockInBtn: {
    backgroundColor: colors.greenDark,
  },
  clockOutBtn: {
    backgroundColor: colors.red,
  },
  clockBtnText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
  },
  sectionCount: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  jobCard: {
    marginBottom: spacing.sm,
  },
  jobTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  jobNumber: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.accent,
  },
  jobClient: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  jobAddress: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  jobRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  jobTotal: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  jobDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  crewRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  crewChip: {
    backgroundColor: colors.greenBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  crewChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.greenDark,
  },
  workflowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  workflowCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  workflowCount: {
    fontSize: fontSize.xxxl,
    fontWeight: '800',
  },
  workflowLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  receivableCard: {
    marginBottom: spacing.xs,
  },
  receivableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receivableName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  receivableLate: {
    fontSize: fontSize.sm,
    color: colors.red,
    marginTop: 2,
  },
  receivableDue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  receivableAmount: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
});
