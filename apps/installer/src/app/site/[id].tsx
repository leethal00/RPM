import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { GalleryPhoto, SiteGallery, siteGallery } from '../../lib/api';
import { useInstallerSession } from '../../lib/session';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, Title, colors, styles } from '../../lib/ui';
import { navigateTo } from '../sites';

export default function SitePhotos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allowed, ready } = useInstallerSession();
  const [gallery, setGallery] = useState<SiteGallery | null>(null);
  const [album, setAlbum] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    if (!id || !allowed) return;
    setLoading(true);
    try {
      const data = await siteGallery(id);
      setGallery(data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load site photos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id || !allowed) return;
    let active = true;
    void siteGallery(id).then(data => {
      if (active) { setGallery(data); setError(''); }
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load site photos.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, id]);
  const albums = useMemo(() => {
    const names = new Map<string, string>();
    gallery?.photos.forEach(photo => {
      if (photo.album_id) names.set(photo.album_id, photo.album_name || 'Album');
    });
    return Array.from(names, ([id, name]) => ({ id, name }));
  }, [gallery]);
  const photos = useMemo(() => gallery?.photos.filter(photo => !album || photo.album_id === album) ?? [], [album, gallery]);
  const selectedIndex = photos.findIndex(photo => photo.id === selectedId);
  const selected: GalleryPhoto | undefined = selectedIndex >= 0 ? photos[selectedIndex] : undefined;

  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  return <Page>
    <Title detail={gallery ? `${gallery.site.client_name} · ${gallery.site.address || 'No address saved'}` : 'Photos shared to this site in RPM'}>{gallery?.site.name || 'Site photos'}</Title>
    {error ? <ErrorText message={error} /> : null}
    {loading && !gallery ? <Loading /> : null}
    {gallery ? <>
      <Card>
        <Text style={styles.heading}>{gallery.site.name}</Text>
        <Text style={styles.muted}>{gallery.site.address || 'No address saved'}</Text>
        <Button secondary style={{ marginTop: 14, marginBottom: 0 }} disabled={!gallery.site.address && gallery.site.lat == null}
          onPress={() => void navigateTo(gallery.site.address, gallery.site.lat, gallery.site.lng)}>Get directions  ↗</Button>
      </Card>
      <SectionLabel>Site gallery · {photos.length} photo{photos.length === 1 ? '' : 's'}</SectionLabel>
      {albums.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        {[{ id: null, name: 'All photos' }, ...albums].map(item => <Pressable key={item.id || 'all'} accessibilityRole="button"
          accessibilityState={{ selected: album === item.id }} onPress={() => { setAlbum(item.id); setSelectedId(null); }}
          style={{ backgroundColor: album === item.id ? colors.forest : colors.pale, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10 }}>
          <Text style={{ color: album === item.id ? colors.white : colors.forest, fontWeight: '800' }}>{item.name}</Text>
        </Pressable>)}
      </ScrollView> : null}
      {photos.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {photos.map(photo => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`Open ${photo.caption || 'site photo'}`}
          onPress={() => setSelectedId(photo.id)} style={{ width: '48%', marginBottom: 14 }}>
          <Image source={{ uri: photo.url }} style={{ width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.pale }} resizeMode="cover" />
          <Text numberOfLines={2} style={[styles.muted, { marginTop: 5, fontSize: 12 }]}>{photo.caption || photo.album_name || 'Site photo'}</Text>
        </Pressable>)}
      </View> : <Card><Text style={styles.muted}>No shared photos in this {album ? 'album' : 'site'} yet.</Text></Card>}
      <Button secondary onPress={() => void refresh()}>Refresh photos</Button>
    </> : !loading ? <Button secondary onPress={() => void refresh()}>Try again</Button> : null}
    <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelectedId(null)}>
      <View style={{ flex: 1, backgroundColor: '#101C17F2', paddingTop: 40, paddingBottom: 24, paddingHorizontal: 16 }}>
        <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={{ alignSelf: 'flex-end', padding: 12 }}>
          <Text style={{ color: colors.white, fontSize: 17, fontWeight: '800' }}>Close ✕</Text>
        </Pressable>
        {selected ? <>
          <Image source={{ uri: selected.url }} resizeMode="contain" style={{ flex: 1, width: '100%' }} />
          <Text style={{ color: colors.white, fontSize: 15, lineHeight: 21, marginTop: 12, textAlign: 'center' }}>{selected.caption || selected.album_name || 'Site photo'}</Text>
          <Text style={{ color: '#C7D8CD', textAlign: 'center', marginTop: 5 }}>{selectedIndex + 1} of {photos.length}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Button secondary style={{ flex: 1 }} disabled={selectedIndex <= 0} onPress={() => setSelectedId(photos[selectedIndex - 1].id)}>← Previous</Button>
            <Button secondary style={{ flex: 1 }} disabled={selectedIndex >= photos.length - 1} onPress={() => setSelectedId(photos[selectedIndex + 1].id)}>Next →</Button>
          </View>
        </> : null}
      </View>
    </Modal>
  </Page>;
}
