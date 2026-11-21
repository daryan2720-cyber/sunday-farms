/**
 * Sunday Farms — Trust your food. Grow your own.
 * React Native app built with Expo: runs in Expo Go, and `npx expo prebuild` turns it into
 * native Android Studio / Xcode projects.
 */
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import type { ComponentType } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from './src/i18n';
import { TABS, useApp } from './src/services/app';
import { ForgotScreen, LoginScreen, OnboardingScreen, SignUpScreen, UnlockScreen } from './src/screens/auth';
import { AddPlantScreen, GardenScreen, GuidesScreen, HealthCheckScreen, JournalEntryScreen, PlantDetailScreen, SensorScreen, WeatherScreen } from './src/screens/garden';
import { HomeScreen, JourneyScreen, ScanScreen } from './src/screens/home';
import { CheckoutScreen, KitDetailScreen, KitsScreen, OrdersScreen, ReturnScreen, RewardsScreen, SpaceCheckScreen } from './src/screens/kits';
import { ProfileScreen } from './src/screens/profile';
import { AskScreen, CommunityScreen, KidsModeScreen, KidsScreen, PostScreen, SchoolScreen, StartKidsScreen } from './src/screens/social';
import { C } from './src/ui/components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCREENS: Record<string, ComponentType<{ params: any }>> = {
  Onboarding: OnboardingScreen, Login: LoginScreen, SignUp: SignUpScreen, Forgot: ForgotScreen, Unlock: UnlockScreen,
  Home: HomeScreen, Scan: ScanScreen, Journey: JourneyScreen,
  Kits: KitsScreen, KitDetail: KitDetailScreen, SpaceCheck: SpaceCheckScreen, Checkout: CheckoutScreen,
  Orders: OrdersScreen, Return: ReturnScreen, Rewards: RewardsScreen,
  Garden: GardenScreen, AddPlant: AddPlantScreen, PlantDetail: PlantDetailScreen, JournalEntry: JournalEntryScreen,
  HealthCheck: HealthCheckScreen, Sensor: SensorScreen, Guides: GuidesScreen, Weather: WeatherScreen,
  Community: CommunityScreen, Ask: AskScreen, Post: PostScreen,
  Kids: KidsScreen, StartKids: StartKidsScreen, KidsMode: KidsModeScreen, School: SchoolScreen,
  Profile: ProfileScreen,
};

const TAB_INFO: Record<string, { icon: string; label: string }> = {
  home: { icon: '🏠', label: 'tab_home' },
  scan: { icon: '📷', label: 'tab_scan' },
  kits: { icon: '📦', label: 'tab_kits' },
  garden: { icon: '🪴', label: 'tab_garden' },
  kids: { icon: '🧒', label: 'tab_kids' },
};

export default function App() {
  const app = useApp();

  // Android back button: go back a page; in Kids mode it does nothing (the PIN is needed).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (app.mode === 'kids') return true;
      return app.back();
    });
    return () => sub.remove();
  }, [app]);

  const route = app.top;
  const Screen = SCREENS[route?.name] ?? HomeScreen;
  // A fresh key per page and tab so each screen starts with clean local state.
  const key = `${app.mode}:${app.tab}:${app.stack.length}:${route?.name}:${JSON.stringify(route?.params ?? {})}`;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.body}>
        <Screen key={key} params={route?.params ?? {}} />
      </View>
      {app.mode === 'main' && (
        <View style={styles.tabbar} accessibilityRole="tablist">
          {TABS.map((tab) => {
            const selected = app.tab === tab;
            return (
              <Pressable key={tab} onPress={() => app.switchTab(tab)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected }}>
                <Text style={styles.tabIcon}>{TAB_INFO[tab].icon}</Text>
                <Text style={[styles.tabLabel, selected && styles.tabLabelOn]} numberOfLines={1}>{t(TAB_INFO[tab].label)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cream },
  body: { flex: 1 },
  tabbar: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingBottom: 18, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
  tabLabelOn: { color: C.leaf, fontWeight: '700' },
});
