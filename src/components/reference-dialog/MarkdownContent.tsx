import type { ReactNode } from 'react';
import styles from '../ReferenceDialog.module.css';

interface MarkdownSection {
  id: string;
  content: string;
}

interface MarkdownContentProps {
  markdown: string;
  idPrefix: string;
  query?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*[\]().]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sectionize(markdown: string, idPrefix: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let lines: string[] = [];
  let index = 0;

  const commit = () => {
    if (lines.length === 0) return;
    const heading = lines.find((line) => /^#{1,2}\s+/.test(line));
    const title = heading?.replace(/^#{1,2}\s+/, '') ?? `section-${index + 1}`;
    sections.push({ id: `${idPrefix}-${slugify(title)}-${index++}`, content: lines.join('\n') });
    lines = [];
  };

  for (const line of markdown.split('\n')) {
    if (lines.length > 0 && /^##\s+/.test(line)) commit();
    lines.push(line);
  }
  commit();

  return sections;
}

function renderInline(text: string, idPrefix: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]*\))/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token[0] === '`') {
      parts.push(
        <code key={key++} className={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{renderInline(token.slice(2, -2), idPrefix)}</strong>);
    } else if (token[0] === '*') {
      parts.push(<em key={key++}>{renderInline(token.slice(1, -1), idPrefix)}</em>);
    } else {
      const link = token.match(/\[([^\]]+)\]\(([^)]*)\)/);
      if (!link) {
        parts.push(token);
      } else if (link[2].startsWith('#')) {
        const targetId = `${idPrefix}-${slugify(link[2].slice(1))}`;
        parts.push(
          <a
            key={key++}
            className={styles.tutLink}
            href={link[2]}
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById(targetId)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {renderInline(link[1], idPrefix)}
          </a>,
        );
      } else {
        parts.push(<span key={key++}>{renderInline(link[1], idPrefix)}</span>);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inCode = false;

  for (const char of line.trim().slice(1, -1)) {
    if (char === '`') inCode = !inCode;
    if (char === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseMarkdown(markdown: string, idPrefix: string): ReactNode[] {
  const lines = markdown.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      blocks.push(<hr key={key++} className={styles.tutHr} />);
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) codeLines.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className={styles.tutPre}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      const level = heading[1].length;
      const className = level === 1 ? styles.tutH1 : level === 2 ? styles.tutH2 : styles.tutH3;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
      blocks.push(
        <Tag key={key++} id={`${idPrefix}-${slugify(heading[2])}`} className={className}>
          {renderInline(heading[2], idPrefix)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) quoteLines.push(lines[i++].slice(2));
      blocks.push(
        <blockquote key={key++} className={styles.tutBlockquote}>
          {renderInline(quoteLines.join(' '), idPrefix)}
        </blockquote>,
      );
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) tableLines.push(lines[i++]);
      const separator = /^\|[-|: ]+\|$/;
      const dataStart = tableLines.length > 1 && separator.test(tableLines[1].trim()) ? 2 : 1;
      blocks.push(
        <div key={key++} className={styles.tutTableWrap}>
          <table className={styles.tutTable}>
            <thead>
              <tr>
                {splitTableRow(tableLines[0]).map((cell, cellIndex) => (
                  <th key={cellIndex} className={styles.tutTh}>
                    {renderInline(cell, idPrefix)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableLines.slice(dataStart).map((tableLine, rowIndex) => (
                <tr key={rowIndex}>
                  {splitTableRow(tableLine).map((cell, cellIndex) => (
                    <td key={cellIndex} className={styles.tutTd}>
                      {renderInline(cell, idPrefix)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={key++} className={styles.tutUl}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, idPrefix)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i++].replace(/^\d+\. /, ''));
      }
      blocks.push(
        <ol key={key++} className={styles.tutOl}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, idPrefix)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('|') &&
      !lines[i].startsWith('> ') &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      lines[i].trim() !== '---'
    ) {
      paragraphLines.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className={styles.tutP}>
        {renderInline(paragraphLines.join(' '), idPrefix)}
      </p>,
    );
  }

  return blocks;
}

export function MarkdownContent({ markdown, idPrefix, query = '' }: MarkdownContentProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const sections = sectionize(markdown, idPrefix).filter(
    (section) => !normalizedQuery || section.content.toLowerCase().includes(normalizedQuery),
  );

  if (sections.length === 0) {
    return <div className={styles.empty}>no matches for &ldquo;{query}&rdquo;</div>;
  }

  return (
    <div className={styles.tutContent}>
      {sections.map((section) => (
        <section key={section.id}>{parseMarkdown(section.content, idPrefix)}</section>
      ))}
    </div>
  );
}
