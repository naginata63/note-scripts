import fetch, { Response as FetchResponse } from 'node-fetch';
import type { RequestInit } from 'node-fetch';

const BASE_URL = 'https://note.com';
const USER_AGENT = 'note-mcp-server/0.1.0';
const FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<FetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

interface SignInResponse {
  data?: {
    csrf_token?: string;
  };
}

interface DraftSaveResponse {
  data?: {
    id?: string;
    key?: string;
    url?: string;
  };
}

interface PublishResponse {
  data?: {
    id?: string;
    key?: string;
    noteUrl?: string;
    url?: string;
  };
}

interface SearchResponse {
  data?: {
    notes?: {
      contents?: Array<{
        id: string;
        key?: string;
        name: string;
        noteUrl?: string;
        url?: string;
        user?: {
          nickname?: string;
          urlname?: string;
        };
        likeCount?: number;
      }>;
    };
  };
}

interface DraftListResponse {
  data?: {
    notes?: Array<{
      id: string;
      key?: string;
      name: string;
      updatedAt?: string;
      updated_at?: string;
    }>;
  };
}

export class NoteClient {
  private cookie: string = '';
  private csrfToken: string = '';
  private isAuthenticated: boolean = false;

  async authenticate(): Promise<void> {
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;

    if (!email || !password) {
      throw new Error('NOTE_EMAIL または NOTE_PASSWORD 環境変数が設定されていません');
    }

    const response = await fetchWithTimeout(`${BASE_URL}/api/v1/sessions/sign_in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        login: email,
        password: password,
        g_recaptcha_response: '',
        redirect_path: '/',
      }),
    });

    if (response.status === 401) {
      throw new Error('認証失敗: メールアドレスまたはパスワードが正しくありません');
    }

    if (response.status === 429) {
      throw new Error('リクエスト上限に達しました。しばらく待ってから再度お試しください');
    }

    if (!response.ok) {
      const bodyText = await response.text();
      if (bodyText.toLowerCase().includes('recaptcha')) {
        throw new Error('reCAPTCHA検出: ブラウザでnote.comに一度ログインしてから再度お試しください');
      }
      throw new Error(`note.com APIの仕様が変更された可能性があります。開発者にお知らせください (HTTP ${response.status})`);
    }

    // node-fetch v3: getSetCookie() で複数Set-Cookieを配列取得
    // fallback: raw()['set-cookie'] (node-fetch v2), get() (single string)
    const headersAny = response.headers as any;
    let setCookies: string[];
    if (typeof headersAny.getSetCookie === 'function') {
      setCookies = headersAny.getSetCookie();
    } else if (typeof headersAny.raw === 'function') {
      setCookies = headersAny.raw()['set-cookie'] ?? [];
    } else {
      const single = response.headers.get('set-cookie');
      setCookies = single ? [single] : [];
    }
    if (setCookies.length > 0) {
      this.cookie = setCookies.map((c: string) => c.split(';')[0]).join('; ');
    }

    const body = await response.json() as SignInResponse;
    this.csrfToken = body?.data?.csrf_token ?? '';
    this.isAuthenticated = true;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'Cookie': this.cookie,
      'X-CSRF-Token': this.csrfToken,
      'User-Agent': USER_AGENT,
    };
  }

  private async requestWithReauth<T>(
    fn: () => Promise<{ response: FetchResponse; body: T }>
  ): Promise<{ response: FetchResponse; body: T }> {
    await this.ensureAuthenticated();
    const result = await fn();
    if (result.response.status === 401) {
      this.isAuthenticated = false;
      await this.authenticate();
      return await fn();
    }
    return result;
  }

  async createDraft(title: string, bodyHtml: string): Promise<{ id: string; url: string }> {
    const { response, body } = await this.requestWithReauth<DraftSaveResponse>(async () => {
      const resp = await fetchWithTimeout(`${BASE_URL}/api/v1/text_notes/draft_save`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: title,
          body: bodyHtml,
          body_length: bodyHtml.length,
        }),
      });
      const b = await resp.json() as DraftSaveResponse;
      return { response: resp, body: b };
    });

    this.handleErrorResponse(response);

    const id = body?.data?.key ?? body?.data?.id ?? '';
    const url = body?.data?.url ?? `${BASE_URL}/n/${id}`;
    return { id, url };
  }

  async publishNote(noteId: string, title: string, bodyHtml: string): Promise<{ id: string; url: string }> {
    const { response, body } = await this.requestWithReauth<PublishResponse>(async () => {
      const resp = await fetchWithTimeout(`${BASE_URL}/api/v1/text_notes/${noteId}`, {
        method: 'PUT',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'published',
          name: title,
          free_body: bodyHtml,
        }),
      });
      const b = await resp.json() as PublishResponse;
      return { response: resp, body: b };
    });

    this.handleErrorResponse(response);

    const id = body?.data?.key ?? body?.data?.id ?? noteId;
    const url = body?.data?.noteUrl ?? body?.data?.url ?? `${BASE_URL}/n/${id}`;
    return { id, url };
  }

  async editNote(noteId: string, title?: string, bodyHtml?: string): Promise<{ id: string; status: string }> {
    const payload: Record<string, unknown> = {};
    if (title !== undefined) payload.name = title;
    if (bodyHtml !== undefined) payload.free_body = bodyHtml;

    const { response } = await this.requestWithReauth<unknown>(async () => {
      const resp = await fetchWithTimeout(`${BASE_URL}/api/v1/text_notes/${noteId}`, {
        method: 'PUT',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const b = await resp.json();
      return { response: resp, body: b };
    });

    this.handleErrorResponse(response);

    return { id: noteId, status: 'updated' };
  }

  async searchNotes(
    query: string,
    page: number = 1
  ): Promise<Array<{ id: string; title: string; url: string; creator: string; likes: number }>> {
    const params = new URLSearchParams({
      context: 'note',
      q: query,
      page: String(page),
    });

    const response = await fetchWithTimeout(`${BASE_URL}/api/v3/searches?${params.toString()}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (response.status === 429) {
      throw new Error('リクエスト上限に達しました。しばらく待ってから再度お試しください');
    }

    if (!response.ok) {
      throw new Error(`note.com APIの仕様が変更された可能性があります。開発者にお知らせください (HTTP ${response.status})`);
    }

    const body = await response.json() as SearchResponse;
    const contents = body?.data?.notes?.contents ?? [];

    return contents.map((item) => ({
      id: item.key ?? String(item.id),
      title: item.name,
      url: item.noteUrl ?? item.url ?? `${BASE_URL}/n/${item.key ?? item.id}`,
      creator: item.user?.nickname ?? item.user?.urlname ?? '',
      likes: item.likeCount ?? 0,
    }));
  }

  async listDrafts(): Promise<Array<{ id: string; title: string; updated_at: string }>> {
    const { response, body } = await this.requestWithReauth<DraftListResponse>(async () => {
      const resp = await fetchWithTimeout(`${BASE_URL}/api/v1/notes?status=draft`, {
        headers: this.getAuthHeaders(),
      });
      const b = await resp.json() as DraftListResponse;
      return { response: resp, body: b };
    });

    this.handleErrorResponse(response);

    const notes = body?.data?.notes ?? [];
    return notes.map((note) => ({
      id: note.key ?? String(note.id),
      title: note.name,
      updated_at: note.updatedAt ?? note.updated_at ?? '',
    }));
  }

  private handleErrorResponse(response: FetchResponse): void {
    if (response.status === 401) {
      throw new Error('認証失敗: メールアドレスまたはパスワードが正しくありません');
    }
    if (response.status === 429) {
      throw new Error('リクエスト上限に達しました。しばらく待ってから再度お試しください');
    }
    if (response.status === 404 || response.status >= 500) {
      throw new Error(`note.com APIの仕様が変更された可能性があります。開発者にお知らせください (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`note.com APIの仕様が変更された可能性があります。開発者にお知らせください (HTTP ${response.status})`);
    }
  }
}
