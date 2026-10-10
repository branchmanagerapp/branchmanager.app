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
  approved: 'success',
  converted: 'success',
  declined: 'error',
  awaiting: 'warning',
};

export function QuotesListScreen({ navigation }: any) {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false });
      setQuotes(data || []);
    } catch (e) {
      console.warn('Quotes load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.row}
      onPress={() => navigation.navigate('QuoteDetail', { id: item.id })}
    >
      <View style={styles.rowInfo}>
        <View style={styles.rowTop}>
          <Text style={styles.rowNum}>#{item.quote_number}</Text>
          <Text style={styles.rowName}>{item.client_name || 'Unknown'}</Text>
        </View>
        {item.description ? <Text style={styles.rowSub} numberOfLines={1}>{item.description}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        <StatusBadge
          label={(item.status || 'draft').replace(/_/g, ' ')}
          variant={STATUS_VARIANT[item.status] || 'neutral'}
        />
        {parseFloat(item.total) > 0 && (
          <Text style={styles.rowAmount}>{currency(parseFloat(item.total))}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quotes</Text>
        <TouchableOpacity onPress={() => {}} style={styles.headerAction}>
          <Ionicons name="search-outline" size={22} color={colors.greenDark} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      ) : quotes.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No quotes yet</Text>
        </View>
      ) : (
        <FlatList
          data={quotes}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowNum: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  rowName: { fontSize: fontSize.md, fontWeight: '700' },
  rowSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: fontSize.sm, fontWeight: '700', color: colors.greenDark },
  separator: { height: spacing.sm },
});
