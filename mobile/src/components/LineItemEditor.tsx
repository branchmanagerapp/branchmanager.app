import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { currency } from '../utils/format';
import type { LineItem } from '../models/types';

interface Props {
  item?: LineItem;
  onSave: (item: Omit<LineItem, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}

export function LineItemEditor({ item, onSave, onCancel }: Props) {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || '1');
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice?.toString() || '');

  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(unitPrice) || 0;
  const total = qty * price;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id,
      name: name.trim(),
      description: description.trim(),
      quantity: qty,
      unitPrice: price,
      total,
    });
  };

  return (
    <View style={styles.editor}>
      <Text style={styles.label}>Service / Product</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tree Removal" placeholderTextColor={colors.textLight} />

      <Text style={styles.label}>Description</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Details..." placeholderTextColor={colors.textLight} />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Quantity</Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="1" placeholderTextColor={colors.textLight} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Unit Price</Text>
          <TextInput style={styles.input} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textLight} />
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Line Total</Text>
        <Text style={styles.totalValue}>{currency(total)}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>{item ? 'Update' : 'Add Item'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { padding: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: spacing.md },
  input: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.text, backgroundColor: colors.white,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 2, borderTopColor: colors.border,
  },
  totalLabel: { fontSize: fontSize.lg, fontWeight: '700' },
  totalValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.greenDark },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelText: { fontWeight: '600', color: colors.textSecondary },
  saveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.greenDark, alignItems: 'center',
  },
  saveText: { fontWeight: '700', color: colors.white },
});
