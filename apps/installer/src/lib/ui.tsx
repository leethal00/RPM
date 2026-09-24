import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export const colors = { navy: '#122238', blue: '#2765D2', pale: '#EDF3FF', ink: '#17283B', muted: '#68798B', line: '#DCE5ED', white: '#FFFFFF', bg: '#F5F8FB', red: '#B42318' };
export function Page({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const content = <View style={styles.page}>{children}</View>;
  return scroll ? <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1 }}>{content}</ScrollView> : content;
}
export function Title({ children, detail }: { children: React.ReactNode; detail?: string }) {
  return <View style={{ marginBottom: 20 }}><Text style={styles.title}>{children}</Text>{detail ? <Text style={styles.muted}>{detail}</Text> : null}</View>;
}
export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return <Pressable onPress={onPress} style={styles.card}>{children}</Pressable>;
}
export function Button({ children, onPress, secondary = false, disabled = false }: { children: React.ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && { opacity: 0.5 }]}><Text style={[styles.buttonText, secondary && { color: colors.blue }]}>{children}</Text></Pressable>;
}
export function Loading() { return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} size="large" /></View>; }
export function ErrorText({ message }: { message: string }) { return <Text style={{ color: colors.red, marginBottom: 12 }}>{message}</Text>; }
export const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, paddingBottom: 50, backgroundColor: colors.bg },
  title: { fontSize: 30, fontWeight: '800', color: colors.navy, marginBottom: 4 },
  heading: { fontSize: 19, fontWeight: '700', color: colors.navy, marginBottom: 10 },
  muted: { color: colors.muted, lineHeight: 21 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 18, marginBottom: 12, borderColor: colors.line, borderWidth: 1 },
  button: { backgroundColor: colors.blue, borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 10, minHeight: 52 },
  secondary: { backgroundColor: colors.pale },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, marginBottom: 12, color: colors.ink },
});
