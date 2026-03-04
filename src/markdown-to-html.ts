import { marked } from 'marked';

// marked v5+でstring | Promise<string>が返る問題を防ぐ
// async: false で同期モードを明示的に使用
marked.use({ async: false });

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}
