import { describe, expect, it } from 'vitest';
import { draftError, swmsBody, templateBody, textValue, validWorkDate } from '../../apps/installer/src/lib/health-safety-form';

describe('mobile SWMS draft form', () => {
  it('rejects impossible dates and supports a deliberately unconfirmed date', () => {
    expect(validWorkDate('2026-02-30')).toBe(false);
    expect(validWorkDate('2028-02-29')).toBe(true);
    expect(validWorkDate('30/10/2026')).toBe(false);
    expect(draftError('Site work', '', { steps: [], date_tbc: true })).toBe('');
    expect(draftError('Site work', '2026-02-30', { steps: [] })).toContain('valid work date');
  });
  it('allows incomplete drafts but requires a bounded title and step count', () => {
    expect(draftError('Site work', '2026-10-30', { steps: [] })).toBe('');
    expect(draftError(' ', '2026-10-30', { steps: [] })).toContain('title');
    expect(draftError('x'.repeat(251), '2026-10-30', { steps: [] })).toContain('title');
    expect(draftError('Site work', '2026-10-30', { steps: Array.from({ length: 101 }, () => ({})) })).toContain('100');
  });
  it('keeps unknown body fields and copies step objects without mutating saved data', () => {
    const original = { steps: [{ task: 'Access site', risk: '3' }], notes: 'Keep this', custom: 'Existing metadata' };
    const body = swmsBody(original);
    body.steps[0].task = 'New task';
    expect(original.steps[0].task).toBe('Access site');
    expect(body.custom).toBe('Existing metadata');
    expect(swmsBody({ steps: [null, 'invalid', { task: 'Safe step' }] }).steps).toEqual([{ task: 'Safe step' }]);
  });
  it('reuses safe work methods while clearing previous site-specific information', () => {
    const body = templateBody({ principal: 'Old contractor', emergency: 'Old contact', ppe: 'Harness', scope: 'Installation', steps: [{ control: 'Isolate area' }], date_tbc: true });
    expect(body.principal).toBe('');
    expect(body.emergency).toBe('');
    expect(body.ppe).toBe('Harness');
    expect(body.steps[0].control).toBe('Isolate area');
    expect(body.date_tbc).toBe(false);
    expect(textValue({ unsafe: 'object' })).toBe('');
    expect(textValue(3)).toBe('3');
  });
});
