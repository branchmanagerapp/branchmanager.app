/**
 * AI Assistant Chat Screen
 * Talk to the AI assistant to create quotes, look up clients, schedule jobs
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import {
  sendMessage,
  executeAction,
  getApiKey,
  saveApiKey,
  type AssistantMessage,
  type AssistantAction,
} from '../api/assistant';

const QUICK_PROMPTS = [
  { label: 'Create a quote', prompt: 'Create a quote for ' },
  { label: 'Overdue invoices', prompt: 'What invoices are overdue?' },
  { label: "Today's jobs", prompt: "What jobs are scheduled for today?" },
  { label: 'Schedule a job', prompt: 'Schedule a job for ' },
  { label: 'Look up client', prompt: 'Look up client ' },
  { label: 'Pricing help', prompt: 'What do we charge for ' },
];

export function AssistantScreen({ navigation }: any) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hey Doug. What do you need? I can create quotes, look up clients, check invoices, or schedule jobs.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getApiKey().then(key => setHasKey(!!key));
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: AssistantMessage = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages.filter(m => m.role !== 'system'), userMsg]
        .slice(-10) // Keep last 10 messages for context
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const response = await sendMessage(history);

      const assistantMsg: AssistantMessage = {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: response.text,
        action: response.action,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Auto-execute search actions
      if (response.action?.type === 'search') {
        await handleExecuteAction(response.action, assistantMsg.id);
      }
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: e.message || 'Something went wrong. Try again.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (action: AssistantAction, msgId: string) => {
    try {
      const result = await executeAction(action);
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? { ...m, action: { ...action, status: 'done' as const } }
            : m
        )
      );
      setMessages(prev => [
        ...prev,
        {
          id: 'result-' + Date.now(),
          role: 'assistant',
          content: result,
          timestamp: Date.now(),
        },
      ]);
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: 'Error: ' + (e.message || 'Action failed'),
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleSetupKey = () => {
    Alert.prompt(
      'AI API Key',
      'Enter your AI API key to enable the AI assistant.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (key?: string) => {
            if (key?.trim()) {
              await saveApiKey(key.trim());
              setHasKey(true);
            }
          },
        },
      ],
      'plain-text',
      '',
      'default'
    );
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  if (hasKey === false) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Assistant</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.setupWrap}>
          <Text style={styles.setupIcon}>🤖</Text>
          <Text style={styles.setupTitle}>Set Up AI Assistant</Text>
          <Text style={styles.setupText}>
            Connect your AI API key to enable the AI assistant. It can create quotes, look up
            clients, schedule jobs, and more — just by asking.
          </Text>
          <TouchableOpacity style={styles.setupBtn} onPress={handleSetupKey}>
            <Text style={styles.setupBtnText}>Add API Key</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>AI Assistant</Text>
        <TouchableOpacity onPress={handleSetupKey}>
          <Text style={styles.settingsBtn}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
        >
          {messages.map(msg => (
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  msg.role === 'user' ? styles.userText : styles.assistantText,
                ]}
              >
                {cleanMessageText(msg.content)}
              </Text>

              {/* Action Button */}
              {msg.action && msg.action.status === 'pending' && msg.action.type !== 'search' && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    Alert.alert(
                      'Execute Action',
                      `${getActionLabel(msg.action!)}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Do It', onPress: () => handleExecuteAction(msg.action!, msg.id) },
                      ]
                    );
                  }}
                >
                  <Text style={styles.actionBtnText}>{getActionLabel(msg.action)}</Text>
                </TouchableOpacity>
              )}

              {msg.action?.status === 'done' && (
                <Text style={styles.actionDone}>✓ Done</Text>
              )}
            </View>
          ))}

          {loading && (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <ActivityIndicator size="small" color={colors.greenDark} />
            </View>
          )}
        </ScrollView>

        {/* Quick Prompts */}
        {messages.length <= 2 && !input && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScroll}
            contentContainerStyle={styles.quickContent}
          >
            {QUICK_PROMPTS.map(qp => (
              <TouchableOpacity
                key={qp.label}
                style={styles.quickChip}
                onPress={() => handleQuickPrompt(qp.prompt)}
              >
                <Text style={styles.quickText}>{qp.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask anything..."
            placeholderTextColor={colors.textLight}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function cleanMessageText(text: string): string {
  // Remove JSON code blocks from display
  return text.replace(/```json[\s\S]*?```/g, '').trim();
}

function getActionLabel(action: AssistantAction): string {
  switch (action.type) {
    case 'create_quote': return `Create Quote — $${action.data?.total?.toFixed(2) || '0'}`;
    case 'schedule_job': return `Schedule Job — ${action.data?.date || ''}`;
    case 'create_invoice': return 'Create Invoice';
    case 'lookup_client': return 'Look Up Client';
    default: return 'Execute';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  settingsBtn: { fontSize: 20 },
  messageList: { flex: 1, backgroundColor: colors.bg },
  messageContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  messageBubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.greenDark,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.white,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: { fontSize: fontSize.md, lineHeight: 22 },
  userText: { color: colors.white },
  assistantText: { color: colors.text },
  actionBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  actionBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  actionDone: { color: colors.greenDark, fontWeight: '700', fontSize: fontSize.sm, marginTop: spacing.sm },
  quickScroll: { maxHeight: 50, borderTopWidth: 1, borderTopColor: colors.border },
  quickContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  quickChip: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  quickText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white,
  },
  textInput: {
    flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 15, maxHeight: 100, color: colors.text,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenDark,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: colors.white, fontSize: 20, fontWeight: '800' },
  setupWrap: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxxl,
  },
  setupIcon: { fontSize: 64, marginBottom: spacing.lg },
  setupTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.md },
  setupText: {
    fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 22, marginBottom: spacing.xl,
  },
  setupBtn: {
    backgroundColor: colors.greenDark, paddingVertical: 14,
    paddingHorizontal: spacing.xxxl, borderRadius: radius.md,
  },
  setupBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.lg },
});
