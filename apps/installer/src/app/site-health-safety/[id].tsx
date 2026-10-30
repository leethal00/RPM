import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useInstallerSession } from '../../lib/session';
import { siteHealthSafety, SiteHealthSafety } from '../../lib/health-safety';
import { errorMessage } from '../../lib/health-safety-form';
import { Button, Card, ErrorText, Loading, Page, StatusPill, Title, styles } from '../../lib/ui';

export default function SiteHs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, allowed } = useInstallerSession();
  const [data, setData] = useState<SiteHealthSafety | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!allowed || !id) return;
    let active = true;
    setError('');
    void siteHealthSafety(id).then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(errorMessage(cause, 'Could not load site H&S.')); });
    return () => { active = false; };
  // The refresh token intentionally reloads this focused screen on demand.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, id, reload]));
  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  return <Page>
    <Title detail={data?.site.name}>Health & Safety</Title>
    {error ? <ErrorText message={error} /> : null}
    {data ? <>
      {data.can_create ? <Button onPress={() => router.push({ pathname: '/swms-editor', params: { siteId: id } })}>Create SWMS / TA</Button> : null}
      <Text style={[styles.muted, { marginBottom: 16 }]}>SWMS / TAs and toolbox meetings for this site. Open a document to read all details.</Text>
      {data.records.map(record => <Card key={record.id} onPress={() => router.push({ pathname: '/health-safety-record/[id]', params: { id: record.id, siteId: id } })}>
        <Text style={styles.heading}>{record.title}</Text>
        <StatusPill status={record.status} />
        <Text style={[styles.muted, { marginTop: 10 }]}>{record.kind === 'swms' ? 'SWMS / TA' : 'Toolbox meeting'} · {record.date_tbc ? 'Date TBC' : record.work_date} · Revision {record.revision}</Text>
        {record.job_reference ? <Text style={styles.muted}>{record.job_reference}</Text> : null}
        <Text style={[styles.muted, { marginTop: 10 }]}>Open document →</Text>
      </Card>)}
      {!data.records.length ? <Card><Text style={styles.muted}>No SWMS / TAs or toolbox meetings linked to this site yet.</Text></Card> : null}
    </> : !error ? <Loading /> : null}
    <Button secondary onPress={() => setReload(value => value + 1)}>Refresh H&S</Button>
  </Page>;
}
