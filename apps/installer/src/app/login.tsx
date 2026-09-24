import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useInstallerSession } from '../lib/session';
import { Button, ErrorText, Page, Title, styles } from '../lib/ui';

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
  return <Page><Title detail="Sign in with your RPM account">Installer login</Title>
    {session && !allowed ? <><ErrorText message="This account is not assigned the installer role." /><Button secondary onPress={() => void supabase.auth.signOut()}>Sign out</Button></> :
    <><Text style={styles.muted}>Email</Text><TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
    <Text style={styles.muted}>Password</Text><TextInput style={styles.input} secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
    {error ? <ErrorText message={error} /> : null}<Button onPress={() => void signIn()} disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button></>}
  </Page>;
}
