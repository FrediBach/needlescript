import type { AiWorkPlan } from '../ai/chat-types.ts';
import styles from './AIChatPanel.module.css';

export default function AIWorkPlan({ plan }: { plan: AiWorkPlan }) {
  const complete = plan.steps.every(({ status }) => status === 'completed');
  return (
    <section className={styles.plan} aria-label={`Work plan: ${plan.title}`}>
      <strong>{plan.title}</strong>
      <ol>
        {plan.steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span className={styles.planCheck} aria-hidden="true">
              {step.status === 'completed' ? '✓' : step.status === 'in-progress' ? '◉' : '○'}
            </span>
            <span>{step.text}</span>
            <span className="sr-only">
              {step.status === 'in-progress' ? 'In progress' : step.status}
            </span>
          </li>
        ))}
      </ol>
      {complete && <small>All steps completed</small>}
    </section>
  );
}
