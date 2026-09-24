import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import type { PhotoCategory } from './api';

const KEY = 'rpm-installer-photo-queue-v1';
export type QueuedPhoto = { id: string; userId: string; jobId: string; path: string; uri: string; caption: string | null; category?: PhotoCategory; capturedAt: string };

async function all(): Promise<QueuedPhoto[]> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as QueuedPhoto[];
}
export async function queuedFor(userId: string) { return (await all()).filter(item => item.userId === userId); }

export async function enqueuePhoto(userId: string, jobId: string, sourceUri: string, caption: string | null, category: PhotoCategory) {
  const id = Crypto.randomUUID();
  const copy = new File(Paths.document, `installer-${id}.jpg`);
  const source = new File(sourceUri);
  if (source.size <= 0) throw new Error('The photo is empty. Please take it again.');
  await source.copy(copy);
  if (copy.size <= 0) { copy.delete(); throw new Error('The photo could not be saved. Please take it again.'); }
  const item: QueuedPhoto = { id, userId, jobId, path: `${jobId}/${userId}/${id}.jpg`, uri: copy.uri, caption, category, capturedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify([...(await all()), item]));
  return item;
}

let syncing = false;
export async function syncPhotos(userId: string): Promise<{ uploaded: number; pending: number; errors: { jobId: string; message: string }[] }> {
  if (syncing) return { uploaded: 0, pending: (await queuedFor(userId)).length, errors: [] };
  syncing = true;
  let uploaded = 0;
  const errors: { jobId: string; message: string }[] = [];
  try {
    for (const item of await queuedFor(userId)) {
      try {
        const file = new File(item.uri);
        const body = await file.arrayBuffer();
        if (body.byteLength === 0) throw new Error('Empty photo cannot be uploaded');
        const { error: uploadError } = await supabase.storage.from('installer-photos').upload(item.path, body, { contentType: 'image/jpeg', upsert: false });
        if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
        const common = { p_job_id: item.jobId, p_path: item.path, p_caption: item.caption, p_captured_at: item.capturedAt };
        const { error: registerError } = item.category
          ? await supabase.rpc('installer_register_job_photo', { ...common, p_category: item.category })
          : await supabase.rpc('installer_register_photo', common);
        if (registerError) throw registerError;
        await AsyncStorage.setItem(KEY, JSON.stringify((await all()).filter(photo => photo.id !== item.id)));
        uploaded++;
        try { file.delete(); } catch { /* The upload is complete even if local cleanup fails. */ }
      } catch (error) {
        // Keep both file and metadata for the next foreground retry.
        errors.push({ jobId: item.jobId, message: error instanceof Error ? error.message : 'Upload failed. Please try again.' });
      }
    }
    return { uploaded, pending: (await queuedFor(userId)).length, errors };
  } finally { syncing = false; }
}
