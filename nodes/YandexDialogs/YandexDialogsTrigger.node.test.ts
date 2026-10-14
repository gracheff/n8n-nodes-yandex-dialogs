// ─────────────────────────────────────────────────────────────────────────────
// Тесты YandexDialogsTrigger: normalizeAliceRequest, isPingRequest,
// buildMinimalAliceResponse
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';

import type { AliceRequest } from './types';
import {
  buildMinimalAliceResponse,
  isPingRequest,
  normalizeAliceRequest,
} from './YandexDialogsTrigger.node';

// ── Фабрика тестового запроса Алисы ──────────────────────────────────────────
function makeAliceRequest(overrides: Partial<AliceRequest> = {}): AliceRequest {
  return {
    meta: {
      locale: 'ru-RU',
      timezone: 'Europe/Moscow',
      client_id: 'test-client',
      interfaces: { screen: {} },
    },
    request: {
      type: 'SimpleUtterance',
      command: 'привет',
      original_utterance: 'Привет',
      nlu: { tokens: ['привет'], entities: [], intents: {} },
    },
    session: {
      message_id: 1,
      session_id: 'session-1',
      skill_id: 'skill-1',
      user_id: 'user-1',
      application: { application_id: 'app-1' },
      new: true,
    },
    version: '1.0',
    ...overrides,
  };
}

describe('isPingRequest', () => {
  it('пустая SimpleUtterance в новой сессии — пинг', () => {
    const body = makeAliceRequest({
      request: {
        type: 'SimpleUtterance',
        command: '',
        original_utterance: '',
        nlu: { tokens: [], entities: [], intents: {} },
      },
    });
    expect(isPingRequest(body)).toBe(true);
  });

  it('нажатие кнопки в новой сессии — НЕ пинг (TASK-011)', () => {
    const body = makeAliceRequest({
      request: {
        type: 'ButtonPressed',
        command: '',
        original_utterance: '',
        payload: { action: 'start' },
        nlu: { tokens: [], entities: [], intents: {} },
      },
    });
    expect(isPingRequest(body)).toBe(false);
  });

  it('реальная фраза в новой сессии — НЕ пинг', () => {
    expect(isPingRequest(makeAliceRequest())).toBe(false);
  });

  it('пустая фраза в продолжении сессии — НЕ пинг', () => {
    const body = makeAliceRequest();
    body.session.new = false;
    body.request.command = '';
    body.request.original_utterance = '';
    expect(isPingRequest(body)).toBe(false);
  });
});

describe('normalizeAliceRequest', () => {
  it('нормализует SimpleUtterance', () => {
    const data = normalizeAliceRequest(makeAliceRequest(), false);

    expect(data.version).toBe('1.0');
    expect(data.sessionId).toBe('session-1');
    expect(data.skillId).toBe('skill-1');
    expect(data.userId).toBe('user-1');
    expect(data.applicationId).toBe('app-1');
    expect(data.isNewSession).toBe(true);
    expect(data.messageId).toBe(1);
    expect(data.command).toBe('привет');
    expect(data.originalUtterance).toBe('Привет');
    expect(data.requestType).toBe('SimpleUtterance');
    expect(data.buttonPayload).toBeNull();
    expect(data.nluTokens).toEqual(['привет']);
    expect(data.locale).toBe('ru-RU');
    expect(data.timezone).toBe('Europe/Moscow');
    expect(data.hasScreen).toBe(true);
  });

  it('извлекает payload для ButtonPressed', () => {
    const payload = { action: 'start' };
    const body = makeAliceRequest({
      request: {
        type: 'ButtonPressed',
        command: '',
        original_utterance: '',
        payload,
        nlu: { tokens: [], entities: [], intents: {} },
      },
    });
    const data = normalizeAliceRequest(body, false);
    expect(data.requestType).toBe('ButtonPressed');
    expect(data.buttonPayload).toEqual(payload);
  });

  it('hasScreen=false без экранного интерфейса', () => {
    const body = makeAliceRequest();
    body.meta.interfaces = {};
    expect(normalizeAliceRequest(body, false).hasScreen).toBe(false);
  });

  it('переносит state (session/user/application)', () => {
    const body = makeAliceRequest({
      state: {
        session: { step: 2 },
        user: { name: 'Иван' },
        application: { theme: 'dark' },
      },
    });
    const data = normalizeAliceRequest(body, false);
    expect(data.sessionState).toEqual({ step: 2 });
    expect(data.userState).toEqual({ name: 'Иван' });
    expect(data.applicationState).toEqual({ theme: 'dark' });
  });

  it('rawRequest включается только при includeRaw=true (TASK-013)', () => {
    const body = makeAliceRequest();
    expect('rawRequest' in normalizeAliceRequest(body, false)).toBe(false);
    expect(normalizeAliceRequest(body, true).rawRequest).toEqual(body);
  });

  it('user_id из session.user имеет приоритет над deprecated user_id', () => {
    const body = makeAliceRequest();
    body.session.user = { user_id: 'new-user-id' };
    expect(normalizeAliceRequest(body, false).userId).toBe('new-user-id');
  });
});

describe('buildMinimalAliceResponse', () => {
  it('формирует корректный ответ-заглушку', () => {
    const body = makeAliceRequest();
    const response = buildMinimalAliceResponse(body, 'Навык запущен', false);

    expect(response.version).toBe('1.0');
    expect(response.response.text).toBe('Навык запущен');
    expect(response.response.tts).toBe('Навык запущен');
    expect(response.response.end_session).toBe(false);
  });

  it('пустой текст заменяется пробелом (требование протокола)', () => {
    const response = buildMinimalAliceResponse(makeAliceRequest(), '', false);
    expect(response.response.text).toBe(' ');
    expect(response.response.tts).toBe(' ');
  });

  it('end_session=true передаётся в ответ', () => {
    const response = buildMinimalAliceResponse(makeAliceRequest(), 'Пока', true);
    expect(response.response.end_session).toBe(true);
  });
});
