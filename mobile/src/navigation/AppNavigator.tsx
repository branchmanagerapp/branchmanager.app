import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabs } from './BottomTabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { ClientDetailScreen } from '../screens/ClientDetailScreen';
import { RequestDetailScreen } from '../screens/RequestDetailScreen';
import { CreateClientScreen } from '../screens/CreateClientScreen';
import { CreateRequestScreen } from '../screens/CreateRequestScreen';
import { CreateJobScreen } from '../screens/CreateJobScreen';
import { EmployeeProfileScreen } from '../screens/EmployeeProfileScreen';
import { PayrollReviewScreen } from '../screens/PayrollReviewScreen';
import { PayrollConfirmScreen } from '../screens/PayrollConfirmScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { QuoteBuilderScreen } from '../screens/QuoteBuilderScreen';
import { QuoteDetailScreen } from '../screens/QuoteDetailScreen';
import { InvoiceBuilderScreen } from '../screens/InvoiceBuilderScreen';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';
import { ClientPortalScreen } from '../screens/ClientPortalScreen';
import { RecurringScreen } from '../screens/RecurringScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { MessagingScreen } from '../screens/MessagingScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { DispatchScreen } from '../screens/DispatchScreen';
import { VoiceToQuoteScreen } from '../screens/VoiceToQuoteScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { VerifyHoursScreen } from '../screens/VerifyHoursScreen';
import { RequestsListScreen } from '../screens/RequestsListScreen';
import { QuotesListScreen } from '../screens/QuotesListScreen';
import { JobsListScreen } from '../screens/JobsListScreen';
import { InvoicesListScreen } from '../screens/InvoicesListScreen';
import { PaymentsListScreen } from '../screens/PaymentsListScreen';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={BottomTabs} />

      {/* Detail screens */}
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="RequestDetail" component={RequestDetailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="EmployeeProfile" component={EmployeeProfileScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ClientPortal" component={ClientPortalScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Dispatch" component={DispatchScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ animation: 'slide_from_right' }} />

      {/* List screens */}
      <Stack.Screen name="RequestsList" component={RequestsListScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="QuotesList" component={QuotesListScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="JobsList" component={JobsListScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="InvoicesList" component={InvoicesListScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="PaymentsList" component={PaymentsListScreen} options={{ animation: 'slide_from_right' }} />

      {/* Builder/create screens */}
      <Stack.Screen name="QuoteBuilder" component={QuoteBuilderScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="InvoiceBuilder" component={InvoiceBuilderScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Recurring" component={RecurringScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Messaging" component={MessagingScreen} options={{ animation: 'slide_from_right' }} />

      {/* Payroll */}
      <Stack.Screen name="PayrollReview" component={PayrollReviewScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="PayrollConfirm" component={PayrollConfirmScreen} options={{ animation: 'slide_from_right' }} />

      {/* Modals */}
      <Stack.Screen name="CreateClient" component={CreateClientScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="CreateRequest" component={CreateRequestScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="CreateJob" component={CreateJobScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="VerifyHours" component={VerifyHoursScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="VoiceToQuote" component={VoiceToQuoteScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Assistant" component={AssistantScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
