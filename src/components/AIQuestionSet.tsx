import { useMemo, useState } from 'react';
import type { AiQuestionAnswer, AiQuestionSet as QuestionSet } from '../ai/chat-types.ts';
import styles from './AIChatPanel.module.css';

interface Props {
  questionSet: QuestionSet;
  onSubmit: (answers: AiQuestionAnswer[]) => void;
  onCancel: () => void;
}

export default function AIQuestionSet({ questionSet, onSubmit, onCancel }: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const valid = useMemo(
    () =>
      questionSet.questions.every(
        (question) =>
          !question.required ||
          (selected[question.id]?.length ?? 0) > 0 ||
          Boolean(other[question.id]?.trim()),
      ),
    [other, questionSet.questions, selected],
  );

  return (
    <form
      className={styles.questions}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit(
          questionSet.questions.map((question) => ({
            questionId: question.id,
            selectedOptionIds: selected[question.id] ?? [],
            ...(other[question.id]?.trim() ? { other: other[question.id].trim() } : {}),
          })),
        );
      }}
    >
      {questionSet.introduction && <p>{questionSet.introduction}</p>}
      {questionSet.questions.map((question, questionIndex) => (
        <fieldset key={question.id}>
          <legend>
            {questionIndex + 1}. {question.prompt}
          </legend>
          {question.options.map((option) => {
            const checked = selected[question.id]?.includes(option.id) ?? false;
            return (
              <label key={option.id}>
                <input
                  type={question.selection === 'single' ? 'radio' : 'checkbox'}
                  name={question.id}
                  checked={checked}
                  onChange={() =>
                    setSelected((current) => ({
                      ...current,
                      [question.id]:
                        question.selection === 'single'
                          ? [option.id]
                          : checked
                            ? (current[question.id] ?? []).filter((id) => id !== option.id)
                            : [...(current[question.id] ?? []), option.id],
                    }))
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  {question.recommendedOptionId === option.id && <em>Recommended</em>}
                  <small>{option.description}</small>
                </span>
              </label>
            );
          })}
          {question.allowOther && (
            <label className={styles.otherAnswer}>
              Other
              <input
                value={other[question.id] ?? ''}
                maxLength={500}
                onChange={(event) =>
                  setOther((current) => ({ ...current, [question.id]: event.target.value }))
                }
              />
            </label>
          )}
        </fieldset>
      ))}
      <div className={styles.questionActions}>
        <button type="button" onClick={onCancel}>
          Cancel questions
        </button>
        <button type="submit" disabled={!valid}>
          Submit answers
        </button>
      </div>
    </form>
  );
}
