import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useInstallerSession } from '../../lib/session';
import { hsAttachmentUrl, siteHealthSafety, SiteHealthSafety } from '../../lib/health-safety';
import { errorMessage, stepFields, swmsBody, swmsFields, textValue } from '../../lib/health-safety-form';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, StatusPill, Title, styles } from '../../lib/ui';

export default function HsDocument() {
  const { id, siteId } = useLocalSearchParams<{ id: string; siteId: string }>();
  const { ready, allowed } = useInstallerSession();
  const [data, setData] = useState<SiteHealthSafety | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!allowed || !id || !siteId) return;
    let active = true;
    setError('');
    void siteHealthSafety(siteId, id).then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(errorMessage(cause, 'Could not open document.')); });
    return () => { active = false; };
  // The refresh token intentionally reloads this focused screen on demand.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, id, siteId, reload]));
  async function openAttachment(path: string) {
    try { await Linking.openURL(await hsAttachmentUrl(path)); }
    catch (cause) { setError(errorMessage(cause, 'Could not open attachment.')); }
  }
  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  const record = data?.record;
  const body = swmsBody(record?.body);
  const fields = [...swmsFields, ['run_by', 'Run by'], ['previous_actions', 'Previous actions'], ['safety_topics', 'Safety topics'], ['operations', 'Operations']] as const;
  return <Page>
    <Title detail={data?.site.name}>{record?.title || 'H&S document'}</Title>
    {error ? <ErrorText message={error} /> : null}
    {record ? <>
      <Card><StatusPill status={record.status} />
        <Text style={[styles.muted, { marginTop: 12 }]}>{body.date_tbc ? 'Date TBC' : record.work_date} · Revision {record.revision}</Text>
        {record.site ? <Text style={styles.muted}>{record.site}</Text> : null}
        {record.job_reference ? <Text style={styles.muted}>{record.job_reference}</Text> : null}
        {record.status === 'draft' ? <Text style={[styles.muted, { marginTop: 12 }]}>Draft — awaiting admin review and completion.</Text> : null}
      </Card>
      {record.can_edit ? <Button onPress={() => router.push({ pathname: '/swms-editor', params: { siteId, recordId: id } })}>Edit SWMS draft</Button> : null}
      {fields.filter(([key]) => textValue(body[key]).trim()).map(([key, label]) => <Card key={key}><Text style={styles.heading}>{label}</Text><Text selectable style={styles.muted}>{textValue(body[key])}</Text></Card>)}
      {body.steps.length ? <SectionLabel>Safe work steps</SectionLabel> : null}
      {body.steps.map((step, index) => <Card key={index}>
        <Text style={styles.heading}>Step {index + 1}</Text>
        {stepFields.map(([key, label]) => <React.Fragment key={key}><Text style={[styles.heading, { fontSize: 14, marginTop: 12 }]}>{label}</Text><Text selectable style={styles.muted}>{textValue(step[key]) || '—'}</Text></React.Fragment>)}
      </Card>)}
      <SectionLabel>Attendees</SectionLabel>
      <Card>{data.attendees.length ? data.attendees.map(person => <Text key={person.id} style={styles.muted}>{person.name}{person.signed_at ? ` · Signed ${person.signed_at.slice(0, 10)}` : ' · Not signed'}</Text>) : <Text style={styles.muted}>No attendees added.</Text>}</Card>
      {data.attachments.length ? <SectionLabel>Attachments</SectionLabel> : null}
      {data.attachments.map(file => <Button secondary key={file.id} onPress={() => void openAttachment(file.storage_path)}>{file.file_name} ↗</Button>)}
    </> : !error ? <Loading /> : null}
    <Button secondary onPress={() => setReload(value => value + 1)}>Refresh document</Button>
  </Page>;
}
