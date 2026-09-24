import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

const KEY = 'rpm-installer-photo-queue-v1';
export type QueuedPhoto = { id: string; userId: string; jobId: string; path: string; uri: string; caption: string | null; capturedAt: string };

async function all(): Promise<QueuedPhoto[]> {
  return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as QueuedPhoto[];
}
export async function queuedFor(userId: string) { return (await all()).filter(item => item.userId === userId); }

export async function enqueuePhoto(userId: string, jobId: string, sourceUri: string, caption: string | null) {
  const id = Crypto.randomUUID();
  const copy = new File(Paths.document, `installer-${id}.jpg`);
  new File(sourceUri).copy(copy);
  const item: QueuedPhoto = { id, userId, jobId, path: `${jobId}/${userId}/${id}.jpg`, uri: copy.uri, caption, capturedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify([...(await all()), item]));
  return item;
}

let syncing = false;
export async function syncPhotos(userId: string): Promise<{ uploaded: number; pending: number }> {
  if (syncing) return { uploaded: 0, pending: (await queuedFor(userId)).length };
  syncing = true;
  let uploaded = 0;
  try {
    for (const item of await queuedFor(userId)) {
      try {
        const file = new File(item.uri);
        const body = await file.arrayBuffer();
        const { error: uploadError } = await supabase.storage.from('installer-photos').upload(item.path, body, { contentType: 'image/jpeg', upsert: false });
        if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
        const { error: registerError } = await supabase.rpc('installer_register_photo', {
          p_job_id: item.jobId, p_path: item.path, p_caption: item.caption, p_captured_at: item.capturedAt,
        });
        if (registerError) throw registerError;
        await AsyncStorage.setItem(KEY, JSON.stringify((await all()).filter(photo => photo.id !== item.id)));
        file.delete();
        uploaded++;
      } catch { /* Keep both file and metadata for the next foreground retry. */ }
    }
    return { uploaded, pending: (await queuedFor(userId)).length };
  } finally { syncing = false; }
}
