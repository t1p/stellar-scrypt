# Импорт сделок по оферам: OFFER_TRADES

Документ описывает пункт меню **Обновить сделки по оферам (OFFER_TRADES)** и контракт листа `OFFER_TRADES`.

Код: [`syncOfferTrades()`](clasp/Резиденты%20Мабиз.js), чистые функции — [`mapOfferTrade()`](clasp/DomainCore.js), [`normalizeHorizonTradeRecord()`](clasp/DomainCore.js), [`reconcileOfferTrades()`](clasp/DomainCore.js), [`offerTradeDedupeKey()`](clasp/DomainCore.js).

## Зачем

`TRANSFERS` строится по `payments` и отражает движение по счёту фонда. У обмена через офер (`manage_offer` cross) есть `payment`-подобный эффект, но экономически это **другая операция**: фонд не переводит актив получателю, а обменивает его на другой актив по оферу.

Поэтому `OFFER_TRADES` — не дубль и не альтернатива `TRANSFERS`, а вторая, экономически более точная проекция того же события:

- `TRANSFERS` пишет строку с `direction=OUT` для `IMTabak`, если он ушёл со счёта фонда как `payment`;
- `OFFER_TRADES` пишет строку с фактически списанным `EURMTL` и полученным `IMTabak` — то, чем реально торговал фонд.

Двойного суммирования нет: это разные листы с разным контрактом, ни один из них не является подмножеством другого. **Остаток в `RESIDENTS` по `OFFER_TRADES` не пересчитывается** — источником остатка остаётся `TRANSFERS`.

Проверено на реальных данных (ledger 64330650, 64782322): фонд на base-стороне списал `250 EURMTL`, получил `250 IMTabak`; `effects` подтверждают `account_debited` / `account_credited`.

## Источник данных

Horizon endpoint: `GET {HORIZON_URL}/accounts/{account}/trades?order=asc&limit=200`.

- `HORIZON_URL` берётся из `CONST`, при отсутствии — [`DEFAULT_HORIZON_URL`](clasp/Резиденты%20Мабиз.js:3).
- Аккаунты — все значения из `CONST`, начинающиеся с `G` (те же `fundAccounts`, что использует [`parseConstSheet()`](clasp/Резиденты%20Мабиз.js:805)).
- Пагинация по `_links.next.href`, лимит [`MAX_OFFER_TRADE_PAGES`](clasp/Резиденты%20Мабиз.js:34) страниц на аккаунт за запуск.
- Общий бюджет времени прогона — [`MAX_OFFER_TRADE_RUNTIME_MS`](clasp/Резиденты%20Мабиз.js) (4 минуты). По исчерпании пагинация останавливается, уже прочитанные страницы обрабатываются, курсор фиксируется по последней прочитанной записи.

### Реальный формат записи Horizon

```
id, paging_token, ledger_close_time, trade_type,
base_offer_id, base_account, base_amount,
base_asset_type, base_asset_code, base_asset_issuer,
counter_offer_id, counter_account, counter_amount,
counter_asset_type, counter_asset_code, counter_asset_issuer,
base_is_seller, price: { n, d }
```

Чего в записи **нет** и откуда берётся:

| Поле листа | Источник |
|------------|----------|
| `ledger` | вычисляется из `id`: `floor(<opId> / 2^32)`, где `<opId>` — часть `id` до `-` |
| `quote_*` | `counter_*` (`counter_amount` → `quote_amount`, `counter_account` → `quote_account`, `counter_asset_*` → `quote_asset*`) |
| `price` | объект `{n, d}` → `n/d`; fallback — `quote_amount / base_amount` |
| `tx_hash` | отдельным запросом `GET /operations/{opId}` (в trade нет); кэш на прогон |
| `linked_transfer_key` | `<tx_hash>:<opId>`, пустая строка, если `tx_hash` недоступен |

Нормализация — [`normalizeHorizonTradeRecord()`](clasp/DomainCore.js), поэтому на вход `mapOfferTrade()` всегда попадает единая структура.

## Курсоры

Хранятся в `PropertiesService.getScriptProperties()` по ключу `cursor_offer_trades_<fund_key>`, где `<fund_key>` — ключ из `CONST`.

- Script properties, а не user properties: журнал append-only и общий для всех запускающих.
- Курсор сохраняется **только после успешной записи строк** (`setValues`) и **только по аккаунтам без ошибок**.
- Ошибка записи → курсоры не двигаются, прогон можно безопасно повторить (дедуп отсечёт уже записанное).
- Ошибка по одному аккаунту не ломает прогон по остальным: попадает в `DEBUG_LOG` (stage `syncOfferTrades.fetch`, `fund_key=ERROR`) и в `errors`.
- Сброс курсоров (`resetAllCursors()`) удаляет и `cursor_payments_*`, и `cursor_offer_trades_*` → повторная выборка всей истории; дубли отсекаются дедупом.

## Контракт листа

Заголовки заданы в [`OFFER_TRADES_HEADERS`](clasp/Резиденты%20Мабиз.js:27):

```
trade_id, paging_token, ledger, closed_at, trade_type,
base_asset, base_asset_issuer, base_amount, base_is_seller,
quote_asset, quote_asset_issuer, quote_amount,
base_account, quote_account, fund_account, fund_side, counterparty_account, direction,
in_scope, price, base_offer_id, counter_offer_id,
tx_hash, linked_transfer_key, dedupe_key, synced_at
```

Правила:

| Поле | Правило |
|------|---------|
| `trade_id` | `id` (или `paging_token`) записи Horizon; первичный ключ дедупликации |
| `ledger` | вычислен из `id` (см. выше), текст |
| `closed_at` | `ledger_close_time`, формат `dd-mm-yyyy hh:mm:ss` |
| `base_asset` / `quote_asset` | код актива; `XLM` для native |
| `base_is_seller` | как отдал Horizon (`true`/`false`, иначе пусто). **Справочная колонка, не управляет `direction`** |
| `fund_account` | аккаунт из `CONST`, участвующий в сделке (пустая строка, если такого нет) |
| `fund_side` | `base` или `quote` |
| `counterparty_account` | противоположный аккаунт сделки |
| `direction` | `OUT` при `fund_side=base`, `IN` при `fund_side=quote`; пусто вне скоупа |
| `in_scope` | `false`, если фонд не участвует; такие строки не пишутся в лист |
| `price` | из `{n,d}`; fallback — `quote_amount / base_amount`, 0 при нулевом `base_amount` |
| `tx_hash` | из `/operations/{opId}`; пусто при недоступности |
| `linked_transfer_key` | `<tx_hash>:<opId>` — связка со строкой `TRANSFERS` того же события |
| `dedupe_key` | нормализованный ключ, по которому строка признана новой |
| `synced_at` | время записи строки |

### Правило `direction` и `base_is_seller`

`direction` определяется **стороной фонда в сделке**, а не флагом `base_is_seller`:

- фонд на `base`-стороне → фонд отдал `base_asset` → `OUT`;
- фонд на `quote`-стороне → фонд получил `base_asset` → `IN`.

Отклонение от исходного замечания ревью (MINOR-7): на фактических данных по сделке `276298037880643585-0` Horizon отдаёт `base_is_seller=false`, при этом `effects` показывают `account_debited` фонда на `250 EURMTL` — то есть фонд фактически продал base-актив. Причина: `base_is_seller` — **maker-флаг**, он описывает владельца `base_offer_id` (того, кто выставил офер), а не сторону фонда. У taker-фонда он `false` даже при продаже base-актива. Поэтому правило «`base_is_seller=true` → фонд продал base» реальным данным не соответствует и для `direction` не применяется. `base_is_seller` сохраняется как справочная колонка для сверки.

## Дедупликация

1. [`offerTradeDedupeKey()`](clasp/DomainCore.js) → `trade_id` в нижнем регистре.
2. Если `trade_id`/`paging_token` отсутствует, но есть `id` Horizon → составной ключ `fallback:id|ledger|base_account|quote_account|base_asset|base_amount|quote_asset|quote_amount|base_offer_id|counter_offer_id|base_is_seller|tx_hash`.
3. Если идентификатора нет вообще → строка **не пишется**, счётчик `rejected_no_key` растёт.
4. [`reconcileOfferTrades()`](clasp/DomainCore.js) сверяет новые строки и с существующим листом, и внутри собственной пачки; результат — `{ fresh, duplicates, appended, skipped, rejected_no_key }`.
5. Новые строки сортируются по `ledger`, затем по `trade_id`.

Следствие: несколько сделок в одной транзакции (`<opId>-0`, `<opId>-1`) — разные строки; повторный импорт того же `tx_hash` и `payment` того же события сумму не удваивают, потому что ключ — `trade_id`, а не `tx_hash`.

## Частичные исполнения

Horizon отдаёт каждое исполнение офера отдельным `trade_id` (например `276298037880643585-0` и `278237954349006849-0` для двух сделок EURMTL/IMTabak по 250). Схлопывания нет: в листе две строки, `base_amount`/`quote_amount` остаются фактическими.

## Dry-run

`syncOfferTrades({ dryRun: true })` (меню: **OFFER_TRADES: Dry-run**) выполняет полный цикл чтения и нормализации, но:

- не создаёт лист, если его нет, и ничего не пишет;
- не трогает курсоры (в `DEBUG_LOG` пишется строка `[DRY_RUN]` со значениями, которые были бы записаны);
- если листа нет, дедуп-база пуста: в `details_json` пишется `dedupe_unavailable=true (dedupe unavailable, sheet missing)`, и `would_append` не следует читать как точное значение;
- возвращает `{ dryRun, fetched, wouldAppend, duplicateSkipped, rejectedNoKey, linkedTransfers, byAccount, headers, dedupeUnavailable, apiCalls, rows, errors }`.

## Проверка результата

1. Лист `OFFER_TRADES` — появились строки, `trade_id` уникальны.
2. `DEBUG_LOG`, stage `syncOfferTrades`: `rows_fetched`, `rows_appended`, `dedup_skipped`, `errors`, `details_json` с `would_append`, `duplicate_skipped`, `rejected_no_key`, `linked_transfers`, `truncated_accounts`.
3. Повторный запуск без новых сделок → `rows_appended=0`, `dedup_skipped` равен числу ранее записанных строк в скоупе.
4. Перед боевым прогоном — **Dry-run**: `wouldAppend` должен совпасть с ожиданием, `errors` — пустым.

## Ограничения

- Только ручной запуск из меню; триггеры/`clasp run` не используются.
- Запуск не переписывает лист: только append, никаких `clearContents()`.
- При сбросе курсоров читается вся история → несколько запусков на большом объёме.
- `tx_hash` требует дополнительного запроса на каждый уникальный `opId` (кэш на прогон), эти вызовы входят в бюджет `MAX_OFFER_TRADE_RUNTIME_MS` и учитываются в `api_calls`; при исчерпании бюджета остаток `opId` не резолвится, `tx_hash`/`linked_transfer_key` остаются пустыми, строка всё равно пишется.
- Расчёт рыночных отклонений (спред к orderbook) в этой версии не выполняется — только фактические условия сделки.
