// ============================================
// Wolai 适配器 - 客户端实现（骨架示例）
// ============================================

import { KnowledgeBaseClient } from '../../core/client';
import {
  WolaiConfig,
  Database,
  Page,
  Block,
  QueryDatabaseParams,
  QueryDatabaseResponse,
  CreateDatabaseParams,
  CreatePageParams,
  UpdatePageParams,
  UpdateDatabaseParams,
  SearchResult,
} from '../../core/types';
import { AuthenticationError, NotFoundError, KBSDKError } from '../../core/errors';

export interface WolaiAdapterConfig extends WolaiConfig {
  // wolai 特有配置
}

export class WolaiAdapter extends KnowledgeBaseClient {
  private apiToken: string;
  private baseUrl = 'https://api.wolai.com/v1';

  constructor(config: WolaiAdapterConfig) {
    super(config);
    this.apiToken = config.apiToken;
    // wolai 使用 API Token 认证
  }

  // 统一 HTTP 请求封装
  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!resp.ok) {
      if (resp.status === 401) throw new AuthenticationError();
      if (resp.status === 404) throw new NotFoundError();
      throw new KBSDKError(`Request failed: ${resp.statusText}`, 'REQUEST_ERROR', resp.status);
    }

    return resp.json();
  }

  // ===== 数据库操作 =====
  databases = {
    query: async (params: QueryDatabaseParams): Promise<QueryDatabaseResponse> => {
      // Wolai 数据库/表格查询 API
      // GET /databases/{database_id}/query
      const data = await this.request(`/databases/${params.databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify({
          filter: params.filter,
          sorts: params.sorts,
          page_size: params.pageSize,
          cursor: params.cursor,
        }),
      });

      // 映射到统一类型...
      return {
        results: data.results.map((r: any) => this.toUnifiedPage(r)),
        hasMore: data.has_more,
        nextCursor: data.next_cursor,
      };
    },

    create: async (params: CreateDatabaseParams): Promise<Database> => {
      // POST /databases
      const data = await this.request('/databases', {
        method: 'POST',
        body: JSON.stringify({
          parent: params.parent,
          title: params.title,
          properties: params.properties,
        }),
      });
      return this.toUnifiedDatabase(data);
    },

    retrieve: async (databaseId: string): Promise<Database> => {
      const data = await this.request(`/databases/${databaseId}`);
      return this.toUnifiedDatabase(data);
    },

    update: async (databaseId: string, params: UpdateDatabaseParams): Promise<Database> => {
      const data = await this.request(`/databases/${databaseId}`, {
        method: 'PATCH',
        body: JSON.stringify(params),
      });
      return this.toUnifiedDatabase(data);
    },
  };

  // ===== 页面操作 =====
  pages = {
    create: async (params: CreatePageParams): Promise<Page> => {
      const data = await this.request('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: params.parent,
          properties: params.properties,
          icon: params.icon,
          children: params.children,
        }),
      });
      return this.toUnifiedPage(data);
    },

    retrieve: async (pageId: string): Promise<Page> => {
      const data = await this.request(`/pages/${pageId}`);
      return this.toUnifiedPage(data);
    },

    update: async (pageId: string, params: UpdatePageParams): Promise<Page> => {
      const data = await this.request(`/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify(params),
      });
      return this.toUnifiedPage(data);
    },
  };

  // ===== 块操作 =====
  blocks = {
    append: async (parentId: string, children: Block[]): Promise<void> => {
      await this.request(`/blocks/${parentId}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ children }),
      });
    },

    retrieve: async (blockId: string): Promise<Block> => {
      const data = await this.request(`/blocks/${blockId}`);
      return data;
    },
  };

  // ===== 搜索 =====
  async search(query: string): Promise<SearchResult[]> {
    const data = await this.request('/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
    return data.results;
  }

  // ===== 类型映射工具方法 =====
  private toUnifiedDatabase(data: any): Database {
    // 将 wolai 响应转换为统一 Database 类型
    return {
      id: data.id,
      title: data.title,
      properties: data.properties,
      url: data.url,
      createdTime: new Date(data.created_time),
      lastEditedTime: new Date(data.last_edited_time),
    };
  }

  private toUnifiedPage(data: any): Page {
    // 将 wolai 响应转换为统一 Page 类型
    return {
      id: data.id,
      parent: data.parent,
      properties: data.properties,
      url: data.url,
      icon: data.icon,
      createdTime: new Date(data.created_time),
      lastEditedTime: new Date(data.last_edited_time),
    };
  }
}

export class Client extends WolaiAdapter {}
