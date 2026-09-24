import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InstallerSessionProvider } from '../lib/session';
import { colors } from '../lib/ui';

export default function RootLayout() {
  return <SafeAreaProvider><InstallerSessionProvider><Stack screenOptions={{ headerStyle: { backgroundColor: colors.white }, headerTintColor: colors.forest, headerTitleStyle: { fontWeight: '800', color: colors.navy }, headerShadowVisible: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="index" options={{ title: 'RPM Mobile' }} />
    <Stack.Screen name="login" options={{ title: 'RPM Mobile sign in' }} />
    <Stack.Screen name="sites" options={{ title: 'Sites' }} />
    <Stack.Screen name="site/[id]" options={{ title: 'Site photos' }} />
    <Stack.Screen name="job/[id]" options={{ title: 'Job detail' }} />
    <Stack.Screen name="admin-photos" options={{ title: 'Job photos' }} />
    <Stack.Screen name="admin-photo-job/[id]" options={{ title: 'Job photos' }} />
  </Stack></InstallerSessionProvider></SafeAreaProvider>;
}
