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
import { Card } from '../components/Card';
import { supabase } from '../api/supabase';
import { truncate } from '../utils/format';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  new: 'warning',
  assessment_scheduled: 'info',
  quote_sent: 'info',
  approved: 'success',
  completed: 'success',
  declined: 'error',
  cancelled: 'neutral',
};

export function RequestsListScreen({ navigation }: any) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('requests')
        .select('*')
        .order('created_at', { ascending: false });
      setRequests(data || []);
    } catch (e) {
      console.warn('Requests load error:', e);
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

  const isNew = (r: any) => r.status === 'new';

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.row, isNew(item) && styles.rowNew]}
      onPress={() => navigation.navigate('RequestDetail', { id: item.id, request: item })}
    >
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.client_name || 'Unknown'}</Text>
        {item.service ? <Text style={styles.rowService}>{item.service}</Text> : null}
        {item.property ? (
          <Text style={styles.rowSub} numberOfLines={1}>{truncate(item.property, 40)}</Text>
        ) : null}
        <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
      </View>
      <StatusBadge
        label={(item.status || 'new').replace(/_/g, ' ')}
        variant={STATUS_VARIANT[item.status] || 'neutral'}
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Requests</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateRequest')} style={styles.headerAction}>
          <Ionicons name="add" size={26} color={colors.greenDark} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.greenDark} />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📥</Text>
          <Text style={styles.emptyTitle}>No requests yet</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
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
  rowNew: {
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: fontSize.md, fontWeight: '700' },
  rowService: { fontSize: fontSize.sm, color: colors.greenDark, fontWeight: '600', marginTop: 2 },
  rowSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowDate: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
  separator: { height: spacing.sm },
});
