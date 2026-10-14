import type {
  IDataObject,
  IExecuteFunctions,
  IExecuteResponsePromiseData,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type {
  AliceButton,
  AliceCard,
  AliceBigImageCard,
  AliceItemsListCard,
  AliceItemsListItem,
  AliceResponse,
  AliceResponseObject,
  NodeResponseConfig,
} from './types';

export class YandexDialogs implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Yandex Dialogs Response',
    name: 'yandexDialogs',
    icon: 'file:yandex-alisa.svg',
    group: ['output'],
    version: 1,
    description:
      'Формирует и отправляет ответ голосовому помощнику Алиса. ' +
      'Используйте после узла "Yandex Dialogs Trigger".',
    defaults: {
      name: 'Yandex Dialogs Response',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
//    requiresWebhook: true,
    properties: [
      // ── Тип ответа ────────────────────────────────────────────────────────
      {
        displayName: 'Тип ответа',
        name: 'responseType',
        type: 'options',
        options: [
          {
            name: 'Текст',
            value: 'text',
            description: 'Простой текстовый ответ',
          },
          {
            name: 'Большое изображение (BigImage)',
            value: 'bigImage',
            description: 'Карточка с одним большим изображением',
          },
          {
            name: 'Список предметов (ItemsList)',
            value: 'itemsList',
            description: 'Горизонтальный или вертикальный список с изображениями',
          },
          {
            name: 'JSON (произвольный)',
            value: 'json',
            description: 'Передать готовый JSON-ответ в формате протокола Алисы',
          },
          {
            name: 'Завершить сессию',
            value: 'endSession',
            description: 'Завершить диалог с пользователем',
          },
        ],
        default: 'text',
      },

      // ── Текст ─────────────────────────────────────────────────────────────
      {
        displayName: 'Текст ответа',
        name: 'text',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        placeholder: 'Привет! Чем могу помочь?',
        description: 'Текст, который Алиса зачитает пользователю. Максимум 1024 символа.',
        required: true,
        displayOptions: {
          show: { responseType: ['text', 'bigImage', 'itemsList', 'endSession'] },
        },
      },
      {
        displayName: 'TTS (синтез речи)',
        name: 'tts',
        type: 'string',
        typeOptions: { rows: 2 },
        default: '',
        placeholder: 'При+вет! Чем могу помо+чь?',
        description:
          'Текст для синтеза речи. Если пусто — используется поле "Текст ответа". ' +
          'Поддерживает TTS-разметку Алисы: ударения (+), паузы (sil<[800]>), и т.д.',
        displayOptions: {
          show: { responseType: ['text', 'bigImage', 'itemsList', 'endSession'] },
        },
      },
      {
        displayName: 'Завершить сессию',
        name: 'endSession',
        type: 'boolean',
        default: false,
        description:
          'Если включено — после ответа диалог с пользователем завершится.',
        displayOptions: {
          show: { responseType: ['text', 'bigImage', 'itemsList'] },
        },
      },

      // ── Кнопки ────────────────────────────────────────────────────────────
      {
        displayName: 'Кнопки',
        name: 'buttons',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: { buttonValues: [] },
        placeholder: 'Добавить кнопку',
        description: 'Кнопки-подсказки, которые отображаются под ответом Алисы.',
        displayOptions: {
          show: { responseType: ['text', 'bigImage', 'itemsList'] },
        },
        options: [
          {
            name: 'buttonValues',
            displayName: 'Кнопка',
            values: [
              {
                displayName: 'Текст кнопки',
                name: 'title',
                type: 'string',
                default: '',
                placeholder: 'Нажми меня',
                required: true,
                description: 'Текст на кнопке. Максимум 64 символа.',
              },
              {
                displayName: 'URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com',
                description: 'Ссылка, открываемая при нажатии кнопки (необязательно).',
              },
              {
                displayName: 'Payload (JSON)',
                name: 'payload',
                type: 'string',
                default: '',
                placeholder: '{"action": "help"}',
                description:
                  'Произвольный JSON, передаваемый в запросе ButtonPressed при нажатии кнопки.',
              },
              {
                displayName: 'Скрыть кнопку после нажатия',
                name: 'hide',
                type: 'boolean',
                default: true,
                description: 'Если true — кнопка исчезает после нажатия.',
              },
            ],
          },
        ],
      },

      // ── BigImage ──────────────────────────────────────────────────────────
      {
        displayName: 'ID изображения',
        name: 'bigImageId',
        type: 'string',
        default: '',
        placeholder: '213044/d13b0d86a41daf9de232',
        description: 'ID изображения, загруженного через Яндекс Диалоги API.',
        required: true,
        displayOptions: { show: { responseType: ['bigImage'] } },
      },
      {
        displayName: 'Заголовок карточки',
        name: 'bigImageTitle',
        type: 'string',
        default: '',
        description: 'Заголовок карточки (необязательно).',
        displayOptions: { show: { responseType: ['bigImage'] } },
      },
      {
        displayName: 'Описание карточки',
        name: 'bigImageDescription',
        type: 'string',
        typeOptions: { rows: 2 },
        default: '',
        description: 'Описание под заголовком карточки (необязательно).',
        displayOptions: { show: { responseType: ['bigImage'] } },
      },
      {
        displayName: 'Кнопка карточки — текст',
        name: 'bigImageButtonTitle',
        type: 'string',
        default: '',
        description: 'Текст кнопки, встроенной в карточку (необязательно).',
        displayOptions: { show: { responseType: ['bigImage'] } },
      },
      {
        displayName: 'Кнопка карточки — URL',
        name: 'bigImageButtonUrl',
        type: 'string',
        default: '',
        description: 'URL кнопки, встроенной в карточку (необязательно).',
        displayOptions: { show: { responseType: ['bigImage'] } },
      },

      // ── ItemsList ─────────────────────────────────────────────────────────
      {
        displayName: 'Заголовок списка',
        name: 'itemsListHeader',
        type: 'string',
        default: '',
        description: 'Заголовок над списком предметов (необязательно).',
        displayOptions: { show: { responseType: ['itemsList'] } },
      },
      {
        displayName: 'Элементы списка',
        name: 'items',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: { itemValues: [] },
        placeholder: 'Добавить элемент',
        displayOptions: { show: { responseType: ['itemsList'] } },
        options: [
          {
            name: 'itemValues',
            displayName: 'Элемент',
            values: [
              {
                displayName: 'ID изображения',
                name: 'imageId',
                type: 'string',
                default: '',
                placeholder: '213044/d13b0d86a41daf9de232',
              },
              {
                displayName: 'Заголовок',
                name: 'title',
                type: 'string',
                default: '',
              },
              {
                displayName: 'Описание',
                name: 'description',
                type: 'string',
                default: '',
              },
              {
                displayName: 'Текст кнопки',
                name: 'buttonTitle',
                type: 'string',
                default: '',
              },
              {
                displayName: 'URL кнопки',
                name: 'buttonUrl',
                type: 'string',
                default: '',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Нижний колонтитул — текст',
        name: 'itemsListFooterText',
        type: 'string',
        default: '',
        description: 'Текст в нижней части карточки-списка (необязательно).',
        displayOptions: { show: { responseType: ['itemsList'] } },
      },
      {
        displayName: 'Нижний колонтитул — кнопка (текст)',
        name: 'itemsListFooterButtonTitle',
        type: 'string',
        default: '',
        displayOptions: { show: { responseType: ['itemsList'] } },
      },
      {
        displayName: 'Нижний колонтитул — кнопка (URL)',
        name: 'itemsListFooterButtonUrl',
        type: 'string',
        default: '',
        displayOptions: { show: { responseType: ['itemsList'] } },
      },

      // ── Raw JSON ──────────────────────────────────────────────────────────
      {
        displayName: 'JSON-ответ',
        name: 'rawJson',
        type: 'string',
        // ↓ ИСПРАВЛЕНО: 'json' → 'code'
        typeOptions: { rows: 10 },
        default:
          '{\n  "version": "1.0",\n  "response": {\n    "text": "Привет!",\n    "end_session": false\n  }\n}',
        description:
          'Полный JSON-ответ в формате протокола Яндекс Диалогов. ' +
          'Должен содержать поля version и response.',
        displayOptions: { show: { responseType: ['json'] } },
      },

      // ── Session State / Analytics ─────────────────────────────────────────
      {
        displayName: 'Дополнительные опции',
        name: 'advancedOptions',
        type: 'collection',
        placeholder: 'Добавить опцию',
        default: {},
        options: [
          {
            displayName: 'Session State (JSON)',
            name: 'sessionState',
            type: 'string',
            // ↓ ИСПРАВЛЕНО: 'json' → 'code'
            typeOptions: { rows: 3 },
            default: '',
            placeholder: '{"lastItem": "молоко"}',
            description:
              'Данные, которые Алиса сохранит в сессии и вернёт в следующем запросе ' +
              'в поле state.session. В режиме "JSON (произвольный)" накладывается ' +
              'поверх rawJson (поля самого JSON имеют приоритет).',
          },
          {
            displayName: 'Analytics (JSON)',
            name: 'analytics',
            type: 'string',
            // ↓ ИСПРАВЛЕНО: 'json' → 'code'
            typeOptions: { rows: 3 },
            default: '',
            placeholder: '{"events": [{"name": "intent_matched"}]}',
            description: 'Данные аналитики для Яндекс.Метрики (необязательно).',
          },
        ],
      },
    ],
  };

  // ── Execute ────────────────────────────────────────────────────────────────

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    let responseSent = false;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const config = extractNodeConfig(this, itemIndex);
        const aliceResponse = buildAliceResponse(this, config, itemIndex);

        const responseData = aliceResponse as unknown as IDataObject;

        // HTTP-ответ Алисе можно отправить только один раз. Ответ формируется
        // по первому item; остальные items проходят без повторного sendResponse.
        if (!responseSent) {
          await this.sendResponse({
            workflowData: [[{ json: responseData }]],
          } satisfies IExecuteResponsePromiseData);
          responseSent = true;
        } else {
          this.logger.warn(
            'Yandex Dialogs Response: получено несколько входящих items — ответ Алисе отправлен только по первому.',
          );
        }

        returnData.push({
          json: responseData,
          pairedItem: { item: itemIndex },
        });
      } catch (err: unknown) {
        if (this.continueOnFail()) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          returnData.push({
            json: { error: errorMessage } as IDataObject,
            pairedItem: { item: itemIndex },
          });
          continue;
        }
        if (err instanceof NodeOperationError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new NodeOperationError(this.getNode(), message, { itemIndex });
      }
    }

    return [returnData];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции — без изменений относительно первой версии
// ─────────────────────────────────────────────────────────────────────────────

function extractNodeConfig(ctx: IExecuteFunctions, index: number): NodeResponseConfig {
  const responseType = ctx.getNodeParameter('responseType', index) as string;

  const base: NodeResponseConfig = {
    mode: responseType as NodeResponseConfig['mode'],
    text: '',
    endSession: responseType === 'endSession',
    buttons: [],
    items: [],
  };

  if (responseType !== 'json') {
    base.text = ctx.getNodeParameter('text', index, '') as string;
    base.tts = ctx.getNodeParameter('tts', index, '') as string;

    if (['text', 'bigImage', 'itemsList'].includes(responseType)) {
      base.endSession = ctx.getNodeParameter('endSession', index, false) as boolean;
    }

    const buttonsCollection = ctx.getNodeParameter('buttons', index, {
      buttonValues: [],
    }) as {
      buttonValues?: Array<{
        title: string;
        url?: string;
        payload?: string;
        hide?: boolean;
      }>;
    };
    base.buttons = buttonsCollection.buttonValues ?? [];
  }

  if (responseType === 'bigImage') {
    base.bigImageId = ctx.getNodeParameter('bigImageId', index, '') as string;
    base.bigImageTitle = ctx.getNodeParameter('bigImageTitle', index, '') as string;
    base.bigImageDescription = ctx.getNodeParameter('bigImageDescription', index, '') as string;
    base.bigImageButtonTitle = ctx.getNodeParameter('bigImageButtonTitle', index, '') as string;
    base.bigImageButtonUrl = ctx.getNodeParameter('bigImageButtonUrl', index, '') as string;
  }

  if (responseType === 'itemsList') {
    base.itemsListHeader = ctx.getNodeParameter('itemsListHeader', index, '') as string;
    base.itemsListFooterText = ctx.getNodeParameter('itemsListFooterText', index, '') as string;
    base.itemsListFooterButtonTitle = ctx.getNodeParameter(
      'itemsListFooterButtonTitle',
      index,
      '',
    ) as string;
    base.itemsListFooterButtonUrl = ctx.getNodeParameter(
      'itemsListFooterButtonUrl',
      index,
      '',
    ) as string;

    const itemsCollection = ctx.getNodeParameter('items', index, { itemValues: [] }) as {
      itemValues?: Array<{
        imageId?: string;
        title?: string;
        description?: string;
        buttonTitle?: string;
        buttonUrl?: string;
      }>;
    };
    base.items = itemsCollection.itemValues ?? [];
  }

  if (responseType === 'json') {
    base.rawJson = ctx.getNodeParameter('rawJson', index, '') as string;
  }

  const advanced = ctx.getNodeParameter('advancedOptions', index, {}) as {
    sessionState?: string;
    analytics?: string;
  };
  base.sessionState = advanced.sessionState ?? '';
  base.analytics = advanced.analytics ?? '';

  return base;
}

// Экспортировано для тестов
export function buildAliceResponse(
  ctx: IExecuteFunctions,
  config: NodeResponseConfig,
  itemIndex: number,
): AliceResponse {
  // ── Raw JSON ──────────────────────────────────────────────────────────────
  if (config.mode === 'json') {
    const raw = (config.rawJson ?? '').trim();
    if (!raw) {
      throw new NodeOperationError(ctx.getNode(), 'Поле "JSON-ответ" не может быть пустым.', {
        itemIndex,
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new NodeOperationError(ctx.getNode(), `Невалидный JSON-ответ: ${msg}`, { itemIndex });
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('response' in parsed) ||
      !('version' in parsed)
    ) {
      throw new NodeOperationError(
        ctx.getNode(),
        'JSON-ответ должен содержать поля "version" и "response".',
        { itemIndex },
      );
    }
    const result = parsed as AliceResponse;

    // Session State из advancedOptions накладывается поверх rawJson,
    // если поле ответа ещё не заполнено самим JSON.
    let sessionState: Record<string, unknown> | undefined;
    if (config.sessionState?.trim()) {
      try {
        const parsedState: unknown = JSON.parse(config.sessionState.trim());
        if (typeof parsedState === 'object' && parsedState !== null) {
          sessionState = parsedState as Record<string, unknown>;
        }
      } catch (stateErr: unknown) {
        const msg = stateErr instanceof Error ? stateErr.message : String(stateErr);
        throw new NodeOperationError(
          ctx.getNode(),
          `Невалидный JSON в Session State: ${msg}`,
          { itemIndex },
        );
      }
    }
    if (sessionState) {
      result.session_state = { ...sessionState, ...(result.session_state ?? {}) };
    }

    return result;
  }

  // ── Текст ─────────────────────────────────────────────────────────────────
  const text = sanitizeText(config.text);
  if (!text) {
    throw new NodeOperationError(ctx.getNode(), 'Поле "Текст ответа" не может быть пустым.', {
      itemIndex,
    });
  }

  // ── Кнопки ────────────────────────────────────────────────────────────────
  const buttons: AliceButton[] = config.buttons
    .filter((b) => b.title?.trim())
    .map((b) => {
      const btn: AliceButton = {
        title: b.title.trim().slice(0, 64),
        hide: b.hide ?? true,
      };
      if (b.url?.trim()) btn.url = b.url.trim();
      if (b.payload?.trim()) {
        try {
          btn.payload = JSON.parse(b.payload.trim());
        } catch {
          btn.payload = b.payload.trim();
        }
      }
      return btn;
    });

  // ── Карточки ──────────────────────────────────────────────────────────────
  let card: AliceCard | undefined;

  if (config.mode === 'bigImage') {
    if (!config.bigImageId?.trim()) {
      throw new NodeOperationError(
        ctx.getNode(),
        'Укажите ID изображения для карточки BigImage.',
        { itemIndex },
      );
    }
    const bigCard: AliceBigImageCard = {
      type: 'BigImage',
      image_id: config.bigImageId.trim(),
    };
    if (config.bigImageTitle?.trim()) {
      bigCard.title = sanitizeCardField(config.bigImageTitle, CARD_TITLE_MAX);
    }
    if (config.bigImageDescription?.trim()) {
      bigCard.description = sanitizeCardField(config.bigImageDescription, CARD_DESCRIPTION_MAX);
    }
    if (config.bigImageButtonTitle?.trim()) {
      bigCard.button = { title: sanitizeCardField(config.bigImageButtonTitle, BUTTON_TITLE_MAX) };
      if (config.bigImageButtonUrl?.trim()) {
        bigCard.button.url = config.bigImageButtonUrl.trim();
      }
    }
    card = bigCard;
  }

  if (config.mode === 'itemsList') {
    const validItems = config.items.filter((it) => it.title?.trim() || it.imageId?.trim());
    if (validItems.length === 0) {
      // Яндекс отклоняет ItemsList с пустым items — лучше упасть с понятной ошибкой
      throw new NodeOperationError(
        ctx.getNode(),
        'Список ItemsList пуст: заполните хотя бы один элемент (Title или Image ID).',
        { itemIndex },
      );
    }
    const listCard: AliceItemsListCard = {
      type: 'ItemsList',
      items: validItems.map<AliceItemsListItem>((it) => {
        const item: AliceItemsListItem = {};
        if (it.imageId?.trim()) item.image_id = it.imageId.trim();
        if (it.title?.trim()) item.title = sanitizeCardField(it.title, CARD_TITLE_MAX);
        if (it.description?.trim()) {
          item.description = sanitizeCardField(it.description, CARD_DESCRIPTION_MAX);
        }
        if (it.buttonTitle?.trim()) {
          item.button = { title: sanitizeCardField(it.buttonTitle, BUTTON_TITLE_MAX) };
          if (it.buttonUrl?.trim()) item.button.url = it.buttonUrl.trim();
        }
        return item;
      }),
    };
    if (config.itemsListHeader?.trim()) {
      listCard.header = { text: sanitizeCardField(config.itemsListHeader, CARD_TITLE_MAX) };
    }
    if (config.itemsListFooterText?.trim()) {
      listCard.footer = { text: sanitizeCardField(config.itemsListFooterText, CARD_TITLE_MAX) };
      if (config.itemsListFooterButtonTitle?.trim()) {
        listCard.footer.button = {
          title: sanitizeCardField(config.itemsListFooterButtonTitle, BUTTON_TITLE_MAX),
        };
        if (config.itemsListFooterButtonUrl?.trim()) {
          listCard.footer.button.url = config.itemsListFooterButtonUrl.trim();
        }
      }
    }
    card = listCard;
  }

  // ── Session State ─────────────────────────────────────────────────────────
  let sessionState: Record<string, unknown> | undefined;
  if (config.sessionState?.trim()) {
    try {
      const parsed: unknown = JSON.parse(config.sessionState.trim());
      if (typeof parsed === 'object' && parsed !== null) {
        sessionState = parsed as Record<string, unknown>;
      }
    } catch (stateErr: unknown) {
      const msg = stateErr instanceof Error ? stateErr.message : String(stateErr);
      throw new NodeOperationError(
        ctx.getNode(),
        `Невалидный JSON в Session State: ${msg}`,
        { itemIndex },
      );
    }
  }

  // ── Analytics (Яндекс.Метрика) ────────────────────────────────────────────
  let analytics: Record<string, unknown> | undefined;
  if (config.analytics?.trim()) {
    try {
      const parsed: unknown = JSON.parse(config.analytics.trim());
      if (typeof parsed === 'object' && parsed !== null) {
        analytics = parsed as Record<string, unknown>;
      }
    } catch (analyticsErr: unknown) {
      const msg = analyticsErr instanceof Error ? analyticsErr.message : String(analyticsErr);
      throw new NodeOperationError(
        ctx.getNode(),
        `Невалидный JSON в Analytics: ${msg}`,
        { itemIndex },
      );
    }
  }

  // ── Сборка ответа ─────────────────────────────────────────────────────────
  const responseObj: AliceResponseObject = {
    text,
    end_session: config.mode === 'endSession' ? true : (config.endSession ?? false),
  };

  // TTS-фолбэк: пустое поле TTS → Алиса зачитает поле text
  if (config.tts?.trim()) {
    responseObj.tts = config.tts.trim();
  } else {
    responseObj.tts = text;
  }
  if (card) responseObj.card = card;
  if (buttons.length > 0) responseObj.buttons = buttons;
  if (analytics) responseObj.analytics = analytics;

  const result: AliceResponse = {
    version: '1.0',
    response: responseObj,
  };

  if (sessionState) result.session_state = sessionState;

  return result;
}

// Экспортировано для тестов
export function sanitizeText(text: string): string {
  return (text ?? '').trim().slice(0, 1024);
}

// Лимиты протокола Алисы для полей карточек
const CARD_TITLE_MAX = 128;
const CARD_DESCRIPTION_MAX = 4096;
const BUTTON_TITLE_MAX = 64;

/** Обрезает значение поля карточки до лимита протокола. */
function sanitizeCardField(value: string | undefined, limit: number): string {
  return (value ?? '').trim().slice(0, limit);
}

