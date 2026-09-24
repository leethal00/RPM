import React, { useEffect, useState } from 'react';
import { Linking, Platform, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Site, workspace } from '../lib/api';
import { useInstallerSession } from '../lib/session';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, Title, colors, styles } from '../lib/ui';

export async function navigateTo(address: string | null, lat?: number | null, lng?: number | null) {
  const destination = lat != null && lng != null ? `${lat},${lng}` : address;
  if (!destination) return;
  const url = Platform.OS === 'ios'
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  await Linking.openURL(url);
}

export default function Sites() {
  const { allowed, ready } = useInstallerSession();
  const [term, setTerm] = useState(''); const [sites, setSites] = useState<Site[]>([]); const [error, setError] = useState('');
  useEffect(() => {
    if (!allowed) return;
    const handle = setTimeout(() => { void workspace(undefined, term).then(data => { setSites(data.sites); setError(''); }).catch(e => setError(e.message)); }, 250);
    return () => clearTimeout(handle);
  }, [allowed, term]);
  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  return <Page><Title detail="Find locations, contacts and directions.">All sites</Title>
    <View style={{ backgroundColor: colors.pale, borderRadius: 17, padding: 16, marginBottom: 18 }}>
      <Text style={{ color: colors.forest, fontWeight: '800', fontSize: 12, letterSpacing: 1.1, marginBottom: 9 }}>SEARCH RPM SITES</Text>
      <TextInput style={[styles.input, { marginBottom: 0 }]} placeholder="Site or client name" placeholderTextColor={colors.muted} value={term} onChangeText={setTerm} />
    </View>
    {error ? <ErrorText message={error} /> : null}
    <SectionLabel>{term ? 'Search results' : 'All sites'} · {sites.length}</SectionLabel>
    {sites.map(site => <Card key={site.id}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }}>{site.client_name.toUpperCase()}</Text>
      <Text style={[styles.heading, { marginTop: 6 }]}>{site.name}</Text>
      <Text style={styles.muted}>{site.address || 'No address saved'}</Text>
      {site.manager_name ? <Text style={[styles.muted, { marginTop: 9 }]}>Contact  ·  {site.manager_name}{site.manager_phone ? `  ·  ${site.manager_phone}` : ''}</Text> : null}
      <Button secondary style={{ marginTop: 17, marginBottom: 0 }} disabled={!site.address && site.lat == null} onPress={() => void navigateTo(site.address, site.lat, site.lng)}>Get directions  ↗</Button>
    </Card>)}
    {!sites.length && !error ? <Card><Text style={styles.muted}>No sites found. Try a different name.</Text></Card> : null}
  </Page>;
}

