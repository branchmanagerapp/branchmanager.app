import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, FlatList, Linking,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Avatar } from '../components/Avatar';
import { supabase } from '../api/supabase';

interface Thread {
  id: string;
  clientName: string;
  lastMessage: string;
  lastAt: string;
  unread: boolean;
  phone?: string;
  email?: string;
}

export function MessagingScreen({ navigation }: any) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ id: string; from: string; text: string; time: string }[]>([]);

  useEffect(() => {
    // Load recent client communications
    supabase.from('clients').select('id, name, phone, email').order('updated_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        setThreads((data || []).map((c: any) => ({
          id: c.id, clientName: c.name, lastMessage: '', lastAt: '', unread: false,
          phone: c.phone, email: c.email,
        })));
      });
  }, []);

  const handleSendSMS = () => {
    if (!selected?.phone || !message.trim()) return;
    Linking.openURL(`sms:${selected.phone.replace(/\D/g, '')}&body=${encodeURIComponent(message)}`);
    setMessage('');
  };

  const handleSendEmail = () => {
    if (!selected?.email || !message.trim()) return;
    Linking.openURL(`mailto:${selected.email}?subject=Second Nature Tree Service&body=${encodeURIComponent(message)}`);
    setMessage('');
  };

  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selected.clientName}</Text>
          <View style={styles.headerActions}>
            {selected.phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${selected.phone!.replace(/\D/g, '')}`)}>
                <Text style={styles.actionIcon}>📞</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent}>
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatIcon}>💬</Text>
            <Text style={styles.emptyChatText}>Start a conversation with {selected.clientName}</Text>
          </View>
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.chatInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Type a message..."
            placeholderTextColor={colors.textLight}
            multiline
          />
          <View style={styles.sendButtons}>
            {selected.phone && (
              <TouchableOpacity style={styles.smsBtn} onPress={handleSendSMS}>
                <Text style={styles.sendBtnText}>SMS</Text>
              </TouchableOpacity>
            )}
            {selected.email && (
              <TouchableOpacity style={styles.emailBtn} onPress={handleSendEmail}>
                <Text style={styles.sendBtnText}>Email</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        data={threads}
        keyExtractor={t => t.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.threadRow} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <Avatar name={item.clientName} size={44} />
            <View style={styles.threadInfo}>
              <Text style={[styles.threadName, item.unread && styles.threadNameUnread]}>{item.clientName}</Text>
              <Text style={styles.threadPreview} numberOfLines={1}>
                {item.phone || item.email || 'No contact info'}
              </Text>
            </View>
            <View style={styles.threadMeta}>
              {item.phone && <Text style={styles.contactTag}>SMS</Text>}
              {item.email && <Text style={styles.contactTag}>Email</Text>}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No Conversations</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: spacing.md },
  actionIcon: { fontSize: 20 },
  list: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: spacing.lg },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  threadInfo: { flex: 1 },
  threadName: { fontSize: fontSize.md, fontWeight: '600' },
  threadNameUnread: { fontWeight: '800' },
  threadPreview: { fontSize: fontSize.sm, color: colors.textLight, marginTop: 2 },
  threadMeta: { flexDirection: 'row', gap: 4 },
  contactTag: { fontSize: fontSize.xs, fontWeight: '600', color: colors.accent, backgroundColor: colors.blueBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chatArea: { flex: 1, backgroundColor: colors.bg },
  chatContent: { padding: spacing.lg },
  emptyChat: { alignItems: 'center', paddingVertical: 60 },
  emptyChatIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyChatText: { fontSize: fontSize.md, color: colors.textLight, textAlign: 'center' },
  inputBar: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, backgroundColor: colors.white },
  chatInput: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.text, maxHeight: 100, marginBottom: spacing.sm },
  sendButtons: { flexDirection: 'row', gap: spacing.sm },
  smsBtn: { flex: 1, backgroundColor: colors.greenDark, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
  emailBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
  sendBtnText: { color: colors.white, fontWeight: '700' },
  emptyList: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textLight },
});
