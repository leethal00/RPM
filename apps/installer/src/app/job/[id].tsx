import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Document, InstallerNote, Photo, PhotoCategory, SitePhoto, Timer, addJobNote, documentUrl, jobNotes, photoUrl, timerAction, workspace } from '../../lib/api';
import { enqueuePhoto, queuedFor, syncPhotos } from '../../lib/photo-queue';
import { useInstallerSession } from '../../lib/session';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, StatusPill, Title, colors, styles } from '../../lib/ui';
import { navigateTo } from '../sites';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allowed, ready, session } = useInstallerSession();
  const [job, setJob] = useState<Awaited<ReturnType<typeof workspace>>['job']>(null);
  const [docs, setDocs] = useState<Document[]>([]); const [photos, setPhotos] = useState<Photo[]>([]);
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([]);
  const [notes, setNotes] = useState<InstallerNote[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [timer, setTimer] = useState<Timer | null>(null); const [pending, setPending] = useState(0);
  const [caption, setCaption] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<PhotoCategory>('Production');
  const [now, setNow] = useState(0); const [photoUrls, setPhotoUrls] = useState<Record<string,string>>({});
  const refresh = useCallback(async () => {
    if (!allowed || !session || !id) return;
    try {
      const [data, savedNotes] = await Promise.all([workspace(id), jobNotes(id)]);
      setJob(data.job); setDocs(data.documents); setPhotos(data.photos); setSitePhotos(data.site_photos); setTimer(data.timer); setNotes(savedNotes); setError('');
      setCategory(data.job?.store_id ? 'Installation' : 'Production');
      setPending((await queuedFor(session.user.id)).filter(p => p.jobId === id).length);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load job.'); }
  }, [allowed, session, id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { photos.forEach(p => { void photoUrl(p.path).then(url => setPhotoUrls(prev => ({ ...prev, [p.id]: url }))).catch(() => {}); }); }, [photos]);
  if (!ready) return <Loading />;
  if (!allowed || !session) return <Redirect href="/login" />;
  async function changeTimer(kind: 'travel' | 'work', action: 'start' | 'stop') {
    if (!id) return; setBusy(true); setError('');
    try { await timerAction(id, kind, action); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Timer action failed.'); }
    finally { setBusy(false); }
  }
  async function addPhotos(fromCamera: boolean) {
    if (!id || !session) return;
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert('Camera access is needed to take a job photo.'); return; }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6, exif: false });
      if (result.canceled) return;
      for (const asset of result.assets) {
        const manipulator = ImageManipulator.manipulate(asset.uri);
        if (Math.max(asset.width, asset.height) > 1600) manipulator.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
        const image = await (await manipulator.renderAsync()).saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
        await enqueuePhoto(session.user.id, id, image.uri, caption.trim() || null, category);
      }
      setCaption('');
      const synced = await syncPhotos(session.user.id); setPending(synced.pending); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the photo.'); }
  }
  async function openDoc(path: string) {
    try { await Linking.openURL(await documentUrl(path)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open document.'); }
  }
  async function saveNote() {
    if (!id || !noteDraft.trim() || savingNote) return;
    setSavingNote(true); setError('');
    try {
      const saved = await addJobNote(id, noteDraft.trim());
      setNotes(current => [saved, ...current]);
      setNoteDraft('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save note. Try again when connected.'); }
    finally { setSavingNote(false); }
  }
  if (!job) return <Page>{error ? <ErrorText message={error} /> : <Loading />}</Page>;
  const elapsed = timer ? Math.max(0, Math.floor((now-new Date(timer.started_at).getTime())/1000)) : 0;
  const clock = `${Math.floor(elapsed/3600).toString().padStart(2,'0')}:${Math.floor(elapsed%3600/60).toString().padStart(2,'0')}:${(elapsed%60).toString().padStart(2,'0')}`;
  const canRecord = ['approved','in_progress'].includes(job.status);
  const categories: PhotoCategory[] = job.store_id ? ['Production', 'Installation', 'Site Survey', 'Delivery'] : ['Production', 'Delivery'];
  return <Page>
    <Title detail={`${job.client_name || 'Client'}  ·  ${job.site_name || 'Manufacture only / No site'}`}>{job.title}</Title>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -12, marginBottom: 19 }}>
      <StatusPill status={job.status} />
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>{job.job_number || 'JOB'}</Text>
    </View>
    {error ? <ErrorText message={error} /> : null}

    {timer ? <Card style={{ backgroundColor: colors.forest, borderColor: colors.forest }}>
      <Text style={{ color: '#B9DAC0', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }}>● {timer.kind.toUpperCase()} TIMER RUNNING{timer.job_id !== id ? ' ON ANOTHER JOB' : ''}</Text>
      <Text style={{ color: colors.white, fontSize: 38, fontWeight: '800', marginTop: 8, fontVariant: ['tabular-nums'] }}>{clock}</Text>
    </Card> : null}

    {job.store_id ? <Card>
      <SectionLabel>Location</SectionLabel>
      <Text style={[styles.heading, { marginBottom: 4 }]}>{job.site_name || 'Site'}</Text>
      <Text style={[styles.muted, { marginBottom: 17 }]}>{job.address || 'No address saved'}</Text>
      <Button secondary style={{ marginBottom: 0 }} disabled={!job.address && job.lat == null} onPress={() => void navigateTo(job.address, job.lat, job.lng)}>Navigate to site  ↗</Button>
    </Card> : <Card><SectionLabel>Location</SectionLabel><Text style={styles.heading}>Manufacture only / No site</Text><Text style={styles.muted}>Work and photos are saved on this job.</Text></Card>}

    <SectionLabel>Time & travel</SectionLabel>
    <Card>
      <Text style={[styles.muted, { marginBottom: 15 }]}>Track your journey and work separately for this job.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['travel','work'] as const).map(kind => {
          const running = timer?.job_id === id && timer.kind === kind;
          return <Button key={kind} style={{ flex: 1, marginBottom: 0 }} disabled={busy || (!canRecord && !running) || (!!timer && !running)} secondary={!running}
            onPress={() => void changeTimer(kind, running ? 'stop' : 'start')}>{running ? `Stop ${kind}` : `Start ${kind}`}</Button>;
        })}
      </View>
      {!canRecord ? <Text style={[styles.muted, { marginTop: 12 }]}>Time entry opens when this job is approved.</Text> : null}
    </Card>

    <SectionLabel>Job information</SectionLabel>
    <Card>
      <Text style={styles.heading}>Job instructions</Text>
      <Text style={styles.muted}>{job.installation_notes || 'No job instructions yet.'}</Text>
    </Card>

    <Card>
      <Text style={styles.heading}>Job notes</Text>
      <Text style={[styles.muted, { marginBottom: 14 }]}>Add progress, issues, or handover details.</Text>
      {canRecord ? <>
        <TextInput style={[styles.input, { minHeight: 108, textAlignVertical: 'top', backgroundColor: colors.bg }]} multiline
          placeholder="Write an update…" placeholderTextColor={colors.muted} value={noteDraft} onChangeText={setNoteDraft} maxLength={4000} />
        <Button style={{ marginBottom: 0 }} disabled={savingNote || !noteDraft.trim()} onPress={() => void saveNote()}>{savingNote ? 'Saving…' : 'Save note to RPM'}</Button>
      </> : <Text style={styles.muted}>Notes can be added when this job is approved or in progress.</Text>}
      {notes.length ? <View style={{ marginTop: 18 }}>{notes.map(note => <View key={note.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 21 }}>{note.body}</Text>
        <Text style={[styles.muted, { marginTop: 5, fontSize: 12 }]}>{note.author} · {new Date(note.created_at).toLocaleString()}</Text>
      </View>)}</View> : <Text style={[styles.muted, { marginTop: 14 }]}>No job notes yet.</Text>}
    </Card>

    <SectionLabel>Photos & files</SectionLabel>
    <Card>
      <Text style={styles.heading}>Job photos</Text>
      <Text style={[styles.muted, { marginBottom: 14 }]}>Private photos saved to this job. Category defaults to {job.store_id ? 'Installation' : 'Production'}.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>{categories.map(option =>
        <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: category === option }} onPress={() => setCategory(option)}
          style={{ backgroundColor: category === option ? colors.forest : colors.pale, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Text style={{ color: category === option ? colors.white : colors.forest, fontWeight: '700' }}>{option}</Text>
        </Pressable>)}</View>
      <TextInput style={[styles.input, { backgroundColor: colors.bg }]} placeholder="Optional photo caption" placeholderTextColor={colors.muted} value={caption} onChangeText={setCaption} maxLength={500} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button style={{ flex: 1 }} disabled={!canRecord} onPress={() => void addPhotos(true)}>Take photo</Button>
        <Button secondary style={{ flex: 1 }} disabled={!canRecord} onPress={() => void addPhotos(false)}>Choose photos</Button>
      </View>
      {pending ? <View style={{ backgroundColor: colors.amberPale, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <Text style={{ color: colors.amber, fontWeight: '800' }}>{pending} photo{pending===1?'':'s'} waiting to upload</Text>
        <Button secondary style={{ marginTop: 10, marginBottom: 0 }} onPress={() => { void syncPhotos(session.user.id).then(refresh); }}>Retry uploads</Button>
      </View> : null}
      {photos.map(photo => <View key={photo.id} style={{ marginTop: 12 }}>{photoUrls[photo.id] ? <Image alt={photo.caption || 'Job photo'} source={{ uri: photoUrls[photo.id] }} style={{ width: '100%', height: 180, borderRadius: 12 }} /> : null}<Text style={[styles.muted, { marginTop: 4 }]}>{photo.category || 'Installation'} · {photo.caption || new Date(photo.captured_at).toLocaleString()}</Text></View>)}
      {sitePhotos.length ? <Text style={[styles.heading, { marginTop: 20, fontSize: 15 }]}>Site gallery</Text> : null}
      {sitePhotos.map(photo => <View key={photo.id} style={{ marginTop: 10 }}><Image alt={photo.caption || 'Site photo'} source={{ uri: photo.url }} style={{ width: '100%', height: 180, borderRadius: 12 }} />{photo.caption ? <Text style={[styles.muted, { marginTop: 4 }]}>{photo.caption}</Text> : null}</View>)}
    </Card>

    {job.store_id ? <Card>
      <Text style={styles.heading}>Site documents</Text>
      {docs.length ? docs.map(doc => <Button key={doc.id} secondary onPress={() => void openDoc(doc.path)}>{doc.title || doc.name}</Button>) : <Text style={styles.muted}>No site documents attached.</Text>}
    </Card> : null}
  </Page>;
}

