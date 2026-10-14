// ─────────────────────────────────────────────────────────────────────────────
// Тесты YandexDialogsResponse: buildAliceResponse, sanitizeText
// ─────────────────────────────────────────────────────────────────────────────
import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import type { NodeResponseConfig } from './types';
import { buildAliceResponse, sanitizeText } from './YandexDialogs.node';

// ── Мок контекста n8n: buildAliceResponse использует только ctx.getNode() ────
function makeCtx(): IExecuteFunctions {
  return {
    getNode: () => ({ name: 'Yandex Dialogs Response', type: 'yandexDialogs' }),
  } as unknown as IExecuteFunctions;
}

// ── Фабрика конфига (значения по умолчанию из UI) ────────────────────────────
function makeConfig(overrides: Partial<NodeResponseConfig> = {}): NodeResponseConfig {
  return {
    mode: 'text',
    text: 'Привет',
    endSession: false,
    buttons: [],
    items: [],
    ...overrides,
  };
}

describe('sanitizeText', () => {
  it('обрезает текст до 1024 символов', () => {
    expect(sanitizeText('x'.repeat(2000)).length).toBe(1024);
  });

  it('обрезает пробелы по краям', () => {
    expect(sanitizeText('  привет  ')).toBe('привет');
  });
});

describe('buildAliceResponse — режим text', () => {
  it('базовый ответ с version 1.0', () => {
    const response = buildAliceResponse(makeCtx(), makeConfig(), 0);

    expect(response.version).toBe('1.0');
    expect(response.response.text).toBe('Привет');
    expect(response.response.end_session).toBe(false);
  });

  it('TTS-фолбэк: пустое tts = text (TASK-012)', () => {
    const response = buildAliceResponse(makeCtx(), makeConfig({ tts: '' }), 0);
    expect(response.response.tts).toBe('Привет');
  });

  it('заполненный TTS используется как есть', () => {
    const response = buildAliceResponse(makeCtx(), makeConfig({ tts: 'При+вет' }), 0);
    expect(response.response.tts).toBe('При+вет');
  });

  it('text длиннее 1024 символов обрезается (TASK-006 лимит протокола)', () => {
    const response = buildAliceResponse(makeCtx(), makeConfig({ text: 'x'.repeat(2000) }), 0);
    expect(response.response.text.length).toBe(1024);
  });

  it('end_session=true завершает сессию', () => {
    const response = buildAliceResponse(makeCtx(), makeConfig({ endSession: true }), 0);
    expect(response.response.end_session).toBe(true);
  });

  it('пустой text — ошибка ноды', () => {
    expect(() => buildAliceResponse(makeCtx(), makeConfig({ text: '   ' }), 0)).toThrow(
      NodeOperationError,
    );
  });

  it('endSession-режим принудительно завершает сессию', () => {
    const response = buildAliceResponse(makeCtx(), makeConfig({ mode: 'endSession' }), 0);
    expect(response.response.end_session).toBe(true);
  });
});

describe('buildAliceResponse — кнопки', () => {
  it('кнопка с payload-JSON парсится в объект', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({ buttons: [{ title: 'Старт', payload: '{"action":"start"}' }] }),
      0,
    );
    expect(response.response.buttons?.[0].payload).toEqual({ action: 'start' });
  });

  it('кнопка с невалидным payload оставляет строку', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({ buttons: [{ title: 'Старт', payload: 'не-JSON' }] }),
      0,
    );
    expect(response.response.buttons?.[0].payload).toBe('не-JSON');
  });

  it('title кнопки обрезается до 64 символов', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({ buttons: [{ title: 'б'.repeat(100) }] }),
      0,
    );
    expect(response.response.buttons?.[0].title.length).toBe(64);
  });

  it('кнопки без title отбрасываются', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({ buttons: [{ title: '   ' }, { title: 'Ок' }] }),
      0,
    );
    expect(response.response.buttons).toHaveLength(1);
    expect(response.response.buttons?.[0].title).toBe('Ок');
  });
});

describe('buildAliceResponse — карточки', () => {
  it('BigImage без image_id — ошибка', () => {
    expect(() => buildAliceResponse(makeCtx(), makeConfig({ mode: 'bigImage' }), 0)).toThrow(
      NodeOperationError,
    );
  });

  it('BigImage собирается с обрезкой полей (TASK-013)', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({
        mode: 'bigImage',
        bigImageId: 'img-1',
        bigImageTitle: 'т'.repeat(200),
        bigImageDescription: 'д'.repeat(5000),
        bigImageButtonTitle: 'к'.repeat(100),
        bigImageButtonUrl: 'https://example.com',
      }),
      0,
    );
    const card = response.response.card;
    expect(card?.type).toBe('BigImage');
    if (card?.type !== 'BigImage') throw new Error('не та карточка');
    expect(card.title?.length).toBe(128);
    expect(card.description?.length).toBe(4096);
    expect(card.button?.title.length).toBe(64);
    expect(card.button?.url).toBe('https://example.com');
  });

  it('ItemsList без элементов — ошибка (TASK-013)', () => {
    expect(() => buildAliceResponse(makeCtx(), makeConfig({ mode: 'itemsList' }), 0)).toThrow(
      NodeOperationError,
    );
  });

  it('ItemsList собирается с header, items и footer', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({
        mode: 'itemsList',
        itemsListHeader: 'Каталог',
        items: [
          { imageId: 'img-1', title: 'Товар 1', description: 'Описание', buttonTitle: 'Купить' },
          { title: '   ' }, // пустой элемент отфильтруется
        ],
        itemsListFooterText: 'Итого',
      }),
      0,
    );
    const card = response.response.card;
    expect(card?.type).toBe('ItemsList');
    if (card?.type !== 'ItemsList') throw new Error('не та карточка');
    expect(card.header?.text).toBe('Каталог');
    expect(card.items).toHaveLength(1);
    expect(card.items[0].title).toBe('Товар 1');
    expect(card.items[0].button?.title).toBe('Купить');
    expect(card.footer?.text).toBe('Итого');
  });
});

describe('buildAliceResponse — режим json', () => {
  it('валидный rawJson возвращается как есть', () => {
    const raw = JSON.stringify({
      version: '1.0',
      response: { text: 'Из JSON', end_session: false },
    });
    const response = buildAliceResponse(makeCtx(), makeConfig({ mode: 'json', rawJson: raw }), 0);
    expect(response.response.text).toBe('Из JSON');
  });

  it('rawJson без version/response — ошибка', () => {
    expect(() =>
      buildAliceResponse(makeCtx(), makeConfig({ mode: 'json', rawJson: '{"foo": 1}' }), 0),
    ).toThrow(NodeOperationError);
  });

  it('невалидный rawJson — ошибка', () => {
    expect(() =>
      buildAliceResponse(makeCtx(), makeConfig({ mode: 'json', rawJson: '{broken' }), 0),
    ).toThrow(NodeOperationError);
  });

  it('sessionState накладывается поверх rawJson (TASK-009)', () => {
    const raw = JSON.stringify({
      version: '1.0',
      response: { text: 'Из JSON', end_session: false },
      session_state: { from: 'raw' },
    });
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({
        mode: 'json',
        rawJson: raw,
        sessionState: '{"from":"advanced","extra":1}',
      }),
      0,
    );
    // Поля rawJson имеют приоритет
    expect(response.session_state).toEqual({ from: 'raw', extra: 1 });
  });
});

describe('buildAliceResponse — session_state и analytics', () => {
  it('sessionState попадает в ответ в текстовом режиме', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({ sessionState: '{"cart":["молоко"]}' }),
      0,
    );
    expect(response.session_state).toEqual({ cart: ['молоко'] });
  });

  it('невалидный sessionState — ошибка', () => {
    expect(() =>
      buildAliceResponse(makeCtx(), makeConfig({ sessionState: '{broken' }), 0),
    ).toThrow(NodeOperationError);
  });

  it('analytics попадает в response (TASK-008)', () => {
    const response = buildAliceResponse(
      makeCtx(),
      makeConfig({ analytics: '{"click":{"name":"btn"}}' }),
      0,
    );
    expect(response.response.analytics).toEqual({ click: { name: 'btn' } });
  });

  it('невалидный analytics — ошибка', () => {
    expect(() =>
      buildAliceResponse(makeCtx(), makeConfig({ analytics: 'не-JSON' }), 0),
    ).toThrow(NodeOperationError);
  });
});
