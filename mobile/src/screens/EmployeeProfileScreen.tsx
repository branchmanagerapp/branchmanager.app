import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { currency, phone as fmtPhone } from '../utils/format';
import { supabase } from '../api/supabase';
import { isGustoConnected, syncEmployeesFromGusto } from '../api/gusto';

type TabKey = 'profile' | 'pay' | 'schedule' | 'history' | 'gusto';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'profile', label: 'Profile', icon: '👤' },
  { key: 'pay', label: 'Pay', icon: '💰' },
  { key: 'schedule', label: 'Schedule', icon: '📅' },
  { key: 'history', label: 'History', icon: '📋' },
  { key: 'gusto', label: 'Gusto', icon: '🔗' },
];

export function EmployeeProfileScreen({ navigation, route }: any) {
  const empId = route?.params?.id;
  const [tab, setTab] = useState<TabKey>('profile');
  const [emp, setEmp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [gustoConnected, setGustoConnected] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Load employee — either from route params or first team member
      let employee: any = null;
      if (empId) {
        const { data } = await supabase.from('team_members').select('*').eq('id', empId).single();
        employee = data;
      } else {
        const { data } = await supabase.from('team_members').select('*').eq('active', true).order('name').limit(1);
        employee = data?.[0];
      }
      setEmp(employee);

      if (employee) {
        // Load job history
        const { data: jobData } = await supabase.from('jobs').select('*')
          .contains('crew', [employee.name])
          .order('scheduled_date', { ascending: false }).limit(10);
        setJobs(jobData || []);

        // Load time entries for YTD
        const yearStart = new Date().getFullYear() + '-01-01';
        const { data: timeData } = await supabase.from('time_entries').select('hours, date')
          .eq('user_name', employee.name).gte('date', yearStart);
        setTimeEntries(timeData || []);
      }

      setGustoConnected(await isGustoConnected());
      setLoading(false);
    };
    load();
  }, [empId]);

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={colors.greenDark} /></View></SafeAreaView>;
  }

  if (!emp) {
    return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>Not Found</Text><View style={{ width: 50 }} /></View></SafeAreaView>;
  }

  const rate = parseFloat(emp.rate) || 0;
  const ytdHours = timeEntries.reduce((s: number, e: any) => s + (parseFloat(e.hours) || 0), 0);
  const ytdGross = ytdHours * rate;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Employee</Text>
        <TouchableOpacity onPress={() => Alert.alert('Edit', 'Employee edit form coming soon.')}><Text style={styles.editBtn}>Edit</Text></TouchableOpacity>
      </View>

      <View style={styles.profileBanner}>
        <Avatar name={emp.name} size={64} color={emp.role === 'owner' ? colors.greenDark : emp.role === 'crew_lead' ? colors.accent : colors.textSecondary} />
        <Text style={styles.profileName}>{emp.name}</Text>
        <StatusBadge label={emp.role?.replace('_', ' ') || 'employee'} variant="info" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={styles.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tab === 'profile' && (
          <Card>
            <InfoRow label="Email" value={emp.email || '—'} />
            <InfoRow label="Phone" value={emp.phone ? fmtPhone(emp.phone) : '—'} />
            <InfoRow label="Role" value={emp.role?.replace('_', ' ') || '—'} />
            <InfoRow label="Active" value={emp.active ? 'Yes' : 'No'} last />
          </Card>
        )}

        {tab === 'pay' && (
          <>
            <Card>
              <View style={styles.payGrid}>
                <View style={styles.payItem}>
                  <Text style={styles.payValue}>{rate > 0 ? currency(rate) + '/hr' : '—'}</Text>
                  <Text style={styles.payLabel}>Pay Rate</Text>
                </View>
                <View style={styles.payItem}>
                  <Text style={styles.payValue}>{ytdHours.toFixed(0)} hrs</Text>
                  <Text style={styles.payLabel}>YTD Hours</Text>
                </View>
              </View>
            </Card>
            <Text style={styles.subTitle}>Year to Date</Text>
            <Card>
              <View style={styles.payGrid}>
                <View style={styles.payItem}>
                  <Text style={styles.payValue}>{currency(ytdGross)}</Text>
                  <Text style={styles.payLabel}>Gross Pay</Text>
                </View>
                <View style={styles.payItem}>
                  <Text style={styles.payValue}>{ytdHours.toFixed(0)} hrs</Text>
                  <Text style={styles.payLabel}>Total Hours</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {tab === 'schedule' && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>Default Schedule</Text>
            <Text style={styles.emptyText}>Monday – Friday, 7:00 AM – 3:30 PM</Text>
          </Card>
        )}

        {tab === 'history' && (
          <>
            <Text style={styles.subTitle}>Recent Jobs ({jobs.length})</Text>
            <Card>
              {jobs.length === 0 && <Text style={{ color: colors.textLight, padding: spacing.md }}>No job history</Text>}
              {jobs.map((j: any, i: number) => (
                <TouchableOpacity key={j.id} style={[iStyles.row, i < jobs.length - 1 && iStyles.border]} onPress={() => navigation?.navigate('JobDetail', { id: j.id })}>
                  <View style={{ flex: 1 }}>
                    <Text style={iStyles.primary}>#{j.job_number} {j.client_name}</Text>
                    <Text style={iStyles.secondary}>{j.scheduled_date} · {j.status}</Text>
                  </View>
                  {j.total > 0 && <Text style={iStyles.amount}>{currency(parseFloat(j.total))}</Text>}
                </TouchableOpacity>
              ))}
            </Card>
          </>
        )}

        {tab === 'gusto' && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🔗</Text>
            <Text style={styles.emptyTitle}>Gusto Integration</Text>
            <Text style={styles.emptyText}>
              {gustoConnected ? 'Connected to Gusto' : 'Not synced with Gusto'}
            </Text>
            <TouchableOpacity style={styles.gustoBtn} onPress={async () => {
              if (gustoConnected) {
                try { await syncEmployeesFromGusto(); Alert.alert('Synced', 'Employee data synced from Gusto.'); } catch (e: any) { Alert.alert('Error', e.message); }
              } else {
                Alert.alert('Connect Gusto', 'Go to Settings to add your Gusto API key.');
              }
            }}>
              <Text style={styles.gustoBtnText}>{gustoConnected ? 'Re-sync from Gusto' : 'Connect to Gusto'}</Text>
            </TouchableOpacity>
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[iStyles.row, !last && iStyles.border]}>
      <Text style={iStyles.label}>{label}</Text>
      <Text style={iStyles.value}>{value}</Text>
    </View>
  );
}

const iStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
  border: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  primary: { fontSize: fontSize.sm, fontWeight: '600' },
  secondary: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
  amount: { fontSize: fontSize.sm, fontWeight: '700', color: colors.greenDark },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  editBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  profileBanner: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm, backgroundColor: colors.white },
  profileName: { fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.sm },
  tabScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.greenDark },
  tabIcon: { fontSize: 14 },
  tabLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  tabLabelActive: { color: colors.greenDark },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  subTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  payGrid: { flexDirection: 'row', gap: spacing.lg },
  payItem: { flex: 1, alignItems: 'center' },
  payValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  payLabel: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 4 },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  gustoBtn: { marginTop: spacing.lg, backgroundColor: colors.greenDark, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  gustoBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
