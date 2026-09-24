import React, { useCallback, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useInstallerSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, Title, colors, styles } from '../../lib/ui';

type RelatedName = { name: string | null } | { name: string | null }[] | null;
type Photo = { id: string; storage_path: string; category: string; caption: string | null; captured_at: string; published_site_photo_id: string | null; users: RelatedName; url?: string };
type PhotoJob = { job_number: string | null; title: string; clients: RelatedName; stores: RelatedName };
function relatedName(value: RelatedName): string | null { return Array.isArray(value) ? value[0]?.name || null : value?.name || null; }

export default function SuperuserJobPhotos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allowed, ready, role } = useInstallerSession();
  const [job, setJob] = useState<PhotoJob | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!id || role !== 'super_admin') return;
    setLoading(true); setError('');
    try {
      const [jobResult, photoResult] = await Promise.all([
        supabase.from('costing_jobs').select('job_number,title,clients(name),stores(name)').eq('id', id).single(),
        supabase.from('installer_photos').select('id,storage_path,category,caption,captured_at,published_site_photo_id,users(name)').eq('job_id', id).order('captured_at', { ascending: false }),
      ]);
      if (jobResult.error) throw jobResult.error;
      if (photoResult.error) throw photoResult.error;
      const rows = photoResult.data as unknown as Photo[];
      const signed = await Promise.all(rows.map(async photo => {
        const { data } = await supabase.storage.from('installer-photos').createSignedUrl(photo.storage_path, 300);
        return { ...photo, url: data?.signedUrl };
      }));
      setJob(jobResult.data as unknown as PhotoJob); setPhotos(signed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load job photos.'); }
    finally { setLoading(false); }
  }, [id, role]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  if (role !== 'super_admin') return <Redirect href="/" />;

  function confirmDelete(photo: Photo) {
    const publishedNote = photo.published_site_photo_id ? ' Its separately published site gallery copy will remain.' : '';
    Alert.alert('Delete job photo?', `This removes the original photo for everyone and cannot be undone.${publishedNote}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deletePhoto(photo) },
    ]);
  }
  async function deletePhoto(photo: Photo) {
    if (deletingPhotoId) return;
    setDeletingPhotoId(photo.id); setError('');
    try {
      const { error: storageError } = await supabase.storage.from('installer-photos').remove([photo.storage_path]);
      if (storageError) throw storageError;
      const { error: recordError } = await supabase.from('installer_photos').delete().eq('id', photo.id).select('id').single();
      if (recordError) throw recordError;
      setPhotos(current => current.filter(item => item.id !== photo.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete photo.'); }
    finally { setDeletingPhotoId(null); }
  }

  return <Page>
    <Title detail={`${job?.job_number || 'Job'} · ${relatedName(job?.clients || null) || 'Client'} · ${relatedName(job?.stores || null) || 'Manufacture only / No site'}`}>{job?.title || 'Job photos'}</Title>
    {error ? <ErrorText message={error} /> : null}
    <SectionLabel>Job photos · {photos.length}</SectionLabel>
    {loading && !job ? <Loading /> : photos.length ? photos.map(photo => <Card key={photo.id}>
      {photo.url ? <Image alt={photo.caption || 'Job photo'} source={{ uri: photo.url }} style={{ width: '100%', height: 200, borderRadius: 12 }} /> : <View style={{ height: 200, backgroundColor: colors.pale, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}><Text style={styles.muted}>Photo unavailable</Text></View>}
      <Text style={[styles.heading, { marginTop: 10, fontSize: 15 }]}>{photo.category}</Text>
      <Text style={styles.muted}>{relatedName(photo.users) || 'RPM Mobile'} · {photo.caption || new Date(photo.captured_at).toLocaleString()}</Text>
      <Button secondary style={{ marginTop: 12, marginBottom: 0 }} disabled={deletingPhotoId !== null} onPress={() => confirmDelete(photo)}>{deletingPhotoId === photo.id ? 'Deleting…' : 'Delete photo'}</Button>
    </Card>) : !loading && !error ? <Card><Text style={styles.muted}>No photos on this job.</Text></Card> : null}
  </Page>;
}
