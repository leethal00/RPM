import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Job, Timer, timerAction, workspace } from '../lib/api';
import { queuedFor, syncPhotos } from '../lib/photo-queue';
import { useInstallerSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, StatusPill, Title, colors, styles } from '../lib/ui';

export default function Home() {
  const { ready, allowed, session, role } = useInstallerSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timer, setTimer] = useState<Timer | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const refresh = useCallback(async () => {
    if (!allowed || !session) return;
    try {
      const data = await workspace();
      setJobs(data.jobs); setTimer(data.timer); setError('');
      await syncPhotos(session.user.id);
      setPending((await queuedFor(session.user.id)).length);
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
  const name = session.user.email?.split('@')[0]?.split('.')[0] || 'there';
  const readyJobs = jobs.filter(job => ['approved', 'in_progress'].includes(job.status)).length;
  const admin = role === 'mobile_admin' || role === 'rodier_admin' || role === 'super_admin';

  return <Page>
    <Title detail={admin ? 'All operational jobs.' : 'Factory and site work available to you.'}>Active Jobs</Title>

    <View style={{ backgroundColor: colors.forest, borderRadius: 22, padding: 22, marginBottom: 18, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: 160, height: 160, borderRadius: 80, right: -55, top: -65, backgroundColor: '#2D6A4D', opacity: 0.6 }} />
      <Text style={{ color: '#A9D4B5', fontWeight: '800', letterSpacing: 1.5, fontSize: 11 }}>WORK OVERVIEW</Text>
      <Text style={{ color: colors.white, fontSize: 25, fontWeight: '800', marginTop: 12 }}>Hi, {name.charAt(0).toUpperCase() + name.slice(1)}</Text>
      <Text style={{ color: '#C6DEC9', fontSize: 14, marginTop: 4 }}>{now ? new Date(now).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Today'}</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <View style={{ flex: 1, borderRadius: 14, backgroundColor: '#FFFFFF20', padding: 14 }}>
          <Text style={{ color: colors.white, fontSize: 25, fontWeight: '800' }}>{jobs.length}</Text>
          <Text style={{ color: '#D6E8D8', fontSize: 12 }}>Available jobs</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 14, backgroundColor: '#FFFFFF20', padding: 14 }}>
          <Text style={{ color: colors.white, fontSize: 25, fontWeight: '800' }}>{readyJobs}</Text>
          <Text style={{ color: '#D6E8D8', fontSize: 12 }}>Ready for work</Text>
        </View>
      </View>
    </View>

    {timer ? <Card style={{ backgroundColor: colors.amberPale, borderColor: '#F0D4B0' }}>
      <Text style={{ color: colors.amber, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }}>● {timer.kind.toUpperCase()} TIMER RUNNING</Text>
      <Text style={{ color: colors.navy, fontSize: 38, fontWeight: '800', marginTop: 8, fontVariant: ['tabular-nums'] }}>{clock}</Text>
      <Text style={styles.muted}>Job {jobs.find(job => job.id === timer.job_id)?.job_number || timer.job_id}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 17 }}>
        <Button style={{ flex: 1, marginBottom: 0 }} onPress={() => { void timerAction(timer.job_id,timer.kind,'stop').then(refresh).catch(e=>setError(e.message)); }}>Stop {timer.kind}</Button>
        {jobs.some(job => job.id === timer.job_id) ? <Button secondary style={{ flex: 1, marginBottom: 0 }} onPress={() => router.push(`/job/${timer.job_id}`)}>View job</Button> : null}
      </View>
    </Card> : null}

    {pending ? <Card style={{ backgroundColor: colors.amberPale, borderColor: '#F0D4B0' }}>
      <Text style={{ color: colors.navy, fontSize: 16, fontWeight: '800' }}>{pending} photo{pending === 1 ? '' : 's'} waiting to upload</Text>
      <Text style={[styles.muted, { marginTop: 4, marginBottom: 12 }]}>They will retry when you are connected.</Text>
      <Button secondary style={{ marginBottom: 0 }} onPress={() => void refresh()}>Retry uploads</Button>
    </Card> : null}
    {error ? <ErrorText message={error} /> : null}

    <Card onPress={() => router.push('/sites')} style={{ backgroundColor: '#EEF5EF', borderColor: '#DCE9DE' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.forest, fontSize: 20 }}>⌕</Text></View>
        <View style={{ flex: 1 }}><Text style={{ color: colors.navy, fontWeight: '800', fontSize: 16 }}>Sites / Map</Text><Text style={styles.muted}>Find sites and their jobs</Text></View>
        <Text style={{ color: colors.forest, fontSize: 22 }}>›</Text>
      </View>
    </Card>

    <SectionLabel>{admin ? 'All Jobs' : 'Assigned Jobs'} · {jobs.length}</SectionLabel>
    {jobs.length ? jobs.map(job => <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{job.job_number || 'JOB'}</Text>
        <StatusPill status={job.status} />
      </View>
      <Text style={{ color: colors.navy, fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: 12 }}>{job.title}</Text>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 9 }}>{job.client_name || 'Client'}  ·  {job.site_name || 'Manufacture only / No site'}</Text>
      {job.address ? <Text numberOfLines={2} style={[styles.muted, { marginTop: 3 }]}>{job.address}</Text> : null}
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 15 }} />
      <Text style={{ color: colors.forest, fontWeight: '800', fontSize: 13 }}>Open job  →</Text>
    </Card>) : <Card><Text style={styles.muted}>{admin ? 'No operational jobs are available yet.' : 'No jobs are available yet. Ask an RPM administrator to assign your jobs.'}</Text></Card>}
    <Button secondary style={{ marginTop: 10 }} onPress={() => void supabase.auth.signOut()}>Sign out</Button>
  </Page>;
}

