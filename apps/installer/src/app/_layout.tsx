import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InstallerSessionProvider } from '../lib/session';
import { colors } from '../lib/ui';

export default function RootLayout() {
  return <SafeAreaProvider><InstallerSessionProvider><Stack screenOptions={{ headerStyle: { backgroundColor: colors.navy }, headerTintColor: '#fff', contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="index" options={{ title: 'RPM Install' }} />
    <Stack.Screen name="login" options={{ title: 'Installer sign in' }} />
    <Stack.Screen name="sites" options={{ title: 'Sites' }} />
    <Stack.Screen name="job/[id]" options={{ title: 'Job detail' }} />
  </Stack></InstallerSessionProvider></SafeAreaProvider>;
}
