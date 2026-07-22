import type { AiProviderTool } from './provider.ts';

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const target = { type: 'string', enum: ['live', 'draft'] };

export const AI_CHAT_TOOLS: AiProviderTool[] = [
  {
    type: 'function',
    function: {
      name: 'ask_user_questions',
      description: 'Pause and ask one compact set of material multiple-choice questions.',
      parameters: objectSchema(
        {
          introduction: { type: 'string', maxLength: 300 },
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: objectSchema(
              {
                id: { type: 'string', maxLength: 40 },
                prompt: { type: 'string', maxLength: 240 },
                selection: { type: 'string', enum: ['single', 'multiple'] },
                required: { type: 'boolean' },
                options: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 5,
                  items: objectSchema(
                    {
                      id: { type: 'string', maxLength: 40 },
                      label: { type: 'string', maxLength: 80 },
                      description: { type: 'string', maxLength: 180 },
                    },
                    ['id', 'label', 'description'],
                  ),
                },
                recommendedOptionId: { type: 'string', maxLength: 40 },
                allowOther: { type: 'boolean' },
              },
              ['id', 'prompt', 'selection', 'required', 'options'],
            ),
          },
        },
        ['questions'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: 'Create a visible checklist for genuinely multi-step work.',
      parameters: objectSchema(
        {
          title: { type: 'string', maxLength: 120 },
          steps: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: objectSchema(
              {
                id: { type: 'string', maxLength: 40 },
                text: { type: 'string', maxLength: 160 },
                status: { type: 'string', enum: ['pending', 'in-progress'] },
              },
              ['id', 'text', 'status'],
            ),
          },
        },
        ['title', 'steps'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Atomically advance or revise the current visible checklist.',
      parameters: objectSchema(
        {
          planId: { type: 'string' },
          expectedVersion: { type: 'integer', minimum: 1 },
          explanation: { type: 'string', maxLength: 240 },
          steps: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: objectSchema(
              {
                id: { type: 'string', maxLength: 40 },
                text: { type: 'string', maxLength: 160 },
                status: {
                  type: 'string',
                  enum: ['pending', 'in-progress', 'completed'],
                },
              },
              ['id', 'text', 'status'],
            ),
          },
        },
        ['planId', 'expectedVersion', 'steps'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_source',
      description: 'Read a bounded, line-numbered page of live or private draft source.',
      parameters: objectSchema({
        target,
        startLine: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'compile_design',
      description: 'Compile live or draft source and return bounded stitch and physics facts.',
      parameters: objectSchema({
        target,
        seed: { type: 'integer' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_spatial',
      description:
        'Inspect exact compiled hoop-space layout for the design or selected source lines.',
      parameters: objectSchema({
        target,
        scope: { type: 'string', enum: ['design', 'source-lines', 'box'] },
        sourceLines: {
          type: 'array',
          maxItems: 24,
          items: { type: 'integer', minimum: 1 },
        },
        box: objectSchema(
          {
            minX: { type: 'number' },
            minY: { type: 'number' },
            maxX: { type: 'number' },
            maxY: { type: 'number' },
          },
          ['minX', 'minY', 'maxX', 'maxY'],
        ),
        includeOccupancy: { type: 'boolean' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_physics',
      description: 'Return filtered structured physics findings from a compiled target.',
      parameters: objectSchema({
        target,
        severities: {
          type: 'array',
          items: { type: 'string', enum: ['error', 'warning', 'info'] },
        },
        codes: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        sourceLines: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          maxItems: 24,
        },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        cursor: { type: 'string' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_draft',
      description:
        'Apply atomic, non-overlapping edits to the private draft. Never edits live source.',
      parameters: objectSchema(
        {
          expectedRevision: { type: 'integer', minimum: 0 },
          expectedHash: { type: 'string' },
          edits: {
            type: 'array',
            minItems: 1,
            maxItems: 24,
            items: objectSchema(
              {
                startLine: { type: 'integer', minimum: 1 },
                startColumn: { type: 'integer', minimum: 1 },
                endLine: { type: 'integer', minimum: 1 },
                endColumn: { type: 'integer', minimum: 1 },
                text: { type: 'string', maxLength: 24000 },
              },
              ['startLine', 'startColumn', 'endLine', 'endColumn', 'text'],
            ),
          },
          reason: { type: 'string', maxLength: 240 },
        },
        ['expectedRevision', 'expectedHash', 'edits', 'reason'],
      ),
    },
  },
];
