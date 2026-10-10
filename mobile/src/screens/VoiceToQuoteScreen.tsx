/**
 * Voice-to-Quote Screen
 * Record voice notes on-site, transcribe, and generate quote line items
 * Uses device speech recognition + AI parsing
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { currency } from '../utils/format';

interface LineItem {
  id: string;
  name: string;
  description: string;
  qty: number;
  rate: number;
  total: number;
}

// Service catalog with default rates (matches web app)
const SERVICE_CATALOG: Record<string, number> = {
  'tree removal': 0,
  'tree pruning': 0,
  'stump removal': 0,
  'stump grinding': 0,
  'bucket truck': 150,
  'cabling': 0,
  'land clearing': 0,
  'snow removal': 0,
  'spring clean up': 0,
  'gutter clean out': 0,
  'haul debris': 0,
  'labor': 50,
  'arborist letter': 250,
  'firewood cord': 375,
  'firewood bundle': 10,
  'chipping brush': 0,
};

export function VoiceToQuoteScreen({ navigation, route }: any) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [clientName, setClientName] = useState(route?.params?.clientName || '');
  const [property, setProperty] = useState(route?.params?.property || '');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startRecording = () => {
    setIsRecording(true);
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // In production: use expo-speech or react-native-voice
    // For now, simulate recording
  };

  const stopRecording = () => {
    setIsRecording(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);

    // Simulate transcription result
    if (!transcript) {
      setTranscript(
        'Two large oaks need removal in the backyard, about 24 inch DBH each. ' +
        'One is leaning toward the house, need bucket truck for that one. ' +
        'Three stumps to grind. Haul all debris. Estimate 2 days with 3-man crew.'
      );
    }
  };

  const parseTranscript = () => {
    if (!transcript.trim()) return;

    const items: LineItem[] = [];
    const text = transcript.toLowerCase();

    // Parse tree removal mentions
    const treeMatch = text.match(/(\d+)\s*(large\s+)?(oak|maple|ash|tree|elm|pine|spruce)s?\s*(need\s+)?removal/i);
    if (treeMatch) {
      const count = parseInt(treeMatch[1]) || 1;
      const dbhMatch = text.match(/(\d+)\s*inch\s*dbh/i);
      const dbh = dbhMatch ? parseInt(dbhMatch[1]) : 18;
      const perTree = dbh * 100; // $100 per inch DBH
      items.push({
        id: 'tr-' + Date.now(),
        name: 'Tree Removal',
        description: `${count}x ${dbh}" DBH ${treeMatch[3] || 'tree'}`,
        qty: count,
        rate: perTree,
        total: count * perTree,
      });
    }

    // Bucket truck
    if (text.includes('bucket truck') || text.includes('bucket')) {
      items.push({
        id: 'bt-' + Date.now(),
        name: 'Bucket Truck',
        description: 'Bucket truck with operator',
        qty: 1,
        rate: 600,
        total: 600,
      });
    }

    // Stump grinding
    const stumpMatch = text.match(/(\d+)\s*stumps?\s*(to\s+)?(grind|removal|grinding)/i);
    if (stumpMatch) {
      const count = parseInt(stumpMatch[1]) || 1;
      items.push({
        id: 'sg-' + Date.now(),
        name: 'Stump Grinding',
        description: `${count} stump${count > 1 ? 's' : ''}`,
        qty: count,
        rate: 150,
        total: count * 150,
      });
    }

    // Haul debris
    if (text.includes('haul') || text.includes('debris') || text.includes('cleanup')) {
      items.push({
        id: 'hd-' + Date.now(),
        name: 'Haul Debris',
        description: 'Haul all debris from site',
        qty: 1,
        rate: 350,
        total: 350,
      });
    }

    // Labor/crew
    const crewMatch = text.match(/(\d+)[- ]?(man|person|crew)/i);
    const dayMatch = text.match(/(\d+)\s*days?/i);
    if (crewMatch && dayMatch) {
      const crew = parseInt(crewMatch[1]) || 2;
      const days = parseInt(dayMatch[1]) || 1;
      const hours = days * 8;
      items.push({
        id: 'lb-' + Date.now(),
        name: 'Labor',
        description: `${crew}-person crew x ${days} day${days > 1 ? 's' : ''} (${hours}hrs)`,
        qty: hours * crew,
        rate: 50,
        total: hours * crew * 50,
      });
    }

    if (items.length === 0) {
      Alert.alert('No items parsed', 'Try describing specific services like tree removal, stump grinding, or labor hours.');
      return;
    }

    setLineItems(items);
  };

  const total = lineItems.reduce((s, i) => s + i.total, 0);

  const createQuote = () => {
    Alert.alert(
      'Create Quote',
      `Create quote for ${clientName || 'new client'} totaling ${currency(total)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: () => {
            // In production: POST to Supabase quotes table
            Alert.alert('Quote Created', `Quote for ${currency(total)} saved.`);
            navigation?.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice to Quote</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Client Info */}
        <Card>
          <View style={styles.field}>
            <Text style={styles.label}>Client</Text>
            <TextInput
              style={styles.input}
              placeholder="Client name"
              placeholderTextColor={colors.textLight}
              value={clientName}
              onChangeText={setClientName}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Property</Text>
            <TextInput
              style={styles.input}
              placeholder="Property address"
              placeholderTextColor={colors.textLight}
              value={property}
              onChangeText={setProperty}
            />
          </View>
        </Card>

        {/* Voice Recording */}
        <View style={styles.recordSection}>
          <Animated.View style={[styles.recordOuter, { transform: [{ scale: isRecording ? pulseAnim : 1 }] }]}>
            <TouchableOpacity
              style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.7}
            >
              <Text style={styles.recordIcon}>{isRecording ? '⏹' : '🎤'}</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.recordLabel}>
            {isRecording ? 'Recording... Tap to stop' : 'Tap to describe the job'}
          </Text>
          <Text style={styles.recordHint}>
            Example: "Two oaks need removal, 24 inch DBH, bucket truck needed, three stumps to grind"
          </Text>
        </View>

        {/* Transcript */}
        {transcript.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Transcript</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              multiline
              value={transcript}
              onChangeText={setTranscript}
            />
            <TouchableOpacity style={styles.parseBtn} onPress={parseTranscript}>
              <Text style={styles.parseBtnText}>Parse into Line Items</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Line Items */}
        {lineItems.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Quote Line Items</Text>
            {lineItems.map((item, i) => (
              <View key={item.id} style={[styles.lineItem, i < lineItems.length - 1 && styles.lineItemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemTotal}>{currency(item.total)}</Text>
                  <Text style={styles.itemRate}>
                    {item.qty} x {currency(item.rate)}
                  </Text>
                </View>
              </View>
            ))}

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{currency(total)}</Text>
            </View>

            <TouchableOpacity style={styles.createBtn} onPress={createQuote}>
              <Text style={styles.createBtnText}>Create Quote — {currency(total)}</Text>
            </TouchableOpacity>
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  field: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    backgroundColor: colors.white,
    color: colors.text,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  recordSection: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  recordOuter: {
    marginBottom: spacing.lg,
  },
  recordBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  recordBtnActive: {
    backgroundColor: colors.red,
  },
  recordIcon: {
    fontSize: 40,
  },
  recordLabel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  recordHint: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  parseBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  parseBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  lineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemName: { fontSize: fontSize.md, fontWeight: '600' },
  itemDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemTotal: { fontSize: fontSize.md, fontWeight: '700' },
  itemRate: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  totalLabel: { fontSize: fontSize.lg, fontWeight: '800' },
  totalValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.greenDark },
  createBtn: {
    backgroundColor: colors.greenDark,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  createBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
});
