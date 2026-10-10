import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize } from '../theme';
import { StatusBadge } from '../components/StatusBadge';
import { supabase } from '../api/supabase';
import { currency } from '../utils/format';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'info',
  paid: 'success',
  partial: 'warning',
  overdue: 'error',
  bad_debt: 'error',
};

export function InvoicesListScreen({ navigation }: any) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });
      setInvoices(data || []);
    } catch (e) {
      console.warn('Invoices load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const formatDate = (d: string) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderItem = ({ item }: { item: any }) => {
    const total = parseFloat(item.total || 0);
    const balance = parseFloat(item.balance || 0);
    const hasBal = balance > 0;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.card}
        onPress={() => navigation.navigate('InvoiceDetail', { invoice: item })}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={styles.cardNum}>#{item.invoice_number}</Text>
            <Text style={styles.cardName}>{item.client_name || 'Unknown'}</Text>
          </View>
          <StatusBadge
            label={(item.status || 'draft').replace(/_/g, ' ')}
            variant={STATUS_VARIANT[item.status] || 'neutral'}
          />
        </View>

        {item.subject ? <Text style={styles.cardSubject} numberOfLines={1}>{item.subject}</Text> : null}

        <View style={styles.cardBottom}>
          <Text style={styles.cardDate}>{formatDate(item.issued_date || item.created_at)}</Text>
          <View style={styles.cardAmounts}>
            {hasBal ? (
              <>
                <Text style={styles.cardBalance}>{currency(balance)} due</Text>
                <Text style={styles.cardTotal}>of {currency(total)}</Text>
              </>
            ) : (
              <Text style={styles.cardTotalPaid}>{currency(total)}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoices</Text>
        <TouchableOpacity onPress={() => navigation.navigate('InvoiceBuilder')} style={styles.headerAction}>
          <Ionicons name="add" size={26} color={colors.greenDark} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      ) : invoices.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyTitle}>No invoices yet</Text>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.greenDark} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { marginRight: spacing.sm },
  backText: { fontSize: fontSize.lg, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', flex: 1 },
  headerAction: { padding: spacing.xs },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textSecondary },
  list: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardNum: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  cardName: { fontSize: fontSize.md, fontWeight: '700' },
  cardSubject: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  cardDate: { fontSize: fontSize.xs, color: colors.textLight },
  cardAmounts: { alignItems: 'flex-end' },
  cardBalance: { fontSize: fontSize.md, fontWeight: '800', color: colors.red },
  cardTotal: { fontSize: fontSize.xs, color: colors.textLight },
  cardTotalPaid: { fontSize: fontSize.md, fontWeight: '700', color: colors.greenDark },
  separator: { height: spacing.sm },
});
