import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Document, Photo, SitePhoto, Timer, documentUrl, photoUrl, timerAction, workspace } from '../../lib/api';
import { enqueuePhoto, queuedFor, syncPhotos } from '../../lib/photo-queue';
import { useInstallerSession } from '../../lib/session';
import { Button, Card, ErrorText, Loading, Page, Title, colors, styles } from '../../lib/ui';
import { navigateTo } from '../sites';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allowed, ready, session } = useInstallerSession();
  const [job, setJob] = useState<Awaited<ReturnType<typeof workspace>>['job']>(null);
  const [docs, setDocs] = useState<Document[]>([]); const [photos, setPhotos] = useState<Photo[]>([]);
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([]);
  const [timer, setTimer] = useState<Timer | null>(null); const [pending, setPending] = useState(0);
  const [caption, setCaption] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0); const [photoUrls, setPhotoUrls] = useState<Record<string,string>>({});
  const refresh = useCallback(async () => {
    if (!allowed || !session || !id) return;
    try {
      const data = await workspace(id); setJob(data.job); setDocs(data.documents); setPhotos(data.photos); setSitePhotos(data.site_photos); setTimer(data.timer); setError('');
      setPending((await queuedFor(session.user.id)).filter(p => p.jobId === id).length);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load job.'); }
  }, [allowed, session, id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { photos.forEach(p => { void photoUrl(p.path).then(url => setPhotoUrls(prev => ({ ...prev, [p.id]: url }))).catch(() => {}); }); }, [photos]);
  if (!ready) return <Loading />;
  if (!allowed || !session) { router.replace('/login'); return null; }
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
        await enqueuePhoto(session.user.id, id, image.uri, caption.trim() || null);
      }
      setCaption('');
      const synced = await syncPhotos(session.user.id); setPending(synced.pending); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the photo.'); }
  }
  async function openDoc(path: string) {
    try { await Linking.openURL(await documentUrl(path)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open document.'); }
  }
  if (!job) return <Page>{error ? <ErrorText message={error} /> : <Loading />}</Page>;
  const elapsed = timer ? Math.max(0, Math.floor((now-new Date(timer.started_at).getTime())/1000)) : 0;
  const clock = `${Math.floor(elapsed/3600).toString().padStart(2,'0')}:${Math.floor(elapsed%3600/60).toString().padStart(2,'0')}:${(elapsed%60).toString().padStart(2,'0')}`;
  const canRecord = ['approved','in_progress'].includes(job.status);
  return <Page><Title detail={`${job.client_name || 'Client'} · ${job.site_name || 'Site'} · ${job.job_number || 'Job'}`}>{job.title}</Title>
    {error ? <ErrorText message={error} /> : null}
    {timer ? <Card><Text style={{ color: colors.blue, fontWeight: '800' }}>● {timer.kind.toUpperCase()} RUNNING {timer.job_id !== id ? 'ON ANOTHER JOB' : ''}</Text><Text style={{ fontSize: 30, color: colors.navy, fontWeight: '800' }}>{clock}</Text></Card> : null}
    <Card><Text style={styles.heading}>Site</Text><Text style={styles.muted}>{job.address || 'No address saved'}</Text>
      <Button secondary disabled={!job.address && job.lat == null} onPress={() => void navigateTo(job.address, job.lat, job.lng)}>Navigate to site</Button></Card>
    <Card><Text style={styles.heading}>Time and travel</Text>
      {(['travel','work'] as const).map(kind => {
        const running = timer?.job_id === id && timer.kind === kind;
        return <Button key={kind} disabled={busy || (!canRecord && !running) || (!!timer && !running)} secondary={!running}
          onPress={() => void changeTimer(kind, running ? 'stop' : 'start')}>{running ? `Stop ${kind}` : `Start ${kind}`}</Button>;
      })}
      {!canRecord ? <Text style={styles.muted}>Time entry is closed for this job.</Text> : null}
    </Card>
    <Card><Text style={styles.heading}>Installation notes</Text><Text style={styles.muted}>{job.installation_notes || 'No installation notes yet.'}</Text></Card>
    <Card><Text style={styles.heading}>Photos</Text>
      <TextInput style={styles.input} placeholder="Optional photo caption" value={caption} onChangeText={setCaption} maxLength={500} />
      <Button disabled={!canRecord} onPress={() => void addPhotos(true)}>Take photo</Button>
      <Button secondary disabled={!canRecord} onPress={() => void addPhotos(false)}>Choose multiple photos</Button>
      {pending ? <Text style={styles.muted}>{pending} photo{pending===1?'':'s'} queued for upload</Text> : null}
      {pending ? <Button secondary onPress={() => { void syncPhotos(session.user.id).then(refresh); }}>Retry uploads</Button> : null}
      {photos.map(photo => <View key={photo.id} style={{ marginTop: 10 }}>{photoUrls[photo.id] ? <Image alt={photo.caption || 'Job photo'} source={{ uri: photoUrls[photo.id] }} style={{ width: '100%', height: 180, borderRadius: 10 }} /> : null}<Text style={styles.muted}>{photo.caption || new Date(photo.captured_at).toLocaleString()}</Text></View>)}
      {sitePhotos.map(photo => <View key={photo.id} style={{ marginTop: 10 }}><Image alt={photo.caption || 'Site photo'} source={{ uri: photo.url }} style={{ width: '100%', height: 180, borderRadius: 10 }} />{photo.caption ? <Text style={styles.muted}>{photo.caption}</Text> : null}</View>)}
    </Card>
    <Card><Text style={styles.heading}>Site documents</Text>
      {docs.length ? docs.map(doc => <Button key={doc.id} secondary onPress={() => void openDoc(doc.path)}>{doc.title || doc.name}</Button>) : <Text style={styles.muted}>No site documents attached.</Text>}
    </Card>
  </Page>;
}
