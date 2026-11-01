# Active Context

Этот файл отслеживает текущий статус проекта, включая недавние изменения, текущие цели и открытые вопросы.
2026-11-01 22:55:04 - Последняя редакция базового описания.

## Правила редактирования

* Записи в разделах должны быть отсортированы в обратном хронологическом порядке (самые новые сверху, старые внизу).
* Каждая запись должна начинаться с даты редакции в формате ГГГГ-ММ-ДД ЧЧ:ММ:СС.
2026-11-01 22:55:04 - Последняя редакция правил редактирования.

## Текущий фокус

2026-11-01 22:55:04 - Задача ClickUp `124hv5ux5pn` — «Stellar: учитывать исполнения IMTabak через trades офера в RESIDENTS». Ветка `feature/imtabak-offer-trades-import` (HEAD `08fd814`), DRAFT PR #5 → `main`. Фокус смещён с общего resident-tracking контура на учёт исполнений офера IMTabak отдельным листом `OFFER_TRADES`. Канон процесса — ClickUp `124hv5uugrc` (IDP и DevOps-контур Aicoda: своя функция, самовосстановление, событие наружу, мониторинг, аудит; event-first; одна ветка = один воркер; отдельный GO на production).
2026-04-22 14:25:07 - Развитие resident-tracking scope поверх foundation-слоя с фокусом на operational pipeline, обязательном upstream-шаге [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js:1505) и использовании account-metadata как intelligence-слоя для последующих витрин и аналитики.
2026-03-31 23:08:56 - Поддержка администраторской документации: фиксация контракта данных (листы/константы/диапазоны), операционных runbook-сценариев и ограничений ручного редактирования.
2026-03-31 21:42:38 - Поддержание актуальности документации и onboarding-материалов: синхронизация README с фактическим основным скриптом и описание пользовательского меню.
2026-01-21 12:32:55 - Реализация функции обновления Created данных для листа ACCOUNTS с использованием Horizon API и ссылок на транзакции через EXPLORER_TX_URL.
2026-01-14 18:49:45 - Улучшение и расширение функциональности скрипта stellar-scrypt для синхронизации данных Stellar blockchain с Google Sheets.
2026-01-14 18:49:45 - Разработка и тестирование новых версий скрипта (v2_improved.js) с улучшенной обработкой ошибок и группировкой отчетов.

## Недавние изменения
2026-11-01 22:55:04 - Git приведён в порядок: ветки `feature/maymun-allocation-runway-manual` (PR #3), `feature/maymun-precheck-candidates-queue` (PR #4) и `feature/maymun-selected-transfer-write` (PR #2) слиты в `main`; удалена `feature/maymun-asset-layer-sheets` (подтверждённый дубликат слитого PR #1) и три слитые ветки. Дерево чистое, `main` = `bd37f31`.
2026-11-01 22:55:04 - От `main` создана ветка `feature/imtabak-offer-trades-import`; открыт DRAFT PR #5 (https://github.com/t1p/stellar-scrypt/pull/5), 4 коммита: `2a28f68`, `683a636`, `718969b`, `08fd814`.
2026-11-01 22:55:04 - Реализован импорт Stellar offer trades: чистые доменные функции в [`clasp/DomainCore.js`](clasp/DomainCore.js) (`parseTradePrice`, `deriveLedgerFromTradeId`, `normalizeHorizonTradeRecord`, `mapOfferTrade`, `offerTradeDedupeKey`, `normalizeTradeIdKey`, `tradeIdLookupKeys`, `reconcileOfferTrades`, `buildLinkedTransferKey`, `planTradeCursorUpdates`, `shouldContinueTradePagination`, `resolveTradeTxHashes`, `acquireScriptLock`); GAS-слой в [`clasp/Резиденты Мабиз.js`](clasp/Резиденты%20Мабиз.js) (`syncOfferTrades()`, `syncOfferTradesDryRun()`, `ensureOfferTradesSheet_()`, `getOfferTradeProps_()`, `resolveTradeTxHashes_()`, `fetchOfferTradesForAccount_()`, лист `OFFER_TRADES`, пункты меню 38 и 39, аудит в `DEBUG_LOG`, сброс курсоров `cursor_offer_trades_*`).
2026-11-01 22:55:04 - Добавлены тесты [`__tests__/offerTrades.test.js`](__tests__/offerTrades.test.js) и документация [`docs/OFFER_TRADES_IMPORT.md`](docs/OFFER_TRADES_IMPORT.md), обновлены [`docs/USER_MENU.md`](docs/USER_MENU.md) (п.38–39) и [`docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md`](docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md).
2026-11-01 22:55:04 - On-chain evidence по публичному Horizon (read-only): офер `1849698980` — продавец `GAQ5ERJVI6IW5UVNPEVXUUVMXH3GCDHJ4BJAXMAAKPR5VBWWAUOMABIZ`, selling IMTabak `GAKGV47MQO7IXHWJDWYBJY6T2O65SXHIFFE5M5OIAT46OTAUTIUZGTBK`, buying EURMTL `GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V`, остаток 2450, цена 1.0. Исполнения: `276298037880643585-0` (ledger 64330650, tx `12010b56241345ccf2f25c15b20db58fe6ee41abc975cf9d4acc7a598ca2f1b9`, memo `Buyback`) и `278237954349006849-0` (ledger 64782322, tx `a00bebb5bca07bc66a0a0a11d47809a91c14ebb0688e511e4b170fa4f574dbae`, memo `Swap`); обе `path_payment_strict_send`, фонд `GDW4TABBRHOPN4QP6QMCC3EK34FP477V2XPHIL2TREXKOMCD7DZAGXIC` отдал 250 EURMTL, получил 250 IMTabak. Сверка офера: 2450 + 250 + 250 = 2950.
2026-11-01 22:55:04 - Деталь формата Horizon, зафиксированная в коде и тестах: `/accounts/{id}/trades` отдаёт поля `counter_*` (не `quote_*`) и не отдаёт `ledger` (восстанавливается из `id` через `floor(opId / 2^32)`), `price` приходит объектом `{n,d}`; `base_is_seller` — maker-флаг (владелец `base_offer_id`), поэтому у taker-фонда `false`; направление определяется по стороне фонда (`fund_side`).
2026-04-22 14:25:07 - Зафиксирован интеграционный результат commit `a8864c4`: синхронизация account metadata и выравнивание RT operational docs как актуальный source of truth по resident-tracking контуру.
2026-04-22 14:25:07 - Реализован и закоммичен resident-tracking use-case pipeline: [`buildResidentTimeline()`](clasp/Резиденты%20Мабиз.js:1631), [`buildTokenFlows()`](clasp/Резиденты%20Мабиз.js:1737), [`buildIssuerStructure()`](clasp/Резиденты%20Мабиз.js:1832) и обязательный orchestration entrypoint [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js:1505).
2026-04-22 14:25:07 - Обновлен пользовательский operational flow через меню в [`onOpen()`](clasp/Резиденты%20Мабиз.js:45): resident-tracking сценарии и связанные foundation/RT команды выведены в рабочий UI-контур.
2026-04-22 14:25:07 - Сформированы RT snapshots/read-models поверх foundation-слоя и синхронизирована документация по DomainCore/bridge pattern, upstream dataset и downstream views.
2026-03-31 23:08:56 - Добавлен пакет админ-документации: docs/ADMIN_SETUP_AND_CONFIG.md, docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md, docs/ADMIN_RUNBOOK.md.
2026-03-31 23:08:56 - README дополнен ссылками на администраторские документы и разделением user/admin уровней документации.
2026-03-31 23:08:56 - Явно задокументированы хрупкие fixed-column assumptions и расхождение: MEMO_PATTERNS_* и CLASSIFY_ENABLE заданы в коде как hardcoded constants, а не в CONST.
2026-03-31 21:42:38 - Создана рабочая ветка feature/menu-docs для документирования меню и синхронизации README.
2026-03-31 21:42:38 - README синхронизирован: устаревшая ссылка на v3.js заменена указанием фактического основного скрипта clasp/Резиденты Мабиз.js.
2026-03-31 21:42:38 - Добавлена пользовательская инструкция docs/USER_MENU.md с описанием пунктов меню, порядка запуска, ограничений и блока по безопасности данных.
2026-01-21 12:32:55 - Добавлены функции updateAccountCreationDetails, getCreationTransactionDetails и форматирование ссылок, а также пункт меню для заполнения Created by / Created data в ACCOUNTS.
2026-01-19 14:37:59 - Правило: при анализе JSON/логов не использовать here-doc через python3, вместо этого создавать вспомогательный файл-скрипт и запускать его.
2026-01-18 23:12:24 - Реализованы функции upgradeTransfersSheet, upgradeResidentsSheet, upgradeExistingSheets и добавлены пункты меню для апгрейда листов

2026-01-16 22:44:51 - Добавлены диагностические счетчики drop* и дедуп по tx_hash+operation_id в syncStellarTransfers; задан дефолтный HORIZON_URL при пустом значении.

2026-01-14 22:08:37 - Добавлен новый пункт меню 'Показать транзакции между адресами' и функция showTransactionsBetweenAddresses с валидацией входных данных в v3.js.
2026-01-14 21:06:54 - Добавлена новая функция fetchTransactionsBetweenAddresses в v3.js для получения транзакций между двумя адресами.
2026-01-14 18:49:45 - Обновление productContext.md с подробным описанием целей, особенностей и архитектуры проекта stellar-scrypt.
2026-01-14 18:49:45 - Добавление решения в decisionLog.md о группировке дочерних счетов под родительскими в отчетах.

## Уточненная информация о среде выполнения

2026-04-22 14:25:07 - Актуальный runtime-контур resident-tracking зависит от последовательного выполнения upstream sync и sheet bootstrap: downstream RT-витрины считаются корректными только после успешного прогона [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js:1505).
2026-01-14 18:49:45 - Среда разработки: Linux (Manjaro), VSCode, с поддержкой JavaScript и Git.
2026-01-14 18:49:45 - Среда выполнения: Google Apps Script runtime (JavaScript ES5+), Horizon API Stellar для получения данных о транзакциях и балансах, Google Sheets API для обновления таблиц.
2026-01-14 18:49:45 - Хранение данных: PropertiesService для курсоров пагинации, SpreadsheetApp для работы с таблицами.

## Открытые вопросы/проблемы

2026-11-01 22:55:04 - Change gate до production не пройден: вердикт по PR #5 → `clasp push` в тестовую копию → dry-run (сверка `would_append`, `trades_calls`, `tx_hash_calls`, `lock`) → боевой прогон со сверкой с Horizon по контрольным opId → повторный прогон (`rows_appended=0`) → GO владельца/Игоря → отдельный GO на `clasp push` в production. `clasp push` не выполнялся, таблица Sheets не трогалась.
2026-11-01 22:55:04 - Учётный остаток в `RESIDENTS` этим импортом НЕ пересчитывается: строка 12 остаётся `2700 EURMTL` (ручной учётный показатель). Пересчёт остатка — отдельная задача с change gate.
2026-11-01 22:55:04 - Предсуществующий дефект вне scope: [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js) пишет в `TRANSFERS` актив-получатель `IMTabak` при `direction=OUT`, хотя экономически списан `EURMTL` — нужна отдельная задача.
2026-11-01 22:55:04 - Остаточные риски: GAS-обвязка не покрыта юнит-тестами (моки `SpreadsheetApp`/`UrlFetchApp`/`PropertiesService`); dry-run без существующего листа завышает `would_append` (флаг `dedupe_unavailable`); `api_calls` по страницам `/trades` не покрыт юнит-тестами.
2026-04-22 14:25:07 - Требуется финальная runtime-верификация полного resident-tracking flow на целевой таблице после интеграции account metadata sync и новых RT snapshot builders.
2026-04-22 14:25:07 - Остается углубить trade/swap аналитику поверх RT snapshots и расширить UI/dashboard для richer downstream consumption.
2026-01-14 18:49:45 - Необходимость тестирования новых версий скриптов на реальных данных Stellar blockchain.
2026-01-14 18:49:45 - Интеграция с Google Sheets: проверка корректности обновления таблиц и обработки больших объемов данных.
2026-01-14 18:49:45 - Обработка ошибок и таймаутов в Horizon API при синхронизации инкрементальных данных.
