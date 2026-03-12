// ============================================
// Notion 适配器 - 客户端实现
// ============================================

import { Client as NotionClient } from '@notionhq/client';
import { KnowledgeBaseClient } from '../../core/client';
import {
  NotionConfig,
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
import { AuthenticationError, NotFoundError, RateLimitError, KBSDKError } from '../../core/errors';
import { NotionMapper } from './mapper';

export class NotionAdapter extends KnowledgeBaseClient {
  private client: NotionClient;

  constructor(config: NotionConfig) {
    super(config);
    this.client = new NotionClient({
      auth: config.auth,
      timeoutMs: config.timeout,
    });
  }

  private handleError(error: any): never {
    if (error.code === 'unauthorized') {
      throw new AuthenticationError(error.message);
    }
    if (error.code === 'not_found') {
      throw new NotFoundError(error.message);
    }
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'];
      throw new RateLimitError(error.message, retryAfter ? parseInt(retryAfter) : undefined);
    }
    throw new KBSDKError(error.message, error.code || 'UNKNOWN_ERROR', error.status);
  }

  // ===== 数据库操作 =====
  databases = {
    query: async (params: QueryDatabaseParams): Promise<QueryDatabaseResponse> => {
      try {
        const notionParams: any = {
          database_id: params.databaseId,
          page_size: params.pageSize || 100,
        };

        if (params.filter) notionParams.filter = params.filter;
        if (params.sorts) notionParams.sorts = params.sorts;
        if (params.cursor) notionParams.start_cursor = params.cursor;

        const response = await this.client.databases.query(notionParams);
        return NotionMapper.toUnifiedQueryResponse(response);
      } catch (error: any) {
        this.handleError(error);
      }
    },

    create: async (params: CreateDatabaseParams): Promise<Database> => {
      try {
        const notionParams: any = {
          parent: params.parent,
          title: params.title.map(t => NotionMapper.toNotionRichText(t)),
          properties: {},
        };

        // 转换属性定义
        for (const [name, prop] of Object.entries(params.properties)) {
          notionParams.properties[name] = {
            [prop.type]: prop.config || {},
          };
        }

        const response = await this.client.databases.create(notionParams);
        return NotionMapper.toUnifiedDatabase(response as any);
      } catch (error: any) {
        this.handleError(error);
      }
    },

    retrieve: async (databaseId: string): Promise<Database> => {
      try {
        const response = await this.client.databases.retrieve({ database_id: databaseId });
        return NotionMapper.toUnifiedDatabase(response as any);
      } catch (error: any) {
        this.handleError(error);
      }
    },

    update: async (databaseId: string, params: UpdateDatabaseParams): Promise<Database> => {
      try {
        const notionParams: any = { database_id: databaseId };

        if (params.title) {
          notionParams.title = params.title.map(t => NotionMapper.toNotionRichText(t));
        }

        if (params.properties) {
          notionParams.properties = {};
          for (const [name, prop] of Object.entries(params.properties)) {
            notionParams.properties[name] = {
              [prop.type]: prop.config || {},
            };
          }
        }

        const response = await this.client.databases.update(notionParams);
        return NotionMapper.toUnifiedDatabase(response as any);
      } catch (error: any) {
        this.handleError(error);
      }
    },
  };

  // ===== 页面操作 =====
  pages = {
    create: async (params: CreatePageParams): Promise<Page> => {
      try {
        const notionParams: any = {
          parent: params.parent,
          properties: {},
        };

        // 转换属性值
        for (const [name, value] of Object.entries(params.properties)) {
          if (value && typeof value === 'object' && 'type' in value) {
            notionParams.properties[name] = NotionMapper.toNotionPropertyValue(value as any);
          } else {
            notionParams.properties[name] = value;
          }
        }

        if (params.icon) notionParams.icon = params.icon;

        // 添加块内容
        if (params.children && params.children.length > 0) {
          notionParams.children = params.children.map(b => NotionMapper.toNotionBlock(b));
        }

        const response = await this.client.pages.create(notionParams);
        return NotionMapper.toUnifiedPage(response as any);
      } catch (error: any) {
        this.handleError(error);
      }
    },

    retrieve: async (pageId: string): Promise<Page> => {
      try {
        const response = await this.client.pages.retrieve({ page_id: pageId });
        return NotionMapper.toUnifiedPage(response as any);
      } catch (error: any) {
        this.handleError(error);
      }
    },

    update: async (pageId: string, params: UpdatePageParams): Promise<Page> => {
      try {
        const notionParams: any = { page_id: pageId };

        if (params.properties) {
          notionParams.properties = {};
          for (const [name, value] of Object.entries(params.properties)) {
            if (value && typeof value === 'object' && 'type' in value) {
              notionParams.properties[name] = NotionMapper.toNotionPropertyValue(value as any);
            } else {
              notionParams.properties[name] = value;
            }
          }
        }

        if (params.icon) notionParams.icon = params.icon;

        const response = await this.client.pages.update(notionParams);
        return NotionMapper.toUnifiedPage(response as any);
      } catch (error: any) {
        this.handleError(error);
      }
    },
  };

  // ===== 块操作 =====
  blocks = {
    append: async (parentId: string, children: Block[]): Promise<void> => {
      try {
        await this.client.blocks.children.append({
          block_id: parentId,
          children: children.map(b => NotionMapper.toNotionBlock(b)),
        });
      } catch (error: any) {
        this.handleError(error);
      }
    },

    retrieve: async (blockId: string): Promise<Block> => {
      try {
        const response = await this.client.blocks.retrieve({ block_id: blockId });
        return NotionMapper.toUnifiedBlock(response);
      } catch (error: any) {
        this.handleError(error);
      }
    },

    delete: async (blockId: string): Promise<void> => {
      try {
        await this.client.blocks.delete({ block_id: blockId });
      } catch (error: any) {
        this.handleError(error);
      }
    },
  };

  // ===== 搜索 =====
  async search(query: string): Promise<SearchResult[]> {
    try {
      const response = await this.client.search({
        query,
        page_size: 100,
      });
      return NotionMapper.toUnifiedSearchResult(response.results);
    } catch (error: any) {
      this.handleError(error);
    }
  }
}

// 兼容 notion-client 的导出方式
export class Client extends NotionAdapter {}
export { NotionMapper as mapper };