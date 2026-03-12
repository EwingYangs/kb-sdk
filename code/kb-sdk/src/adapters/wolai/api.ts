// ============================================
// Wolai 适配器 - API 底层封装（带 token 缓存）
// ============================================

const DEFAULT_BASE_URL = 'https://openapi.wolai.com/v1';
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000; // 提前 5 分钟刷新

interface TokenCache {
  token: string;
  expiresAt: number; // Unix timestamp in ms
}

export interface WolaiAPIConfig {
  appId?: string;
  appSecret?: string;
  apiToken?: string; // 直接提供 token（跳过 OAuth 流程）
  baseUrl?: string;
  timeout?: number;
}

export class WolaiAPI {
  private baseUrl: string;
  private appId?: string;
  private appSecret?: string;
  private staticToken?: string;
  private tokenCache: TokenCache | null = null;
  private tokenFetchPromise: Promise<string> | null = null;

  constructor(config: WolaiAPIConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.staticToken = config.apiToken;
  }

  // ===== Token 管理 =====

  private async fetchToken(): Promise<string> {
    if (!this.appId || !this.appSecret) {
      throw new Error('WolaiAPI: appId and appSecret are required for token authentication');
    }

    const resp = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.appId, appSecret: this.appSecret }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw { status: resp.status, statusText: resp.statusText, body };
    }

    const json: any = await resp.json();
    const token: string = json.data?.app_token;
    const expiresIn: number = json.data?.expires_in ?? 7200; // seconds

    if (!token) {
      throw new Error('WolaiAPI: Invalid token response – missing app_token');
    }

    this.tokenCache = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return token;
  }

  async getToken(): Promise<string> {
    // 直接 token 优先
    if (this.staticToken) return this.staticToken;

    // 检查缓存（提前 5 分钟刷新）
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + TOKEN_EARLY_REFRESH_MS) {
      return this.tokenCache.token;
    }

    // 防止并发重复请求
    if (!this.tokenFetchPromise) {
      this.tokenFetchPromise = this.fetchToken().finally(() => {
        this.tokenFetchPromise = null;
      });
    }

    return this.tokenFetchPromise;
  }

  // ===== 通用 HTTP 请求 =====

  async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();

    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw { status: resp.status, statusText: resp.statusText, body };
    }

    const text = await resp.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  // ===== 数据库端点 =====

  async getDatabase(databaseId: string): Promise<any> {
    return this.request(`/databases/${databaseId}`);
  }

  async queryDatabaseRows(
    databaseId: string,
    params: {
      filter?: any;
      sort?: any[];
      page_token?: string;
      page_size?: number;
    } = {},
  ): Promise<any> {
    return this.request(`/databases/${databaseId}/rows/query`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async createDatabaseRow(databaseId: string, properties: Record<string, any>): Promise<any> {
    return this.request(`/databases/${databaseId}/rows`, {
      method: 'POST',
      body: JSON.stringify({ rows: [{ properties }] }),
    });
  }

  async updateDatabaseRow(
    databaseId: string,
    rowId: string,
    properties: Record<string, any>,
  ): Promise<any> {
    return this.request(`/databases/${databaseId}/rows/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }

  async deleteDatabaseRow(databaseId: string, rowId: string): Promise<any> {
    return this.request(`/databases/${databaseId}/rows/${rowId}`, {
      method: 'DELETE',
    });
  }

  // ===== Block 端点 =====

  async getBlock(blockId: string): Promise<any> {
    return this.request(`/blocks/${blockId}`);
  }

  async getBlockChildren(blockId: string): Promise<any> {
    return this.request(`/blocks/${blockId}/children`);
  }

  async appendBlockChildren(blockId: string, children: any[]): Promise<any> {
    return this.request(`/blocks/${blockId}/children`, {
      method: 'POST',
      body: JSON.stringify({ blocks: children }),
    });
  }

  async updateBlock(blockId: string, data: any): Promise<any> {
    return this.request(`/blocks/${blockId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBlock(blockId: string): Promise<any> {
    return this.request(`/blocks/${blockId}`, {
      method: 'DELETE',
    });
  }

  // ===== 搜索 =====

  async search(query: string, extra: Record<string, any> = {}): Promise<any> {
    return this.request('/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...extra }),
    });
  }
}
