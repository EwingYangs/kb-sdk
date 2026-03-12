// ============================================
// Notion 适配器 - 类型映射
// ============================================

import {
  RichText,
  Property,
  PropertyValue,
  Database,
  Page,
  Block,
  QueryDatabaseResponse,
  SearchResult,
} from '../../core/types';

export class NotionMapper {
  // ===== RichText 映射 =====
  static toUnifiedRichText(notionRichText: any): RichText {
    const richText: RichText = {
      type: notionRichText.type,
    };

    if (notionRichText.type === 'text') {
      richText.text = {
        content: notionRichText.text?.content || '',
        link: notionRichText.text?.link || null,
      };
    }

    if (notionRichText.annotations) {
      richText.annotations = {
        bold: notionRichText.annotations.bold,
        italic: notionRichText.annotations.italic,
        strikethrough: notionRichText.annotations.strikethrough,
        underline: notionRichText.annotations.underline,
        code: notionRichText.annotations.code,
        color: notionRichText.annotations.color,
      };
    }

    return richText;
  }

  static toNotionRichText(richText: RichText): any {
    const result: any = {
      type: richText.type,
    };

    if (richText.type === 'text' && richText.text) {
      result.text = {
        content: richText.text.content,
      };
      if (richText.text.link) {
        result.text.link = richText.text.link;
      }
    }

    if (richText.annotations) {
      result.annotations = richText.annotations;
    }

    return result;
  }

  // ===== Property 映射 =====
  static toUnifiedProperty(name: string, notionProp: any): Property {
    return {
      id: notionProp.id,
      name,
      type: notionProp.type,
      config: notionProp[notionProp.type],
    };
  }

  // ===== PropertyValue 映射 =====
  static toUnifiedPropertyValue(notionValue: any): PropertyValue {
    const type = notionValue.type;
    const value = notionValue[type];

    switch (type) {
      case 'title':
        return {
          type: 'title',
          title: (value || []).map((t: any) => this.toUnifiedRichText(t)),
        };
      case 'rich_text':
        return {
          type: 'rich_text',
          rich_text: (value || []).map((t: any) => this.toUnifiedRichText(t)),
        };
      case 'number':
        return { type: 'number', number: value ?? null };
      case 'select':
        return { type: 'select', select: value || null };
      case 'multi_select':
        return { type: 'multi_select', multi_select: value || [] };
      case 'date':
        return { type: 'date', date: value || null };
      case 'files':
        return { type: 'files', files: value || [] };
      case 'checkbox':
        return { type: 'checkbox', checkbox: value || false };
      case 'url':
        return { type: 'url', url: value || null };
      case 'email':
        return { type: 'email', email: value || null };
      case 'relation':
        return { type: 'relation', relation: value || [] };
      case 'formula':
        return { type: 'formula', formula: value || { type: 'string', value: '' } };
      default:
        return { type, [type]: value } as any;
    }
  }

  static toNotionPropertyValue(propertyValue: PropertyValue): any {
    const type = (propertyValue as any).type;
    const value = (propertyValue as any)[type];
    return { [type]: value };
  }

  // ===== Database 映射 =====
  static toUnifiedDatabase(notionDb: any): Database {
    const properties: Record<string, Property> = {};
    
    for (const [name, prop] of Object.entries(notionDb.properties || {})) {
      properties[name] = this.toUnifiedProperty(name, prop);
    }

    return {
      id: notionDb.id,
      title: (notionDb.title || []).map((t: any) => this.toUnifiedRichText(t)),
      properties,
      url: notionDb.url,
      createdTime: new Date(notionDb.created_time),
      lastEditedTime: new Date(notionDb.last_edited_time),
    };
  }

  // ===== Page 映射 =====
  static toUnifiedPage(notionPage: any): Page {
    const properties: Record<string, PropertyValue> = {};
    
    for (const [name, prop] of Object.entries(notionPage.properties || {})) {
      properties[name] = this.toUnifiedPropertyValue(prop);
    }

    const parent = notionPage.parent?.type === 'database_id'
      ? { database_id: notionPage.parent.database_id, type: 'database_id' as const }
      : { page_id: notionPage.parent?.page_id || '', type: 'page_id' as const };

    return {
      id: notionPage.id,
      parent,
      properties,
      url: notionPage.url,
      icon: notionPage.icon,
      createdTime: new Date(notionPage.created_time),
      lastEditedTime: new Date(notionPage.last_edited_time),
    };
  }

  // ===== Block 映射 =====
  static toUnifiedBlock(notionBlock: any): Block {
    const block: Block = {
      id: notionBlock.id,
      type: notionBlock.type,
    };

    const type = notionBlock.type;
    if (notionBlock[type]) {
      block[type] = notionBlock[type];
    }

    return block;
  }

  static toNotionBlock(block: Block): any {
    const result: any = {
      object: 'block',
      type: block.type,
    };

    const type = block.type;
    if ((block as any)[type]) {
      result[type] = (block as any)[type];
    }

    return result;
  }

  // ===== Query 响应映射 =====
  static toUnifiedQueryResponse(notionResponse: any): QueryDatabaseResponse {
    return {
      results: (notionResponse.results || [])
        .filter((r: any) => r.object === 'page')
        .map((r: any) => this.toUnifiedPage(r)),
      hasMore: notionResponse.has_more || false,
      nextCursor: notionResponse.next_cursor || undefined,
    };
  }

  // ===== Search 结果映射 =====
  static toUnifiedSearchResult(notionResults: any[]): SearchResult[] {
    return (notionResults || []).map(r => ({
      object: r.object,
      id: r.id,
      title: r.title?.[0]?.text?.content || r.title?.[0]?.plain_text || '',
      url: r.url,
    }));
  }
}