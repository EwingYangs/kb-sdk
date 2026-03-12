// ============================================
// 语雀适配器 - 类型映射
// ============================================

import {
  RichText,
  Property,
  PropertyValue,
  Database,
  Page,
  Block,
  SearchResult,
} from '../../core/types';

export class YuqueMapper {
  // ===== 知识库 <-> Database 映射 =====
  
  static toUnifiedDatabase(yuqueRepo: any): Database {
    // 语雀知识库属性映射到统一属性
    const properties: Record<string, Property> = {
      'slug': {
        id: 'slug',
        name: 'slug',
        type: 'rich_text',
      },
      'description': {
        id: 'description',
        name: 'description',
        type: 'rich_text',
      },
      'type': {
        id: 'type',
        name: 'type',
        type: 'select',
      },
      'public': {
        id: 'public',
        name: 'public',
        type: 'select',
      },
    };

    return {
      id: yuqueRepo.slug, // 使用 slug 作为 ID
      title: [{ type: 'text', text: { content: yuqueRepo.name } }],
      properties,
      url: yuqueRepo.web_url || `https://www.yuque.com/${yuqueRepo.namespace}`,
      createdTime: new Date(yuqueRepo.created_at),
      lastEditedTime: new Date(yuqueRepo.updated_at),
    };
  }

  // ===== 文档 <-> Page 映射 =====
  
  static toUnifiedPage(yuqueDoc: any, namespace: string): Page {
    const properties: Record<string, PropertyValue> = {
      'title': {
        type: 'title',
        title: [{ type: 'text', text: { content: yuqueDoc.title } }],
      },
      'slug': {
        type: 'rich_text',
        rich_text: [{ type: 'text', text: { content: yuqueDoc.slug } }],
      },
      'description': {
        type: 'rich_text',
        rich_text: yuqueDoc.description 
          ? [{ type: 'text', text: { content: yuqueDoc.description } }]
          : [],
      },
      'word_count': {
        type: 'number',
        number: yuqueDoc.word_count || 0,
      },
      'cover': yuqueDoc.cover
        ? {
            type: 'files',
            files: [{ name: 'cover', type: 'external', external: { url: yuqueDoc.cover } }],
          }
        : { type: 'files', files: [] },
      'public': {
        type: 'select',
        select: yuqueDoc.public === 1 ? { name: '公开' } : { name: '私密' },
      },
      // 存储原始 Markdown 内容
      '_raw_content': {
        type: 'rich_text',
        rich_text: yuqueDoc.body
          ? [{ type: 'text', text: { content: yuqueDoc.body } }]
          : [],
      },
    };

    return {
      id: `${namespace}/${yuqueDoc.slug}`,
      parent: { database_id: namespace, type: 'database_id' },
      properties,
      url: yuqueDoc.web_url || `https://www.yuque.com/${namespace}/${yuqueDoc.slug}`,
      icon: yuqueDoc.cover
        ? { type: 'external', external: { url: yuqueDoc.cover } }
        : undefined,
      createdTime: new Date(yuqueDoc.created_at),
      lastEditedTime: new Date(yuqueDoc.updated_at),
    };
  }

  static toYuqueDocParams(properties: Record<string, any>): {
    title: string;
    slug?: string;
    body?: string;
    description?: string;
    public?: number;
  } {
    const title = this.extractTitle(properties);
    const slug = this.extractPropertyValue(properties, 'slug');
    const body = this.extractBody(properties);
    const description = this.extractPropertyValue(properties, 'description');
    const isPublic = this.extractPublic(properties);

    return {
      title,
      ...(slug && { slug }),
      ...(body && { body }),
      ...(description && { description }),
      ...(isPublic !== undefined && { public: isPublic }),
    };
  }

  // ===== 块内容映射（语雀使用 Lake 格式或 Markdown） =====
  
  // Markdown 转语雀块（简化版）
  static blocksToMarkdown(blocks: Block[]): string {
    return blocks.map(block => this.blockToMarkdown(block)).join('\n\n');
  }

  private static blockToMarkdown(block: Block): string {
    switch (block.type) {
      case 'paragraph':
        return this.richTextToMarkdown(block.paragraph?.rich_text || []);
      
      case 'heading_1':
        return `# ${this.richTextToMarkdown((block as any).heading_1?.rich_text || [])}`;
      
      case 'heading_2':
        return `## ${this.richTextToMarkdown((block as any).heading_2?.rich_text || [])}`;
      
      case 'heading_3':
        return `### ${this.richTextToMarkdown((block as any).heading_3?.rich_text || [])}`;
      
      case 'bulleted_list_item':
        return `- ${this.richTextToMarkdown((block as any).bulleted_list_item?.rich_text || [])}`;
      
      case 'numbered_list_item':
        return `1. ${this.richTextToMarkdown((block as any).numbered_list_item?.rich_text || [])}`;
      
      case 'divider':
        return '---';
      
      case 'quote':
        return `> ${this.richTextToMarkdown((block as any).quote?.rich_text || [])}`;
      
      case 'image': {
        const imgBlock = block as any;
        const url = imgBlock.image?.external?.url || imgBlock.image?.file?.url || '';
        const caption = this.richTextToMarkdown(imgBlock.image?.caption || []);
        return `![${caption}](${url})`;
      }
      
      case 'callout': {
        const calloutBlock = block as any;
        const emoji = calloutBlock.callout?.icon?.emoji || '💡';
        const text = this.richTextToMarkdown(calloutBlock.callout?.rich_text || []);
        return `> ${emoji} ${text}`;
      }
      
      default:
        return '';
    }
  }

  private static richTextToMarkdown(richTexts: RichText[]): string {
    return richTexts.map(rt => {
      let text = rt.text?.content || '';
      
      if (rt.annotations) {
        if (rt.annotations.bold) text = `**${text}**`;
        if (rt.annotations.italic) text = `*${text}*`;
        if (rt.annotations.code) text = `\`${text}\``;
        if (rt.annotations.strikethrough) text = `~~${text}~~`;
      }
      
      if (rt.text?.link) {
        text = `[${text}](${rt.text.link.url})`;
      }
      
      return text;
    }).join('');
  }

  // Markdown 转块（简化解析）
  static markdownToBlocks(markdown: string): Block[] {
    const lines = markdown.split('\n');
    const blocks: Block[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 标题
      if (trimmed.startsWith('# ')) {
        blocks.push({
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: trimmed.slice(2) } }],
          },
        });
      }
      else if (trimmed.startsWith('## ')) {
        blocks.push({
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: trimmed.slice(3) } }],
          },
        });
      }
      else if (trimmed.startsWith('### ')) {
        blocks.push({
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: trimmed.slice(4) } }],
          },
        });
      }
      // 列表
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: trimmed.slice(2) } }],
          },
        });
      }
      // 分割线
      else if (trimmed === '---' || trimmed === '***') {
        blocks.push({ type: 'divider', divider: {} });
      }
      // 引用
      else if (trimmed.startsWith('> ')) {
        blocks.push({
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: trimmed.slice(2) } }],
          },
        });
      }
      // 默认段落
      else {
        blocks.push({
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: trimmed } }],
          },
        });
      }
    }
    
    return blocks;
  }

  // ===== 搜索结果映射 =====
  
  static toUnifiedSearchResult(yuqueResult: any): SearchResult {
    return {
      object: yuqueResult.type === 'Doc' ? 'page' : 'database',
      id: yuqueResult.slug,
      title: yuqueResult.title,
      url: yuqueResult.web_url,
    };
  }

  // ===== 辅助方法 =====
  
  private static extractTitle(properties: Record<string, any>): string {
    const titleProp = properties['标题'] || properties['title'] || properties['Title'];
    if (titleProp?.type === 'title') {
      return titleProp.title?.map((t: RichText) => t.text?.content).join('') || 'Untitled';
    }
    return 'Untitled';
  }

  private static extractPropertyValue(properties: Record<string, any>, key: string): string | undefined {
    const prop = properties[key];
    if (!prop) return undefined;
    
    const type = prop.type;
    if (type === 'rich_text' || type === 'title') {
      return prop[type]?.map((t: RichText) => t.text?.content).join('');
    }
    if (type === 'select') {
      return prop.select?.name;
    }
    return undefined;
  }

  private static extractBody(properties: Record<string, any>): string | undefined {
    // 优先使用 _raw_content 或 body
    const body = this.extractPropertyValue(properties, '_raw_content') ||
                 this.extractPropertyValue(properties, 'body') ||
                 this.extractPropertyValue(properties, '内容');
    return body;
  }

  private static extractPublic(properties: Record<string, any>): number | undefined {
    const publicProp = properties['public'] || properties['公开'];
    if (publicProp?.type === 'select') {
      const value = publicProp.select?.name;
      if (value === '公开' || value === 'public') return 1;
      if (value === '私密' || value === 'private') return 0;
    }
    if (publicProp?.type === 'checkbox') {
      return publicProp.checkbox ? 1 : 0;
    }
    return undefined;
  }
}