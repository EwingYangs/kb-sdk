// ============================================
// 飞书适配器 - 客户端实现
// ============================================

import { KnowledgeBaseClient } from '../../core/client';
import {
  FeishuConfig,
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
import { FeishuAPI, FeishuAPIConfig } from './api';
import { FeishuMapper } from './mapper';

export interface FeishuAdapterConfig extends FeishuConfig {
  appToken?: string; // 默认的多维表格 token
}

export class FeishuAdapter extends KnowledgeBaseClient {
  private api: FeishuAPI;
  private defaultAppToken?: string;
  private fieldsCache: Map<string, Map<string, any>> = new Map(); // tableId -> fieldName -> fieldMeta

  constructor(config: FeishuAdapterConfig) {
    super(config);
    this.api = new FeishuAPI({
      appId: config.appId,
      appSecret: config.appSecret,
    });
    this.defaultAppToken = config.appToken;
  }

  // 解析 databaseId，格式: "appToken/tableId"
  private parseDatabaseId(databaseId: string): { appToken: string; tableId: string } {
    if (databaseId.includes('/')) {
      const [appToken, tableId] = databaseId.split('/');
      return { appToken, tableId };
    }
    if (this.defaultAppToken) {
      return { appToken: this.defaultAppToken, tableId: databaseId };
    }
    throw new KBSDKError(
      'Invalid databaseId format. Expected "appToken/tableId" or set default appToken in config',
      'INVALID_DATABASE_ID'
    );
  }

  // 获取并缓存字段元数据
  private async getFieldsMeta(appToken: string, tableId: string): Promise<Map<string, any>> {
    const cacheKey = `${appToken}/${tableId}`;
    
    if (this.fieldsCache.has(cacheKey)) {
      return this.fieldsCache.get(cacheKey)!;
    }

    try {
      const fields = await this.api.getFields(appToken, tableId);
      const meta = new Map<string, any>();
      
      for (const field of fields) {
        meta.set(field.field_name, field);
      }

      this.fieldsCache.set(cacheKey, meta);
      return meta;
    } catch (error: any) {
      if (error.message?.includes('unauthorized') || error.message?.includes('token')) {
        throw new AuthenticationError(error.message);
      }
      if (error.message?.includes('not found')) {
        throw new NotFoundError(error.message);
      }
      throw error;
    }
  }

  // ===== 数据库操作 =====
  databases = {
    query: async (params: QueryDatabaseParams): Promise<QueryDatabaseResponse> => {
      try {
        const { appToken, tableId } = this.parseDatabaseId(params.databaseId);
        const fieldsMeta = await this.getFieldsMeta(appToken, tableId);

        // 转换 filter
        // 飞书 filter 参数是 formula 字符串，例如：CurrentValue.[字段名] = "值"
        // 如果用户传入的是对象（统一格式），则尝试转换；
        // 如果已经是字符串，直接透传。
        let filter: string | undefined;
        if (params.filter) {
          if (typeof params.filter === 'string') {
            filter = params.filter;
          } else {
            // 尽力转换：{ fieldName: value } -> AND(CurrentValue.[fieldName] = "value", ...)
            const conditions = Object.entries(params.filter).map(([key, val]) => {
              const escaped = String(val).replace(/"/g, '\\"');
              return `CurrentValue.[${key}] = "${escaped}"`;
            });
            filter = conditions.length === 1
              ? conditions[0]
              : `AND(${conditions.join(', ')})`;
          }
        }

        // 转换 sort
        // 飞书 sort 参数格式：JSON 序列化的数组 [{"field_name":"xxx","desc":true}, ...]
        let sort: string | undefined;
        if (params.sorts && params.sorts.length > 0) {
          const sortArr = params.sorts.map(s => ({
            field_name: s.property,
            desc: s.direction === 'descending',
          }));
          sort = JSON.stringify(sortArr);
        }

        const result = await this.api.queryRecords(appToken, tableId, {
          filter,
          sort,
          pageSize: params.pageSize,
          pageToken: params.cursor,
        });

        return FeishuMapper.toUnifiedQueryResponse(
          result.items,
          fieldsMeta,
          params.databaseId,
          result.hasMore,
          result.pageToken
        );
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    create: async (_params: CreateDatabaseParams): Promise<Database> => {
      // 飞书 API 不支持通过 API 创建多维表格
      throw new KBSDKError(
        'Feishu does not support creating databases via API. Please create manually in Feishu.',
        'NOT_SUPPORTED'
      );
    },

    retrieve: async (databaseId: string): Promise<Database> => {
      try {
        const { appToken, tableId } = this.parseDatabaseId(databaseId);
        const fields = await this.api.getFields(appToken, tableId);

        return FeishuMapper.toUnifiedDatabase(
          { sheetId: tableId, spreadsheetToken: appToken },
          fields
        );
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    update: async (_databaseId: string, _params: UpdateDatabaseParams): Promise<Database> => {
      // 飞书 API 不支持通过 API 修改表格结构
      throw new KBSDKError(
        'Feishu does not support updating database schema via API. Please modify manually in Feishu.',
        'NOT_SUPPORTED'
      );
    },
  };

  // ===== 页面操作（对应飞书的记录） =====
  pages = {
    create: async (params: CreatePageParams): Promise<Page> => {
      try {
        const parent = params.parent as any;
        const databaseId = parent.type === 'database_id' 
          ? parent.database_id 
          : '';
        
        if (!databaseId) {
          throw new KBSDKError('Feishu only supports creating records in databases', 'INVALID_PARENT');
        }

        const { appToken, tableId } = this.parseDatabaseId(databaseId);
        const fieldsMeta = await this.getFieldsMeta(appToken, tableId);

        // 转换属性值
        const fields = FeishuMapper.toFeishuFields(params.properties, fieldsMeta);

        const record = await this.api.createRecord(appToken, tableId, fields);

        return FeishuMapper.toUnifiedPage(record, fieldsMeta, databaseId);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    retrieve: async (pageId: string): Promise<Page> => {
      try {
        // pageId 格式: "appToken/tableId/recordId"
        const parts = pageId.split('/');
        if (parts.length !== 3) {
          throw new KBSDKError(
            'Invalid pageId format. Expected "appToken/tableId/recordId"',
            'INVALID_PAGE_ID'
          );
        }

        const [appToken, tableId, recordId] = parts;
        const fieldsMeta = await this.getFieldsMeta(appToken, tableId);

        const record = await this.api.getRecord(appToken, tableId, recordId);

        return FeishuMapper.toUnifiedPage(record, fieldsMeta, `${appToken}/${tableId}`);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    update: async (pageId: string, params: UpdatePageParams): Promise<Page> => {
      try {
        // pageId 格式: "appToken/tableId/recordId"
        const parts = pageId.split('/');
        if (parts.length !== 3) {
          throw new KBSDKError(
            'Invalid pageId format. Expected "appToken/tableId/recordId"',
            'INVALID_PAGE_ID'
          );
        }

        const [appToken, tableId, recordId] = parts;
        const fieldsMeta = await this.getFieldsMeta(appToken, tableId);

        // 转换属性值
        const fields = params.properties 
          ? FeishuMapper.toFeishuFields(params.properties, fieldsMeta)
          : {};

        const record = await this.api.updateRecord(appToken, tableId, recordId, fields);

        return FeishuMapper.toUnifiedPage(record, fieldsMeta, `${appToken}/${tableId}`);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },
  };

  // ===== 块操作（映射到飞书云文档） =====
  blocks = {
    append: async (parentId: string, children: Block[]): Promise<void> => {
      // parentId 可以是文档 ID 或 recordId（需要在 record 中查找关联的文档字段）
      try {
        // 如果 parentId 是 record 格式 (appToken/tableId/recordId)
        if (parentId.split('/').length === 3) {
          // 需要先从 record 中获取关联的文档字段
          throw new KBSDKError(
            'For Feishu records, use documents API instead. Example: await feishu.documents.createWithRecord(...)',
            'USE_DOCUMENTS_API'
          );
        }
        
        // 直接追加到文档
        const docxBlocks = children.map(b => FeishuMapper.toFeishuDocxBlock(b));
        await this.api.createDocumentBlocks(parentId, parentId, docxBlocks);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    retrieve: async (blockId: string): Promise<Block> => {
      // blockId 格式: documentId/blockId
      const parts = blockId.split('/');
      if (parts.length !== 2) {
        throw new KBSDKError('Invalid blockId format. Expected "documentId/blockId"', 'INVALID_BLOCK_ID');
      }
      
      try {
        const [documentId, blockIdPart] = parts;
        const blocks = await this.api.getDocumentBlocks(documentId, blockIdPart);
        if (blocks.length === 0) {
          throw new NotFoundError('Block not found');
        }
        return FeishuMapper.toUnifiedBlock(blocks[0]);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },
  };

  // ===== 云文档操作（飞书特有） =====
  documents = {
    /**
     * 创建飞书文档
     */
    create: async (params: {
      title: string;
      folderToken?: string;
      content?: Block[];
    }): Promise<{ documentId: string; title: string; url: string }> => {
      try {
        // 1. 创建空文档
        const doc = await this.api.createDocument(params.title, {
          folderToken: params.folderToken,
        });

        // 2. 如果有内容，追加到文档
        if (params.content && params.content.length > 0) {
          const docxBlocks = params.content.map(b => FeishuMapper.toFeishuDocxBlock(b));
          await this.api.createDocumentBlocks(doc.documentId, doc.documentId, docxBlocks);
        }

        return doc;
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    /**
     * 创建文档并与多维表格记录关联
     * 这是推荐方案：表格存元数据，文档存富文本内容
     */
    createWithRecord: async (params: {
      databaseId: string;  // appToken/tableId
      properties: Record<string, any>;  // 表格字段
      documentTitle?: string;
      documentContent?: Block[];
      documentFieldName?: string;  // 存储文档链接的字段名（默认"文档链接"）
    }): Promise<{ record: Page; document: { documentId: string; url: string } }> => {
      try {
        const { appToken, tableId } = this.parseDatabaseId(params.databaseId);
        const fieldsMeta = await this.getFieldsMeta(appToken, tableId);

        // 1. 先创建文档
        const title = params.documentTitle || 
          params.properties['标题']?.title?.[0]?.text?.content || 
          '未命名文档';
        
        const doc = await this.api.createDocument(title);

        // 2. 追加文档内容
        if (params.documentContent && params.documentContent.length > 0) {
          const docxBlocks = params.documentContent.map(b => FeishuMapper.toFeishuDocxBlock(b));
          await this.api.createDocumentBlocks(doc.documentId, doc.documentId, docxBlocks);
        }

        // 3. 在表格记录中保存文档链接
        const docFieldName = params.documentFieldName || '文档链接';
        const recordFields = FeishuMapper.toFeishuFields(params.properties, fieldsMeta);

        // 优先按 documentFieldName 写入（不论字段类型），确保用户指定的字段生效
        // 如果该字段不存在于 fieldsMeta，仍然写入（让飞书 API 自行报错而非静默忽略）
        const targetField = fieldsMeta.get(docFieldName);
        if (targetField) {
          recordFields[docFieldName] = doc.url;
        } else {
          // 字段不存在时 fallback：找第一个 url 类型字段写入，否则直接按名写
          const urlField = Array.from(fieldsMeta.values()).find(f => f.type === 'url');
          if (urlField) {
            console.warn(
              `[kb-sdk] documentFieldName "${docFieldName}" not found in table, ` +
              `falling back to field "${urlField.field_name}"`
            );
            recordFields[urlField.field_name] = doc.url;
          } else {
            // 兜底：强制写入，让 API 层报错而不是静默丢失文档链接
            recordFields[docFieldName] = doc.url;
          }
        }

        // 4. 创建表格记录
        const record = await this.api.createRecord(appToken, tableId, recordFields);

        return {
          record: FeishuMapper.toUnifiedPage(record, fieldsMeta, params.databaseId),
          document: {
            documentId: doc.documentId,
            url: doc.url,
          },
        };
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    /**
     * 获取文档内容
     */
    getContent: async (documentId: string): Promise<Block[]> => {
      try {
        const rawBlocks = await this.api.getDocumentBlocks(documentId);
        return rawBlocks.map(b => FeishuMapper.toUnifiedBlock(b));
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    /**
     * 追加内容到文档
     */
    appendBlocks: async (documentId: string, blocks: Block[]): Promise<void> => {
      try {
        const docxBlocks = blocks.map(b => FeishuMapper.toFeishuDocxBlock(b));
        await this.api.createDocumentBlocks(documentId, documentId, docxBlocks);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },

    /**
     * 获取文档元数据
     */
    getMeta: async (documentId: string): Promise<any> => {
      try {
        return await this.api.getDocumentMeta(documentId);
      } catch (error: any) {
        throw this.handleError(error);
      }
    },
  };

  // ===== 搜索 =====
  async search(_query: string): Promise<SearchResult[]> {
    // 飞书没有直接搜索多维表格的 API
    return [];
  }

  // ===== 错误处理 =====
  private handleError(error: any): Error {
    if (error instanceof KBSDKError) {
      return error;
    }
    if (error.message?.includes('unauthorized') || error.message?.includes('token') || error.message?.includes('认证')) {
      return new AuthenticationError(error.message);
    }
    if (error.message?.includes('not found') || error.message?.includes('不存在')) {
      return new NotFoundError(error.message);
    }
    return new KBSDKError(error.message, 'FEISHU_ERROR');
  }
}

// 兼容导出
export class Client extends FeishuAdapter {}
export { FeishuMapper as mapper };