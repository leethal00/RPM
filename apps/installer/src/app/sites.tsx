import React, { useEffect, useState } from 'react';
import { Linking, Platform, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Site, workspace } from '../lib/api';
import { useInstallerSession } from '../lib/session';
import { Button, Card, ErrorText, Page, Title, styles } from '../lib/ui';

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
  if (ready && !allowed) { router.replace('/login'); return null; }
  return <Page><Title detail="Search client and site names">All sites</Title>
    <TextInput style={styles.input} placeholder="Search sites" value={term} onChangeText={setTerm} />
    {error ? <ErrorText message={error} /> : null}
    {sites.map(site => <Card key={site.id}><Text style={styles.heading}>{site.client_name} · {site.name}</Text>
      <Text style={styles.muted}>{site.address || 'No address saved'}</Text>
      {site.manager_name ? <Text style={styles.muted}>Contact: {site.manager_name}{site.manager_phone ? ` · ${site.manager_phone}` : ''}</Text> : null}
      <Button secondary disabled={!site.address && site.lat == null} onPress={() => void navigateTo(site.address, site.lat, site.lng)}>Navigate</Button>
    </Card>)}
  </Page>;
}
