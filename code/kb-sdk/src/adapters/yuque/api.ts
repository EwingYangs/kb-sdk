// ============================================
// 语雀适配器 - API 底层封装
// ============================================

export interface YuqueAPIConfig {
  token: string;
  baseUrl?: string;
}

export class YuqueAPI {
  private token: string;
  private baseUrl: string;

  constructor(config: YuqueAPIConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl || 'https://www.yuque.com/api/v2';
  }

  // 统一 HTTP 请求
  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'X-Auth-Token': this.token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!resp.ok) {
      const errorData: any = await resp.json().catch(() => ({ message: resp.statusText }));
      throw new Error(`Yuque API error: ${errorData.message || resp.statusText}`);
    }

    return resp.json();
  }

  // ===== 用户/团队 =====
  
  // 获取当前用户
  async getUser(): Promise<any> {
    return this.request('/user');
  }

  // 获取用户知识库列表
  async getUserRepos(login: string): Promise<any[]> {
    const data = await this.request(`/users/${login}/repos`);
    return data.data || [];
  }

  // 获取团队列表
  async getGroups(): Promise<any[]> {
    const data = await this.request('/groups');
    return data.data || [];
  }

  // 获取团队知识库列表
  async getGroupRepos(login: string): Promise<any[]> {
    const data = await this.request(`/groups/${login}/repos`);
    return data.data || [];
  }

  // ===== 知识库（对应 Database） =====

  // 获取知识库详情
  async getRepo(namespace: string): Promise<any> {
    const data = await this.request(`/repos/${namespace}`);
    return data.data;
  }

  // 创建知识库
  async createRepo(params: {
    name: string;
    slug?: string;
    description?: string;
    public?: number; // 0 私密, 1 所有人可见, 2 空间成员可见
    type?: 'Book' | 'Design' | 'Column';
    groupLogin?: string; // 团队路径，不传则创建个人知识库
  }): Promise<any> {
    const body: any = {
      name: params.name,
      slug: params.slug,
      description: params.description,
      public: params.public ?? 1,
      type: params.type || 'Book',
    };

    const path = params.groupLogin 
      ? `/groups/${params.groupLogin}/repos`
      : '/user/repos';

    const data = await this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return data.data;
  }

  // 更新知识库
  async updateRepo(namespace: string, params: {
    name?: string;
    slug?: string;
    description?: string;
    public?: number;
    toc?: string; // 目录排序
  }): Promise<any> {
    const data = await this.request(`/repos/${namespace}`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
    return data.data;
  }

  // 删除知识库
  async deleteRepo(namespace: string): Promise<void> {
    await this.request(`/repos/${namespace}`, { method: 'DELETE' });
  }

  // ===== 文档（对应 Page） =====

  // 获取知识库文档列表
  async getDocs(namespace: string, params?: {
    offset?: number;
    limit?: number;
  }): Promise<{ docs: any[]; meta: any }> {
    const searchParams = new URLSearchParams();
    if (params?.offset) searchParams.append('offset', String(params.offset));
    if (params?.limit) searchParams.append('limit', String(params.limit));

    const data = await this.request(`/repos/${namespace}/docs?${searchParams.toString()}`);
    return {
      docs: data.data || [],
      meta: data.meta,
    };
  }

  // 获取单篇文档详情
  async getDoc(namespace: string, slug: string, params?: {
    raw?: number; // 1 返回 Markdown 原文
  }): Promise<any> {
    const searchParams = new URLSearchParams();
    if (params?.raw) searchParams.append('raw', String(params.raw));

    const data = await this.request(`/repos/${namespace}/docs/${slug}?${searchParams.toString()}`);
    return data.data;
  }

  // 创建文档
  async createDoc(namespace: string, params: {
    title: string;
    slug?: string;
    body?: string; // Markdown 格式
    body_html?: string;
    public?: number;
    format?: 'markdown' | 'lake'; // lake 是语雀富文本格式
    cover?: string;
  }): Promise<any> {
    const data = await this.request(`/repos/${namespace}/docs`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return data.data;
  }

  // 更新文档
  async updateDoc(namespace: string, slug: string, params: {
    title?: string;
    body?: string;
    body_html?: string;
    public?: number;
    cover?: string;
    _force_asl?: number; // 强制覆盖
  }): Promise<any> {
    const data = await this.request(`/repos/${namespace}/docs/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
    return data.data;
  }

  // 删除文档
  async deleteDoc(namespace: string, slug: string): Promise<void> {
    await this.request(`/repos/${namespace}/docs/${slug}`, { method: 'DELETE' });
  }

  // ===== 搜索 =====

  // 搜索
  async search(q: string, params?: {
    offset?: number;
    limit?: number;
    type?: 'doc' | 'repo';
  }): Promise<{ data: any[]; meta: any }> {
    const searchParams = new URLSearchParams();
    searchParams.append('q', q);
    if (params?.offset) searchParams.append('offset', String(params.offset));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.type) searchParams.append('type', params.type);

    const data = await this.request(`/search?${searchParams.toString()}`);
    return {
      data: data.data || [],
      meta: data.meta,
    };
  }

  // ===== 附件/文件 =====

  // 上传附件
  async uploadAttachment(namespace: string, file: Buffer | Blob, filename: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', new Blob([file]), filename);

    const resp = await fetch(`${this.baseUrl}/repos/${namespace}/attachments`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': this.token,
      },
      body: formData,
    });

    if (!resp.ok) {
      throw new Error(`Upload failed: ${resp.statusText}`);
    }

    const result: any = await resp.json();
    return result.data;
  }
}