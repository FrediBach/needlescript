/**
 * src/book/components/Quiz.tsx
 *
 * Multiple-choice or predict-the-output question with instant feedback.
 * No server required — answers are evaluated client-side.
 *
 * Usage in MDX:
 *   <Quiz
 *     question="What does `repeat 4 [ fd 10 rt 90 ]` draw?"
 *     options={['A circle', 'A square', 'A triangle', 'Nothing']}
 *     answer={1}
 *   />
 */

interface Props {
  question: string;
  options: string[];
  /** 0-based index of the correct answer. */
  answer: number;
  /** Optional explanation shown after answering. */
  explanation?: string;
}

import { useState } from 'react';

export default function Quiz({ question, options, answer, explanation }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  return (
    <div
      style={{
        border: '1px solid var(--bk-border)',
        borderRadius: 6,
        overflow: 'hidden',
        marginBlock: '1.75rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.4rem 0.75rem',
          background: 'var(--bk-bg-alt)',
          borderBottom: '1px solid var(--bk-border)',
          fontFamily: 'var(--bk-font-mono)',
          fontSize: '0.7rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--bk-text-faint)',
        }}
      >
        Quiz
      </div>

      <div style={{ padding: '1rem 1rem 0.75rem' }}>
        <p
          style={{
            margin: '0 0 0.85rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: 'var(--bk-text)',
          }}
        >
          {question}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {options.map((opt, i) => {
            const isCorrect = i === answer;
            const isSelected = i === selected;
            let bg = 'var(--bk-chip-bg)';
            let color = 'var(--bk-text)';
            let borderColor = 'var(--bk-border)';

            if (answered) {
              if (isCorrect) {
                bg = 'var(--bk-chip-correct-bg)';
                color = 'var(--bk-chip-correct-text)';
                borderColor = 'var(--bk-chip-correct-text)';
              } else if (isSelected) {
                bg = 'var(--bk-chip-wrong-bg)';
                color = 'var(--bk-chip-wrong-text)';
                borderColor = 'var(--bk-chip-wrong-text)';
              }
            }

            return (
              <button
                key={i}
                onClick={() => !answered && setSelected(i)}
                disabled={answered}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.45rem 0.75rem',
                  background: bg,
                  color,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 4,
                  textAlign: 'left',
                  cursor: answered ? 'default' : 'pointer',
                  fontFamily: 'var(--bk-font-prose)',
                  fontSize: '0.88rem',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--bk-font-mono)',
                    fontSize: '0.75rem',
                    opacity: 0.6,
                    minWidth: '1rem',
                  }}
                >
                  {String.fromCharCode(65 + i)}.
                </span>
                <span style={{ flex: 1 }}>{opt}</span>
                {answered && isCorrect && <span>✓</span>}
                {answered && isSelected && !isCorrect && <span>✗</span>}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {answered && explanation && (
          <p
            style={{
              marginTop: '0.85rem',
              marginBottom: 0,
              padding: '0.6rem 0.75rem',
              background: 'var(--bk-bg-alt)',
              border: '1px solid var(--bk-border)',
              borderRadius: 4,
              fontSize: '0.88rem',
              color: 'var(--bk-text-muted)',
              fontStyle: 'italic',
            }}
          >
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
}
