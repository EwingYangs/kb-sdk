// ============================================
// 飞书适配器 - API 底层封装
// ============================================

import * as lark from '@larksuiteoapi/node-sdk';

export interface FeishuAPIConfig {
  appId: string;
  appSecret: string;
}

export class FeishuAPI {
  private client: lark.Client;
  private appId: string;
  private appSecret: string;

  // Token 缓存：提前 5 分钟刷新，避免临界过期
  private tokenCache: { token: string; expiresAt: number } | null = null;
  private static readonly TOKEN_REFRESH_ADVANCE_MS = 5 * 60 * 1000; // 5 分钟

  constructor(config: FeishuAPIConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
    });
  }

  // 获取 tenant_access_token（带缓存）
  async getTenantAccessToken(): Promise<string> {
    const now = Date.now();

    // 缓存有效则直接返回
    if (this.tokenCache && now < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const resp = await this.client.auth.tenantAccessToken.internal({
      data: {
        app_id: this.appId,
        app_secret: this.appSecret,
      },
    });

    if (resp.code !== 0) {
      throw new Error(`Failed to get tenant access token: ${resp.msg}`);
    }

    // @ts-ignore - SDK 类型定义不完整
    const token = resp.tenant_access_token!;
    // @ts-ignore
    const expireSeconds: number = resp.expire ?? 7200; // 飞书默认 2 小时

    this.tokenCache = {
      token,
      expiresAt: now + expireSeconds * 1000 - FeishuAPI.TOKEN_REFRESH_ADVANCE_MS,
    };

    return token;
  }

  // ===== 多维表格 API =====

  // 获取多维表格元数据
  async getSpreadsheetMeta(spreadsheetToken: string): Promise<any> {
    const resp = await this.client.sheets.spreadsheet.get({
      // @ts-ignore - SDK 类型定义使用下划线命名
      path: { spreadsheet_token: spreadsheetToken },
    });

    if (resp.code !== 0) {
      throw new Error(`Failed to get spreadsheet meta: ${resp.msg}`);
    }

    return resp.data;
  }

  // 获取表格列表（工作表）
  async getSheets(spreadsheetToken: string): Promise<any[]> {
    const resp = await this.client.sheets.spreadsheetSheet.query({
      // @ts-ignore - SDK 类型定义使用下划线命名
      path: { spreadsheet_token: spreadsheetToken },
    });

    if (resp.code !== 0) {
      throw new Error(`Failed to get sheets: ${resp.msg}`);
    }

    // @ts-ignore
    return resp.data?.sheets || [];
  }

  // ===== 多维表格记录 API (Bitable) =====

  // 查询记录
  async queryRecords(
    appToken: string,
    tableId: string,
    options?: {
      viewId?: string;
      filter?: string;
      sort?: string;
      pageSize?: number;
      pageToken?: string;
    }
  ): Promise<{ items: any[]; hasMore: boolean; pageToken?: string; total?: number }> {
    // 使用原始 HTTP 调用
    const params = new URLSearchParams();
    if (options?.viewId) params.append('view_id', options.viewId);
    if (options?.filter) params.append('filter', options.filter);
    if (options?.sort) params.append('sort', options.sort);
    if (options?.pageSize) params.append('page_size', String(options.pageSize));
    if (options?.pageToken) params.append('page_token', options.pageToken);

    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to query records: ${data.msg}`);
    }

    return {
      items: data.data?.items || [],
      hasMore: data.data?.has_more || false,
      pageToken: data.data?.page_token,
      total: data.data?.total,
    };
  }

  // 获取单条记录
  async getRecord(appToken: string, tableId: string, recordId: string): Promise<any> {
    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to get record: ${data.msg}`);
    }

    return data.data?.record;
  }

  // 创建记录
  async createRecord(appToken: string, tableId: string, fields: Record<string, any>): Promise<any> {
    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to create record: ${data.msg}`);
    }

    return data.data?.record;
  }

  // 更新记录
  async updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, any>
  ): Promise<any> {
    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to update record: ${data.msg}`);
    }

    return data.data?.record;
  }

  // 删除记录
  async deleteRecord(appToken: string, tableId: string, recordId: string): Promise<void> {
    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to delete record: ${data.msg}`);
    }
  }

  // 获取表格字段（列）
  async getFields(appToken: string, tableId: string): Promise<any[]> {
    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to get fields: ${data.msg}`);
    }

    return data.data?.items || [];
  }

  // 搜索多维表格
  async searchTables(_query: string): Promise<any[]> {
    // 飞书没有直接搜索多维表格的 API，这里返回空数组
    return [];
  }

  // ===== 云文档 API (Docx) =====

  // 创建文档
  async createDocument(title: string, parent?: { folderToken?: string; type?: 'doc' | 'sheet' | 'bitable' }): Promise<{ documentId: string; title: string; url: string }> {
    const token = await this.getTenantAccessToken();
    
    const body: any = {
      title,
      type: 'docx',  // 新格式文档
    };
    
    if (parent?.folderToken) {
      body.folder_token = parent.folderToken;
    }

    const resp = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to create document: ${data.msg}`);
    }

    return {
      documentId: data.data?.document?.document_id,
      title: data.data?.document?.title,
      url: `https://feishu.cn/docx/${data.data?.document?.document_id}`,
    };
  }

  // 获取文档元数据
  async getDocumentMeta(documentId: string): Promise<any> {
    const token = await this.getTenantAccessToken();
    
    const resp = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to get document meta: ${data.msg}`);
    }

    return data.data?.document;
  }

  // 获取文档块内容
  async getDocumentBlocks(documentId: string, blockId?: string, pageSize?: number): Promise<any[]> {
    const token = await this.getTenantAccessToken();
    
    const targetBlockId = blockId || documentId;
    const params = new URLSearchParams();
    if (pageSize) params.append('page_size', String(pageSize));

    const resp = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${targetBlockId}/children?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to get document blocks: ${data.msg}`);
    }

    return data.data?.items || [];
  }

  // 创建文档块
  async createDocumentBlocks(documentId: string, parentBlockId: string, blocks: any[]): Promise<any[]> {
    const token = await this.getTenantAccessToken();
    
    const targetBlockId = parentBlockId || documentId;

    const resp = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${targetBlockId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          children: blocks,
        }),
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to create document blocks: ${data.msg}`);
    }

    return data.data?.children || [];
  }

  // 更新文档块
  async updateDocumentBlock(documentId: string, blockId: string, block: any): Promise<void> {
    const token = await this.getTenantAccessToken();

    const resp = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...block,
        }),
      }
    );

    const data: any = await resp.json();

    if (data.code !== 0) {
      throw new Error(`Failed to update document block: ${data.msg}`);
    }
  }
}