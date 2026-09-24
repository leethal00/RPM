import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useInstallerSession } from '../lib/session';
import { Button, Card, ErrorText, Page, Title, colors, styles } from '../lib/ui';

export default function Login() {
  const { allowed, session, refreshRole } = useInstallerSession();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true); setError('');
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) setError(result.error.message);
    else { await refreshRole(); router.replace('/'); }
    setBusy(false);
  }
  return <Page><Title detail="Your jobs, sites and updates in your pocket.">Welcome back</Title>
    <View style={{ backgroundColor: colors.forest, borderRadius: 20, padding: 22, marginBottom: 18 }}>
      <Text style={{ color: '#AFD9BA', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }}>RPM MOBILE</Text>
      <Text style={{ color: colors.white, fontSize: 22, fontWeight: '800', marginTop: 10 }}>Ready for work.</Text>
      <Text style={{ color: '#D5E9D9', marginTop: 6, lineHeight: 20 }}>Sign in to see your jobs and send updates from the factory or site.</Text>
    </View>
    {session && !allowed ? <Card><ErrorText message="This account does not have RPM Mobile access." /><Button secondary style={{ marginBottom: 0 }} onPress={() => void supabase.auth.signOut()}>Sign out</Button></Card> :
    <Card>
      <Text style={{ color: colors.navy, fontWeight: '800', fontSize: 18, marginBottom: 16 }}>Sign in</Text>
      <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 6 }}>Email</Text>
      <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@rodier.co.nz" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} />
      <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 6 }}>Password</Text>
      <TextInput style={styles.input} secureTextEntry autoComplete="password" placeholder="Your password" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} />
      {error ? <ErrorText message={error} /> : null}
      <Button style={{ marginTop: 5, marginBottom: 0 }} onPress={() => void signIn()} disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </Card>}
  </Page>;
}

