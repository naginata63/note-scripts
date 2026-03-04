import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { NoteClient } from './note-client.js';
import { markdownToHtml } from './markdown-to-html.js';

export function getTools(): Tool[] {
  return [
    {
      name: 'note_create_draft',
      description: 'note.comに記事を下書き保存します',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '記事タイトル',
          },
          body: {
            type: 'string',
            description: '記事本文（Markdown形式）',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'タグ一覧（省略可）',
          },
        },
        required: ['title', 'body'],
      },
    },
    {
      name: 'note_publish',
      description: 'note.comの下書きを公開します',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: {
            type: 'string',
            description: '公開する記事のID',
          },
          title: {
            type: 'string',
            description: '記事タイトル',
          },
          body: {
            type: 'string',
            description: '記事本文（Markdown形式）',
          },
        },
        required: ['note_id', 'title', 'body'],
      },
    },
    {
      name: 'note_edit',
      description: 'note.comの既存記事を編集します',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: {
            type: 'string',
            description: '編集する記事のID',
          },
          title: {
            type: 'string',
            description: '新しいタイトル（省略可）',
          },
          body: {
            type: 'string',
            description: '新しい本文（Markdown形式、省略可）',
          },
        },
        required: ['note_id'],
      },
    },
    {
      name: 'note_search',
      description: 'note.com上の記事をキーワード検索します（認証不要）',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '検索キーワード',
          },
          page: {
            type: 'number',
            description: 'ページ番号（デフォルト: 1）',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'note_list_drafts',
      description: '自分の下書き一覧を取得します',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

type ToolArgs = Record<string, unknown>;

export async function handleTool(
  name: string,
  args: ToolArgs,
  client: NoteClient
): Promise<CallToolResult> {
  try {
    switch (name) {
      case 'note_create_draft': {
        const title = args.title as string;
        const body = args.body as string;
        const html = markdownToHtml(body);
        const result = await client.createDraft(title, html);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ note_id: result.id, status: 'draft', url: result.url }),
            },
          ],
        };
      }

      case 'note_publish': {
        const noteId = args.note_id as string;
        const title = args.title as string;
        const body = args.body as string;
        const html = markdownToHtml(body);
        const result = await client.publishNote(noteId, title, html);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ note_id: result.id, status: 'published', url: result.url }),
            },
          ],
        };
      }

      case 'note_edit': {
        const noteId = args.note_id as string;
        const title = args.title as string | undefined;
        const body = args.body as string | undefined;
        const html = body !== undefined ? markdownToHtml(body) : undefined;
        const result = await client.editNote(noteId, title, html);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ note_id: result.id, status: result.status }),
            },
          ],
        };
      }

      case 'note_search': {
        const query = args.query as string;
        const page = (args.page as number | undefined) ?? 1;
        const results = await client.searchNotes(query, page);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ results }),
            },
          ],
        };
      }

      case 'note_list_drafts': {
        const drafts = await client.listDrafts();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ drafts }),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}
