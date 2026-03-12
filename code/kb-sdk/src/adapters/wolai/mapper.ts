// ============================================
// Wolai 适配器 - 类型映射
// ============================================

import {
  RichText,
  Property,
  PropertyType,
  PropertyValue,
  TitlePropertyValue,
  RichTextPropertyValue,
  NumberPropertyValue,
  SelectPropertyValue,
  MultiSelectPropertyValue,
  DatePropertyValue,
  CheckboxPropertyValue,
  UrlPropertyValue,
  Database,
  Page,
  Block,
  QueryDatabaseResponse,
  SearchResult,
} from '../../core/types';

// ===== Block 类型映射表 =====

const WOLAI_TO_UNIFIED_BLOCK: Record<string, Block['type']> = {
  text:         'paragraph',
  heading1:     'heading_1',
  heading2:     'heading_2',
  heading3:     'heading_3',
  bulletedList: 'bulleted_list_item',
  numberedList: 'numbered_list_item',
  image:        'image',
  divider:      'divider',
  quote:        'quote',
  callout:      'callout',
};

const UNIFIED_TO_WOLAI_BLOCK: Record<string, string> = Object.fromEntries(
  Object.entries(WOLAI_TO_UNIFIED_BLOCK).map(([k, v]) => [v, k]),
);

// ===== WolaiMapper =====

export class WolaiMapper {
  // ─── RichText ────────────────────────────────────────────

  /**
   * Wolai content.title 元素 → 统一 RichText
   * Wolai 元素结构: { type, text, bold, italic, underline, strikethrough, code, color, link }
   */
  static toUnifiedRichText(wolaiItem: any): RichText {
    const rt: RichText = {
      type: 'text',
      text: {
        content: wolaiItem.text ?? '',
        link: wolaiItem.link ? { url: wolaiItem.link } : null,
      },
    };

    const ann: RichText['annotations'] = {};
    if (wolaiItem.bold)          ann.bold          = true;
    if (wolaiItem.italic)        ann.italic        = true;
    if (wolaiItem.underline)     ann.underline     = true;
    if (wolaiItem.strikethrough) ann.strikethrough = true;
    if (wolaiItem.code)          ann.code          = true;
    if (wolaiItem.color)         ann.color         = wolaiItem.color;

    if (Object.keys(ann).length > 0) rt.annotations = ann;

    return rt;
  }

  /** 统一 RichText → Wolai content.title 元素 */
  static toWolaiRichText(rt: RichText): any {
    const item: any = {
      type: 'text',
      text: rt.text?.content ?? '',
    };

    if (rt.text?.link?.url) item.link = rt.text.link.url;

    const ann = rt.annotations ?? {};
    if (ann.bold)          item.bold          = true;
    if (ann.italic)        item.italic        = true;
    if (ann.underline)     item.underline     = true;
    if (ann.strikethrough) item.strikethrough = true;
    if (ann.code)          item.code          = true;
    if (ann.color)         item.color         = ann.color;

    return item;
  }

  // ─── Block ───────────────────────────────────────────────

  /** Wolai Block → 统一 Block */
  static toUnifiedBlock(wolaiBlock: any): Block {
    const wolaiType: string = wolaiBlock.type ?? 'text';
    const unifiedType: Block['type'] = WOLAI_TO_UNIFIED_BLOCK[wolaiType] ?? 'paragraph';

    const richText: RichText[] = (wolaiBlock.content?.title ?? []).map(
      (item: any) => this.toUnifiedRichText(item),
    );

    const block: any = {
      id:   wolaiBlock.block_id ?? wolaiBlock.id,
      type: unifiedType,
    };

    if (unifiedType === 'image') {
      block.image = {
        type: 'external',
        external: { url: wolaiBlock.content?.url ?? '' },
        caption: richText,
      };
    } else if (unifiedType === 'divider') {
      block.divider = {};
    } else {
      block[unifiedType] = { rich_text: richText };
    }

    return block as Block;
  }

  /** 统一 Block → Wolai Block */
  static toWolaiBlock(block: Block): any {
    const wolaiType = UNIFIED_TO_WOLAI_BLOCK[block.type] ?? 'text';
    const blockData: any = (block as any)[block.type];

    const content: any = { title: [] };

    if (block.type === 'image') {
      content.url = blockData?.external?.url ?? blockData?.file?.url ?? '';
      content.title = (blockData?.caption ?? []).map((rt: RichText) =>
        this.toWolaiRichText(rt),
      );
    } else if (block.type === 'divider') {
      // no content needed
    } else if (blockData?.rich_text) {
      content.title = (blockData.rich_text as RichText[]).map((rt) =>
        this.toWolaiRichText(rt),
      );
    }

    return { type: wolaiType, content };
  }

  // ─── PropertyValue ───────────────────────────────────────

  /**
   * Wolai row property { type, value } → 统一 PropertyValue
   */
  static toUnifiedPropertyValue(wolaiProp: any): PropertyValue {
    const type: string = wolaiProp.type;
    const value: any  = wolaiProp.value;

    switch (type) {
      case 'title':
        return {
          type: 'title',
          title: (value ?? []).map((item: any) => this.toUnifiedRichText(item)),
        } as TitlePropertyValue;

      case 'rich_text':
        return {
          type: 'rich_text',
          rich_text: (value ?? []).map((item: any) => this.toUnifiedRichText(item)),
        } as RichTextPropertyValue;

      case 'number':
        return { type: 'number', number: value ?? null } as NumberPropertyValue;

      case 'select':
        return {
          type: 'select',
          select: value ? { id: value.id, name: value.name, color: value.color } : null,
        } as SelectPropertyValue;

      case 'multi_select':
        return {
          type: 'multi_select',
          multi_select: (value ?? []).map((v: any) => ({
            id:    v.id,
            name:  v.name,
            color: v.color,
          })),
        } as MultiSelectPropertyValue;

      case 'date':
        return {
          type: 'date',
          date: value
            ? { start: value.start ?? value, end: value.end ?? null }
            : null,
        } as DatePropertyValue;

      case 'checkbox':
        return { type: 'checkbox', checkbox: value ?? false } as CheckboxPropertyValue;

      case 'url':
        return { type: 'url', url: value ?? null } as UrlPropertyValue;

      default:
        // 未知类型：返回 rich_text 空值占位
        return { type: 'rich_text', rich_text: [] } as RichTextPropertyValue;
    }
  }

  /** 统一 PropertyValue → Wolai { type, value } */
  static toWolaiPropertyValue(propValue: PropertyValue): any {
    switch (propValue.type) {
      case 'title': {
        const v = propValue as TitlePropertyValue;
        return { type: 'title', value: v.title.map((rt) => this.toWolaiRichText(rt)) };
      }
      case 'rich_text': {
        const v = propValue as RichTextPropertyValue;
        return { type: 'rich_text', value: v.rich_text.map((rt) => this.toWolaiRichText(rt)) };
      }
      case 'number': {
        const v = propValue as NumberPropertyValue;
        return { type: 'number', value: v.number };
      }
      case 'select': {
        const v = propValue as SelectPropertyValue;
        return { type: 'select', value: v.select };
      }
      case 'multi_select': {
        const v = propValue as MultiSelectPropertyValue;
        return { type: 'multi_select', value: v.multi_select };
      }
      case 'date': {
        const v = propValue as DatePropertyValue;
        return { type: 'date', value: v.date };
      }
      case 'checkbox': {
        const v = propValue as CheckboxPropertyValue;
        return { type: 'checkbox', value: v.checkbox };
      }
      case 'url': {
        const v = propValue as UrlPropertyValue;
        return { type: 'url', value: v.url };
      }
      default:
        return { type: (propValue as any).type, value: null };
    }
  }

  // ─── Database ────────────────────────────────────────────

  /** Wolai database 响应 → 统一 Database */
  static toUnifiedDatabase(wolaiDb: any): Database {
    const properties: Record<string, Property> = {};

    for (const [name, prop] of Object.entries(wolaiDb.properties ?? {})) {
      const p = prop as any;
      properties[name] = {
        id:     p.id,
        name,
        type:   (p.type ?? 'rich_text') as PropertyType,
        config: p.config,
      };
    }

    const titleText: string =
      typeof wolaiDb.title === 'string'
        ? wolaiDb.title
        : (wolaiDb.title as any[])?.[0]?.text ?? '';

    return {
      id:             wolaiDb.database_id ?? wolaiDb.id ?? '',
      title:          [{ type: 'text', text: { content: titleText } }],
      properties,
      url:            wolaiDb.url,
      createdTime:    new Date(wolaiDb.created_time ?? Date.now()),
      lastEditedTime: new Date(wolaiDb.last_edited_time ?? Date.now()),
    };
  }

  // ─── Page / Row ──────────────────────────────────────────

  /** Wolai database row → 统一 Page */
  static toUnifiedPage(wolaiRow: any, databaseId: string): Page {
    const properties: Record<string, PropertyValue> = {};

    for (const [name, prop] of Object.entries(wolaiRow.properties ?? {})) {
      properties[name] = this.toUnifiedPropertyValue(prop);
    }

    return {
      id:             wolaiRow.row_id ?? wolaiRow.id ?? '',
      parent:         { database_id: databaseId, type: 'database_id' },
      properties,
      url:            wolaiRow.url,
      createdTime:    new Date(wolaiRow.created_time ?? Date.now()),
      lastEditedTime: new Date(wolaiRow.last_edited_time ?? Date.now()),
    };
  }

  // ─── Query Response ──────────────────────────────────────

  static toUnifiedQueryResponse(data: any, databaseId: string): QueryDatabaseResponse {
    const rows: any[] = data.data ?? data.rows ?? data.results ?? [];
    const nextCursor: string | undefined =
      data.page_token ?? data.next_cursor ?? undefined;

    return {
      results:    rows.map((r) => this.toUnifiedPage(r, databaseId)),
      hasMore:    !!nextCursor,
      nextCursor,
    };
  }

  // ─── Search Results ──────────────────────────────────────

  static toUnifiedSearchResults(results: any[]): SearchResult[] {
    return (results ?? []).map((r) => ({
      object: (r.type === 'database' ? 'database' : 'page') as 'page' | 'database',
      id:     r.id ?? r.block_id ?? r.row_id ?? '',
      title:  r.title ?? r.name ?? '',
      url:    r.url,
    }));
  }
}
