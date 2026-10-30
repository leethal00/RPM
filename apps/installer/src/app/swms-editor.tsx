import React, { useEffect, useRef, useState } from 'react';
import { Alert, Switch, Text, TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Crypto from 'expo-crypto';
import { useInstallerSession } from '../lib/session';
import { saveSwmsDraft, siteHealthSafety, SiteHealthSafety } from '../lib/health-safety';
import { draftError, errorMessage, stepFields, swmsBody, SwmsBody, swmsFields, templateBody, textValue } from '../lib/health-safety-form';
import { Button, Card, ErrorText, Loading, Page, SectionLabel, Title, styles } from '../lib/ui';

function Field({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [height, setHeight] = useState(84);
  return <View><Text style={[styles.heading, { fontSize: 14 }]}>{label}</Text>
    <TextInput accessibilityLabel={label} editable={!disabled} value={value} onChangeText={onChange} multiline
      textAlignVertical="top" onContentSizeChange={event => setHeight(Math.max(84, event.nativeEvent.contentSize.height + 28))}
      style={[styles.input, { minHeight: height }]} />
  </View>;
}

export default function SwmsEditor() {
  const { siteId, recordId } = useLocalSearchParams<{ siteId: string; recordId?: string }>();
  const { ready, allowed } = useInstallerSession();
  const [newId] = useState(() => Crypto.randomUUID());
  const [data, setData] = useState<SiteHealthSafety | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  const [body, setBody] = useState<SwmsBody>(() => swmsBody());
  const [jobId, setJobId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [showJobs, setShowJobs] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [initialForm, setInitialForm] = useState('');
  const saved = useRef(false);
  const navigation = useNavigation();
  const formSnapshot = JSON.stringify({ title, date, body, jobId, attendees });
  usePreventRemove(allowed && !!data && (!recordId || !!initialForm && formSnapshot !== initialForm || saving), ({ data: actionData }) => {
    if (saved.current) { navigation.dispatch(actionData.action); return; }
    if (saving) return;
    Alert.alert('Discard unsaved changes?', 'Save your SWMS draft before leaving to keep your work.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(actionData.action) },
    ]);
  });
  useEffect(() => {
    if (!allowed || !siteId) return;
    let active = true;
    void siteHealthSafety(siteId, recordId).then(value => {
      if (!active) return;
      if (!value.can_create || (recordId && !value.record?.can_edit)) throw new Error('You can create drafts and edit your own drafts. Admins can edit all drafts.');
      setError('');
      setData(value);
      if (value.record) {
        setTitle(value.record.title); setDate(value.record.work_date); setBody(swmsBody(value.record.body));
        setJobId(value.record.job_id); setAttendees(value.attendees.map(person => person.name).join('\n'));
        setInitialForm(JSON.stringify({ title: value.record.title, date: value.record.work_date, body: swmsBody(value.record.body), jobId: value.record.job_id, attendees: value.attendees.map(person => person.name).join('\n') }));
      } else {
        setTitle(`${value.site.name} — SWMS / TA`);
        setBody(swmsBody({ client: value.site.client_name }));
      }
    }).catch(cause => { if (active) setError(errorMessage(cause, 'Could not load draft form.')); });
    return () => { active = false; };
  }, [allowed, siteId, recordId, reload]);
  function chooseTemplate(id: string) {
    const template = data?.templates.find(value => value.id === id);
    if (!template) return;
    Alert.alert('Use this template?', 'This replaces the current draft fields and work steps. Title, date, job and attendees are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use template', onPress: () => { setBody({ ...templateBody(template.body), client: data?.site.client_name || '' }); setTemplateId(id); setShowTemplates(false); } },
    ]);
  }
  async function save() {
    if (saving || !data) return;
    const validation = draftError(title, date, body);
    if (validation) { setError(validation); return; }
    setSaving(true); setError('');
    try {
      const saved = await saveSwmsDraft({ siteId, id: recordId || newId, title: title.trim(), date: body.date_tbc ? null : date,
        body, jobId, attendees: attendees.split('\n'), updatedAt: data.record?.updated_at || null, templateId: recordId ? null : templateId });
      finishSave(saved.id);
    } catch (cause) { setError(errorMessage(cause, 'Could not save. Your entries are still here; check your connection and try again.')); }
    finally { setSaving(false); }
  }
  function finishSave(id: string) {
    saved.current = true;
    if (recordId) router.back();
    else router.replace({ pathname: '/health-safety-record/[id]', params: { id, siteId } });
  }
  if (!ready) return <Loading />;
  if (!allowed) return <Redirect href="/login" />;
  return <Page>
    <Title detail={data?.site.name}>{recordId ? 'Edit SWMS draft' : 'Create SWMS / TA'}</Title>
    {error ? <ErrorText message={error} /> : null}
    {!data ? (!error ? <Loading /> : <Button secondary onPress={() => { setError(''); setReload(value => value + 1); }}>Try again</Button>) : <>
      <Text style={[styles.muted, { marginBottom: 16 }]}>Save a draft while on site. An admin reviews, completes and locks it in RPM. An internet connection is needed to save.</Text>
      <Field label="Title" value={title} onChange={setTitle} disabled={saving} />
      <Text style={styles.heading}>Site</Text><Text style={[styles.muted, { marginBottom: 16 }]}>{data.site.name} · {data.site.address}</Text>
      <Button secondary disabled={saving} onPress={() => setShowJobs(value => !value)}>Job: {data.jobs.find(job => job.id === jobId)?.job_number || (jobId ? data.record?.job_reference || 'Linked job' : 'No job selected')} ▾</Button>
      {showJobs ? <Card><Button secondary disabled={saving} onPress={() => { setJobId(null); setShowJobs(false); }}>Site only / No job</Button>{data.jobs.map(job => <Button key={job.id} secondary disabled={saving} onPress={() => { setJobId(job.id); setShowJobs(false); }}>{job.job_number ? `${job.job_number} · ` : ''}{job.title}</Button>)}</Card> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}><Switch accessibilityLabel="Date TBC" disabled={saving} value={body.date_tbc === true} onValueChange={value => setBody(old => ({ ...old, date_tbc: value }))} /><Text style={styles.muted}>Date TBC</Text></View>
      {!body.date_tbc ? <><Text style={styles.heading}>Work date (YYYY-MM-DD)</Text><TextInput accessibilityLabel="Work date" editable={!saving} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} style={styles.input} /></> : null}
      {!recordId && data.templates.length ? <>
        <Button secondary disabled={saving} onPress={() => setShowTemplates(value => !value)}>Use a SWMS template ▾</Button>
        {showTemplates ? <Card>{data.templates.map(template => <Button secondary disabled={saving} key={template.id} onPress={() => chooseTemplate(template.id)}>{template.title}</Button>)}</Card> : null}
      </> : null}
      <SectionLabel>Company, site and work details</SectionLabel>
      {swmsFields.map(([key, label]) => <Field key={key} label={label} disabled={saving} value={textValue(body[key])} onChange={value => setBody(old => ({ ...old, [key]: value }))} />)}
      <SectionLabel>Safe work steps</SectionLabel>
      {body.steps.map((step, index) => <Card key={index}>
        <Text style={styles.heading}>Step {index + 1}</Text>
        {stepFields.map(([key, label]) => <Field key={key} label={label} disabled={saving} value={textValue(step[key])}
          onChange={value => setBody(old => ({ ...old, steps: old.steps.map((entry, position) => position === index ? { ...entry, [key]: value } : entry) }))} />)}
        <Button secondary disabled={saving} onPress={() => Alert.alert('Remove step?', `Remove step ${index + 1} from this draft?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => setBody(old => ({ ...old, steps: old.steps.filter((_, position) => position !== index) })) }])}>Remove step {index + 1}</Button>
      </Card>)}
      <Button secondary disabled={saving || body.steps.length >= 100} onPress={() => setBody(old => ({ ...old, steps: [...old.steps, { task: '', hazard: '', risk: '1', control: '', responsible: '' }] }))}>Add step</Button>
      <Field label="Attendees (one name per line)" value={attendees} onChange={setAttendees} disabled={saving} />
      {error ? <ErrorText message={error} /> : null}
      <Button disabled={saving} onPress={() => void save()}>{saving ? 'Saving draft…' : 'Save SWMS draft'}</Button>
    </>}
  </Page>;
}
