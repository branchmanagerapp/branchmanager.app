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
  completed: 'success',
  succeeded: 'success',
  pending: 'warning',
  failed: 'error',
  refunded: 'error',
};

export function PaymentsListScreen({ navigation }: any) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      setPayments(data || []);
    } catch (e) {
      console.warn('Payments load error:', e);
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

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.row}
      onPress={() => {
        if (item.invoice_id) {
          navigation.navigate('InvoiceDetail', { invoice: { id: item.invoice_id } });
        }
      }}
    >
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.client_name || 'Unknown'}</Text>
        <Text style={styles.rowDate}>{formatDate(item.payment_date || item.created_at)}</Text>
        {item.method ? (
          <Text style={styles.rowMethod}>{item.method.replace(/_/g, ' ')}</Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>{currency(parseFloat(item.amount || 0))}</Text>
        <StatusBadge
          label={(item.status || 'completed').replace(/_/g, ' ')}
          variant={STATUS_VARIANT[item.status] || 'success'}
        />
      </View>
    </TouchableOpacity>
  );

  // Compute total
  const total = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payments</Text>
        <View style={styles.headerAction} />
      </View>

      {!loading && payments.length > 0 && (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>Total: {currency(total)}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>💳</Text>
          <Text style={styles.emptyTitle}>No payments yet</Text>
        </View>
      ) : (
        <FlatList
          data={payments}
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
  headerAction: { padding: spacing.xs, width: 30 },
  statsBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.greenBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statsText: { fontSize: fontSize.md, fontWeight: '700', color: colors.greenDark },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textSecondary },
  list: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: fontSize.md, fontWeight: '700' },
  rowDate: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowMethod: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2, textTransform: 'capitalize' },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: fontSize.md, fontWeight: '800', color: colors.greenDark },
  separator: { height: spacing.sm },
});
