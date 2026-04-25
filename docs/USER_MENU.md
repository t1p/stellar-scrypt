# Меню скрипта в таблице: возможности и функционал

Документ описывает фактические пункты меню `Stellar` из [`onOpen()`](clasp/Резиденты%20Мабиз.js:37) в основном рабочем скрипте [`clasp/Резиденты Мабиз.js`](clasp/Резиденты%20Мабиз.js:1).

## Где находится меню

- Меню создаётся в [`onOpen()`](clasp/Резиденты%20Мабиз.js:37) через [`ui.createMenu('Stellar')`](clasp/Резиденты%20Мабиз.js:39).
- Каждый пункт меню привязан к конкретной функции через [`addItem()`](clasp/Резиденты%20Мабиз.js:40).

## Пункты меню и что они делают

### 1) Загрузка и обработка переводов Stellar

1. **Обновить переводы** → [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)
   - Что делает: основной сбор переводов по фондам, дедупликация, классификация, попытка маппинга `project_id`, заполнение служебных очередей/аномалий.
   - Листы (читает/пишет): `CONST`, `RESIDENTS`, `ACCOUNTS` (чтение), `TRANSFERS`, `TRANSFERS_MEMO_QUEUE`, `BALANCE_CHANGES`, `ANOMALIES` (запись).
   - Побочные эффекты/длительность/ограничения: обновляет курсоры в пользовательских свойствах через [`PropertiesService.getUserProperties()`](clasp/Резиденты%20Мабиз.js:78); может выполняться долго на больших диапазонах дат.
   - Типичные проблемы: некорректные ключи/адреса в `CONST`; слишком строгие фильтры (`TOKEN_FILTER`, `COUNTERPARTY_SCOPE`, `min_amount`).
   - Признак успеха: новые строки в `TRANSFERS` и запись этапа в `DEBUG_LOG` через [`writeDebugLog()`](clasp/Резиденты%20Мабиз.js:1307).

2. **Догрузить memo** → [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621)
   - Что делает: берёт хэши из очереди `TRANSFERS_MEMO_QUEUE`, догружает memo по API Horizon и дозаписывает memo в `TRANSFERS`.
   - Листы (читает/пишет): `TRANSFERS_MEMO_QUEUE`, `TRANSFERS`, `CONST`.
   - Побочные эффекты/длительность/ограничения: сетевые вызовы через [`UrlFetchApp.fetch()`](clasp/Резиденты%20Мабиз.js:645); за запуск обрабатывает не более [`MAX_MEMO_FETCH_PER_RUN`](clasp/Резиденты%20Мабиз.js:22) (300) хэшей; использует кэш.
   - Типичные проблемы: недоступен `HORIZON_URL`, API отвечает не-200, очередь большая и требует несколько запусков.
   - Признак успеха: уменьшается очередь в `TRANSFERS_MEMO_QUEUE`, в `TRANSFERS` появляются memo, есть запись в `DEBUG_LOG`.

3. **Сбросить курсоры** → [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78)
   - Что делает: удаляет все свойства `cursor_payments_*`.
   - Листы (читает/пишет): напрямую листы не изменяет.
   - Побочные эффекты/длительность/ограничения: следующий запуск полной загрузки может заново проходить большие объёмы данных.
   - Типичные проблемы: ожидание «быстрого» следующего запуска после сброса.
   - Признак успеха: запись о сбросе в `DEBUG_LOG`.

4. **Показать транзакции между адресами** → [`showTransactionsBetweenAddresses()`](clasp/Резиденты%20Мабиз.js:1978)
   - Что делает: открывает диалог, валидирует ввод и запускает выборку транзакций между двумя адресами.
   - Листы (читает/пишет): пишет в `ADDRESS_TRANSACTIONS`.
   - Побочные эффекты/длительность/ограничения: UI-диалоги [`ui.alert()`](clasp/Резиденты%20Мабиз.js:2020); длительность зависит от диапазона.
   - Типичные проблемы: ошибки в формате Stellar-адресов, слишком широкий диапазон дат.
   - Признак успеха: сообщение об успешной загрузке в UI и заполненный лист `ADDRESS_TRANSACTIONS`.

5. **Тестировать транзакции между адресами** → [`testFetchTransactionsBetweenAddresses()`](clasp/Резиденты%20Мабиз.js:2172)
   - Что делает: тестовый вызов загрузчика с хардкод-адресами.
   - Листы (читает/пишет): зависит от вызываемой логики выборки, в основном для проверки работоспособности.
   - Побочные эффекты/длительность/ограничения: диагностический запуск, результаты в логах.
   - Типичные проблемы: ожидание боевого результата вместо тестовой проверки.
   - Признак успеха: отсутствуют ошибки в логах выполнения.

6. **Обновить все** → [`syncAllStellar()`](clasp/Резиденты%20Мабиз.js:72)
   - Что делает: последовательно запускает [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) и [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621).
   - Листы (читает/пишет): суммарно как у двух функций выше.
   - Побочные эффекты/длительность/ограничения: общий runtime больше, чем у одиночных пунктов.
   - Типичные проблемы: таймаут Apps Script на больших объёмах.
   - Признак успеха: новые данные в `TRANSFERS` + частично/полностью обработанная очередь memo.

### 2) Классификация и маппинг

7. **Переклассифицировать TRANSFERS (по override приоритет)** → [`reclassifyTransfers()`](clasp/Резиденты%20Мабиз.js:1007)
   - Что делает: пересчитывает классификацию строк `TRANSFERS` с приоритетом `class_override`.
   - Листы (читает/пишет): `TRANSFERS`.
   - Побочные эффекты/длительность/ограничения: массовая перезапись колонок классификации; есть UI-оповещения.
   - Типичные проблемы: отсутствие ожидаемого эффекта при пустых/невалидных memo-паттернах.
   - Признак успеха: обновлены поля классификации и есть запись в `DEBUG_LOG`.

8. **Перемаппить project_id для UNMAPPED/AMBIGUOUS** → [`remappingProjectIds()`](clasp/Резиденты%20Мабиз.js:1072)
   - Что делает: повторно пытается назначить `project_id` для проблемных операций; фиксирует новые аномалии при необходимости.
   - Листы (читает/пишет): `TRANSFERS`, `ANOMALIES`.
   - Побочные эффекты/длительность/ограничения: зависит от качества данных в `PROJECT_MAP`/`RESIDENTS`.
   - Типичные проблемы: конфликтные соответствия (несколько кандидатов), неполный `PROJECT_MAP`.
   - Признак успеха: уменьшение доли `UNMAPPED/AMBIGUOUS`, запись этапа в `DEBUG_LOG`.

### 3) Инициализация служебных листов

9. **Создать CLICKUP_SCHEMA** → [`initializeClickUpSchema()`](clasp/Резиденты%20Мабиз.js:2187)
10. **Создать CLICKUP_TASKS** → [`initializeClickUpTasks()`](clasp/Резиденты%20Мабиз.js:2201)
11. **Создать PROJECT_MAP** → [`initializeProjectMap()`](clasp/Резиденты%20Мабиз.js:2217)
12. **Создать ANOMALIES** → [`initializeAnomalies()`](clasp/Резиденты%20Мабиз.js:2231)
13. **Создать FACT_MONTHLY** → [`initializeFactMonthly()`](clasp/Резиденты%20Мабиз.js:2246)
14. **Создать KPI_RAW** → [`initializeKpiRaw()`](clasp/Резиденты%20Мабиз.js:2262)

Для всех пунктов 9–14:
- Что делают: создают соответствующий лист (если его нет) и добавляют заголовки.
- Листы (читает/пишет): каждый пункт пишет в свой целевой лист.
- Побочные эффекты/длительность/ограничения: выполняются быстро; безопасны для первичной подготовки структуры.
- Типичные проблемы: лист уже существует с несовместимой структурой/ручными правками.
- Признак успеха: лист создан/обновлён, событие записано в `DEBUG_LOG`.

15. **Инициализировать новые листы** → [`initializeNewSheets()`](clasp/Резиденты%20Мабиз.js:2540)
- Что делает: пакетно запускает инициализаторы ClickUp/Project/Anomalies/Fact/KPI.
- Листы (читает/пишет): `CLICKUP_SCHEMA`, `CLICKUP_TASKS`, `PROJECT_MAP`, `ANOMALIES`, `FACT_MONTHLY`, `KPI_RAW`.
- Побочные эффекты/длительность/ограничения: удобно для нового файла таблицы; не заменяет апгрейд существующих нестандартных колонок.
- Типичные проблемы: ожидание, что пункт создаст вообще все бизнес-листы (`CONST`, `TRANSFERS`, `RESIDENTS` и т.д.).
- Признак успеха: набор листов появился и есть запись в `DEBUG_LOG`.

### 4) Account metadata и операционный поток RT

16. **Обновить Created данные аккаунтов** → [`updateAccountCreationDetails()`](clasp/Резиденты%20Мабиз.js)
- Что делает: дополняет лист `ACCOUNTS` полями `created_by` и `created_at` по первичной транзакции создания аккаунта через Horizon.
- Листы (читает/пишет): читает `CONST`, `ACCOUNTS`, пишет `ACCOUNTS`.
- Особенности: поддерживает `EXPLORER_TX_URL` в `CONST` для построения ссылки в `created_by`; при отсутствии использует базу из `HORIZON_URL`.

17. **Обновить метаданные аккаунтов** → [`syncAccountsMeta()`](clasp/Резиденты%20Мабиз.js)
- Что делает: строит служебные snapshots `ACCOUNTS_META` и `ACCOUNT_SIGNERS` по фондовым и резидентским аккаунтам.
- Листы (читает/пишет): читает `CONST`, `RESIDENTS`, `ACCOUNTS`; пишет `ACCOUNTS_META`, `ACCOUNT_SIGNERS`.
- Особенности: использует label-резолвинг с приоритетом `ACCOUNTS` → fallback из фондов/резидентов.

18. **Критическая зависимость RT-flow**
- Базовый источник для RT-витрин — только [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js).
- Перед запуском `RESIDENT_TIMELINE`, `TOKEN_FLOWS`, `ISSUER_STRUCTURE` необходимо выполнить полный refresh:
  1) [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js)
  2) [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js)
  3) [`remappingProjectIds()`](clasp/Резиденты%20Мабиз.js)
  4) [`reclassifyTransfers()`](clasp/Резиденты%20Мабиз.js)
  5) [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js)
  6) затем [`buildResidentTimeline()`](clasp/Резиденты%20Мабиз.js), [`buildTokenFlows()`](clasp/Резиденты%20Мабиз.js), [`buildIssuerStructure()`](clasp/Резиденты%20Мабиз.js)

### 5) Построение отчётных витрин

#### Resident Tracking витрины

19. **Собрать RESIDENT_TIMELINE** → [`buildResidentTimeline()`](clasp/Резиденты%20Мабиз.js:1630)
- Что делает: строит timeline read-model на основе `RESIDENT_TRACKING` с полями `entry_point_at`, `event_index`, `days_since_entry_point`.
- Листы (читает/пишет): читает `RESIDENT_TRACKING`, пишет `RESIDENT_TIMELINE`.
- Побочные эффекты/длительность/ограничения: snapshot-пересборка (очистка + полная запись), проверяет обязательные заголовки источника.
- Признак успеха: заполненный `RESIDENT_TIMELINE` и запись этапа `buildResidentTimeline` в `DEBUG_LOG`.

20. **Собрать TOKEN_FLOWS** → [`buildTokenFlows()`](clasp/Резиденты%20Мабиз.js:1750)
- Что делает: строит snapshot потоков токенов (агрегированные ребра движения) из `RESIDENT_TRACKING`.
- Листы (читает/пишет): читает `RESIDENT_TRACKING`, пишет `TOKEN_FLOWS`.
- Побочные эффекты/длительность/ограничения: snapshot-пересборка, дедуп по `tx_hash`, встроенные safeguards на размер входа/выхода.
- Признак успеха: заполненный `TOKEN_FLOWS` и запись этапа `buildTokenFlows` в `DEBUG_LOG`.

21. **Собрать ISSUER_STRUCTURE** → [`buildIssuerStructure()`](clasp/Резиденты%20Мабиз.js:1865)
- Что делает: строит foundation snapshot структуры взаимодействий (направленные связи `from -> to`) из `RESIDENT_TRACKING`.
- Листы (читает/пишет): читает `RESIDENT_TRACKING`, пишет `ISSUER_STRUCTURE`.
- Побочные эффекты/длительность/ограничения: snapshot-пересборка, требует обязательные колонки источника.
- Признак успеха: заполненный `ISSUER_STRUCTURE` и запись этапа `buildIssuerStructure` в `DEBUG_LOG`.

22. **Собрать FACT_MONTHLY** → [`buildFactMonthly()`](clasp/Резиденты%20Мабиз.js:2937)
- Что делает: агрегирует факты из `TRANSFERS` в помесячный срез `FACT_MONTHLY`.
- Листы (читает/пишет): читает `TRANSFERS`, пишет `FACT_MONTHLY`.
- Побочные эффекты/длительность/ограничения: обычно очищает/перезаписывает целевой диапазон при пересборке.
- Типичные проблемы: пустой `TRANSFERS` или отсутствующие обязательные колонки.
- Признак успеха: заполненные строки `FACT_MONTHLY` и запись в `DEBUG_LOG`.

23. **Собрать KPI_RAW** → [`buildKpiRaw()`](clasp/Резиденты%20Мабиз.js:3067)
- Что делает: считает базовые KPI по текущим данным.
- Листы (читает/пишет): читает `RESIDENTS`, `TRANSFERS`, пишет `KPI_RAW`.
- Побочные эффекты/длительность/ограничения: результат зависит от полноты `RESIDENTS` и свежести `TRANSFERS`.
- Типичные проблемы: пустые даты/служебные поля в `RESIDENTS`, что обнуляет отдельные KPI.
- Признак успеха: `KPI_RAW` заполнен, есть запись о стадии в `DEBUG_LOG`.

### 6) Интеграция с ClickUp

24. **ClickUp Инвентаризация** → [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:2260)
- Что делает: загружает структуру workspace (spaces/folders/lists/users/статусы/поля) в `CLICKUP_SCHEMA`.
- Листы (читает/пишет): читает `CONST`, пишет `CLICKUP_SCHEMA`.
- Побочные эффекты/длительность/ограничения: делает внешние API-запросы к ClickUp (через цепочку функций), время зависит от размера workspace.
- Типичные проблемы: отсутствует `CLICKUP_API_KEY` или `CLICKUP_WORKSPACE_ID` в `CONST`.
- Признак успеха: `CLICKUP_SCHEMA` заполнен и в `DEBUG_LOG` есть этап `clickupInventory`.

25. **Синхронизация задач ClickUp** → [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:2415)
- Что делает: подтягивает задачи из заданных списков и обновляет `CLICKUP_TASKS`; затем вызывает обновление резидентов.
- Листы (читает/пишет): читает `CONST`, пишет `CLICKUP_TASKS`, использует `ANOMALIES` и вызывает [`updateResidentsFromTasks()`](clasp/Резиденты%20Мабиз.js:1873).
- Побочные эффекты/длительность/ограничения: требует `CLICKUP_LIST_IDS`; при отсутствии кидает ошибку [`CLICKUP_LIST_IDS не заданы в CONST листе`](clasp/Резиденты%20Мабиз.js:1772).
- Типичные проблемы: недействительный API-ключ, пустой список list IDs, несоответствие пользовательских полей.
- Признак успеха: обновились строки в `CLICKUP_TASKS` и связанные поля в `RESIDENTS`.

26. **Обновить резидентов из ClickUp** → [`updateResidentsFromTasks()`](clasp/Резиденты%20Мабиз.js:2534)
- Что делает: переносит данные задач (куратор, даты действий/платежей и т.п.) в `RESIDENTS`.
- Листы (читает/пишет): читает `PROJECT_MAP`, пишет `RESIDENTS`.
- Побочные эффекты/длительность/ограничения: функция ожидает входной массив задач; из меню вызывается без аргумента, поэтому практическая ценность — как часть [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754).
- Типичные проблемы: структура `RESIDENTS` без нужных колонок, неполный `PROJECT_MAP`.
- Признак успеха: обновлены управленческие поля в `RESIDENTS`, есть запись в `DEBUG_LOG`.

### 7) Апгрейд структуры листов

27. **Апгрейд листа TRANSFERS** → [`upgradeTransfersSheet()`](clasp/Резиденты%20Мабиз.js:3224)
28. **Апгрейд листа RESIDENTS** → [`upgradeResidentsSheet()`](clasp/Резиденты%20Мабиз.js:3246)
29. **Апгрейд всех листов** → [`upgradeExistingSheets()`](clasp/Резиденты%20Мабиз.js:3268)

Для этих пунктов:
- Что делают: добавляют недостающие колонки и приводят листы к ожидаемой схеме.
- Листы (читает/пишет): `TRANSFERS`, `RESIDENTS` (+ `DEBUG_LOG` через внутренний апгрейд в [`upgradeExistingSheets()`](clasp/Резиденты%20Мабиз.js:2602)).
- Побочные эффекты/длительность/ограничения: меняют структуру заголовков; лучше запускать до рабочих прогонов.
- Типичные проблемы: ручные нестандартные колонки в середине таблицы.
- Признак успеха: появились нужные заголовки и зафиксирован этап в `DEBUG_LOG`.

### 8) MAYMUN owner-approved manual profile

30. **MAYMUN: Dry-run init/check листов** → [`initializeMaymunAssetLayerSheetsManual()`](clasp/Резиденты%20Мабиз.js)
- Что делает: безопасный ручной dry-run ensure/check для `MAYMUN_*` листов без фактической записи.
- Ограничения: только ручной запуск, non-dry write заблокирован общим guardrail.

31. **MAYMUN: Owner-approved manual write profile** → [`runMaymunAssetLayerOwnerApprovedWrite()`](clasp/Резиденты%20Мабиз.js)
- Что делает: отдельный owner-approved ручной профиль фактической записи в `MAYMUN_*` с обязательными precheck/postcheck.
- Precheck: row counts, наличие листов, проверка заголовков, dry-run preview, подтверждение отдельного manual entrypoint.
- Postcheck: row deltas, `DEBUG_LOG` rows, список add/update, repeat/dedup check по `tx_hash + op_id`.
- Ограничения: только Apps Script UI/manual operator; не для cron, не для unattended CLI (`clasp run`), merge status остаётся hold.

32. **MAYMUN: Create allocation from selected DECISION** → [`runMaymunAssetLayerCreateAllocationFromSelectedDecision()`](clasp/Резиденты%20Мабиз.js)
- Что делает: на активном листе `MAYMUN_DECISIONS` берёт выбранную строку, проверяет обязательные поля и создаёт/обновляет allocation в `MAYMUN_ALLOCATIONS` через `upsertMaymunAllocation()`.
- Условия записи: `decision_status=approved` и `owner_go_status=approved`; иначе запись блокируется с `allocation_blocked_pending_approval`.
- Маппинг MVP: `bucket=runway`, `allocation_status=confirmed`.
- `allocation_type`: приоритетно по связанному событию (`dividend_received`/`funding_received`/`direction=in` -> `planned_inflow`), иначе fallback `decision_type=record_income -> planned_inflow`, в остальных случаях `planned_outflow`.
- Если `approved_by`/`approved_at` пустые, запись не блокируется, но в `DEBUG_LOG` пишется warning `allocation_from_decision.approval_audit_missing`.
- Дедуп: ключ `decision_id + bucket + allocation_type` (повторный запуск не создаёт дубль).
- Защита от противоположного типа: если для того же `decision_id + bucket` уже существует allocation с другим `allocation_type`, новая запись блокируется (`allocation_blocked_conflicting_allocation_type`) до ручного разрешения конфликта.

33. **MAYMUN: Create runway snapshot** → [`runMaymunAssetLayerCreateRunwaySnapshot()`](clasp/Резиденты%20Мабиз.js)
- Что делает: на активном листе `MAYMUN_ALLOCATIONS` требует выбранную ровно одну data-row, берёт из неё `asset_code` и формирует append-only snapshot в `MAYMUN_RUNWAY` только в этом asset scope.
- Блокирует запуск, если активный лист не `MAYMUN_ALLOCATIONS`, выбрана не одна data-row или выбранная allocation не `allocation_status=confirmed`.
- Формулы MVP: `net_confirmed_runway = confirmed_balance - planned_outflow - confirmed_expenses`, `forecast_runway = confirmed_balance - planned_outflow`.
- В расчёт включаются только `allocation_status=confirmed` и `expense_status in (paid, confirmed)` для выбранного `asset_code`.

## Рекомендуемый порядок запуска для новой таблицы

1. Подготовить `CONST` (ключи Stellar/ClickUp) по требованиям из [`README.md`](README.md:23).
2. Запустить **Инициализировать новые листы** → [`initializeNewSheets()`](clasp/Резиденты%20Мабиз.js:2540).
3. Для существующих таблиц после обновления кода выполнить **Апгрейд всех листов** → [`upgradeExistingSheets()`](clasp/Резиденты%20Мабиз.js:2602).
4. Выполнить первичную загрузку переводов: **Обновить переводы** → [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149).
5. При наличии очереди memo выполнить **Догрузить memo** → [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621) (при необходимости несколько раз).
6. Для ClickUp: **ClickUp Инвентаризация** → [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599), затем **Синхронизация задач ClickUp** → [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754).
7. Нормализация данных: **Перемаппить project_id...** → [`remappingProjectIds()`](clasp/Резиденты%20Мабиз.js:1072), затем **Переклассифицировать TRANSFERS...** → [`reclassifyTransfers()`](clasp/Резиденты%20Мабиз.js:1007).
8. Обязательный RT этап: **выполнить [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js) перед RT-витринами**.
9. После [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js) собрать RT-витрины: [`buildResidentTimeline()`](clasp/Резиденты%20Мабиз.js:1630), [`buildTokenFlows()`](clasp/Резиденты%20Мабиз.js:1750), [`buildIssuerStructure()`](clasp/Резиденты%20Мабиз.js:1865).
10. Account metadata: при необходимости запускать [`updateAccountCreationDetails()`](clasp/Резиденты%20Мабиз.js) и [`syncAccountsMeta()`](clasp/Резиденты%20Мабиз.js).
11. Сборка отчётов: **Собрать FACT_MONTHLY** → [`buildFactMonthly()`](clasp/Резиденты%20Мабиз.js:2276), **Собрать KPI_RAW** → [`buildKpiRaw()`](clasp/Резиденты%20Мабиз.js:2406).
12. MAYMUN manual chain после фиксации transfer:
   - `TRANSFERS -> MAYMUN_EVENTS` (если `project_id=UNMAPPED/UNKNOWN/пусто/неразрешён`, то только `manual_review` + обязательный decision `pending_approval` с причиной `project_mapping_required`);
   - `MAYMUN_DECISIONS -> MAYMUN_ALLOCATIONS`;
   - `MAYMUN_* -> MAYMUN_RUNWAY`.
13. Контроль результата по листу `DEBUG_LOG` через [`writeDebugLog()`](clasp/Резиденты%20Мабиз.js:1307).

## Безопасность и данные

- Чувствительные значения хранятся в `CONST` и читаются через [`parseConstSheet()`](clasp/Резиденты%20Мабиз.js:700):
  - `CLICKUP_API_KEY`, `CLICKUP_WORKSPACE_ID`, `CLICKUP_LIST_IDS`, `HORIZON_URL`, адреса фондов.
- Что может утекать в логах:
  - диагностические сообщения через [`Logger.log()`](clasp/Резиденты%20Мабиз.js:647) и этапы в `DEBUG_LOG` через [`writeDebugLog()`](clasp/Резиденты%20Мабиз.js:1307);
  - служебные метрики (кол-во строк, стадии, причины фильтрации).
- Что нельзя публиковать:
  - значения из `CONST` с токенами/ключами (`CLICKUP_API_KEY`), внутренние URL и приватные аккаунты фондов;
  - сырые экспортные логи, если там есть чувствительные идентификаторы.
- Рекомендации:
  - не коммитить ключи и дампы листа `CONST` в репозиторий;
  - минимизировать права ClickUp API-ключа;
  - перед внешней передачей отчётов убирать технические идентификаторы и токены.
