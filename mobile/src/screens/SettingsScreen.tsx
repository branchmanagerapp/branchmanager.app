import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Alert, Switch,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveApiKey, getApiKey } from '../api/assistant';
import { saveGustoConfig, getGustoConfig, disconnectGusto } from '../api/gusto';
import { getQueue, syncQueue, clearQueue } from '../utils/offline';
import { startTracking, stopTracking, isTrackingEnabled, setBaseToCurrentLocation } from '../tracking/locationTracker';
import { getBase } from '../tracking/trackingStore';
import { useAuth } from '../hooks/useAuth';

export function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [claudeKey, setClaudeKey] = useState('');
  const [gustoKey, setGustoKey] = useState('');
  const [gustoCompanyId, setGustoCompanyId] = useState('');
  const [offlineCount, setOfflineCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [trackEnabled, setTrackEnabled] = useState(false);
  const [baseSet, setBaseSet] = useState(false);

  useEffect(() => {
    getApiKey().then(k => setClaudeKey(k || ''));
    getGustoConfig().then(c => {
      if (c) { setGustoKey(c.apiKey || ''); setGustoCompanyId(c.companyId || ''); }
    });
    getQueue().then(q => setOfflineCount(q.length));
    isTrackingEnabled().then(setTrackEnabled);
    getBase().then(b => setBaseSet(!!b));
  }, []);

  const handleSetBase = async () => {
    const res = await setBaseToCurrentLocation('Yard');
    if (res.ok) { setBaseSet(true); Alert.alert('Yard set', 'This spot is now your yard. End-of-day hour checks will use it.'); }
    else Alert.alert('Location', res.reason || 'Could not set yard location.');
  };

  const handleToggleTracking = async (on: boolean) => {
    if (on) {
      if (!user?.id) { Alert.alert('Sign in required', 'Log in with your Branch Manager account to enable tracking.'); return; }
      setTrackEnabled(true); // optimistic
      const res = await startTracking({ id: user.id, name: user.name || 'Owner', role: user.role || 'owner' });
      if (!res.ok) {
        setTrackEnabled(false);
        Alert.alert('Location', res.reason || 'Could not start tracking.');
        return;
      }
      Alert.alert('Tracking on', 'Your work location is now logged in the background — even when the app is closed.');
    } else {
      await stopTracking();
      setTrackEnabled(false);
    }
  };

  const handleSaveClaude = async () => {
    await saveApiKey(claudeKey.trim());
    Alert.alert('Saved', 'AI API key updated.');
  };

  const handleSaveGusto = async () => {
    await saveGustoConfig({ apiKey: gustoKey.trim(), companyId: gustoCompanyId.trim(), connected: !!gustoKey.trim() });
    Alert.alert('Saved', gustoKey.trim() ? 'Gusto connected.' : 'Gusto disconnected.');
  };

  const handleSyncOffline = async () => {
    const result = await syncQueue();
    setOfflineCount((await getQueue()).length);
    Alert.alert('Sync Complete', `${result.synced} synced, ${result.failed} failed.`);
  };

  const handleClearOffline = async () => {
    Alert.alert('Clear Queue', 'Delete all queued offline actions?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await clearQueue(); setOfflineCount(0); } },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Card>
          <SettingRow label="Email" value={user?.email || '—'} />
          <SettingRow label="Role" value={user?.role || '—'} />
          <SettingRow label="Name" value={user?.name || '—'} last />
        </Card>

        {/* AI Assistant */}
        <Text style={styles.sectionTitle}>AI Assistant</Text>
        <Card>
          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={claudeKey}
            onChangeText={setClaudeKey}
            placeholder="sk-ant-..."
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            secureTextEntry
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveClaude}>
            <Text style={styles.saveBtnText}>Save API Key</Text>
          </TouchableOpacity>
        </Card>

        {/* Gusto */}
        <Text style={styles.sectionTitle}>Gusto Payroll</Text>
        <Card>
          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput style={styles.input} value={gustoKey} onChangeText={setGustoKey} placeholder="Gusto API key" placeholderTextColor={colors.textLight} autoCapitalize="none" secureTextEntry />
          <Text style={styles.fieldLabel}>Company ID</Text>
          <TextInput style={styles.input} value={gustoCompanyId} onChangeText={setGustoCompanyId} placeholder="Company ID" placeholderTextColor={colors.textLight} autoCapitalize="none" />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGusto}>
            <Text style={styles.saveBtnText}>{gustoKey ? 'Update Gusto' : 'Connect Gusto'}</Text>
          </TouchableOpacity>
        </Card>

        {/* Offline */}
        <Text style={styles.sectionTitle}>Offline Queue</Text>
        <Card>
          <SettingRow label="Queued actions" value={offlineCount.toString()} />
          <View style={styles.offlineActions}>
            <TouchableOpacity style={styles.syncBtn} onPress={handleSyncOffline}>
              <Text style={styles.syncBtnText}>Sync Now</Text>
            </TouchableOpacity>
            {offlineCount > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={handleClearOffline}>
                <Text style={styles.clearBtnText}>Clear Queue</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        {/* Location Tracking */}
        <Text style={styles.sectionTitle}>Location Tracking</Text>
        <Card>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Track my location</Text>
            <Switch value={trackEnabled} onValueChange={handleToggleTracking} trackColor={{ true: colors.greenDark }} />
          </View>
          <Text style={styles.trackNote}>
            Logs where you are in the background so your work days are recorded automatically — even when
            you forget to clock in. Requires Location set to “Always.” You can turn this off anytime.
          </Text>
          <View style={styles.baseRow}>
            <Text style={styles.switchLabel}>Yard location {baseSet ? '✓' : ''}</Text>
            <TouchableOpacity style={styles.baseBtn} onPress={handleSetBase}>
              <Text style={styles.baseBtnText}>{baseSet ? 'Update to here' : 'Set to here'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.trackNote}>
            At day’s end, when you leave the yard for home, you’ll get one prompt to confirm the hours we tracked.
          </Text>
        </Card>

        {/* Notifications */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Card>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Push Notifications</Text>
            <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ true: colors.greenDark }} />
          </View>
        </Card>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Branch Manager v1.0.0</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[rowStyles.row, !last && rowStyles.border]}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
  border: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  label: { fontSize: fontSize.md, color: colors.textSecondary },
  value: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: spacing.sm },
  input: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text },
  saveBtn: { backgroundColor: colors.greenDark, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  saveBtnText: { color: colors.white, fontWeight: '700' },
  offlineActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  syncBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
  syncBtnText: { color: colors.white, fontWeight: '600' },
  clearBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.red },
  clearBtnText: { color: colors.red, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  switchLabel: { fontSize: fontSize.md },
  trackNote: { fontSize: fontSize.xs, color: colors.textLight, marginTop: spacing.xs, lineHeight: 17 },
  baseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  baseBtn: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
  baseBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  signOutBtn: { backgroundColor: colors.redBg, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.xl, borderWidth: 1, borderColor: colors.red },
  signOutText: { color: colors.red, fontWeight: '700', fontSize: fontSize.md },
  version: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textLight, marginTop: spacing.lg },
});
