export const swmsFields = [
  ['principal', 'Principal contractor'], ['client', 'Client'], ['responsible', 'Person responsible'],
  ['duration', 'Duration'], ['notification', 'Notifications'], ['permits', 'Permits'],
  ['ppe', 'PPE'], ['plant', 'Plant / equipment'], ['signage', 'Signage'], ['approvals', 'Approvals'],
  ['checks', 'Pre-start checks'], ['qualifications', 'Qualifications / training'],
  ['scope', 'Scope of work'], ['hazards', 'Site hazards'], ['controls', 'Site controls'],
  ['emergency', 'Emergency arrangements'], ['actions', 'Actions'], ['notes', 'Notes'],
] as const;
export const stepFields = [['task', 'Procedure / job step'], ['hazard', 'Potential hazards'], ['risk', 'Risk level 1–5'], ['control', 'Hazard controls'], ['responsible', 'Person responsible']] as const;
export type WorkStep = Partial<Record<typeof stepFields[number][0], string>>;
export type SwmsBody = Record<string, unknown> & { steps: WorkStep[]; date_tbc?: boolean };
export const textValue = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function swmsBody(value: Record<string, unknown> = {}): SwmsBody {
  return { ...value, steps: Array.isArray(value.steps) ? value.steps.filter((v): v is WorkStep => !!v && typeof v === 'object' && !Array.isArray(v)).map(v => ({ ...v })) : [] };
}
export function templateBody(value: Record<string, unknown>): SwmsBody {
  const body = swmsBody(value);
  for (const key of ['principal', 'client', 'responsible', 'duration', 'notification', 'permits', 'approvals', 'emergency', 'actions', 'notes']) body[key] = '';
  body.date_tbc = false;
  return body;
}
export function validWorkDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function draftError(title: string, date: string, body: SwmsBody): string {
  if (!title.trim() || title.length > 250) return 'Enter a title (up to 250 characters).';
  if (!body.date_tbc && !validWorkDate(date)) return 'Enter a valid work date as YYYY-MM-DD, or choose Date TBC.';
  if (body.steps.length > 100) return 'Use at most 100 work steps.';
  return '';
}
export function errorMessage(cause: unknown, fallback: string): string {
  return cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : fallback;
}
