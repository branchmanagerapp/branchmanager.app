import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../theme';
import { currency } from '../utils/format';
import type { LineItem } from '../models/types';

interface Props {
  item: LineItem;
  index: number;
}

export function LineItemRow({ item, index }: Props) {
  return (
    <View style={[styles.row, index > 0 && styles.border]}>
      <View style={styles.left}>
        <Text style={styles.name}>{item.name}</Text>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
        <Text style={styles.qty}>
          {item.quantity} × {currency(item.unitPrice)}
        </Text>
      </View>
      <Text style={styles.total}>{currency(item.total)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  border: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  left: { flex: 1 },
  name: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  desc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  qty: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },
  total: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
});
