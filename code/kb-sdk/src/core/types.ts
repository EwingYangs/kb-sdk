// ============================================
// 统一知识库 SDK - 核心类型定义 + Wolai 配置
// ============================================

// ===== 基础类型 =====
export interface RichText {
  type: 'text' | 'mention' | 'equation';
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

// ===== 属性类型定义 =====
export type PropertyType = 
  | 'title' 
  | 'rich_text' 
  | 'number' 
  | 'select' 
  | 'multi_select'
  | 'date' 
  | 'files' 
  | 'checkbox' 
  | 'url' 
  | 'email'
  | 'relation'
  | 'formula'
  | 'created_time'
  | 'last_edited_time';

export interface Property {
  id?: string;
  name: string;
  type: PropertyType;
  config?: Record<string, any>;
}

// 属性值类型
export interface TitlePropertyValue {
  type: 'title';
  title: RichText[];
}

export interface RichTextPropertyValue {
  type: 'rich_text';
  rich_text: RichText[];
}

export interface NumberPropertyValue {
  type: 'number';
  number: number | null;
}

export interface SelectPropertyValue {
  type: 'select';
  select: { id?: string; name: string; color?: string } | null;
}

export interface MultiSelectPropertyValue {
  type: 'multi_select';
  multi_select: Array<{ id?: string; name: string; color?: string }>;
}

export interface DatePropertyValue {
  type: 'date';
  date: { start: string; end?: string | null } | null;
}

export interface FilesPropertyValue {
  type: 'files';
  files: Array<{
    name: string;
    type: 'external' | 'file';
    external?: { url: string };
    file?: { url: string };
  }>;
}

export interface CheckboxPropertyValue {
  type: 'checkbox';
  checkbox: boolean;
}

export interface UrlPropertyValue {
  type: 'url';
  url: string | null;
}

export interface EmailPropertyValue {
  type: 'email';
  email: string | null;
}

export interface RelationPropertyValue {
  type: 'relation';
  relation: Array<{ id: string }>;
}

export interface FormulaPropertyValue {
  type: 'formula';
  formula: { type: 'string' | 'number' | 'boolean' | 'date'; value: any };
}

export type PropertyValue =
  | TitlePropertyValue
  | RichTextPropertyValue
  | NumberPropertyValue
  | SelectPropertyValue
  | MultiSelectPropertyValue
  | DatePropertyValue
  | FilesPropertyValue
  | CheckboxPropertyValue
  | UrlPropertyValue
  | EmailPropertyValue
  | RelationPropertyValue
  | FormulaPropertyValue;

// ===== 数据库 =====
export interface Database {
  id: string;
  title: RichText[];
  properties: Record<string, Property>;
  url?: string;
  createdTime: Date;
  lastEditedTime: Date;
}

// ===== 页面/记录 =====
export interface Page {
  id: string;
  parent: 
    | { database_id: string; type: 'database_id' }
    | { page_id: string; type: 'page_id' };
  properties: Record<string, PropertyValue>;
  url?: string;
  icon?: { type: 'emoji'; emoji: string } | { type: 'external'; external: { url: string } };
  createdTime: Date;
  lastEditedTime: Date;
}

// ===== 块内容 =====
export type BlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'image'
  | 'divider'
  | 'quote'
  | 'callout';

export interface Block {
  id?: string;
  type: BlockType;
  [key: string]: any;
}

export interface ParagraphBlock extends Block {
  type: 'paragraph';
  paragraph: { rich_text: RichText[] };
}

export interface ImageBlock extends Block {
  type: 'image';
  image: {
    type: 'external' | 'file';
    external?: { url: string };
    file?: { url: string };
    caption?: RichText[];
  };
}

// ===== 请求参数 =====
export interface QueryDatabaseParams {
  databaseId: string;
  filter?: Record<string, any>;
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>;
  pageSize?: number;
  cursor?: string;
}

export interface QueryDatabaseResponse {
  results: Page[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreateDatabaseParams {
  parent: { page_id: string } | { workspace: true };
  title: RichText[];
  properties: Record<string, Property>;
}

export interface CreatePageParams {
  parent: { database_id: string } | { page_id: string };
  properties: Record<string, any>; // 简化版，实际使用时需要转换
  icon?: { type: 'emoji'; emoji: string } | { type: 'external'; external: { url: string } };
  children?: Block[];
}

export interface UpdatePageParams {
  properties?: Record<string, any>;
  icon?: { type: 'emoji'; emoji: string } | { type: 'external'; external: { url: string } };
}

export interface UpdateDatabaseParams {
  title?: RichText[];
  properties?: Record<string, Property>;
}

export interface SearchResult {
  object: 'page' | 'database';
  id: string;
  title?: string;
  url?: string;
}

// ===== 客户端配置 =====
export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
}

// Notion 配置
export interface NotionConfig extends ClientConfig {
  auth: string;
}

// Wolai 配置
export interface WolaiConfig extends ClientConfig {
  apiToken: string;
}

// 语雀配置（预留）
export interface YuqueConfig extends ClientConfig {
  token: string;
  namespace?: string;
}

