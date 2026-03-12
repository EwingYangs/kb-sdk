// ============================================
// kb-sdk - 统一入口
// ============================================

// 核心类型
export * from './core/types';
export * from './core/client';
export * from './core/errors';

// Notion 适配器
export { NotionAdapter, Client as NotionClient } from './adapters/notion/client';
export { NotionMapper } from './adapters/notion/mapper';

// Wolai 适配器
export { WolaiAdapter, Client as WolaiClient } from './adapters/wolai/client';
export { WolaiMapper } from './adapters/wolai/mapper';
export { WolaiAPI } from './adapters/wolai/api';
export type { WolaiAdapterConfig } from './adapters/wolai/client';
export type { WolaiAPIConfig } from './adapters/wolai/api';

// 语雀适配器
export { YuqueAdapter, Client as YuqueClient } from './adapters/yuque/client';
export { YuqueMapper } from './adapters/yuque/mapper';
export { YuqueAPI } from './adapters/yuque/api';

// 版本
export const VERSION = '0.1.0';