import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { syncPhotos } from './photo-queue';

export type MobileRole = 'installer' | 'mobile_admin' | 'rodier_admin' | 'super_admin' | null;
type SessionState = { session: Session | null; ready: boolean; allowed: boolean; role: MobileRole; refreshRole: () => Promise<void> };
const Context = createContext<SessionState>({ session: null, ready: false, allowed: false, role: null, refreshRole: async () => {} });
export const useInstallerSession = () => useContext(Context);

export function InstallerSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [role, setRole] = useState<MobileRole>(null);
  async function refreshRole() {
    const { data: { session: current } } = await supabase.auth.getSession();
    setSession(current);
    if (!current) { setRole(null); setAllowed(false); setReady(true); return; }
    const { data } = await supabase.from('users').select('role').eq('id', current.user.id).single();
    const nextRole = (['installer', 'mobile_admin', 'rodier_admin', 'super_admin'].includes(data?.role) ? data?.role : null) as MobileRole;
    setRole(nextRole);
    setAllowed(nextRole !== null);
    setReady(true);
    if (nextRole) void syncPhotos(current.user.id);
  }
  useEffect(() => {
    const initial = setTimeout(() => { void refreshRole(); }, 0);
    const auth = supabase.auth.onAuthStateChange(() => { setTimeout(() => { void refreshRole(); }, 0); });
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshRole();
    });
    return () => { clearTimeout(initial); auth.data.subscription.unsubscribe(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!allowed || !session) return;
    const retry = setInterval(() => { void syncPhotos(session.user.id); }, 30000);
    return () => clearInterval(retry);
  }, [allowed, session]);
  return <Context.Provider value={{ session, ready, allowed, role, refreshRole }}>{children}</Context.Provider>;
}
