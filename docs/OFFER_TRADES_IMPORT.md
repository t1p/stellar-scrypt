# Импорт сделок по оферам: OFFER_TRADES

Документ описывает пункт меню **Обновить сделки по оферам (OFFER_TRADES)** и контракт листа `OFFER_TRADES`.

Код: [`syncOfferTrades()`](clasp/Резиденты%20Мабиз.js), чистые функции — [`mapOfferTrade()`](clasp/DomainCore.js), [`reconcileOfferTrades()`](clasp/DomainCore.js), [`offerTradeDedupeKey()`](clasp/DomainCore.js).

## Зачем

Переводы (`payments`) не покрывают обменные операции. Сделка по оферу (`manage_offer` cross) меняет баланс фонда, но не создаёт `payment`-операцию. Лист `OFFER_TRADES` закрывает этот пробел: реальные обмены EURMTL ⇄ IMTabak и подобные пары больше не теряются.

## Источник данных

Horizon endpoint: `GET {HORIZON_URL}/accounts/{account}/trades?order=asc&limit=200`.

- `HORIZON_URL` берётся из `CONST`, при отсутствии — [`DEFAULT_HORIZON_URL`](clasp/Резиденты%20Мабиз.js:3).
- Аккаунты — все значения из `CONST`, начинающиеся с `G` (те же `fundAccounts`, что использует [`parseConstSheet()`](clasp/Резиденты%20Мабиз.js:790)).
- Пагинация по `_links.next.href`, лимит [`MAX_OFFER_TRADE_PAGES`](clasp/Резиденты%20Мабиз.js:34) страниц на аккаунт за запуск.

## Курсоры

Хранятся в `PropertiesService.getUserProperties()` по ключу `cursor_offer_trades_<fund_key>`, где `<fund_key>` — ключ из `CONST`.

- Курсор сохраняется только при успешной выборке аккаунта.
- Ошибка по одному аккаунту не ломает прогон по остальным: она попадает в `DEBUG_LOG` (stage `syncOfferTrades.fetch`, `fund_key=ERROR`) и в поле `errors` итогового лога.
- Сброс курсоров → повторная выборка всей истории; дубли отсекаются дедупом, лист не раздувается.

## Контракт листа

Заголовки заданы в [`OFFER_TRADES_HEADERS`](clasp/Резиденты%20Мабиз.js:26):

```
trade_id, paging_token, ledger, closed_at, trade_type,
base_asset, base_asset_issuer, base_amount, quote_asset, quote_asset_issuer, quote_amount,
base_account, quote_account, fund_account, fund_side, counterparty_account, direction,
in_scope, price, base_offer_id, counter_offer_id, dedupe_key, synced_at
```

Правила:

| Поле | Правило |
|------|---------|
| `trade_id` | `id` (или `paging_token`) записи Horizon; первичный ключ дедупликации |
| `ledger` | номер ledger, текст |
| `closed_at` | `ledger_close_time`, формат `dd-mm-yyyy hh:mm:ss` |
| `base_asset` / `quote_asset` | код актива; `XLM` для native |
| `fund_account` | аккаунт из `CONST`, участвующий в сделке (пустая строка, если такого нет) |
| `fund_side` | `base` или `quote` |
| `counterparty_account` | противоположный аккаунт сделки |
| `direction` | `OUT` при `fund_side=base`, `IN` при `fund_side=quote` |
| `in_scope` | `false`, если фонд не участвует; такие строки не пишутся в лист |
| `price` | `quote_amount / base_amount`, 0 при нулевом `base_amount` |
| `dedupe_key` | нормализованный ключ, по которому строка признана новой |
| `synced_at` | время записи строки |

## Дедупликация

1. [`offerTradeDedupeKey()`](clasp/DomainCore.js) → `trade_id` в нижнем регистре.
2. Если `trade_id` отсутствует → составной ключ `fallback:ledger|base_account|quote_account|base_asset|base_amount|quote_asset|quote_amount|base_offer_id|counter_offer_id`.
3. [`reconcileOfferTrades()`](clasp/DomainCore.js) сверяет новые строки и с существующим листом, и внутри собственной пачки; результат — `{ fresh, duplicates, appended, skipped }`.
4. Новые строки сортируются по `ledger`, затем по `trade_id`.

## Частичные исполнения

Horizon отдаёт каждое исполнение офера отдельным `trade_id` (например `276298037880643585-0` и `278237954349006849-0` для двух сделок EURMTL/IMTabak по 250). Схлопывания нет: в листе две строки, `base_amount`/`quote_amount` остаются фактическими.

## Проверка результата

1. Лист `OFFER_TRADES` — появились строки, `trade_id` уникальны.
2. `DEBUG_LOG`, stage `syncOfferTrades`: `rows_fetched`, `rows_appended`, `dedup_skipped`, `errors`.
3. Повторный запуск без новых сделок → `rows_appended=0`, `dedup_skipped` равен числу ранее записанных строк в скоупе.

## Ограничения

- Только ручной запуск из меню; триггеры/`clasp run` не используются.
- Запуск не переписывает лист: только append.
- При сбросе курсоров читается вся история → несколько запусков на большом объёме.
- Расчёт рыночных отклонений (спред к orderbook) в этой версии не выполняется — только фактические условия сделки.
