import { describe, expect, it } from 'vitest';
import { parseToolArguments, validatePlanSteps, validateQuestionSet } from './tool-validation.ts';

describe('AI chat tool validation', () => {
  it('rejects malformed JSON and non-object arguments', () => {
    expect(parseToolArguments('{')).toMatchObject({ ok: false });
    expect(parseToolArguments('[]')).toMatchObject({ ok: false });
  });

  it('validates question IDs, recommendations, and bounds', () => {
    const valid = validateQuestionSet({
      introduction: 'Choose a direction.',
      questions: [
        {
          id: 'area',
          prompt: 'Which area?',
          selection: 'single',
          required: true,
          options: [
            { id: 'left', label: 'Left', description: 'Changes the left side.' },
            { id: 'all', label: 'Whole design', description: 'Changes everything.' },
          ],
          recommendedOptionId: 'left',
        },
      ],
    });
    expect(valid).toMatchObject({ ok: true });
    if (!valid.ok) return;
    const invalid = validateQuestionSet({
      ...valid.value,
      questions: [{ ...valid.value.questions[0], recommendedOptionId: 'missing' }],
    });
    expect(invalid).toEqual({ ok: false, error: 'Recommended option does not exist.' });
  });

  it('permits at most one in-progress plan step', () => {
    expect(
      validatePlanSteps(
        [
          { id: 'a', text: 'Inspect source', status: 'in-progress' },
          { id: 'b', text: 'Compile draft', status: 'in-progress' },
        ],
        true,
      ),
    ).toEqual({ ok: false, error: 'At most one plan step may be in progress.' });
  });
});
