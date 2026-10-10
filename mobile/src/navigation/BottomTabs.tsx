import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { TimesheetScreen } from '../screens/TimesheetScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { colors, fontSize } from '../theme';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Home', icon: 'home-outline' as const, iconActive: 'home' as const, component: HomeScreen },
  { name: 'Schedule', icon: 'calendar-outline' as const, iconActive: 'calendar' as const, component: ScheduleScreen },
  { name: 'Timesheet', icon: 'time-outline' as const, iconActive: 'time' as const, component: TimesheetScreen },
  { name: 'Search', icon: 'search-outline' as const, iconActive: 'search' as const, component: SearchScreen },
  { name: 'More', icon: 'menu-outline' as const, iconActive: 'menu' as const, component: MoreScreen },
] as const;

export function BottomTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 56 + Math.max(insets.bottom, 8),
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 3,
        },
        tabBarActiveTintColor: colors.greenDark,
        tabBarInactiveTintColor: colors.textLight,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={24} color={color} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
});
