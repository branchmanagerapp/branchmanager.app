import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';

type Tab = 'all' | 'clients' | 'jobs' | 'invoices' | 'quotes' | 'requests';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'clients', label: 'Clients' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'requests', label: 'Requests' },
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  active: 'success', lead: 'warning', scheduled: 'info', in_progress: 'warning',
  completed: 'success', late: 'error', sent: 'info', paid: 'success',
  overdue: 'error', new: 'info', draft: 'neutral', approved: 'success',
  declined: 'error', awaiting: 'warning', converted: 'success',
};

export function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [cRes, jRes, iRes, qRes, rRes] = await Promise.all([
        supabase.from('clients').select('*').order('updated_at', { ascending: false }).limit(50),
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(50),
        supabase.from('invoices').select('*').order('updated_at', { ascending: false }).limit(50),
        supabase.from('quotes').select('*').order('updated_at', { ascending: false }).limit(50),
        supabase.from('requests').select('*').order('updated_at', { ascending: false }).limit(50),
      ]);
      setClients(cRes.data || []);
      setJobs(jRes.data || []);
      setInvoices(iRes.data || []);
      setQuotes(qRes.data || []);
      setRequests(rRes.data || []);
    } catch (e) {
      console.warn('Search load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const q = query.toLowerCase().trim();

  const filtered = useMemo(() => {
    const filter = (items: any[], fields: string[]) => {
      if (!q) return items;
      return items.filter(item =>
        fields.some(f => (item[f] || '').toString().toLowerCase().includes(q))
      );
    };
    return {
      clients: filter(clients, ['name', 'address', 'phone', 'email', 'company']),
      jobs: filter(jobs, ['client_name', 'description', 'property', 'job_number']),
      invoices: filter(invoices, ['client_name', 'subject', 'invoice_number']),
      quotes: filter(quotes, ['client_name', 'description', 'quote_number']),
      requests: filter(requests, ['client_name', 'property', 'phone', 'source']),
    };
  }, [q, clients, jobs, invoices, quotes, requests]);

  const counts = {
    all: filtered.clients.length + filtered.jobs.length + filtered.invoices.length + filtered.quotes.length + filtered.requests.length,
    clients: filtered.clients.length,
    jobs: filtered.jobs.length,
    invoices: filtered.invoices.length,
    quotes: filtered.quotes.length,
    requests: filtered.requests.length,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients, jobs, quotes..."
          placeholderTextColor={colors.textLight}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={styles.tabs}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                {t.label} ({counts[t.key]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {counts.all} result{counts.all !== 1 ? 's' : ''}
          {q ? ` for "${query}"` : ' — most recent first'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenDark} />}
        >
          {/* Clients */}
          {(tab === 'all' || tab === 'clients') && filtered.clients.length > 0 && (
            <Section title="Clients" icon="👥" count={filtered.clients.length}>
              {filtered.clients.map(c => (
                <TouchableOpacity key={c.id} activeOpacity={0.7} style={styles.resultRow} onPress={() => navigation.navigate('ClientDetail', { id: c.id, client: c })}>
                  <Avatar name={c.name || ''} size={38} color={c.status === 'lead' ? colors.orange : colors.accent} />
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{c.name}</Text>
                    {c.address ? <Text style={styles.resultSub} numberOfLines={1}>{c.address}</Text> : null}
                    {c.phone ? <Text style={styles.resultDetail}>{c.phone}</Text> : null}
                  </View>
                  <StatusBadge label={c.status || 'lead'} variant={STATUS_VARIANT[c.status] || 'neutral'} />
                </TouchableOpacity>
              ))}
            </Section>
          )}

          {/* Jobs */}
          {(tab === 'all' || tab === 'jobs') && filtered.jobs.length > 0 && (
            <Section title="Jobs" icon="🔧" count={filtered.jobs.length}>
              {filtered.jobs.map(j => (
                <TouchableOpacity key={j.id} activeOpacity={0.7} style={styles.resultRow} onPress={() => navigation.navigate('JobDetail', { id: j.id })}>
                  <View style={styles.resultInfo}>
                    <View style={styles.resultTop}>
                      <Text style={styles.resultNum}>#{j.job_number}</Text>
                      <Text style={styles.resultName}>{j.client_name}</Text>
                    </View>
                    {j.description ? <Text style={styles.resultSub}>{j.description}</Text> : null}
                  </View>
                  <View style={styles.resultRight}>
                    <StatusBadge label={(j.status || '').replace('_', ' ')} variant={STATUS_VARIANT[j.status] || 'neutral'} />
                    {j.total > 0 && <Text style={styles.resultAmount}>{currency(parseFloat(j.total))}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </Section>
          )}

          {/* Invoices */}
          {(tab === 'all' || tab === 'invoices') && filtered.invoices.length > 0 && (
            <Section title="Invoices" icon="💰" count={filtered.invoices.length}>
              {filtered.invoices.map(i => (
                <TouchableOpacity key={i.id} activeOpacity={0.7} style={styles.resultRow} onPress={() => navigation.navigate('InvoiceDetail', { invoice: i })}>
                  <View style={styles.resultInfo}>
                    <View style={styles.resultTop}>
                      <Text style={styles.resultNum}>#{i.invoice_number}</Text>
                      <Text style={styles.resultName}>{i.client_name}</Text>
                    </View>
                    {i.subject ? <Text style={styles.resultSub}>{i.subject}</Text> : null}
                  </View>
                  <View style={styles.resultRight}>
                    <StatusBadge label={i.status || 'draft'} variant={STATUS_VARIANT[i.status] || 'neutral'} />
                    <Text style={[styles.resultAmount, parseFloat(i.balance) > 0 && { color: colors.red }]}>
                      {parseFloat(i.balance) > 0 ? currency(parseFloat(i.balance)) + ' due' : currency(parseFloat(i.total || 0))}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </Section>
          )}

          {/* Quotes */}
          {(tab === 'all' || tab === 'quotes') && filtered.quotes.length > 0 && (
            <Section title="Quotes" icon="📋" count={filtered.quotes.length}>
              {filtered.quotes.map(qr => (
                <TouchableOpacity key={qr.id} activeOpacity={0.7} style={styles.resultRow} onPress={() => navigation.navigate('QuoteDetail', { quote: qr })}>
                  <View style={styles.resultInfo}>
                    <View style={styles.resultTop}>
                      <Text style={styles.resultNum}>#{qr.quote_number}</Text>
                      <Text style={styles.resultName}>{qr.client_name}</Text>
                    </View>
                    {qr.description ? <Text style={styles.resultSub}>{qr.description}</Text> : null}
                  </View>
                  <View style={styles.resultRight}>
                    <StatusBadge label={qr.status || 'draft'} variant={STATUS_VARIANT[qr.status] || 'neutral'} />
                    {parseFloat(qr.total) > 0 && <Text style={styles.resultAmount}>{currency(parseFloat(qr.total))}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </Section>
          )}

          {/* Requests */}
          {(tab === 'all' || tab === 'requests') && filtered.requests.length > 0 && (
            <Section title="Requests" icon="📥" count={filtered.requests.length}>
              {filtered.requests.map(r => (
                <TouchableOpacity key={r.id} activeOpacity={0.7} style={styles.resultRow} onPress={() => navigation.navigate('RequestDetail', { id: r.id, request: r })}>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{r.client_name}</Text>
                    {r.property ? <Text style={styles.resultSub} numberOfLines={1}>{r.property}</Text> : null}
                    {r.source ? <Text style={styles.resultDetail}>{r.source}</Text> : null}
                  </View>
                  <StatusBadge label={r.status || 'new'} variant={STATUS_VARIANT[r.status] || 'neutral'} />
                </TouchableOpacity>
              ))}
            </Section>
          )}

          {counts.all === 0 && (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptyText}>Try a different search term or filter</Text>
            </Card>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{icon} {title}</Text>
        <Text style={styles.sectionCount}>({count})</Text>
      </View>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg,
    backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: spacing.md,
    height: 48, gap: spacing.sm, borderWidth: 2, borderColor: colors.border,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  clearBtn: { fontSize: fontSize.md, color: colors.textLight, padding: 4 },
  tabScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white, maxHeight: 44 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: 4, paddingVertical: spacing.sm },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  tabActive: { backgroundColor: colors.greenDark, borderColor: colors.greenDark },
  tabLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  tabLabelActive: { color: colors.white },
  summaryBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.bg },
  summaryText: { fontSize: fontSize.sm, color: colors.textLight },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: fontSize.sm, color: colors.textLight },
  sectionCard: { padding: 0, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  resultInfo: { flex: 1, minWidth: 0 },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultNum: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  resultName: { fontSize: fontSize.md, fontWeight: '600' },
  resultSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  resultDetail: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 1 },
  resultRight: { alignItems: 'flex-end', gap: 4 },
  resultAmount: { fontSize: fontSize.sm, fontWeight: '700', color: colors.greenDark },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { color: colors.textLight, textAlign: 'center' },
});
