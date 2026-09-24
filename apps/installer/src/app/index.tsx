import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Job, Timer, timerAction, workspace } from '../lib/api';
import { queuedFor, syncPhotos } from '../lib/photo-queue';
import { useInstallerSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, Loading, Page, Title, colors, styles } from '../lib/ui';

export default function Home() {
  const { ready, allowed, session } = useInstallerSession();
  const [jobs, setJobs] = useState<Job[]>([]); const [timer, setTimer] = useState<Timer | null>(null);
  const [pending, setPending] = useState(0); const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const refresh = useCallback(async () => {
    if (!allowed || !session) return;
    try {
      const data = await workspace(); setJobs(data.jobs); setTimer(data.timer); setError('');
      await syncPhotos(session.user.id); setPending((await queuedFor(session.user.id)).length);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load jobs.'); }
  }, [allowed, session]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { clearInterval(tick); app.remove(); };
  }, [refresh]);
  if (!ready) return <Loading />;
  if (!session || !allowed) return <Redirect href="/login" />;
  const elapsed = timer ? Math.max(0, Math.floor((now - new Date(timer.started_at).getTime()) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 3600).toString().padStart(2,'0')}:${Math.floor(elapsed % 3600 / 60).toString().padStart(2,'0')}:${(elapsed % 60).toString().padStart(2,'0')}`;
  return <Page><Title detail="Jobs available to you">Today</Title>
    {timer ? <Card><Text style={{ color: colors.blue, fontWeight: '800' }}>● {timer.kind.toUpperCase()} RUNNING</Text><Text style={{ fontSize: 30, fontWeight: '800', color: colors.navy }}>{clock}</Text><Text style={styles.muted}>Job {jobs.find(job => job.id === timer.job_id)?.job_number || timer.job_id}</Text>
      <Button onPress={() => { void timerAction(timer.job_id,timer.kind,'stop').then(refresh).catch(e=>setError(e.message)); }}>Stop {timer.kind}</Button>
      {jobs.some(job => job.id === timer.job_id) ? <Button secondary onPress={() => router.push(`/job/${timer.job_id}`)}>View job</Button> : null}
    </Card> : null}
    {pending ? <Card><Text style={{ fontWeight: '700', color: colors.ink }}>{pending} photo{pending === 1 ? '' : 's'} waiting to upload</Text><Text style={styles.muted}>Uploads retry when the app is open and connected.</Text><Button secondary onPress={() => void refresh()}>Retry now</Button></Card> : null}
    {error ? <ErrorText message={error} /> : null}
    <Button secondary onPress={() => router.push('/sites')}>Search all sites</Button>
    <Text style={styles.heading}>Install jobs</Text>
    {jobs.length ? jobs.map(job => <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)}>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{job.title}</Text>
      <Text style={styles.muted}>{job.job_number || 'Job'} · {job.client_name || 'Client'} · {job.site_name || 'No site'}</Text>
      {job.address ? <Text style={styles.muted}>{job.address}</Text> : null}
      <Text style={{ color: colors.blue, marginTop: 8, fontWeight: '700' }}>{job.status.replace('_', ' ')}</Text>
    </Card>) : <Card><Text style={styles.muted}>No install jobs are available yet. Ask an RPM administrator to check your access.</Text></Card>}
    <View style={{ marginTop: 20 }}><Button secondary onPress={() => void supabase.auth.signOut()}>Sign out</Button></View>
  </Page>;
}

