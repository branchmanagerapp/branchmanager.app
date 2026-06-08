import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { reconstructDay, writeVerifiedDay, type DaySpan } from '../tracking/dayHours';
import { setHandledVerify } from '../tracking/trackingStore';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function fmtDate(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function VerifyHoursScreen({ navigation, route }: any) {
  const dateArg: string | undefined = route?.params?.date;
  const [span, setSpan] = useState<DaySpan | null>(null);
  const [hours, setHours] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    reconstructDay(dateArg)
      .then((s) => {
        setSpan(s);
        setHours(s.hours ? String(s.hours) : '');
      })
      .finally(() => setLoading(false));
  }, [dateArg]);

  const dismiss = async () => {
    if (span) await setHandledVerify(span.date);
    navigation?.goBack();
  };

  const confirm = async () => {
    if (!span) return;
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0 || h > 24) {
      Alert.alert('Check hours', 'Enter a number of hours between 0 and 24.');
      return;
    }
    setSaving(true);
    const res = await writeVerifiedDay({
      date: span.date,
      clockIn: span.clockIn,
      clockOut: span.clockOut,
      hours: h,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Could not save', res.reason || 'Try again.');
      return;
    }
    await setHandledVerify(span.date);
    Alert.alert('Saved', `${h} hours logged for ${fmtDate(span.date)}.`);
    navigation?.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.greenDark} />
      </SafeAreaView>
    );
  }

  const noData = !span || span.awayFixes === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Verify Hours</Text>
        <Text style={styles.headerDate}>{span ? fmtDate(span.date) : ''}</Text>
      </View>

      <View style={styles.content}>
        {noData ? (
          <Card>
            <Text style={styles.bigLabel}>No work tracked today</Text>
            <Text style={styles.sub}>
              We didn’t see any location away from your yard today. If you worked, you can still add hours
              manually from the Timesheet.
            </Text>
          </Card>
        ) : (
          <Card>
            <Text style={styles.bigLabel}>Here’s what we tracked</Text>
            <View style={styles.row}>
              <Text style={styles.k}>Started</Text>
              <Text style={styles.v}>{fmtTime(span!.clockIn)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.k}>Ended</Text>
              <Text style={styles.v}>{fmtTime(span!.clockOut)}</Text>
            </View>
            <View style={[styles.row, styles.rowLast]}>
              <Text style={styles.k}>Hours</Text>
              <TextInput
                style={styles.hoursInput}
                value={hours}
                onChangeText={setHours}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
            <Text style={styles.sub}>
              Estimated from {span!.fixes} location points. Edit the hours if this is off, then confirm.
            </Text>
          </Card>
        )}

        {!noData && (
          <TouchableOpacity style={styles.confirmBtn} onPress={confirm} disabled={saving}>
            <Text style={styles.confirmText}>{saving ? 'Saving…' : 'Confirm hours'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.dismissBtn} onPress={dismiss}>
          <Text style={styles.dismissText}>{noData ? 'Close' : 'Not a work day'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  headerDate: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.lg },
  bigLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  rowLast: { borderBottomWidth: 0 },
  k: { fontSize: fontSize.md, color: colors.textSecondary },
  v: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  hoursInput: { minWidth: 80, textAlign: 'right', fontSize: 22, fontWeight: '800', color: colors.greenDark, borderBottomWidth: 2, borderBottomColor: colors.greenDark, paddingVertical: 2 },
  sub: { fontSize: fontSize.xs, color: colors.textLight, marginTop: spacing.md, lineHeight: 17 },
  confirmBtn: { backgroundColor: colors.greenDark, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.xl },
  confirmText: { color: colors.white, fontWeight: '800', fontSize: fontSize.md },
  dismissBtn: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  dismissText: { color: colors.textSecondary, fontWeight: '600' },
});
