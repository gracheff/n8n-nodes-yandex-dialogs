// ─────────────────────────────────────────────────────────────────────────────
// Полные типы протокола Yandex Dialogs / Alice Skills API
// Документация: https://yandex.ru/dev/dialogs/alice/doc/protocol.html
// ─────────────────────────────────────────────────────────────────────────────

// ── Входящий запрос от Алисы ─────────────────────────────────────────────────

export interface AliceRequestMeta {
  locale: string;         // например "ru-RU"
  timezone: string;       // например "Europe/Moscow"
  client_id: string;
  interfaces: {
    screen?: Record<string, unknown>;
    payments?: Record<string, unknown>;
    account_linking?: Record<string, unknown>;
    audio_player?: Record<string, unknown>;
  };
}

export interface AliceNLUEntity {
  tokens: { start: number; end: number };
  type: 'YANDEX.GEO' | 'YANDEX.FIO' | 'YANDEX.NUMBER' | 'YANDEX.DATETIME' | string;
  value: unknown;
}

export interface AliceNLUIntent {
  slots: Record<string, { type: string; tokens: { start: number; end: number }; value: unknown }>;
}

export interface AliceNLU {
  tokens: string[];
  entities: AliceNLUEntity[];
  intents: Record<string, AliceNLUIntent>;
}

export interface AliceMarkup {
  dangerous_context?: boolean;
}

export interface AliceRequestObject {
  command: string;         // нормализованная команда (без "Алиса, скажи …")
  original_utterance: string; // дословная фраза пользователя
  type: 'SimpleUtterance' | 'ButtonPressed';
  markup?: AliceMarkup;
  payload?: unknown;       // для ButtonPressed — данные кнопки
  nlu: AliceNLU;
}

export interface AliceSession {
  message_id: number;
  session_id: string;
  skill_id: string;
  user_id: string;         // deprecated, но присутствует
  user?: {
    user_id: string;
    access_token?: string;
  };
  application: {
    application_id: string;
  };
  new: boolean;            // true — первое обращение в сессии
}

export interface AliceState {
  session?: Record<string, unknown>;
  user?: Record<string, unknown>;
  application?: Record<string, unknown>;
}

/** Полный входящий запрос от Яндекса */
export interface AliceRequest {
  meta: AliceRequestMeta;
  request: AliceRequestObject;
  session: AliceSession;
  state?: AliceState;
  version: string;
}

// ── Ответ навыка ──────────────────────────────────────────────────────────────

export interface AliceButton {
  title: string;
  url?: string;
  payload?: unknown;
  hide?: boolean;
}

// Карточка «Большое изображение»
export interface AliceBigImageCard {
  type: 'BigImage';
  image_id: string;
  title?: string;
  description?: string;
  button?: AliceButton;
}

// Элемент списка карточки ItemsList
export interface AliceItemsListItem {
  image_id?: string;
  title?: string;
  description?: string;
  button?: AliceButton;
}

export interface AliceItemsListHeader {
  text: string;
}

export interface AliceItemsListFooter {
  text: string;
  button?: AliceButton;
}

// Карточка «Список предметов»
export interface AliceItemsListCard {
  type: 'ItemsList';
  header?: AliceItemsListHeader;
  items: AliceItemsListItem[];
  footer?: AliceItemsListFooter;
}

export type AliceCard = AliceBigImageCard | AliceItemsListCard;

export interface AliceTTS {
  // TTS-разметка: паузы sil<[800]>, ударение +, и т.д.
  text: string;
}

export interface AliceResponseObject {
  text: string;          // обязательно, до 1024 символов
  tts?: string;          // синтез речи, если отличается от text
  card?: AliceCard;
  buttons?: AliceButton[];
  end_session: boolean;
  directives?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
}

export interface AliceSessionState {
  [key: string]: unknown;
}

/** Полный ответ навыка */
export interface AliceResponse {
  response: AliceResponseObject;
  session_state?: AliceSessionState;
  user_state_update?: Record<string, unknown>;
  application_state?: Record<string, unknown>;
  version: string;
}

// ── Вспомогательные типы для узла n8n ────────────────────────────────────────

/** Нормализованные данные, передаваемые в workflow */
export interface AliceNormalizedData {
  // Мета
  version: string;
  // Сессия
  sessionId: string;
  skillId: string;
  userId: string;
  applicationId: string;
  isNewSession: boolean;
  messageId: number;
  // Запрос
  command: string;
  originalUtterance: string;
  requestType: 'SimpleUtterance' | 'ButtonPressed' | string;
  buttonPayload: unknown;
  // NLU
  nluTokens: string[];
  nluEntities: AliceNLUEntity[];
  nluIntents: Record<string, AliceNLUIntent>;
  // Контекст
  locale: string;
  timezone: string;
  hasScreen: boolean;
  // Состояние
  sessionState: Record<string, unknown>;
  userState: Record<string, unknown>;
  applicationState: Record<string, unknown>;
  // Оригинальный запрос (для отладки)
  rawRequest?: AliceRequest;
}

// ── Конфигурация ответа из параметров узла YandexDialogs ─────────────────────

export type ResponseMode = 'text' | 'bigImage' | 'itemsList' | 'json' | 'endSession';

export interface NodeResponseConfig {
  mode: ResponseMode;
  text: string;
  tts?: string;
  endSession: boolean;
  buttons: Array<{ title: string; url?: string; payload?: string; hide?: boolean }>;
  // BigImage
  bigImageId?: string;
  bigImageTitle?: string;
  bigImageDescription?: string;
  bigImageButtonTitle?: string;
  bigImageButtonUrl?: string;
  // ItemsList
  itemsListHeader?: string;
  itemsListFooterText?: string;
  itemsListFooterButtonTitle?: string;
  itemsListFooterButtonUrl?: string;
  items: Array<{
    imageId?: string;
    title?: string;
    description?: string;
    buttonTitle?: string;
    buttonUrl?: string;
  }>;
  // Raw JSON
  rawJson?: string;
  // Session state
  sessionState?: string;
  // Analytics (JSON-строка из advancedOptions)
  analytics?: string;
}

