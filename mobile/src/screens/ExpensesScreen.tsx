import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { currency } from '../utils/format';
import { supabase } from '../api/supabase';

const CATEGORIES = ['Fuel', 'Equipment', 'Supplies', 'Insurance', 'Vehicle', 'Meals', 'Subcontractor', 'Dump Fees', 'Other'];

export function ExpensesScreen({ navigation }: any) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Form
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');

  const loadExpenses = useCallback(async () => {
    const { data } = await supabase.from('expenses').select('*').order('date', { ascending: false }).limit(50);
    setExpenses(data || []);
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleSave = async () => {
    if (!desc.trim() || !amount) { Alert.alert('Required', 'Description and amount are required.'); return; }
    try {
      await supabase.from('expenses').insert({
        description: desc.trim(), amount: parseFloat(amount), category, vendor,
        date: new Date().toISOString().split('T')[0],
      });
      Alert.alert('Saved', 'Expense recorded.');
      setDesc(''); setAmount(''); setCategory(''); setVendor('');
      setShowAdd(false);
      loadExpenses();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const totalMonth = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expenses</Text>
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Text style={styles.addBtn}>{showAdd ? 'Cancel' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadExpenses().finally(() => setRefreshing(false)); }} tintColor={colors.greenDark} />}>

        {/* Total */}
        <Card>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>This Month</Text>
            <Text style={styles.totalValue}>{currency(totalMonth)}</Text>
          </View>
          <Text style={styles.totalCount}>{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</Text>
        </Card>

        {/* Add Form */}
        {showAdd && (
          <Card>
            <Text style={styles.sectionTitle}>New Expense</Text>
            <Text style={styles.label}>Description *</Text>
            <TextInput style={styles.input} value={desc} onChangeText={setDesc} placeholder="What was the expense for?" placeholderTextColor={colors.textLight} />
            <Text style={styles.label}>Amount *</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.textLight} />
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              <View style={styles.catRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c} style={[styles.catChip, category === c && styles.catActive]} onPress={() => setCategory(c)}>
                    <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.label}>Vendor</Text>
            <TextInput style={styles.input} value={vendor} onChangeText={setVendor} placeholder="Vendor name (optional)" placeholderTextColor={colors.textLight} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Expense</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* List */}
        {expenses.map(e => (
          <Card key={e.id} style={styles.expenseCard}>
            <View style={styles.expenseTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDesc}>{e.description}</Text>
                <Text style={styles.expenseMeta}>{e.category || 'Other'} {e.vendor ? '· ' + e.vendor : ''} · {e.date}</Text>
              </View>
              <Text style={styles.expenseAmount}>{currency(parseFloat(e.amount) || 0)}</Text>
            </View>
          </Card>
        ))}

        {expenses.length === 0 && !showAdd && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>💵</Text>
            <Text style={styles.emptyTitle}>No Expenses</Text>
            <Text style={styles.emptyText}>Tap + Add to track business expenses.</Text>
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
  addBtn: { fontSize: fontSize.md, color: colors.greenDark, fontWeight: '700' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  totalValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  totalCount: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 4 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: spacing.sm },
  input: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text },
  catRow: { flexDirection: 'row', gap: spacing.sm },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  catActive: { backgroundColor: colors.greenDark, borderColor: colors.greenDark },
  catText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  catTextActive: { color: colors.white },
  saveBtn: { backgroundColor: colors.greenDark, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  expenseCard: { marginBottom: spacing.sm },
  expenseTop: { flexDirection: 'row', alignItems: 'center' },
  expenseDesc: { fontSize: fontSize.md, fontWeight: '600' },
  expenseMeta: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },
  expenseAmount: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});
