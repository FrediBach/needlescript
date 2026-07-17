// Keep Monaco and its selected editor contributions out of the application
// shell. This setup module must evaluate before EditorPane asks the React
// wrapper to initialize Monaco.
import '../monaco-setup.ts';

export { default } from './EditorPane.tsx';
