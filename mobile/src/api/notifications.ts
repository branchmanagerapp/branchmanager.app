/**
 * Push Notifications — Expo Notifications
 * Handles registration, token storage, and local/remote notifications
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const TOKEN_KEY = 'bm-push-token';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Registration ──

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Get Expo push token
  // Use Constants.expoConfig.extra.eas.projectId in production
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: undefined as any, // Auto-resolved from app.json in EAS builds
  });
  const token = tokenData.data;

  // Store locally
  await AsyncStorage.setItem(TOKEN_KEY, token);

  // Store in Supabase for server-side sending
  const userId = await AsyncStorage.getItem('bm-mobile-session');
  if (userId) {
    const session = JSON.parse(userId);
    try {
      await supabase
        .from('push_tokens')
        .upsert({ user_id: session.id, token, platform: Platform.OS, updated_at: new Date().toISOString() });
    } catch (_) {
      // Table may not exist yet
    }
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Branch Manager',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1b5e20',
    });
  }

  return token;
}

// ── Local Notifications ──

export async function scheduleVisitReminder(
  jobId: string,
  clientName: string,
  address: string,
  scheduledTime: Date
) {
  // Reminder 1 hour before
  const oneHourBefore = new Date(scheduledTime.getTime() - 60 * 60 * 1000);
  if (oneHourBefore > new Date()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Upcoming Job',
        body: `${clientName} at ${address} in 1 hour`,
        data: { type: 'job_reminder', jobId },
        sound: true,
      },
      trigger: { type: 'date', date: oneHourBefore } as any,
    });
  }
}

export async function sendClockReminder() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Clock In Reminder',
      body: 'Don\'t forget to clock in for today\'s jobs',
      data: { type: 'clock_reminder' },
      sound: true,
    },
    trigger: null, // Send immediately
  });
}

export async function sendInvoiceOverdueNotification(clientName: string, invoiceNum: number, amount: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Invoice Overdue',
      body: `Invoice #${invoiceNum} for ${clientName} — $${amount.toFixed(2)} is overdue`,
      data: { type: 'invoice_overdue', invoiceNum },
      sound: true,
    },
    trigger: null,
  });
}

export async function sendQuoteFollowUpNotification(clientName: string, quoteNum: number, daysSent: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Quote Follow-up',
      body: `Quote #${quoteNum} for ${clientName} sent ${daysSent} days ago — follow up?`,
      data: { type: 'quote_followup', quoteNum },
      sound: true,
    },
    trigger: null,
  });
}

// ── Notification Listeners ──

export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

// ── Badge ──

export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge() {
  await Notifications.setBadgeCountAsync(0);
}
