import languageReference from '../../../needlescript-language-eference.md?raw';
import { MarkdownContent } from './MarkdownContent';

interface LanguageReferenceContentProps {
  query: string;
}

export function LanguageReferenceContent({ query }: LanguageReferenceContentProps) {
  return <MarkdownContent markdown={languageReference} idPrefix="reference" query={query} />;
}
