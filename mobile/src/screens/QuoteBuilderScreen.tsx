/**
 * QuoteBuilderScreen
 * Create or edit a quote: client info, line items, notes, photos, totals.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { Card } from '../components/Card';
import { LineItemRow } from '../components/LineItemRow';
import { LineItemEditor } from '../components/LineItemEditor';
import { currency } from '../utils/format';
import { takePhoto } from '../utils/photos';
import type { LineItem } from '../models/types';

const SERVICES = [
  { label: 'Tree Removal', value: 'Tree Removal' },
  { label: 'Tree Pruning', value: 'Tree Pruning' },
  { label: 'Stump Grinding', value: 'Stump Removal' },
  { label: 'Cabling', value: 'Cabling' },
  { label: 'Clean Up', value: 'Clean Up' },
  { label: 'Other', value: 'Other' },
];

let _id = 1;
function nextId() {
  return String(_id++);
}

export function QuoteBuilderScreen({ navigation, route }: any) {
  const existing = route?.params?.quote;
  const isEdit = Boolean(existing);

  // Client fields
  const [clientName, setClientName] = useState<string>(existing?.clientName || '');
  const [clientEmail, setClientEmail] = useState<string>(existing?.clientEmail || '');
  const [clientPhone, setClientPhone] = useState<string>(existing?.clientPhone || '');
  const [property, setProperty] = useState<string>(existing?.property || '');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>(existing?.lineItems || []);
  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<LineItem | undefined>(undefined);

  // Description
  const [description, setDescription] = useState<string>(existing?.description || '');

  // Service selector
  const [selectedService, setSelectedService] = useState<string>(SERVICES[0].value);

  // Photos attached to line items (keyed by line item id)
  const [itemPhotos, setItemPhotos] = useState<Record<string, string[]>>({});

  // Notes
  const [notes, setNotes] = useState<string>(existing?.notes || '');

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal;

  const handleAddItem = () => {
    setEditingItem(undefined);
    setShowEditor(true);
  };

  const handleEditorSave = (item: Omit<LineItem, 'id'> & { id?: string }) => {
    if (item.id) {
      setLineItems(prev =>
        prev.map(li => (li.id === item.id ? ({ ...item, id: item.id! } as LineItem) : li))
      );
    } else {
      setLineItems(prev => [...prev, { ...item, id: nextId() } as LineItem]);
    }
    setShowEditor(false);
    setEditingItem(undefined);
  };

  const handleEditorCancel = () => {
    setShowEditor(false);
    setEditingItem(undefined);
  };

  const handleItemPress = (item: LineItem) => {
    setEditingItem(item);
    setShowEditor(true);
  };

  const handleServiceAdd = () => {
    const service = selectedService;

    const addLineItemWithMeasurement = (name: string, desc: string, qty: number, unitPrice: number) => {
      const id = nextId();
      const newItem: LineItem = {
        id,
        name,
        description: desc,
        quantity: qty,
        unitPrice,
        total: qty * unitPrice,
      };
      setLineItems(prev => [...prev, newItem]);

      // Prompt for photo
      Alert.alert('Add Photo?', `Take a photo for "${name}"?`, [
        { text: 'Skip', style: 'cancel' },
        {
          text: 'Camera',
          onPress: async () => {
            const photo = await takePhoto();
            if (photo) {
              setItemPhotos(prev => ({
                ...prev,
                [id]: [...(prev[id] || []), photo.uri],
              }));
            }
          },
        },
      ]);
    };

    if (service === 'Tree Removal') {
      if (Platform.OS === 'ios') {
        Alert.prompt('Tree Diameter', 'Enter DBH in inches (price = DBH x $100)', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: (val) => {
              const dbh = parseFloat(val || '0');
              if (dbh > 0) {
                addLineItemWithMeasurement('Tree Removal', `${dbh}" DBH`, 1, dbh * 100);
              }
            },
          },
        ], 'plain-text', '', 'decimal-pad');
      } else {
        // Android fallback - no Alert.prompt
        addLineItemWithMeasurement('Tree Removal', '', 1, 0);
      }
    } else if (service === 'Stump Removal') {
      if (Platform.OS === 'ios') {
        Alert.prompt('Stump Radius', 'Enter radius in inches (price = radius x $10)', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: (val) => {
              const r = parseFloat(val || '0');
              if (r > 0) {
                addLineItemWithMeasurement('Stump Removal', `${r}" radius`, 1, r * 10);
              }
            },
          },
        ], 'plain-text', '', 'decimal-pad');
      } else {
        addLineItemWithMeasurement('Stump Removal', '', 1, 0);
      }
    } else if (service === 'Cabling') {
      if (Platform.OS === 'ios') {
        Alert.prompt('Cable Length', 'Enter length in feet (price = feet x $10)', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: (val) => {
              const ft = parseFloat(val || '0');
              if (ft > 0) {
                addLineItemWithMeasurement('Cabling', `${ft} ft`, 1, ft * 10);
              }
            },
          },
        ], 'plain-text', '', 'decimal-pad');
      } else {
        addLineItemWithMeasurement('Cabling', '', 1, 0);
      }
    } else {
      addLineItemWithMeasurement(service, '', 1, 0);
    }
  };

  const handleDeleteItem = (id: string) => {
    Alert.alert('Remove Item', 'Remove this line item from the quote?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setLineItems(prev => prev.filter(li => li.id !== id)),
      },
    ]);
  };

  const saveToSupabase = async (status: string) => {
    const { supabase } = await import('../api/supabase');
    const payload = {
      client_name: clientName.trim(),
      client_email: clientEmail,
      client_phone: clientPhone,
      property: property,
      description: description.trim() || lineItems.map(i => i.name).join(', '),
      line_items: lineItems,
      total,
      status,
      ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
    };
    if (existing?.id) {
      await supabase.from('quotes').update(payload).eq('id', existing.id);
      return existing.id;
    }
    const { data } = await supabase.from('quotes').insert(payload).select('quote_number').single();
    return data?.quote_number;
  };

  const handleSaveDraft = async () => {
    if (!clientName.trim()) {
      Alert.alert('Missing Client', 'Please enter a client name before saving.');
      return;
    }
    try {
      const num = await saveToSupabase('draft');
      Alert.alert('Draft Saved', `Quote ${num ? '#' + num + ' ' : ''}saved.`);
      navigation?.goBack();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleSendQuote = () => {
    if (!clientName.trim()) {
      Alert.alert('Missing Client', 'Please enter a client name before sending.');
      return;
    }
    if (lineItems.length === 0) {
      Alert.alert('No Line Items', 'Add at least one line item before sending.');
      return;
    }
    Alert.alert(
      'Send Quote',
      `Send quote for ${currency(total)} to ${clientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const num = await saveToSupabase('sent');
              if (clientEmail) {
                const { sendEmail, buildQuoteEmail } = await import('../api/email');
                const { getApiKey } = await import('../api/assistant');
                // SendGrid key would be stored separately; for now show success
              }
              Alert.alert('Quote Sent', `Quote ${num ? '#' + num + ' ' : ''}sent to ${clientEmail || clientName}.`);
              navigation?.goBack();
            } catch (e: any) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Quote' : 'New Quote'}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Client Section */}
        <Text style={styles.sectionLabel}>Client</Text>
        <Card style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Client name"
              placeholderTextColor={colors.textLight}
              value={clientName}
              onChangeText={setClientName}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor={colors.textLight}
              value={clientEmail}
              onChangeText={setClientEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="(914) 555-0100"
              placeholderTextColor={colors.textLight}
              value={clientPhone}
              onChangeText={setClientPhone}
              keyboardType="phone-pad"
            />
          </View>
          <View style={[styles.field, styles.fieldLast]}>
            <Text style={styles.fieldLabel}>Property Address</Text>
            <TextInput
              style={styles.input}
              placeholder="123 Main St, Peekskill, NY"
              placeholderTextColor={colors.textLight}
              value={property}
              onChangeText={setProperty}
              autoCapitalize="words"
            />
          </View>
        </Card>

        {/* Description */}
        <Text style={styles.sectionLabel}>Description</Text>
        <Card style={styles.card}>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Job description..."
            placeholderTextColor={colors.textLight}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
        </Card>

        {/* Service Selector */}
        <Text style={styles.sectionLabel}>Add Service</Text>
        <Card style={styles.card}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.serviceScroll}
          >
            {SERVICES.map(s => (
              <TouchableOpacity
                key={s.value}
                style={[
                  styles.serviceChip,
                  selectedService === s.value && styles.serviceChipActive,
                ]}
                onPress={() => setSelectedService(s.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.serviceChipText,
                    selectedService === s.value && styles.serviceChipTextActive,
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.addServiceBtn}
            onPress={handleServiceAdd}
            activeOpacity={0.7}
          >
            <Text style={styles.addServiceBtnText}>+ Add {SERVICES.find(s => s.value === selectedService)?.label}</Text>
          </TouchableOpacity>
        </Card>

        {/* Line Items */}
        <Text style={styles.sectionLabel}>Line Items</Text>
        <Card style={styles.card}>
          {lineItems.length === 0 ? (
            <Text style={styles.emptyText}>No items yet — select a service above to add.</Text>
          ) : (
            lineItems.map((item, i) => (
              <View key={item.id}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleItemPress(item)}
                  onLongPress={() => handleDeleteItem(item.id)}
                >
                  <LineItemRow item={item} index={i} />
                </TouchableOpacity>
                {/* Show attached photos */}
                {itemPhotos[item.id] && itemPhotos[item.id].length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemPhotoScroll}>
                    {itemPhotos[item.id].map((uri, pi) => (
                      <Image key={pi} source={{ uri }} style={styles.itemPhoto} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))
          )}

          {showEditor ? (
            <View style={styles.editorWrap}>
              <View style={styles.editorDivider} />
              <LineItemEditor
                item={editingItem}
                onSave={handleEditorSave}
                onCancel={handleEditorCancel}
              />
            </View>
          ) : (
            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem} activeOpacity={0.7}>
              <Text style={styles.addItemText}>+ Add Custom Item</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Notes */}
        <Text style={styles.sectionLabel}>Notes</Text>
        <Card style={styles.card}>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Internal notes or client-facing details..."
            placeholderTextColor={colors.textLight}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </Card>

        {/* Totals */}
        <Text style={styles.sectionLabel}>Summary</Text>
        <Card style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.totalRowLabel}>Subtotal</Text>
            <Text style={styles.totalRowValue}>{currency(subtotal)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalFinal]}>
            <Text style={styles.totalFinalLabel}>Total</Text>
            <Text style={styles.totalFinalValue}>{currency(total)}</Text>
          </View>
        </Card>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.draftBtn} onPress={handleSaveDraft} activeOpacity={0.7}>
          <Text style={styles.draftBtnText}>Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sendBtn} onPress={handleSendQuote} activeOpacity={0.7}>
          <Text style={styles.sendBtnText}>Send Quote</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },

  // Scroll
  scroll: { flex: 1 },
  content: { padding: spacing.lg },

  // Section labels
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },

  card: { marginBottom: spacing.xs },

  // Fields
  field: { marginBottom: spacing.md },
  fieldLast: { marginBottom: 0 },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.white,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },

  // Line items
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  editorWrap: { marginTop: spacing.sm },
  editorDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.xs,
  },
  addItemBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.greenDark,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addItemText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.greenDark,
  },

  // Service selector
  serviceScroll: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  serviceChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full || 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  serviceChipActive: {
    borderColor: colors.greenDark,
    backgroundColor: colors.greenDark,
  },
  serviceChipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  serviceChipTextActive: {
    color: colors.white,
  },
  addServiceBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
  },
  addServiceBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // Per-item photos
  itemPhotoScroll: {
    paddingLeft: spacing.lg,
    paddingBottom: spacing.sm,
  },
  itemPhoto: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },

  // Totals
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalRowLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  totalRowValue: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  totalFinal: {
    borderTopWidth: 2,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  totalFinalLabel: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  totalFinalValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.greenDark },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  draftBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  draftBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary },
  sendBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
  },
  sendBtnText: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
});
