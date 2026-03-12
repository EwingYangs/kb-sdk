// ============================================
// Wolai 适配器 - 客户端完整实现
// ============================================

import { KnowledgeBaseClient } from '../../core/client';
import {
  ClientConfig,
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
import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  KBSDKError,
} from '../../core/errors';
import { WolaiAPI } from './api';
import { WolaiMapper } from './mapper';

// ===== 配置 =====

export interface WolaiAdapterConfig extends ClientConfig {
  /** 直接提供 Bearer Token（跳过 OAuth 流程，适合已有 token 场景）*/
  apiToken?: string;
  /** Wolai AppID（与 appSecret 配合，由 SDK 自动管理 token 生命周期）*/
  appId?: string;
  /** Wolai AppSecret */
  appSecret?: string;
}

// ===== 适配器 =====

export class WolaiAdapter extends KnowledgeBaseClient {
  /** 暴露底层 API 实例，方便高级用法 */
  readonly api: WolaiAPI;

  constructor(config: WolaiAdapterConfig) {
    super(config);

    if (!config.apiToken && !(config.appId && config.appSecret)) {
      throw new Error(
        'WolaiAdapter: provide either `apiToken` or both `appId` and `appSecret`',
      );
    }

    this.api = new WolaiAPI({
      apiToken:  config.apiToken,
      appId:     config.appId,
      appSecret: config.appSecret,
      baseUrl:   config.baseUrl,
      timeout:   config.timeout,
    });
  }

  // ===== 错误处理 =====

  private handleError(error: any): never {
    const status: number | undefined = error.status;
    const message: string =
      error.statusText ?? error.message ?? 'Wolai request failed';

    if (status === 401) throw new AuthenticationError(message);
    if (status === 404) throw new NotFoundError(message);
    if (status === 429) throw new RateLimitError(message);
    throw new KBSDKError(message, 'REQUEST_ERROR', status);
  }

  // ===== 数据库操作 =====

  databases = {
    /**
     * 查询数据库行，映射为统一 Page 列表
     */
    query: async (params: QueryDatabaseParams): Promise<QueryDatabaseResponse> => {
      try {
        const body: Record<string, any> = {
          page_size: params.pageSize ?? 100,
        };
        if (params.filter) body.filter   = params.filter;
        if (params.sorts)  body.sort     = params.sorts;
        if (params.cursor) body.page_token = params.cursor;

        const data = await this.api.queryDatabaseRows(params.databaseId, body);
        return WolaiMapper.toUnifiedQueryResponse(data, params.databaseId);
      } catch (e: any) {
        this.handleError(e);
      }
    },

    /**
     * Wolai 不支持通过 API 创建数据库，抛出明确错误
     */
    create: async (_params: CreateDatabaseParams): Promise<Database> => {
      throw new KBSDKError(
        'Wolai does not support creating databases via API',
        'NOT_SUPPORTED',
        501,
      );
    },

    /**
     * 获取数据库结构（含属性定义）
     */
    retrieve: async (databaseId: string): Promise<Database> => {
      try {
        const resp = await this.api.getDatabase(databaseId);
        return WolaiMapper.toUnifiedDatabase(resp.data ?? resp);
      } catch (e: any) {
        this.handleError(e);
      }
    },

    /**
     * Wolai 不支持通过 API 修改数据库结构，抛出明确错误
     */
    update: async (_databaseId: string, _params: UpdateDatabaseParams): Promise<Database> => {
      throw new KBSDKError(
        'Wolai does not support updating database schema via API',
        'NOT_SUPPORTED',
        501,
      );
    },
  };

  // ===== 页面/行操作 =====

  pages = {
    /**
     * 在数据库中创建一行（parent.database_id 必填）
     */
    create: async (params: CreatePageParams): Promise<Page> => {
      try {
        const parent = params.parent as any;
        const databaseId: string | undefined = parent.database_id;

        if (!databaseId) {
          throw new KBSDKError(
            'WolaiAdapter.pages.create: parent.database_id is required',
            'VALIDATION_ERROR',
            400,
          );
        }

        // 转换属性值
        const wolaiProperties: Record<string, any> = {};
        for (const [name, value] of Object.entries(params.properties)) {
          if (value && typeof value === 'object' && 'type' in value) {
            wolaiProperties[name] = WolaiMapper.toWolaiPropertyValue(value as any);
          } else {
            wolaiProperties[name] = value;
          }
        }

        const resp = await this.api.createDatabaseRow(databaseId, wolaiProperties);
        const rows: any[] = resp.data?.rows ?? resp.rows ?? [];
        const row = rows[0] ?? resp.data ?? resp;
        return WolaiMapper.toUnifiedPage(row, databaseId);
      } catch (e: any) {
        this.handleError(e);
      }
    },

    /**
     * 通过 block_id 获取"页面"信息（Wolai 的 block 即页面节点）
     */
    retrieve: async (pageId: string): Promise<Page> => {
      try {
        const resp = await this.api.getBlock(pageId);
        const block = resp.data ?? resp;

        return {
          id:             block.block_id ?? pageId,
          parent:         { page_id: block.parent_id ?? '', type: 'page_id' },
          properties:     {},
          url:            block.url,
          createdTime:    new Date(block.created_time ?? Date.now()),
          lastEditedTime: new Date(block.last_edited_time ?? Date.now()),
        };
      } catch (e: any) {
        this.handleError(e);
      }
    },

    /**
     * 更新行属性
     * 注意：Wolai 行更新需要 databaseId，可通过 api.updateDatabaseRow() 直接调用
     */
    update: async (pageId: string, params: UpdatePageParams): Promise<Page> => {
      try {
        if (params.properties) {
          // Wolai 行更新需要 databaseId，通过 pages.update 无法获得
          // 建议使用 adapter.api.updateDatabaseRow(databaseId, rowId, props) 代替
          throw new KBSDKError(
            'WolaiAdapter.pages.update: use adapter.api.updateDatabaseRow(databaseId, rowId, props) instead',
            'NOT_SUPPORTED',
            501,
          );
        }

        // 仅刷新获取当前状态
        const resp = await this.api.getBlock(pageId);
        const block = resp.data ?? resp;

        return {
          id:             block.block_id ?? pageId,
          parent:         { page_id: block.parent_id ?? '', type: 'page_id' },
          properties:     {},
          url:            block.url,
          createdTime:    new Date(block.created_time ?? Date.now()),
          lastEditedTime: new Date(block.last_edited_time ?? Date.now()),
        };
      } catch (e: any) {
        this.handleError(e);
      }
    },
  };

  // ===== 块操作 =====

  blocks = {
    /**
     * 在 parent block 下追加子 blocks
     */
    append: async (parentId: string, children: Block[]): Promise<void> => {
      try {
        const wolaiBlocks = children.map((b) => WolaiMapper.toWolaiBlock(b));
        await this.api.appendBlockChildren(parentId, wolaiBlocks);
      } catch (e: any) {
        this.handleError(e);
      }
    },

    /**
     * 获取单个 block
     */
    retrieve: async (blockId: string): Promise<Block> => {
      try {
        const resp = await this.api.getBlock(blockId);
        return WolaiMapper.toUnifiedBlock(resp.data ?? resp);
      } catch (e: any) {
        this.handleError(e);
      }
    },

    /**
     * 删除 block
     */
    delete: async (blockId: string): Promise<void> => {
      try {
        await this.api.deleteBlock(blockId);
      } catch (e: any) {
        this.handleError(e);
      }
    },
  };

  // ===== 搜索 =====

  async search(query: string): Promise<SearchResult[]> {
    try {
      const resp = await this.api.search(query);
      return WolaiMapper.toUnifiedSearchResults(resp.data ?? resp.results ?? []);
    } catch (e: any) {
      this.handleError(e);
    }
  }
}

// 兼容导出别名
export class Client extends WolaiAdapter {}
export { WolaiMapper as mapper };
