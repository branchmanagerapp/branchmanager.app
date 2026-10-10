import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';

interface MenuItem {
  icon: string;
  label: string;
  desc: string;
  screen?: string;
  ownerOnly?: boolean;
}

const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Pipeline',
    items: [
      { icon: '📥', label: 'Requests', desc: 'Incoming service requests', screen: 'RequestsList' },
      { icon: '📋', label: 'Quotes', desc: 'Estimates & proposals', screen: 'QuotesList' },
      { icon: '🔧', label: 'Jobs', desc: 'Scheduled & active work', screen: 'JobsList' },
      { icon: '🧾', label: 'Invoices', desc: 'Billing & collections', screen: 'InvoicesList' },
      { icon: '💳', label: 'Payments', desc: 'Payment history', screen: 'PaymentsList' },
    ],
  },
  {
    title: 'Team',
    items: [
      { icon: '👥', label: 'Employees', desc: 'Manage team members', screen: 'EmployeeProfile' },
      { icon: '💰', label: 'Payroll', desc: 'Review & submit payroll', screen: 'PayrollReview', ownerOnly: true },
      { icon: '🛡️', label: 'Permissions', desc: 'Role-based access control', ownerOnly: true },
    ],
  },
  {
    title: 'Financial',
    items: [
      { icon: '📊', label: 'Reports', desc: 'Revenue & analytics', screen: 'Reports', ownerOnly: true },
      { icon: '💵', label: 'Expenses', desc: 'Track business expenses', screen: 'Expenses', ownerOnly: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: '🤖', label: 'AI Assistant', desc: 'Ask Claude anything', screen: 'Assistant' },
      { icon: '🎤', label: 'Voice to Quote', desc: 'Describe a job, get a quote', screen: 'VoiceToQuote' },
      { icon: '📋', label: 'Dispatch', desc: 'Assign crew to jobs', screen: 'Dispatch' },
      { icon: '💬', label: 'Messaging', desc: 'SMS & email clients', screen: 'Messaging' },
      { icon: '🔄', label: 'Recurring', desc: 'Recurring jobs & invoices', screen: 'Recurring' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { icon: '⚙️', label: 'Settings', desc: 'App preferences', screen: 'Settings' },
      { icon: '💾', label: 'Backup', desc: 'Data import/export' },
      { icon: '🚪', label: 'Sign Out', desc: 'Log out of your account' },
    ],
  },
];

import { useAuth } from '../hooks/useAuth';

export function MoreScreen({ navigation }: any) {
  const { user, hasPermission, isOwner } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <Avatar name={user?.name || 'User'} size={48} color={colors.greenDark} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileRole}>{user?.role ? user.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
          </View>
        </Card>

        {MENU_SECTIONS.map(section => {
          const visibleItems = section.items.filter(item => !item.ownerOnly || isOwner);
          if (visibleItems.length === 0) return null;
          return (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Card style={styles.menuCard}>
              {visibleItems.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, i < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={async () => {
                    if (item.label === 'Sign Out') {
                      const { signOut } = await import('../api/auth');
                      const { Alert } = await import('react-native');
                      Alert.alert('Sign Out', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); /* App.tsx re-renders to LoginScreen */ } },
                      ]);
                      return;
                    }
                    if (item.screen) navigation?.navigate(item.screen);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuDesc}>{item.desc}</Text>
                  </View>
                  <Text style={styles.menuChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </Card>
          </View>
          );
        })}

        {/* Version */}
        <Text style={styles.version}>Branch Manager v1.0.0</Text>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSize.lg, fontWeight: '800' },
  profileRole: { fontSize: fontSize.sm, color: colors.greenDark, fontWeight: '600', marginTop: 2 },
  profileEmail: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  menuCard: { padding: 0, overflow: 'hidden', marginBottom: spacing.sm },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuIcon: { fontSize: 22 },
  menuText: { flex: 1 },
  menuLabel: { fontSize: fontSize.md, fontWeight: '600' },
  menuDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 1 },
  menuChevron: { fontSize: 22, color: colors.textLight },
  version: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xl,
  },
});
