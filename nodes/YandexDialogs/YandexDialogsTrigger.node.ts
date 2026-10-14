import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  NodeConnectionType,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import type { AliceRequest, AliceNormalizedData } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// YandexDialogsTrigger
//
// Совместимость с Webhook-нодой:
//   • Реализует тот же интерфейс INodeType с методом webhook()
//   • Возвращает IWebhookResponseData — тот же формат, что стандартный Webhook
//   • Поддерживает respond: 'webhook' (т.е. "Using 'Respond to Webhook' Node")
//     чтобы YandexDialogs.node.ts мог сформировать ответ Алисе самостоятельно
//   • Путь webhook берётся из параметра "path" (isFullPath: true, как у
//     стандартной Webhook-ноды), что даёт предсказуемый URL для Яндекса
// ─────────────────────────────────────────────────────────────────────────────

export class YandexDialogsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Yandex Dialogs Trigger',
    name: 'yandexDialogsTrigger',
    icon: 'file:yandex-alisa.svg',
    group: ['trigger'],
    version: 1,
    description:
      'Получает запросы от голосового помощника Алиса (Яндекс Диалоги) и запускает workflow. ' +
      'Используйте узел "Yandex Dialogs Response" для отправки ответа.',
    defaults: {
      name: 'Yandex Dialogs Trigger',
    },
    // Совместимость с Webhook: те же output-коннекторы
    inputs: [] as unknown as NodeConnectionType[],
    outputs: [NodeConnectionTypes.Main],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        // n8n удерживает HTTP-ответ до вызова sendResponse() в YandexDialogs.node.ts.
        // Немедленный ответ (режим "immediately") реализуется вручную через
        // res.json() + noWebhookResponse: true в методе webhook().
        responseMode: 'responseNode',
        // path и isFullPath как у стандартной Webhook-ноды: путь берётся из
        // параметра "path" (n8n вычисляет выражение при регистрации webhook),
        // isFullPath: true отключает префикс webhookId.
        // Итоговый URL: <n8n-host>/webhook/<path>.
        path: '={{ $parameter.path }}',
        isFullPath: true,
      },
    ],
    properties: [
      // ── Основные ────────────────────────────────────────────────────────────
      {
        displayName: 'Path',
        name: 'path',
        type: 'string',
        default: 'yandex-dialogs',
        placeholder: 'yandex-dialogs',
        description:
          'URL-путь вебхука (без ведущего слэша). Итоговый URL: <n8n-host>/webhook/<path>. ' +
          'Этот URL нужно указать в настройках навыка в Яндекс Диалогах. ' +
          'Путь должен быть уникальным среди активных webhook-воркфлоу.',
        required: true,
      },
      {
        displayName: 'Режим ответа',
        name: 'respondMode',
        type: 'options',
        options: [
          {
            name: 'Через узел "Yandex Dialogs Response"',
            value: 'responseNode',
            description:
              'Ответ формируется узлом Yandex Dialogs Response в конце workflow. ' +
              'Рекомендуется для полного контроля над ответом Алисе.',
          },
          {
            name: 'Немедленно (заглушка)',
            value: 'immediately',
            description:
              'Немедленно возвращает пустой ответ Алисе. ' +
              'Используйте только для тестирования или webhook-пинга от Яндекса.',
          },
        ],
        default: 'responseNode',
      },
      // ── Опции ───────────────────────────────────────────────────────────────
      {
        displayName: 'Дополнительные опции',
        name: 'options',
        type: 'collection',
        placeholder: 'Добавить опцию',
        default: {},
        options: [
          {
            displayName: 'Передавать RAW-запрос',
            name: 'rawRequest',
            type: 'boolean',
            default: false,
            description:
              'Включать ли оригинальный JSON-запрос от Яндекса в поле rawRequest выходных данных',
          },
          {
            displayName: 'Проверять версию протокола',
            name: 'validateVersion',
            type: 'boolean',
            default: true,
            description:
              'Отклонять запросы с неизвестной версией протокола (ожидается "1.0")',
          },
          {
            displayName: 'Логировать пинги',
            name: 'logPings',
            type: 'boolean',
            default: false,
            description: 'Запускать workflow для ping-запросов Яндекса (isNewSession = true, command = "")',
          },
        ],
      },
    ],
  };

  // ── Webhook-обработчик ─────────────────────────────────────────────────────

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const res = this.getResponseObject();
    const options = this.getNodeParameter('options', {}) as {
      rawRequest?: boolean;
      validateVersion?: boolean;
      logPings?: boolean;
    };
    const respondMode = this.getNodeParameter('respondMode', 'responseNode') as string;

    // ── Парсинг тела запроса ──────────────────────────────────────────────────
    let body: AliceRequest;
    try {
      const raw: unknown = req.body;
      if (raw === null || typeof raw !== 'object') {
        res.status(400).json({ error: 'Invalid JSON body' });
        return { noWebhookResponse: true };
      }
      body = raw as AliceRequest;
    } catch (parseError: unknown) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError);
      res.status(400).json({ error: `Body parse error: ${msg}` });
      return { noWebhookResponse: true };
    }

    // ── Валидация версии протокола ────────────────────────────────────────────
    if (options.validateVersion !== false && body.version !== '1.0') {
      res.status(400).json({ error: `Unsupported protocol version: ${body.version}` });
      return { noWebhookResponse: true };
    }

    // ── Проверка структуры запроса ────────────────────────────────────────────
    if (!body.session || !body.request || !body.meta) {
      res.status(400).json({ error: 'Missing required fields: session, request, meta' });
      return { noWebhookResponse: true };
    }

    // ── Фильтр ping-запросов ──────────────────────────────────────────────────
    const isPing = isPingRequest(body);

    if (isPing && !options.logPings) {
      // Яндекс проверяет доступность навыка пинг-запросом — быстро отвечаем
      const pingResponse = buildMinimalAliceResponse(body, 'Навык запущен', false);
      res.status(200).json(pingResponse);
      return { noWebhookResponse: true };
    }

    // ── Нормализация данных для workflow ──────────────────────────────────────
    const normalized = normalizeAliceRequest(body, options.rawRequest ?? false);

    // ── Режим немедленного ответа ─────────────────────────────────────────────
    if (respondMode === 'immediately') {
      const immediateResponse = buildMinimalAliceResponse(body, '', false);
      res.status(200).json(immediateResponse);
      return {
        workflowData: [[{ json: normalized as unknown as IDataObject }]],
        noWebhookResponse: true,
      };
    }

    // ── Режим ответа через YandexDialogs.node.ts ─────────────────────────────
    // Возвращаем данные в workflow; ответ сформирует YandexDialogs.node.ts
    return {
      webhookResponse: undefined, // сигнал: ответ придёт позже через respondToWebhook
      workflowData: [[{ json: normalized as unknown as IDataObject }]],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────────────────────

// Экспортировано для тестов
export function isPingRequest(body: AliceRequest): boolean {
  // Пинг — это пустая SimpleUtterance в новой сессии. У ButtonPressed поля
  // command и original_utterance всегда пустые, поэтому без проверки на тип
  // нажатие кнопки первым действием в новой сессии ошибочно считалось пингом.
  return (
    body.session.new === true &&
    body.request.type !== 'ButtonPressed' &&
    body.request.command === '' &&
    body.request.original_utterance === ''
  );
}

// Экспортировано для тестов
export function normalizeAliceRequest(
  body: AliceRequest,
  includeRaw: boolean,
): AliceNormalizedData {
  const { meta, request, session, state, version } = body;

  return {
    version,
    // Сессия
    sessionId: session.session_id,
    skillId: session.skill_id,
    userId: session.user?.user_id ?? session.user_id ?? '',
    applicationId: session.application?.application_id ?? '',
    isNewSession: session.new,
    messageId: session.message_id,
    // Запрос
    command: request.command,
    originalUtterance: request.original_utterance,
    requestType: request.type,
    buttonPayload: request.type === 'ButtonPressed' ? request.payload : null,
    // NLU
    nluTokens: request.nlu?.tokens ?? [],
    nluEntities: request.nlu?.entities ?? [],
    nluIntents: request.nlu?.intents ?? {},
    // Контекст
    locale: meta.locale,
    timezone: meta.timezone,
    hasScreen: 'screen' in (meta.interfaces ?? {}),
    // Состояние
    sessionState: (state?.session ?? {}) as Record<string, unknown>,
    userState: (state?.user ?? {}) as Record<string, unknown>,
    applicationState: (state?.application ?? {}) as Record<string, unknown>,
    // Raw — поле отсутствует, если опция выключена (не подставляем пустую заглушку)
    ...(includeRaw ? { rawRequest: body } : {}),
  };
}

// Экспортировано для тестов
export function buildMinimalAliceResponse(
  body: AliceRequest,
  text: string,
  endSession: boolean,
) {
  return {
    version: body.version,
    response: {
      text: text || ' ',
      tts: text || ' ',
      end_session: endSession,
    },
  };
}

