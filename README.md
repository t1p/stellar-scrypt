# Stellar Scrypt

Этот репозиторий содержит Google Apps Script для оркестрации данных между Stellar blockchain, ClickUp и Google Sheets. Скрипт автоматизирует синхронизацию переводов Stellar, задач ClickUp и формирование отчетов для управления проектами и фондами.

## Назначение

* Автоматизация аудита и мониторинга активов и транзакций фондов на Stellar.
* Синхронизация задач и проектов из ClickUp для управления портфелем.
* Формирование ежемесячных фактов и KPI для отчетности.
* Классификация и маппинг транзакций по проектам с обработкой аномалий.
* Интеграция Stellar и ClickUp для полного цикла управления инвестициями.

## Быстрый старт

1. **Апгрейд/инициализация листов**: Выполните [`initializeNewSheets()`](clasp/Резиденты Мабиз.js:2536) и [`upgradeExistingSheets()`](clasp/Резиденты Мабиз.js:2598) из меню Stellar.
2. **Настройка CONST**: Заполните лист CONST обязательными ключами (HORIZON_URL, аккаунты фондов, ClickUp API ключ и workspace).
3. **Первый прогон Stellar**: Запустите [`syncStellarTransfers()`](clasp/Резиденты Мабиз.js:149) для загрузки переводов.
4. **Inventory ClickUp**: Выполните [`clickupInventory()`](clasp/Резиденты Мабиз.js:1596) для сбора схемы workspace.
5. **Sync ClickUp tasks**: Запустите [`syncClickUpTasks()`](clasp/Резиденты Мабиз.js:1755) для синхронизации задач.
6. **Remap/reclassify**: Примените [`remappingProjectIds()`](clasp/Резиденты Мабиз.js:1069) и [`reclassifyTransfers()`](clasp/Резиденты Мабиз.js:1007) для маппинга и классификации.
7. **Build FACT_MONTHLY + KPI_RAW**: Выполните [`buildFactMonthly()`](clasp/Резиденты Мабиз.js:2276) и [`buildKpiRaw()`](clasp/Резиденты Мабиз.js:2402) для отчетов.

## Конфигурация листа CONST

Лист CONST содержит настройки в формате ключ-значение (A:B).

### Обязательные ключи

* **Stellar**:
  * `HORIZON_URL` — URL Horizon API (например, https://archive.stellar.validationcloud.io/v1/H4KC7iRdHf-G0jIblbqY8JKfzSb4Aiq_I97id7yrdzY).
  * `START_DATE` / `END_DATE` — диапазон дат в формате YYYY-MM-DD.
  * `MABIZ_MAIN`, `MABIZ_DEFAULT`, `MFBOND`, `MABIZ_SETTLEMENT` — адреса аккаунтов фондов (начинаются с G).
  * `cursor_payments_<fundKey>` — курсоры для инкрементальной синхронизации (автоматически управляются).

* **ClickUp**:
  * `CLICKUP_API_KEY` — API токен ClickUp.
  * `CLICKUP_WORKSPACE_ID` — ID workspace в ClickUp.
  * `CLICKUP_LIST_IDS` — список ID списков через запятую.

### Опциональные ключи

* **Stellar**:
  * `TOKEN_FILTER` — фильтр по активу (код или код:эмитент).
  * `COUNTERPARTY_SCOPE` — область контрагентов (FUND_RESIDENT_ONLY, FUND_FUND, etc.).
  * `include_native_xlm` — true для включения XLM (по умолчанию false).
  * `asset_allowlist` / `asset_blocklist` — списки разрешенных/запрещенных активов через запятую.
  * `min_amount` — минимальная сумма (по умолчанию 0.01).
  * `RELAX_ROLE_FILTER` — true для ослабления фильтров ролей.

* **ClickUp**:
  * `PROJECT_ID_REGEX` — regex для поиска project_id в memo (по умолчанию /\bP?\d{3,6}\b/).

* **Memo rules**:
  * `MEMO_PATTERNS_REPAY`, `MEMO_PATTERNS_DIVIDEND`, `MEMO_PATTERNS_OPEX` — паттерны для классификации.
  * `CLASSIFY_ENABLE` — true для включения классификации (по умолчанию true).

## Структура листов

* `CONST` — конфигурация (ключи и значения).
* `RESIDENTS` — список резидентов с аккаунтами, эмитентами и управленческими полями (Curator, Next_Action_Due и т.д.).
* `ACCOUNTS` — метки аккаунтов (адрес:метка).
* `TRANSFERS` — синхронизированные переводы Stellar (section, datetime, from/to, asset, amount, memo, tx_hash, project_id, class и т.д.).
* `TRANSFERS_MEMO_QUEUE` — очередь для догрузки memo.
* `ADDRESS_TRANSACTIONS` — выборка транзакций между двумя адресами.
* `BALANCE_CHANGES` — изменения балансов по активам.
* `CLICKUP_SCHEMA` — схема ClickUp (spaces, folders, lists, users, статусы, поля).
* `CLICKUP_TASKS` — синхронизированные задачи ClickUp (task_id, project_id, status, assignee и т.д.).
* `PROJECT_MAP` — маппинг проектов (project_id ↔ stellar_account/issuer, clickup_task_id).
* `ANOMALIES` — аномалии маппинга (UNMAPPED, AMBIGUOUS транзакции).
* `FACT_MONTHLY` — ежемесячные факты по проектам (month, project_id, class, amount_asset и т.д.).
* `KPI_RAW` — сырые метрики KPI (total_projects, overdue_actions и т.д.).
* `DEBUG_LOG` — логи выполнения с метриками (fetched, filtered, appended и т.д.).

## Диагностика

Лист `DEBUG_LOG` содержит логи каждого запуска с временными метками и метриками. Ключевые поля для мониторинга:

* `stage` — этап (syncStellarTransfers, clickupInventory и т.д.).
* `fund_key` — ключ фонда или 'ALL'.
* `rows_fetched` / `rows_appended` — получено/записано строк.
* `unmapped_count` / `ambiguous_count` — неразмеченные транзакции.
* `memoCacheHit` / `memoFetched` — хиты кэша memo.
* `details` — текстовое описание результата или причины обнуления (например, "Главная причина: roleOk = 0").

Проверяйте логи после каждого запуска для выявления фильтров или ошибок.

## MAYMUN Asset Layer (owner-approved manual profile)

MAYMUN-слой работает в двух режимах:

* **Safe default**: global dry-run only (`normalizeOptions_` принудительно держит `dryRun=true` для обычных вызовов).
* **Owner-approved manual write profile**: отдельный ручной entrypoint только для Apps Script UI/manual operator:
  * `runMaymunAssetLayerOwnerApprovedWrite(options)`

Листы и контракт остаются прежними:

* `MAYMUN_EVENTS`
* `MAYMUN_DECISIONS`
* `MAYMUN_ALLOCATIONS`
* `MAYMUN_EXPENSES`
* `MAYMUN_RUNWAY`

Ключевые ограничения (обязательны):

* merge status: **HOLD**;
* no cron;
* no live ClickUp/Telegram projection;
* no unattended CLI automation (`clasp run` путь не используется);
* no runtime / credentials / provider wiring changes.

Owner-approved write profile делает:

1. owner marker в `DEBUG_LOG` (`fund_key=OWNER_GO`);
2. precheck (row counts, наличие MAYMUN-листов, проверка заголовков, dry-run preview);
3. ручной write-run из отдельного entrypoint;
4. postcheck (row delta, DEBUG_LOG rows, список add/update, repeat/dedup check для `tx_hash + op_id`).

Идемпотентность transfer-backed events сохраняется: дедуп по `tx_hash + op_id`.

Rollback и пошаговый безопасный запуск описаны в [`docs/MAYMUN_OWNER_MANUAL_RUNBOOK.md`](docs/MAYMUN_OWNER_MANUAL_RUNBOOK.md).

### Ручной сценарий после фиксации TRANSFER

1. `TRANSFERS -> MAYMUN_EVENTS` через ручной operator flow.
   - Если `project_id` неразрешён (`UNMAPPED`, `UNKNOWN`, пусто и аналоги), событие принудительно получает `event_status=manual_review` и `confidence=low`.
   - Для такого события создаётся `MAYMUN_DECISIONS` с `decision_status=pending_approval`, `owner_go_status=pending`, `reason=project_mapping_required` и явной пометкой о необходимости маппинга на проект из `RESIDENTS`.
   - Даже при `direction=IN` и `class=Dividend` confirmed/auto path блокируется, пока не выполнен project mapping.
2. `MAYMUN_DECISIONS -> MAYMUN_ALLOCATIONS` через `MAYMUN: Create allocation from selected DECISION`.
   - Для `allocation_type` используется семантика связанного события (`dividend_received`/`funding_received`/`direction=in` -> `planned_inflow`) с fallback по `decision_type`.
   - Если поля approval-аудита (`approved_by`, `approved_at`) не заполнены, запись не блокируется, но фиксируется warning в `DEBUG_LOG`.
3. `MAYMUN_EVENTS / MAYMUN_ALLOCATIONS / MAYMUN_EXPENSES -> MAYMUN_RUNWAY` через `MAYMUN: Create runway snapshot`.
   - Запускать с активного листа `MAYMUN_ALLOCATIONS` и выбранной ровно одной data-row.
   - `asset_code` scope берётся из выбранной allocation-строки; расчёт агрегирует только этот asset.
   - Duplicate blocker: повторный запуск блокируется, если уже есть `MAYMUN_RUNWAY`-строка с тем же `asset_code` и тем же нормализованным набором `source_allocation_ids` (stage: `runway_snapshot.duplicate_blocked`).
   - При создании snapshot заполняются legacy alias fields: `snapshot_date` (из `snapshot_at`, `YYYY-MM-DD`), `confirmed_liquidity=confirmed_balance`, `pending_liquidity=0`, `liquidatable_assets_value=confirmed_balance`, `status=manual_snapshot`, `comment=Manual runway snapshot for selected allocation asset scope`; `monthly_burn`, `runway_days`, `self_sufficiency_ratio` оставляются пустыми.

Оба новых шага выполняются только вручную из Apps Script UI, используют protected owner write context и не включают cron/live projection.

Дополнительно для allocation safety:
- при конфликте типов для одного `decision_id + bucket` (`planned_inflow` vs `planned_outflow`) новая запись блокируется до ручного разрешения, чтобы не допускать двойной активной аллокации по одному decision.

## Безопасность

* **ClickUp токен**: Храните `CLICKUP_API_KEY` только в листе CONST. Не коммитите в репозиторий.
* **Минимальные права**: API ключ ClickUp должен иметь доступ только к необходимому workspace. Используйте read-only где возможно.
* **Секреты**: Все чувствительные данные (токены, адреса) хранятся в Google Sheets, не в коде.
* **Ротация**: Регулярно обновляйте API ключи и проверяйте доступы.

## Известные ограничения/риски

* **Таймзоны**: Все даты в UTC; конвертация в локальное время вручную.
* **Memo подгрузка**: Memo догружаются асинхронно через очередь; может потребоваться несколько запусков [`syncTransfersMemos()`](clasp/Резиденты Мабиз.js:621).
* **Дедуп ключ**: Уникальность по tx_hash:op_id; старые дубли могут остаться при изменении логики.
* **Horizon API**: Ограничения на запросы; используйте архивные URL для больших объемов.
* **ClickUp sync**: Только активные задачи; архивные не синхронизируются.
* **Классификация**: Зависит от memo-паттернов; ручная override через class_override.

## Резервная копия

Для резервного копирования в XLSX:

1. В Google Sheets: Файл → Скачать → Microsoft Excel (.xlsx).
2. Или через Apps Script: Используйте `SpreadsheetApp.getActiveSpreadsheet().getBlob()` для экспорта.
3. Автоматизация: Создайте триггер на [`ping()`](clasp/Резиденты Мабиз.js:2604) для регулярного экспорта.

Храните копии в защищенном хранилище с шифрованием.

## Быстрый обзор структуры

* Основной рабочий скрипт для Apps Script: [`clasp/Резиденты Мабиз.js`](clasp/Резиденты Мабиз.js)
* Локальные версии/черновики: [`v2_improved.js`](v2_improved.js), [`v2.js`](v2.js)
* Пользовательская инструкция по меню: [`docs/USER_MENU.md`](docs/USER_MENU.md)
* Документация Memory Bank: [`memory-bank/`](memory-bank/)

## Документация для администратора

Для технического обслуживания и эксплуатации таблицы:

* [Настройка и конфигурация](docs/ADMIN_SETUP_AND_CONFIG.md) — конфигурация через лист CONST, безопасность, типовые ошибки
* [Структура листов и контракты данных](docs/ADMIN_SHEETS_AND_DATA_CONTRACT.md) — подробная документация по каждому листу, режимы работы, риски
* [Операционный runbook](docs/ADMIN_RUNBOOK.md) — пошаговые инструкции для типовых сценариев, восстановление после сбоев

## Memory Bank (обязательно к соблюдению)

Документация в каталоге [`memory-bank/`](memory-bank/) ведётся строго по инструкции из [`memory-bank/memory_bank_management_instructions.md`](memory-bank/memory_bank_management_instructions.md). Ключевые правила:

* Язык всех файлов — русский.
* Формат временных меток — `ГГГГ-ММ-ДД ЧЧ:ММ:СС` (UTC).
* Каждая запись начинается с `[временная метка] - [описание]`.
* Записи сортируются в обратном хронологическом порядке.
* При правках обновляется метка «Последняя редакция».
* Сохраняется структура разделов и их порядок.
