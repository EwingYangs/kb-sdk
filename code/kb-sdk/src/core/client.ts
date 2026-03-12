// ============================================
// 统一知识库 SDK - 抽象基类
// ============================================

import {
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
  ClientConfig,
} from './types';

// ===== 抽象客户端接口 =====
export interface IKnowledgeBaseClient {
  // 数据库操作
  databases: {
    query(params: QueryDatabaseParams): Promise<QueryDatabaseResponse>;
    create(params: CreateDatabaseParams): Promise<Database>;
    retrieve(databaseId: string): Promise<Database>;
    update(databaseId: string, params: UpdateDatabaseParams): Promise<Database>;
  };
  
  // 页面操作
  pages: {
    create(params: CreatePageParams): Promise<Page>;
    retrieve(pageId: string): Promise<Page>;
    update(pageId: string, params: UpdatePageParams): Promise<Page>;
  };
  
  // 块操作
  blocks: {
    append(parentId: string, children: Block[]): Promise<void>;
    retrieve(blockId: string): Promise<Block>;
    delete?(blockId: string): Promise<void>;
  };
  
  // 搜索
  search(query: string): Promise<SearchResult[]>;
}

// ===== 抽象基类 =====
export abstract class KnowledgeBaseClient implements IKnowledgeBaseClient {
  protected config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  // 数据库操作
  abstract databases: {
    query(params: QueryDatabaseParams): Promise<QueryDatabaseResponse>;
    create(params: CreateDatabaseParams): Promise<Database>;
    retrieve(databaseId: string): Promise<Database>;
    update(databaseId: string, params: UpdateDatabaseParams): Promise<Database>;
  };

  // 页面操作
  abstract pages: {
    create(params: CreatePageParams): Promise<Page>;
    retrieve(pageId: string): Promise<Page>;
    update(pageId: string, params: UpdatePageParams): Promise<Page>;
  };

  // 块操作
  abstract blocks: {
    append(parentId: string, children: Block[]): Promise<void>;
    retrieve(blockId: string): Promise<Block>;
    delete?(blockId: string): Promise<void>;
  };

  // 搜索
  abstract search(query: string): Promise<SearchResult[]>;

  // 工具方法：等待
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}