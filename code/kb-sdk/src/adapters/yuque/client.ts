// ============================================
// 语雀适配器 - 客户端实现
// ============================================

import { KnowledgeBaseClient } from '../../core/client';
import {
  YuqueConfig,
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
import { YuqueAPI, YuqueAPIConfig } from './api';
import { YuqueMapper } from './mapper';

export interface YuqueAdapterConfig extends YuqueConfig {
  // 语雀特有配置
  defaultGroup?: string; // 默认团队路径
}

export class YuqueAdapter extends KnowledgeBaseClient {
  private api: YuqueAPI;
  private defaultGroup?: string;
  private userLogin?: string;

  constructor(config: YuqueAdapterConfig) {
    super(config);
    this.api = new YuqueAPI({
      token: config.token,
      baseUrl: config.baseUrl,
    });
    this.defaultGroup = config.defaultGroup;
  }

  // 获取当前用户信息
  private async getUserLogin(): Promise<string> {
    if (this.userLogin) return this.userLogin;
    
    const user = await this.api.getUser();
    this.userLogin = user.data?.login;
    if (!this.userLogin) {
      throw new KBSDKError('Failed to get user login', 'AUTH_ERROR');
    }
    return this.userLogin;
  }

  // 解析 namespace（用户/知识库 或 团队/知识库）
  private async parseNamespace(databaseId: string): Promise<string> {
    // 如果包含 /，说明是完整路径
    if (databaseId.includes('/')) {
      return databaseId;
    }
    
    // 否则使用默认用户或团队
    if (this.defaultGroup) {
      return `${this.defaultGroup}/${databaseId}`;
    }
    
    const login = await this.getUserLogin();
    return `${login}/${databaseId}`;
  }

  // 从 pageId 解析 namespace 和 slug
  private parsePageId(pageId: string): { namespace: string; slug: string } {
    const parts = pageId.split('/');
    if (parts.length < 2) {
      throw new KBSDKError(
        'Invalid pageId format. Expected "user/repo/slug" or "group/repo/slug"',
        'INVALID_PAGE_ID'
      );
    }
    
    const slug = parts.pop()!;
    const namespace = parts.join('/');
    return { namespace, slug };
  }

  // ===== 数据库操作（对应语雀知识库） =====
  databases = {
    query: async (params: QueryDatabaseParams): Promise<QueryDatabaseResponse> => {
      try {
        // 语雀知识库没有传统意义上的"查询记录"，这里返回知识库中的文档列表
        const namespace = await this.parseNamespace(params.databaseId);
        const { docs, meta } = await this.api.getDocs(namespace, {
          offset: params.cursor ? parseInt(params.cursor) : 0,
          limit: params.pageSize || 20,
        });

        const pages = docs.map(doc => YuqueMapper.toUnifiedPage(doc, namespace));

        return {
          results: pages,
          hasMore: meta?.has_more || false,
          nextCursor: meta?.has_more ? String((meta.offset || 0) + docs.length) : undefined,
        };
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    create: async (params: CreateDatabaseParams): Promise<Database> => {
      try {
        // 获取父级（个人或团队）
        let name = params.title?.[0]?.text?.content || 'Untitled';
        
        const parent: any = params.parent;
        if (parent.type === 'page_id') {
          // 语雀不支持嵌套知识库，这里可以创建一个关联的知识库
          // 或者抛出错误
          throw new KBSDKError(
            'Yuque does not support nested repositories. Use group or user as parent.',
            'NOT_SUPPORTED'
          );
        }

        // 创建知识库
        const repo = await this.api.createRepo({
          name,
          public: 1,
          type: 'Book',
          groupLogin: this.defaultGroup,
        });

        return YuqueMapper.toUnifiedDatabase(repo);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    retrieve: async (databaseId: string): Promise<Database> => {
      try {
        const namespace = await this.parseNamespace(databaseId);
        const repo = await this.api.getRepo(namespace);
        return YuqueMapper.toUnifiedDatabase(repo);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    update: async (databaseId: string, params: UpdateDatabaseParams): Promise<Database> => {
      try {
        const namespace = await this.parseNamespace(databaseId);
        const updateData: any = {};
        
        if (params.title) {
          updateData.name = params.title[0]?.text?.content;
        }

        const repo = await this.api.updateRepo(namespace, updateData);
        return YuqueMapper.toUnifiedDatabase(repo);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },
  };

  // ===== 页面操作（对应语雀文档） =====
  pages = {
    create: async (params: CreatePageParams): Promise<Page> => {
      try {
        const parent: any = params.parent;
        if (parent.type !== 'database_id') {
          throw new KBSDKError('Yuque requires a repository (database) as parent', 'INVALID_PARENT');
        }

        const namespace = await this.parseNamespace(parent.database_id);
        
        // 转换属性为语雀文档参数
        const docParams = YuqueMapper.toYuqueDocParams(params.properties);
        
        // 如果有 block 内容，转换为 Markdown
        if (params.children && params.children.length > 0) {
          docParams.body = YuqueMapper.blocksToMarkdown(params.children);
        }

        const doc = await this.api.createDoc(namespace, docParams);
        return YuqueMapper.toUnifiedPage(doc, namespace);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    retrieve: async (pageId: string): Promise<Page> => {
      try {
        const { namespace, slug } = this.parsePageId(pageId);
        
        // 获取原始内容
        const doc = await this.api.getDoc(namespace, slug, { raw: 1 });
        return YuqueMapper.toUnifiedPage(doc, namespace);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    update: async (pageId: string, params: UpdatePageParams): Promise<Page> => {
      try {
        const { namespace, slug } = this.parsePageId(pageId);
        
        const updateData: any = {};
        
        if (params.properties) {
          const docParams = YuqueMapper.toYuqueDocParams(params.properties);
          Object.assign(updateData, docParams);
        }

        const doc = await this.api.updateDoc(namespace, slug, updateData);
        return YuqueMapper.toUnifiedPage(doc, namespace);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },
  };

  // ===== 块操作 =====
  blocks = {
    append: async (parentId: string, children: Block[]): Promise<void> => {
      try {
        // parentId 是 pageId (namespace/slug)
        const { namespace, slug } = this.parsePageId(parentId);
        
        // 获取现有内容
        const doc = await this.api.getDoc(namespace, slug, { raw: 1 });
        const existingBody = doc.body || '';
        
        // 追加新内容
        const newContent = YuqueMapper.blocksToMarkdown(children);
        const updatedBody = existingBody + '\n\n' + newContent;
        
        // 更新文档
        await this.api.updateDoc(namespace, slug, {
          body: updatedBody,
          _force_asl: 1, // 强制覆盖，避免冲突
        });
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    retrieve: async (blockId: string): Promise<Block> => {
      // 语雀没有单独的块 ID，需要通过文档内容解析
      throw new KBSDKError(
        'Yuque does not support individual block retrieval. Use pages.retrieve instead.',
        'NOT_SUPPORTED'
      );
    },
  };

  // ===== 搜索 =====
  async search(query: string): Promise<SearchResult[]> {
    try {
      const { data } = await this.api.search(query);
      return data.map((r: any) => YuqueMapper.toUnifiedSearchResult(r));
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // ===== 语雀特有功能 =====
  
  /**
   * 获取用户的所有知识库
   */
  async getUserRepos(): Promise<Database[]> {
    const login = await this.getUserLogin();
    const repos = await this.api.getUserRepos(login);
    return repos.map(r => YuqueMapper.toUnifiedDatabase(r));
  }

  /**
   * 获取团队的所有知识库
   */
  async getGroupRepos(groupLogin: string): Promise<Database[]> {
    const repos = await this.api.getGroupRepos(groupLogin);
    return repos.map(r => YuqueMapper.toUnifiedDatabase(r));
  }

  /**
   * 上传附件
   */
  async uploadAttachment(
    namespace: string,
    file: Buffer | Blob,
    filename: string
  ): Promise<{ url: string; name: string }> {
    const result = await this.api.uploadAttachment(namespace, file, filename);
    return {
      url: result.url,
      name: result.name,
    };
  }

  // ===== 错误处理 =====
  private handleError(error: any): Error {
    if (error instanceof KBSDKError) {
      return error;
    }
    
    const message = error.message || '';
    
    if (message.includes('Unauthorized') || message.includes('401')) {
      return new AuthenticationError(message);
    }
    if (message.includes('Not Found') || message.includes('404')) {
      return new NotFoundError(message);
    }
    
    return new KBSDKError(message, 'YUQUE_ERROR');
  }
}

// 兼容导出
export class Client extends YuqueAdapter {}
export { YuqueMapper as mapper };