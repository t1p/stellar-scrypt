# Операционный runbook для администратора

Документ содержит пошаговые инструкции для типовых эксплуатационных сценариев: запуск, синхронизация, восстановление после сбоев.

## Запуск новой таблицы

### Цель
Подготовить новую Google Sheets таблицу к работе со скриптом.

### Предусловия
- Создана пустая Google Sheets таблица
- Скрипт развёрнут через clasp или Apps Script editor

### Шаги

1. **Инициализировать структуру листов**
   - Меню **Stellar** → **Инициализировать новые листы** → [`initializeNewSheets()`](clasp/Резиденты%20Мабиз.js:2540)
   - Создаются: `CLICKUP_SCHEMA`, `CLICKUP_TASKS`, `PROJECT_MAP`, `ANOMALIES`, `FACT_MONTHLY`, `KPI_RAW`

2. **Создать лист CONST**
   - Добавьте лист с именем `CONST`
   - Заполните обязательные ключи (см. [ADMIN_SETUP_AND_CONFIG.md](ADMIN_SETUP_AND_CONFIG.md))

3. **Заполнить RESIDENTS**
   - Создайте заголовки: `label`, `Account_s`, `Asset_issuer`, `Curator`, `Case_Status`, `Next_Action`, `Next_Action_Due`, `Next_Payment_Due`, `Work_Status/Notes`
   - Заполните данные резидентов

4. **Заполнить PROJECT_MAP** (опционально)
   - Добавьте соответствия project_id → stellar_account/issuer

5. **Проверить конфигурацию**
   - Запустите **Обновить переводы** → [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)
   - Проверьте `DEBUG_LOG` на ошибки
   - Проверьте `TRANSFERS` на новые строки

### Признак успеха
- Все обязательные листы созданы
- В `TRANSFERS` появились данные
- В `DEBUG_LOG` нет ошибок stage: `ERROR`

### Типовые сбои
| Проблема | Причина | Решение |
|----------|---------|---------|
| CONST не читается | Неправильная структура (A:B) | Проверьте формат: колонка A = ключ, B = значение |
| TRANSFERS пустой | Неправильные даты START_DATE/END_DATE | Проверьте формат `YYYY-MM-DD` |
| Нет данных из Stellar | Неправильный HORIZON_URL | Проверьте URL в CONST |

---

## Регулярная эксплуатация

### Ежедневные операции

1. **Обновить переводы Stellar**
   - Меню **Stellar** → **Обновить переводы** → [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)
   - Загружает новые транзакции с учётом курсоров

2. **Догрузить memo** (при необходимости)
   - Меню **Stellar** → **Догрузить memo** → [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621)
   - Обрабатывает до 300 хэшей за запуск
   - При большой очереди запустите несколько раз

3. **Проверить DEBUG_LOG**
   - Проверьте наличие ошибок
   - Проверьте метрики: `rows_fetched`, `rows_appended`, `unmapped_count`

### Еженедельные операции

1. **Синхронизировать ClickUp**
   - **ClickUp Инвентаризация** → [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599)
   - **Синхронизация задач ClickUp** → [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754)

2. **Обновить резидентов из ClickUp**
   - **Обновить резидентов из ClickUp** → [`updateResidentsFromTasks()`](clasp/Резиденты%20Мабиз.js:1873)

3. **Переклассифицировать при необходимости**
   - **Переклассифицировать TRANSFERS** → [`reclassifyTransfers()`](clasp/Резиденты%20Мабиз.js:1007)

### Ежемесячные операции

1. **Собрать FACT_MONTHLY**
   - **Собрать FACT_MONTHLY** → [`buildFactMonthly()`](clasp/Резиденты%20Мабиз.js:2276)

2. **Собрать KPI_RAW**
   - **Собрать KPI_RAW** → [`buildKpiRaw()`](clasp/Резиденты%20Мабиз.js:2406)

---

## Stellar sync: детали

### Функция: [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)

**Что делает:**
1. Парсит CONST для получения HORIZON_URL, дат, адресов фондов
2. Для каждого фонда запрашивает транзакции через Horizon API
3. Фильтрует по ролям (FUND_RESIDENT_ONLY, FUND_FUND, etc.)
4. Дедуплицирует по `tx_hash:op_id`
5. Пытается определить `project_id` через RESIDENTS → PROJECT_MAP → memo
6. Классифицирует через [`classifyTransfer_()`](clasp/Резиденты%20Мабиз.js:959)
7. Записывает новые строки в TRANSFERS
8. Добавляет хэши без memo в TRANSFERS_MEMO_QUEUE
9. Фиксирует аномалии в ANOMALIES

**Листы:**
- Читает: CONST, RESIDENTS, ACCOUNTS
- Пишет: TRANSFERS, TRANSFERS_MEMO_QUEUE, BALANCE_CHANGES, ANOMALIES

**Курсоры:**
- Хранятся в User Properties: `cursor_payments_<fundKey>`
- Автоматически обновляются после успешного запуска
- Сбрасываются через [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78)

**Признак успеха:**
- В TRANSFERS новые строки
- В DEBUG_LOG stage: `syncStellarTransfers`, fundKey: SUCCESS
- Уменьшается количество UNMAPPED после маппинга

**Типовые сбои:**
| Проблема | Причина | Решение |
|----------|---------|---------|
| 400 Bad Request | Неправильный HORIZON_URL | Проверьте URL в CONST |
| Таймаут | Слишком много транзакций | Уменьшите диапазон дат |
| roleOk = 0 | Слишком строгие фильтры | Проверьте COUNTERPARTY_SCOPE |

---

## Memo enrichment: детали

### Функция: [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621)

**Что делает:**
1. Читает хэши из TRANSFERS_MEMO_QUEUE
2. Для каждого хэша проверяет кэш (6 часов)
3. Если не в кэше — запрашивает Horizon API
4. Обновляет колонки memo (I) и tx_hash (J) в TRANSFERS
5. Удаляет обработанные хэши из очереди

**Листы:**
- Читает: TRANSFERS_MEMO_QUEUE, TRANSFERS
- Пишет: TRANSFERS, TRANSFERS_MEMO_QUEUE

**Ограничения:**
- Максимум 300 хэшей за запуск ([`MAX_MEMO_FETCH_PER_RUN`](clasp/Резиденты%20Мабиз.js:22))
- Кэш 6 часов ([`MEMO_CACHE_TTL`](clasp/Резиденты%20Мабиз.js:21))

**Признак успеха:**
- Уменьшается очередь в TRANSFERS_MEMO_QUEUE
- В TRANSFERS появляются значения в колонке memo
- В DEBUG_LOG stage: `syncTransfersMemos`

**Восстановление:**
- Если Horizon недоступен — хэши остаются в очереди
- Запустите повторно после восстановления

---

## Remap и reclassify

### Перемаппинг project_id

**Функция:** [`remappingProjectIds()`](clasp/Резиденты%20Мабиз.js:1072)

**Что делает:**
1. Находит все UNMAPPED и AMBIGUOUS в TRANSFERS
2. Повторно применяет [`mapProjectIdForTransfer_()`](clasp/Резиденты%20Мабиз.js:892)
3. Фиксирует новые аномалии в ANOMALIES

**Когда запускать:**
- После заполнения PROJECT_MAP
- После добавления новых резидентов
- При появлении новых UNMAPPED

**Признак успеха:**
- Уменьшается количество UNMAPPED/AMBIGUOUS
- В DEBUG_LOG stage: `remappingProjectIds`

### Переклассификация

**Функция:** [`reclassifyTransfers()`](clasp/Резиденты%20Мабиз.js:1007)

**Что делает:**
1. Пересчитывает `class` для всех строк TRANSFERS
2. Не трогает строки с `class_override`
3. Использует [`classifyTransfer_()`](clasp/Резиденты%20Мабиз.js:959) с приоритетом:
   - class_override (всегда)
   - memo-паттерны (repay, dividend, opex)
   - direction + counterparty_type

**Когда запускать:**
- После изменения MEMO_PATTERNS_* (требует правки кода)
- После изменения правил классификации
- При массовом исправлении class_override

**Признак успеха:**
- Обновлены поля class и class_reason
- В DEBUG_LOG stage: `reclassifyTransfers`

---

## ClickUp inventory

### Функция: [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599)

**Что делает:**
1. Загружает структуру workspace: spaces → folders → lists
2. Загружает пользователей
3. Для каждого list из CLICKUP_LIST_IDS загружает статусы и кастомные поля
4. Полностью перезаписывает CLICKUP_SCHEMA

**Листы:**
- Читает: CONST
- Пишет: CLICKUP_SCHEMA

**Признак успеха:**
- CLICKUP_SCHEMA заполнен структурой
- В DEBUG_LOG stage: `clickupInventory`

**Типовые сбои:**
| Проблема | Причина | Решение |
|----------|---------|---------|
| 401 Unauthorized | Неправильный CLICKUP_API_KEY | Проверьте токен в CONST |
| Пустой результат | Неправильный CLICKUP_WORKSPACE_ID | Проверьте ID workspace |

---

## ClickUp tasks sync

### Функция: [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754)

**Что делает:**
1. Находит последнюю дату обновления в CLICKUP_TASKS (колонка G)
2. Запрашивает задачи из списков CLICKUP_LIST_IDS с фильтром по дате
3. Парсит данные: task_id, project_id, status, assignee, due_date
4. Добавляет новые задачи в CLICKUP_TASKS (append)
5. Обновляет RESIDENTS через [`updateResidentsFromTasks()`](clasp/Резиденты%20Мабиз.js:1873)

**Листы:**
- Читает: CONST, CLICKUP_TASKS
- Пишет: CLICKUP_TASKS, ANOMALIES, RESIDENTS

**Признак успеха:**
- В CLICKUP_TASKS новые задачи
- Обновлены поля Curator, Next_Action_Due в RESIDENTS
- В DEBUG_LOG stage: `syncClickUpTasks`

**Восстановление:**
- При сбое курсор (updated_at) не обновляется
- Можно запустить повторно — дубликатов не будет

---

## FACT_MONTHLY

### Функция: [`buildFactMonthly()`](clasp/Резиденты%20Мабиз.js:2276)

**Что делает:**
1. Читает все TRANSFERS
2. Группирует по month + project_id + class + asset_code
3. Суммирует amount (с учётом direction: OUT = минус)
4. Определяет is_pif по fund_account_key = MFBOND
5. **Полностью очищает и перезаписывает** FACT_MONTHLY

**Листы:**
- Читает: TRANSFERS
- Пишет: FACT_MONTHLY

**Пропускает строки где:**
- class пустой или `Unknown`
- project_id = `UNMAPPED` или `AMBIGUOUS`

**Признак успеха:**
- FACT_MONTHLY заполнен данными
- В DEBUG_LOG stage: `buildFactMonthly`, rows_written_fact > 0

---

## KPI_RAW

### Функция: [`buildKpiRaw()`](clasp/Резиденты%20Мабиз.js:2406)

**Что делает:**
1. Читает RESIDENTS
2. Считает метрики:
   - total_projects
   - curator_filled
   - next_action_due_filled / overdue
   - next_payment_due_filled / overdue
3. **Полностью очищает и перезаписывает** KPI_RAW

**Листы:**
- Читает: RESIDENTS
- Пишет: KPI_RAW

**Признак успеха:**
- KPI_RAW заполнен метриками
- В DEBUG_LOG stage: `buildKpiRaw`

---

## Upgrade flows

### Апгрейд структуры листов

**Функции:**
- [`upgradeTransfersSheet()`](clasp/Резиденты%20Мабиз.js:2558)
- [`upgradeResidentsSheet()`](clasp/Резиденты%20Мабиз.js:2580)
- [`upgradeExistingSheets()`](clasp/Резиденты%20Мабиз.js:2602) — все вместе

**Что делают:**
1. Проверяют наличие обязательных заголовков
2. Добавляют недостающие колонки **справа**
3. Не изменяют существующие данные

**Когда запускать:**
- После обновления кода с новыми колонками
- При миграции с другой версии таблицы

**Признак успеха:**
- Появились новые заголовки
- Существующие данные сохранены
- В DEBUG_LOG stage: `upgradeTransfersSheet` / `upgradeResidentsSheet`

---

## Reset cursors

### Функция: [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78)

**Что делает:**
1. Удаляет все свойства `cursor_payments_*` из User Properties

**Когда запускать:**
- При подозрении на пропущенные транзакции
- После сбоя синхронизации
- При первом запуске на новой таблице

**Внимание:**
- Следующий запуск [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) заново загрузит **все** транзакции
- Может занять много времени на больших объёмах

**Признак успеха:**
- В DEBUG_LOG stage: `resetAllCursors`, details: "Все курсоры сброшены"

---

## Что можно и нельзя править вручную

### ✅ Можно править

| Лист | Что можно | Ограничения |
|------|-----------|-------------|
| CONST | Ключи и значения | Не удаляйте обязательные ключи |
| RESIDENTS | Все поля | Не меняйте порядок B, Q, R |
| ACCOUNTS | Адреса и метки | Формат: адрес, метка |
| PROJECT_MAP | Все поля | Не удаляйте активные проекты |
| ANOMALIES | suggested_project_id | Для исправления |
| class_override в TRANSFERS | Значение | Для ручной классификации |
| memo в TRANSFERS | Значение | Для ручного заполнения |

### ❌ Нельзя править

| Лист | Почему |
|------|--------|
| TRANSFERS (кроме class_override, memo) | Append-only, дедупликация сломается |
| TRANSFERS_MEMO_QUEUE | Автоматическая очередь |
| CLICKUP_SCHEMA | Полностью перезаписывается |
| CLICKUP_TASKS | Инкрементальная синхронизация, курсор в G |
| FACT_MONTHLY | Snapshot overwrite |
| KPI_RAW | Snapshot overwrite |
| DEBUG_LOG | Логи |

### ⚠️ Осторожно

| Лист | Риск |
|------|------|
| RESIDENTS | Перестановка колонок B, Q, R → неправильный маппинг |
| TRANSFERS | Перестановка J, O → потеря дедупликации |
| CLICKUP_TASKS | Перестановка G → потеря курсора |

---

## Инциденты и восстановление

### Потерянные транзакции

**Симптомы:**
- В TRANSFERS нет новых данных
- DEBUG_LOG показывает `rows_fetched: 0`

**Диагностика:**
1. Проверьте START_DATE/END_DATE в CONST
2. Проверьте HORIZON_URL
3. Проверьте фильтры: TOKEN_FILTER, COUNTERPARTY_SCOPE

**Восстановление:**
1. [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78)
2. Проверьте диапазон дат
3. Запустите [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)

### Дублирующиеся транзакции

**Симптомы:**
- В TRANSFERS одинаковые tx_hash:op_id

**Причина:**
- Нарушена структура колонок J (tx_hash) или O (op_id)

**Восстановление:**
1. Проверьте структуру TRANSFERS
2. Восстановите из резервной копии
3. [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78)
4. Перезапустите [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)

### Не загружаются memo

**Симптомы:**
- TRANSFERS_MEMO_QUEUE не уменьшается
- Колонка memo пустая

**Диагностика:**
1. Проверьте HORIZON_URL
2. Проверьте доступность Horizon API

**Восстановление:**
1. Дождитесь восстановления Horizon
2. Запустите [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621) несколько раз

### ClickUp не синхронизируется

**Симптомы:**
- CLICKUP_TASKS пустой
- Ошибки в DEBUG_LOG

**Диагностика:**
1. Проверьте CLICKUP_API_KEY в CONST
2. Проверьте CLICKUP_WORKSPACE_ID
3. Проверьте CLICKUP_LIST_IDS

**Восстановление:**
1. Исправьте ключи в CONST
2. Запустите [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599)
3. Запустите [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754)

### Сломался маппинг project_id

**Симптомы:**
- Много UNMAPPED в TRANSFERS
- ANOMALIES заполняется

**Диагностика:**
1. Проверьте RESIDENTS (колонки B, Q, R)
2. Проверьте PROJECT_MAP

**Восстановление:**
1. Заполните PROJECT_MAP
2. Запустите [`remappingProjectIds()`](clasp/Резиденты%20Мабиз.js:1072)

### Полная потеря данных

**Восстановление:**
1. Создайте новую таблицу
2. Выполните процедуру [Запуск новой таблицы](#запуск-новой-таблицы)
3. Восстановите RESIDENTS из резервной копии
4. [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78)
5. Перезапустите [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)

---

## Связанные документы

- [Настройка и конфигурация](ADMIN_SETUP_AND_CONFIG.md) — конфигурация через CONST
- [Структура листов и контракты данных](ADMIN_SHEETS_AND_DATA_CONTRACT.md) — подробная документация по листам
- [Пользовательское меню](USER_MENU.md) — описание пунктов меню