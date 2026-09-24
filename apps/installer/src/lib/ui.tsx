import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const colors = {
  navy: '#12382D',
  forest: '#174B38',
  blue: '#317068',
  pale: '#EAF3EC',
  ink: '#193229',
  muted: '#6B7C71',
  line: '#E0E8DF',
  white: '#FFFFFF',
  bg: '#F5F7F3',
  red: '#AD3F35',
  amber: '#B66C2A',
  amberPale: '#FFF4E7',
};

export function Page({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const content = <View style={styles.page}>{children}</View>;
  return scroll
    ? <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{content}</ScrollView>
    : content;
}

export function Title({ children, detail }: { children: React.ReactNode; detail?: string }) {
  return <View style={styles.titleWrap}>
    <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View><Text style={styles.brandLabel}>RPM  /  FIELD TEAM</Text></View>
    <Text style={styles.title}>{children}</Text>
    {detail ? <Text style={styles.subtitle}>{detail}</Text> : null}
  </View>;
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress}
    style={({ pressed }) => [styles.card, style, pressed && onPress ? { opacity: 0.85 } : null]}>{children}</Pressable>;
}

export function Button({ children, onPress, secondary = false, disabled = false, style }: {
  children: React.ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, style, disabled && { opacity: 0.46 }, pressed && !disabled && { opacity: 0.78 }]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{children}</Text>
  </Pressable>;
}

export function StatusPill({ status }: { status: string }) {
  const label = status === 'in_progress' ? 'In progress' : status === 'approved' ? 'Approved' : status === 'quoted' ? 'Quoted' : status.replaceAll('_', ' ');
  const warm = status === 'quoted';
  return <View style={[styles.statusPill, { backgroundColor: warm ? colors.amberPale : colors.pale }]}>
    <View style={[styles.statusDot, { backgroundColor: warm ? colors.amber : colors.forest }]} />
    <Text style={[styles.statusText, { color: warm ? colors.amber : colors.forest }]}>{label}</Text>
  </View>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Loading() { return <View style={styles.loading}><ActivityIndicator color={colors.forest} size="large" /></View>; }
export function ErrorText({ message }: { message: string }) { return <Text style={styles.error}>{message}</Text>; }

export const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, backgroundColor: colors.bg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 18, fontWeight: '900' },
  brandLabel: { color: colors.forest, fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  titleWrap: { marginBottom: 25 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: '800', color: colors.navy, letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.navy, marginBottom: 8 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 18, marginBottom: 12, borderColor: colors.line, borderWidth: 1, elevation: 2, shadowColor: '#183D2A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10 },
  button: { backgroundColor: colors.forest, borderRadius: 13, minHeight: 52, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  secondary: { backgroundColor: colors.pale, borderWidth: 1, borderColor: '#D6E6D9' },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 15, textAlign: 'center' },
  secondaryText: { color: colors.forest },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 12, color: colors.ink, fontSize: 15 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },
  error: { color: colors.red, backgroundColor: '#FFF0ED', borderRadius: 10, overflow: 'hidden', padding: 12, marginBottom: 12, fontSize: 13 },
  loading: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' },
});

