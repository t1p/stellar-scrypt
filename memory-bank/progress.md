# Progress

Этот файл отслеживает прогресс проекта в формате списка задач.
2026-11-01 22:55:04 - Последняя редакция базового описания.

## Правила редактирования

* Обновлять, когда задача начинается, завершается или происходят изменения в статусе задачи.
* Всегда включать временную метку в формате [ГГГГ-ММ-ДД ЧЧ:ММ:СС] - [Краткое описание изменения].
* Записи в разделах должны быть отсортированы в обратном хронологическом порядке (самые новые сверху, старые внизу).
* Разделы должны быть отсортированы по важности: Выполненные задачи, Текущие задачи, Следующие шаги, Последние обновления.
2026-11-01 22:55:04 - Последняя редакция правил редактирования.

## Выполненные задачи
2026-11-01 22:55:04 - Git приведён в порядок: PR #3 (`feature/maymun-allocation-runway-manual`), PR #4 (`feature/maymun-precheck-candidates-queue`), PR #2 (`feature/maymun-selected-transfer-write`) слиты в `main`; удалена `feature/maymun-asset-layer-sheets` (дубликат PR #1) и три слитые ветки; `main` = `bd37f31`.
2026-11-01 22:55:04 - Создана ветка `feature/imtabak-offer-trades-import` от `main`, открыт DRAFT PR #5 → `main`, 4 коммита: `2a28f68`, `683a636`, `718969b`, `08fd814`.
2026-11-01 22:55:04 - Реализован импорт Stellar offer trades: доменные функции в [`clasp/DomainCore.js`](clasp/DomainCore.js) (`parseTradePrice`, `deriveLedgerFromTradeId`, `normalizeHorizonTradeRecord`, `mapOfferTrade`, `offerTradeDedupeKey`, `normalizeTradeIdKey`, `tradeIdLookupKeys`, `reconcileOfferTrades`, `buildLinkedTransferKey`, `planTradeCursorUpdates`, `shouldContinueTradePagination`, `resolveTradeTxHashes`, `acquireScriptLock`).
2026-11-01 22:55:04 - Реализован GAS-слой в [`clasp/Резиденты Мабиз.js`](clasp/Резиденты%20Мабиз.js): `syncOfferTrades()`, `syncOfferTradesDryRun()`, `ensureOfferTradesSheet_()`, `getOfferTradeProps_()`, `resolveTradeTxHashes_()`, `fetchOfferTradesForAccount_()`, лист `OFFER_TRADES`, пункты меню 38 и 39, аудит в `DEBUG_LOG`, сброс курсоров `cursor_offer_trades_*`.
2026-11-01 22:55:04 - Добавлены тесты [`__tests__/offerTrades.test.js`](__tests__/offerTrades.test.js); прогон `npx jest --config '{"testEnvironment":"node","testMatch":["**/__tests__/**/*.test.js"]}'` → 18 suites / 126 tests PASS; `node --check` для обоих JS — OK.
2026-11-01 22:55:04 - Обновлена документация: [`docs/OFFER_TRADES_IMPORT.md`](docs/OFFER_TRADES_IMPORT.md), [`docs/USER_MENU.md`](docs/USER_MENU.md) (п.38–39), [`docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md`](docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md).
2026-11-01 22:55:04 - Собрано on-chain evidence по публичному Horizon (read-only): офер `1849698980`, исполнения `276298037880643585-0` и `278237954349006849-0` по 250 EURMTL → 250 IMTabak; сверка офера 2450 + 250 + 250 = 2950.
2026-04-22 14:25:07 - Завершено развитие resident-tracking scope поверх foundation-слоя: реализованы use-cases, bridges и foundation/RT changes для построения RT-витрин.
2026-04-22 14:25:07 - Реализован orchestration entrypoint [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js:1505) как обязательный upstream-step для актуализации resident-tracking dataset и downstream views.
2026-04-22 14:25:07 - Завершено построение RT snapshot/read-model builders: [`buildResidentTimeline()`](clasp/Резиденты%20Мабиз.js:1631), [`buildTokenFlows()`](clasp/Резиденты%20Мабиз.js:1737), [`buildIssuerStructure()`](clasp/Резиденты%20Мабиз.js:1832).
2026-04-22 14:25:07 - Обновлен UI-операционный контур через меню в [`onOpen()`](clasp/Резиденты%20Мабиз.js:45) для запуска resident-tracking сценариев и связанных foundation шагов.
2026-04-22 14:25:07 - Интегрирован account-metadata слой и выполнен doc-sync; интеграционный commit `a8864c4` закреплен как source of truth по текущей сборке resident-tracking + account metadata.
2026-03-31 23:08:56 - Подготовлен комплект администраторской документации: docs/ADMIN_SETUP_AND_CONFIG.md, docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md, docs/ADMIN_RUNBOOK.md.
2026-03-31 23:08:56 - README обновлен ссылками на админ-документацию и явным разделением пользовательского и администраторского уровней.
2026-03-31 23:08:56 - Зафиксированы операционные ограничения: fixed-column assumptions, append-only/snapshot режимы листов, hidden state курсоров в user properties.
2026-03-31 21:42:38 - Создана ветка feature/menu-docs для документирования пользовательского меню и синхронизации README.
2026-03-31 21:42:38 - README синхронизирован с фактическим состоянием проекта: основным рабочим скриптом зафиксирован clasp/Резиденты Мабиз.js вместо устаревшей ссылки на v3.js.
2026-03-31 21:42:38 - Добавлена пользовательская инструкция docs/USER_MENU.md с описанием пунктов меню, порядка запуска для новой таблицы и требований по безопасности данных.
2026-01-21 12:32:55 - Реализовано обновление Created by/Created data в ACCOUNTS с данными создания аккаунта и ссылками на транзакции.
2026-01-19 13:50:36 - Реализован подпроект `build_tags_tx` для генерации XDR (N2*N3 manage_data операций) на zsh. Тест-план пройден.
2026-01-18 23:13:46 - Реализованы функции upgradeTransfersSheet, upgradeResidentsSheet, upgradeExistingSheets и добавлены пункты меню для апгрейда листов

2026-01-14 22:08:37 - Добавлен новый пункт меню 'Показать транзакции между адресами' с функцией showTransactionsBetweenAddresses, включающей диалог ввода параметров и валидацию данных
2026-01-14 21:06:54 - Создана функция fetchTransactionsBetweenAddresses для получения транзакций между двумя адресами с фильтрацией по активам, датам и направлениям
2026-01-14 18:53:09 - Создан детальный анализ балансов аккаунтов с функцией detailedBalanceAnalysis()
2026-01-14 18:53:09 - Добавлены функции анализа операций конкретных ledger с checkSpecificLedger()
2026-01-14 18:53:09 - Реализованы функции получения транзакций по хэшу и их деталей
2026-01-14 18:53:09 - Добавлены отладочные листы: ASSETS_ERRORS, ASSETS_DEBUG, TEST_ACCOUNT_OPERATIONS
2026-01-14 18:53:09 - Исправлена фильтрация активов в syncStellarTransfers() для корректной работы с issuer
2026-01-14 18:53:09 - Улучшена обработка ошибок и логирование в syncFundAssets()
2026-01-14 18:53:09 - Разработана основная архитектура скрипта с модульной структурой
2026-01-14 18:53:09 - Реализована синхронизация активов (XLM, trustlines, liquidity pools)
2026-01-14 18:53:09 - Добавлена синхронизация переводов между аккаунтами с фильтрацией по разрешенным активам
2026-01-14 18:53:09 - Создан режим аудита для проверки балансов и операций
2026-01-14 18:53:09 - Интегрирована история активов с отслеживанием поступлений/отправок
2026-01-14 18:53:09 - Настроена работа с Horizon API Stellar
2026-01-14 18:53:09 - Добавлено меню в Google Sheets для запуска функций
2026-01-14 18:53:09 - Настроена пагинация и курсоры для инкрементальной синхронизации

## Текущие задачи

2026-11-01 22:55:04 - Ревью DRAFT PR #5 (https://github.com/t1p/stellar-scrypt/pull/5) и вердикт по нему — вход в change gate перед production.
2026-11-01 22:55:04 - Dry-run в тестовой копии после `clasp push`: сверить `would_append`, `trades_calls`, `tx_hash_calls`, `lock` по контрольным opId `276298037880643585-0` и `278237954349006849-0`.
2026-04-22 14:25:07 - Провести финальную runtime-верификацию полного resident-tracking flow на целевой таблице после интеграции account-metadata sync и обновленных RT builders.
2026-04-22 14:25:07 - Углубить trade/swap аналитику поверх resident-tracking snapshots и token flow read-models.
2026-04-22 14:25:07 - Подготовить richer UI/dashboard для downstream-потребления resident-tracking и account-metadata intelligence.
2026-01-16 22:44:51 - Диагностика фильтров syncStellarTransfers и корректировка дедупликации/логирования.
2026-01-14 18:53:09 - Тестирование функций анализа конкретных активов (IMTabak) на реальных данных
2026-01-14 18:53:09 - Отладка и оптимизация производительности синхронизации переводов
2026-01-14 18:53:09 - Проверка корректности фильтрации операций по участникам и активам
2026-01-14 18:53:09 - Тестирование работы с реальными аккаунтами фондов в Google Sheets

## Следующие шаги

2026-11-01 22:55:04 - Пройти остаток change gate: боевой прогон импорта в тестовой копии → сверка с Horizon по контрольным opId → повторный прогон с `rows_appended=0` → GO владельца/Игоря → отдельный GO на `clasp push` в production.
2026-11-01 22:55:04 - Отдельная задача: пересчёт учётного остатка `RESIDENTS` (строка 12 сейчас `2700 EURMTL`) на основе исполнений офера — со своим change gate.
2026-11-01 22:55:04 - Отдельная задача: исправить предсуществующий дефект [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js) — при `direction=OUT` в `TRANSFERS` пишется актив-получатель `IMTabak`, хотя экономически списан `EURMTL`.
2026-11-01 22:55:04 - Покрыть GAS-обвязку юнит-тестами с моками `SpreadsheetApp`/`UrlFetchApp`/`PropertiesService`; добавить тест на `api_calls` по страницам `/trades`; устранить завышение `would_append` в dry-run при отсутствии листа (флаг `dedupe_unavailable`).
2026-04-22 14:25:07 - Расширить RT pipeline дополнительными аналитическими срезами по trade/swap сценариям и enrichments на account metadata.
2026-04-22 14:25:07 - Спроектировать и внедрить более выразительные dashboard/UI-слои над RT snapshots и downstream views.
2026-04-22 14:25:07 - Закрыть финальный cycle runtime-проверки и operational acceptance для resident-tracking в продукционной таблице.
2026-01-14 18:53:09 - Добавить автоматизацию запуска синхронизации по расписанию в Google Apps Script
2026-01-14 18:53:09 - Создать dashboard для визуализации данных аудита в Google Sheets
2026-01-14 18:53:09 - Добавить поддержку дополнительных типов операций Stellar (path payments, merges)
2026-01-14 18:53:09 - Реализовать экспорт данных в различные форматы (CSV, JSON)
2026-01-14 18:53:09 - Добавить уведомления о подозрительных операциях
2026-01-14 18:53:09 - Создать документацию по настройке и использованию скрипта
2026-01-14 18:53:09 - Добавить тесты для основных функций

## Последние обновления

2026-11-01 22:55:04 - В Memory Bank зафиксирован срез по задаче ClickUp `124hv5ux5pn`: отдельный лист `OFFER_TRADES`, правила дедупликации и определения направления, граница «остаток не пересчитывается», открытый change gate перед production.
2026-11-01 22:55:04 - Фокус проекта смещён с общего resident-tracking контура на учёт исполнений офера IMTabak; production не менялся.
2026-04-22 14:25:07 - В Memory Bank зафиксирован текущий source of truth: resident-tracking развивался поверх foundation/domain core, account-metadata интегрирован как intelligence layer, а commit `a8864c4` отражает последний интеграционный срез.
2026-04-22 14:25:07 - Обновлен статус проекта по resident-tracking: завершены RT snapshots/read-models, menu integration и doc-sync; открыты runtime verification, richer UI и глубокая trade/swap аналитика.
2026-03-31 23:08:56 - Добавлен администраторский контур документации (setup/config, data contract, runbook) для эксплуатации и сопровождения таблицы.
2026-03-31 21:42:38 - Обновлен контур документации для onboarding: добавлен отдельный документ по меню и привязка к README.

2026-01-14 18:53:09 - Добавлена функция сброса курсоров для повторной полной загрузки данных
2026-01-14 18:53:09 - Создан детальный анализ балансов с отладкой конкретных активов
2026-01-14 18:53:09 - Исправлена логика фильтрации активов с учетом issuer для корректной синхронизации переводов
2026-01-14 18:53:09 - Добавлено больше отладочных функций для анализа операций и транзакций
2026-01-14 18:53:09 - Улучшена обработка ошибок API с логированием в отдельные листы
