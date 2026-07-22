import type { AiQuestionSet, AiWorkPlan } from './chat-types.ts';

type JsonObject = Record<string, unknown>;

export function parseToolArguments(
  raw: string,
): { ok: true; value: JsonObject } | { ok: false; error: string } {
  if (raw.length > 64_000) return { ok: false, error: 'Tool arguments are too large.' };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'Tool arguments must be a JSON object.' };
    }
    return { ok: true, value: value as JsonObject };
  } catch {
    return { ok: false, error: 'Tool arguments are not valid JSON.' };
  }
}

export function hasOnlyKeys(value: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const boundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function validateQuestionSet(
  value: JsonObject,
): { ok: true; value: AiQuestionSet } | { ok: false; error: string } {
  if (!hasOnlyKeys(value, ['introduction', 'questions'])) {
    return { ok: false, error: 'Unknown question-set property.' };
  }
  if (
    value.introduction !== undefined &&
    (typeof value.introduction !== 'string' || value.introduction.length > 300)
  ) {
    return { ok: false, error: 'Question introduction is invalid.' };
  }
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 3) {
    return { ok: false, error: 'A question set must contain one to three questions.' };
  }
  const questionIds = new Set<string>();
  for (const raw of value.questions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { ok: false, error: 'Invalid question.' };
    const question = raw as JsonObject;
    if (
      !hasOnlyKeys(question, [
        'id',
        'prompt',
        'selection',
        'required',
        'options',
        'recommendedOptionId',
        'allowOther',
      ])
    ) {
      return { ok: false, error: 'Unknown question property.' };
    }
    if (!boundedString(question.id, 40) || questionIds.has(question.id))
      return { ok: false, error: 'Question IDs must be unique.' };
    questionIds.add(question.id);
    if (
      !boundedString(question.prompt, 240) ||
      !['single', 'multiple'].includes(String(question.selection)) ||
      typeof question.required !== 'boolean'
    ) {
      return { ok: false, error: 'Question prompt, selection, or required flag is invalid.' };
    }
    if (
      !Array.isArray(question.options) ||
      question.options.length < 2 ||
      question.options.length > 5
    )
      return { ok: false, error: 'Each question needs two to five options.' };
    const optionIds = new Set<string>();
    for (const rawOption of question.options) {
      if (!rawOption || typeof rawOption !== 'object' || Array.isArray(rawOption))
        return { ok: false, error: 'Invalid question option.' };
      const option = rawOption as JsonObject;
      if (
        !hasOnlyKeys(option, ['id', 'label', 'description']) ||
        !boundedString(option.id, 40) ||
        optionIds.has(option.id) ||
        !boundedString(option.label, 80) ||
        !boundedString(option.description, 180)
      )
        return {
          ok: false,
          error: 'Question options must have unique IDs, labels, and descriptions.',
        };
      optionIds.add(option.id);
    }
    if (
      question.recommendedOptionId !== undefined &&
      !optionIds.has(String(question.recommendedOptionId))
    )
      return { ok: false, error: 'Recommended option does not exist.' };
    if (question.allowOther !== undefined && typeof question.allowOther !== 'boolean')
      return { ok: false, error: 'allowOther must be boolean.' };
  }
  return { ok: true, value: value as unknown as AiQuestionSet };
}

export function validatePlanSteps(
  value: unknown,
  allowCompleted: boolean,
): { ok: true; steps: AiWorkPlan['steps'] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8)
    return { ok: false, error: 'Plans need two to eight steps.' };
  const ids = new Set<string>();
  let active = 0;
  const steps: AiWorkPlan['steps'] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { ok: false, error: 'Invalid plan step.' };
    const step = raw as JsonObject;
    if (
      !hasOnlyKeys(step, ['id', 'text', 'status']) ||
      !boundedString(step.id, 40) ||
      ids.has(step.id) ||
      !boundedString(step.text, 160)
    )
      return { ok: false, error: 'Plan step IDs and text must be valid and unique.' };
    const allowed = allowCompleted
      ? ['pending', 'in-progress', 'completed']
      : ['pending', 'in-progress'];
    if (!allowed.includes(String(step.status)))
      return { ok: false, error: 'Invalid plan step status.' };
    if (step.status === 'in-progress') active++;
    ids.add(step.id);
    steps.push({
      id: step.id,
      text: step.text,
      status: step.status as AiWorkPlan['steps'][number]['status'],
    });
  }
  if (active > 1) return { ok: false, error: 'At most one plan step may be in progress.' };
  return { ok: true, steps };
}
