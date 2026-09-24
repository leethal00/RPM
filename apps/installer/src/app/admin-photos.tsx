import React, { useCallback, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SuperuserPhotoJob, superuserPhotoJobs } from '../lib/api';
import { useInstallerSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, Title, colors, styles } from '../lib/ui';

export default function SuperuserPhotos() {
  const { allowed, ready, role } = useInstallerSession();
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<SuperuserPhotoJob[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadJobs = useCallback(async (term: string, offset: number) => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError('');
    try {
      const rows = await superuserPhotoJobs(term.trim(), offset);
      if (currentRequest !== requestId.current) return;
      setJobs(current => offset === 0 ? rows : [...current, ...rows]);
      setHasMore(rows.length === 50);
    } catch (cause) { if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : 'Could not load job photos.'); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    if (role !== 'super_admin') return;
    const handle = setTimeout(() => { void loadJobs(search, 0); }, 250);
    return () => { clearTimeout(handle); requestId.current++; };
  }, [role, search, loadJobs]));

  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  if (role !== 'super_admin') return <Redirect href="/" />;

  return <Page>
    <Title detail="Find and manage job photos across RPM.">Job photos</Title>
    <View style={{ backgroundColor: colors.pale, borderRadius: 17, padding: 16, marginBottom: 18 }}>
      <Text style={{ color: colors.forest, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 9 }}>SEARCH JOB PHOTOS</Text>
      <TextInput style={[styles.input, { marginBottom: 0 }]} placeholder="Job, client or site" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
    </View>
    {error ? <ErrorText message={error} /> : null}
    <SectionLabel>Jobs with photos · {jobs.length}</SectionLabel>
    {jobs.map(job => <Card key={job.job_id} onPress={() => router.push(`/admin-photo-job/${job.job_id}`)}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{job.job_number || 'JOB'}</Text>
      <Text style={[styles.heading, { marginTop: 7 }]}>{job.title}</Text>
      <Text style={styles.muted}>{job.client_name || 'Client'} · {job.site_name || 'Manufacture only / No site'}</Text>
      <Text style={{ color: colors.forest, fontWeight: '800', marginTop: 12 }}>{job.photo_count} photo{job.photo_count === 1 ? '' : 's'}  →</Text>
    </Card>)}
    {!jobs.length && !loading && !error ? <Card><Text style={styles.muted}>No job photos found.</Text></Card> : null}
    {loading ? <Text style={[styles.muted, { marginBottom: 14 }]}>Loading photos…</Text> : null}
    {hasMore ? <Button secondary disabled={loading} onPress={() => void loadJobs(search, jobs.length)}>Load more jobs</Button> : null}
    <Button secondary onPress={() => void supabase.auth.signOut()}>Sign out</Button>
  </Page>;
}
