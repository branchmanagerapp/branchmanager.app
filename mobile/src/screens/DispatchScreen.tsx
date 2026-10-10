import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  RefreshControl, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { currency, truncate } from '../utils/format';
import { today as getToday, formatDate } from '../utils/date';
import { supabase } from '../api/supabase';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  scheduled: 'info', in_progress: 'warning', completed: 'success', late: 'error',
};

export function DispatchScreen({ navigation }: any) {
  const [date, setDate] = useState(getToday());
  const [jobs, setJobs] = useState<any[]>([]);
  const [crew, setCrew] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [jRes, cRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('scheduled_date', date).order('start_time'),
      supabase.from('team_members').select('*').eq('active', true).order('name'),
    ]);
    setJobs(jRes.data || []);
    setCrew(cRes.data || []);
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const unassigned = jobs.filter(j => !j.crew || j.crew.length === 0);
  const assigned = jobs.filter(j => j.crew && j.crew.length > 0);

  // Group assigned jobs by first crew member
  const crewJobs: Record<string, any[]> = {};
  assigned.forEach(j => {
    const lead = j.crew[0] || 'Unassigned';
    if (!crewJobs[lead]) crewJobs[lead] = [];
    crewJobs[lead].push(j);
  });

  const handleAssign = (jobId: string, crewName: string) => {
    Alert.alert('Assign Crew', `Assign ${crewName} to this job?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Assign',
        onPress: async () => {
          const job = jobs.find(j => j.id === jobId);
          const updatedCrew = [...(job?.crew || []), crewName];
          await supabase.from('jobs').update({ crew: updatedCrew }).eq('id', jobId);
          loadData();
        },
      },
    ]);
  };

  // Navigate dates
  const shiftDate = (days: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispatch</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Date Nav */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => shiftDate(-1)}>
          <Text style={styles.dateArrow}>{'<'}</Text>
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
          {date === getToday() && <Text style={styles.todayBadge}>Today</Text>}
          {date !== getToday() && (
            <TouchableOpacity onPress={() => setDate(getToday())}>
              <Text style={styles.todayLink}>Go to today</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => shiftDate(1)}>
          <Text style={styles.dateArrow}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData().finally(() => setRefreshing(false)); }} tintColor={colors.greenDark} />}
      >
        {/* Summary */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{jobs.length}</Text>
            <Text style={styles.summaryLabel}>Jobs</Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{crew.length}</Text>
            <Text style={styles.summaryLabel}>Crew</Text>
          </Card>
          <Card style={unassigned.length > 0 ? { ...styles.summaryCard, borderColor: colors.orange, borderWidth: 2 } : styles.summaryCard}>
            <Text style={[styles.summaryValue, unassigned.length > 0 ? { color: colors.orange } : {}]}>{unassigned.length}</Text>
            <Text style={styles.summaryLabel}>Unassigned</Text>
          </Card>
        </View>

        {/* Unassigned Jobs */}
        {unassigned.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>⚠ Unassigned ({unassigned.length})</Text>
            {unassigned.map(j => (
              <Card key={j.id} style={styles.jobCard}>
                <View style={styles.jobTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobNum}>#{j.job_number}</Text>
                    <Text style={styles.jobClient}>{j.client_name}</Text>
                    <Text style={styles.jobDesc} numberOfLines={1}>{j.description}</Text>
                  </View>
                  {j.total > 0 && <Text style={styles.jobTotal}>{currency(parseFloat(j.total))}</Text>}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignRow}>
                  {crew.map(c => (
                    <TouchableOpacity key={c.id} style={styles.assignChip} onPress={() => handleAssign(j.id, c.name)}>
                      <Text style={styles.assignText}>+ {c.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Card>
            ))}
          </>
        )}

        {/* Crew Schedule */}
        {Object.entries(crewJobs).map(([crewName, crewJobList]) => (
          <View key={crewName}>
            <View style={styles.crewHeader}>
              <Avatar name={crewName} size={28} />
              <Text style={styles.crewName}>{crewName}</Text>
              <Text style={styles.crewCount}>{crewJobList.length} job{crewJobList.length !== 1 ? 's' : ''}</Text>
            </View>
            {crewJobList.map(j => (
              <TouchableOpacity key={j.id} onPress={() => navigation?.navigate('JobDetail', { id: j.id })} activeOpacity={0.7}>
                <Card style={styles.crewJobCard}>
                  <View style={styles.jobTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobNum}>#{j.job_number} · {j.client_name}</Text>
                      <Text style={styles.jobDesc} numberOfLines={1}>{j.description || j.property}</Text>
                    </View>
                    <StatusBadge label={j.status?.replace('_', ' ')} variant={STATUS_VARIANT[j.status] || 'neutral'} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {jobs.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Jobs Scheduled</Text>
            <Text style={styles.emptyText}>No jobs for {formatDate(date)}</Text>
          </Card>
        )}

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
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateArrow: { fontSize: fontSize.xl, fontWeight: '600', color: colors.text, paddingHorizontal: spacing.md },
  dateCenter: { alignItems: 'center' },
  dateText: { fontSize: fontSize.lg, fontWeight: '700' },
  todayBadge: { fontSize: fontSize.xs, color: colors.greenDark, fontWeight: '600', marginTop: 2 },
  todayLink: { fontSize: fontSize.xs, color: colors.accent, textDecorationLine: 'underline', marginTop: 2 },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  summaryValue: { fontSize: fontSize.xxl, fontWeight: '800' },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.sm },
  jobCard: { marginBottom: spacing.sm },
  jobTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  jobNum: { fontSize: fontSize.xs, fontWeight: '700', color: colors.accent },
  jobClient: { fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  jobDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  jobTotal: { fontSize: fontSize.md, fontWeight: '700' },
  assignRow: { marginTop: spacing.sm },
  assignChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.greenBg, marginRight: spacing.sm },
  assignText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.greenDark },
  crewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  crewName: { fontSize: fontSize.md, fontWeight: '700', flex: 1 },
  crewCount: { fontSize: fontSize.sm, color: colors.textLight },
  crewJobCard: { marginBottom: spacing.sm, marginLeft: spacing.xl },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary },
});
