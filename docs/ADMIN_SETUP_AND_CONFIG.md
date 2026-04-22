# Администрирование и конфигурация

Документ содержит техническую информацию для администраторов таблицы: настройка, конфигурация, безопасность и типовые проблемы.

## Назначение администрирования

Администратор таблицы отвечает за:
- Первичную настройку структуры таблицы и листов
- Конфигурацию через лист `CONST`
- Мониторинг синхронизации Stellar и ClickUp
- Обработку аномалий и проблемных транзакций
- Обновление структуры листов при изменении кода
- Безопасность хранения токенов и ключей

## Обязательные листы и минимальная структура

Для работы скрипта требуются следующие листы:

| Лист | Назначение | Создание |
|------|------------|----------|
| `CONST` | Конфигурация ключ-значение | Вручную или через [`initializeNewSheets()`](clasp/Резиденты%20Мабиз.js:2540) |
| `RESIDENTS` | Список резидентов с проектами | Вручную (базовая структура) |
| `TRANSFERS` | Синхронизированные переводы Stellar | Автоматически при первом запуске [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) |
| `TRANSFERS_MEMO_QUEUE` | Очередь для догрузки memo | Автоматически |
| `ACCOUNTS` | Метки аккаунтов | Опционально |
| `CLICKUP_SCHEMA` | Схема ClickUp | [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599) |
| `CLICKUP_TASKS` | Синхронизированные задачи | [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754) |
| `PROJECT_MAP` | Маппинг проектов | [`initializeProjectMap()`](clasp/Резиденты%20Мабиз.js:2217) |
| `ANOMALIES` | Аномалии маппинга | [`initializeAnomalies()`](clasp/Резиденты%20Мабиз.js:2231) |
| `FACT_MONTHLY` | Агрегаты по месяцам | [`buildFactMonthly()`](clasp/Резиденты%20Мабиз.js:2276) |
| `KPI_RAW` | Метрики KPI | [`buildKpiRaw()`](clasp/Резиденты%20Мабиз.js:2406) |
| `ACCOUNTS_META` | Snapshot метаданных аккаунтов (пороги, created_by/created_at) | [`syncAccountsMeta()`](clasp/Резиденты%20Мабиз.js) |
| `ACCOUNT_SIGNERS` | Snapshot подписантов аккаунтов | [`syncAccountsMeta()`](clasp/Резиденты%20Мабиз.js) |
| `DEBUG_LOG` | Логи выполнения | Автоматически |

## Лист CONST: полная документация

Лист `CONST` — главный конфигурационный контракт между таблицей и скриптом. Парсится через [`parseConstSheet()`](clasp/Резиденты%20Мабиз.js:700).

### Формат листа

| Колонка A | Колонка B |
|-----------|-----------|
| Ключ | Значение |

### Обязательные ключи

#### Stellar

| Ключ | Назначение | Ожидаемое значение | Влияние на функции | Что ломается при ошибке |
|------|------------|---------------------|--------------------|------------------------|
| `HORIZON_URL` | URL Horizon API | Полный URL, например `https://archive.stellar.validationcloud.io/v1/...` | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149), [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621) | Все запросы к Stellar завершаются ошибкой |
| `START_DATE` | Начало периода | `YYYY-MM-DD` | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) | Загружаются все транзакции или ошибка диапазона |
| `END_DATE` | Конец периода | `YYYY-MM-DD` | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) | Загружаются все транзакции или ошибка диапазона |
| `MABIZ_MAIN` | Основной фонд | Stellar адрес (начинается с G) | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) | Фонд не отслеживается |
| `MABIZ_DEFAULT` | Фонд по умолчанию | Stellar адрес | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) | Фонд не отслеживается |
| `MFBOND` | Фонд облигаций | Stellar адрес | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149), [`buildFactMonthly()`](clasp/Резиденты%20Мабиз.js:2276) | Фонд не отслеживается, неправильный `is_pif` |
| `MABIZ_SETTLEMENT` | Расчётный фонд | Stellar адрес | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) | Фонд не отслеживается |

#### ClickUp

| Ключ | Назначение | Ожидаемое значение | Влияние на функции | Что ломается при ошибке |
|------|------------|---------------------|--------------------|------------------------|
| `CLICKUP_API_KEY` | API токен | Токен из ClickUp | [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599), [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754) | Все запросы к ClickUp завершаются ошибкой 401 |
| `CLICKUP_WORKSPACE_ID` | ID workspace | Числовой ID | [`clickupInventory()`](clasp/Резиденты%20Мабиз.js:1599) | Не загружается структура workspace |
| `CLICKUP_LIST_IDS` | Списки для мониторинга | ID через запятую | [`syncClickUpTasks()`](clasp/Резиденты%20Мабиз.js:1754) | Ошибка `CLICKUP_LIST_IDS не заданы` |

### Опциональные ключи

#### Stellar (фильтрация)

| Ключ | Назначение | Значение по умолчанию | Влияние |
|------|------------|----------------------|---------|
| `TOKEN_FILTER` | Фильтр по активу | нет | Учитывается в [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) |
| `COUNTERPARTY_SCOPE` | Область контрагентов | `FUND_RESIDENT_ONLY` | Определяет `counterparty_type` |
| `include_native_xlm` | Включить XLM | `false` | Нативные переводы |
| `asset_allowlist` | Разрешённые активы | пусто | Белый список |
| `asset_blocklist` | Запрещённые активы | пусто | Чёрный список |
| `min_amount` | Минимальная сумма | `0.01` | Фильтр по сумме |
| `RELAX_ROLE_FILTER` | Ослабить фильтры | `false` | Менее строгие проверки |
| `EXPLORER_TX_URL` | Базовый URL обозревателя для ссылок tx | вычисляется из `HORIZON_URL` | Используется в [`updateAccountCreationDetails()`](clasp/Резиденты%20Мабиз.js) |

#### ClickUp

| Ключ | Назначение | Значение по умолчанию |
|------|------------|----------------------|
| `PROJECT_ID_REGEX` | Regex для project_id | `/\bP?\d{3,6}\b/` |

### Динамические ключи (автоуправляемые)

| Ключ | Назначение | Управление |
|------|------------|------------|
| `cursor_payments_<fundKey>` | Курсор для инкрементальной синхронизации | Автоматически через [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149) |

**Важно**: Курсоры хранятся в User Properties, а не в листе CONST. Сброс курсоров выполняется через [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78).

## Источники конфигурации: разделение

### Параметры из таблицы (CONST)

Все ключи из листа `CONST` парсятся через [`parseConstSheet()`](clasp/Резиденты%20Мабиз.js:700):
- HORIZON_URL, START_DATE, END_DATE
- Адреса фондов (MABIZ_MAIN, MFBOND, etc.)
- CLICKUP_API_KEY, CLICKUP_WORKSPACE_ID, CLICKUP_LIST_IDS
- Фильтры: TOKEN_FILTER, COUNTERPARTY_SCOPE, min_amount

### Жёстко зашитые константы (hardcoded)

Следующие константы **не читаются из CONST** и не могут быть изменены без правки кода:

| Константа | Значение | Назначение |
|-----------|----------|------------|
| [`MEMO_PATTERNS_REPAY`](clasp/Резиденты%20Мабиз.js:31) | `repay\|return\|погаш\|возврат\|refund` | Паттерны для классификации Repayment |
| [`MEMO_PATTERNS_DIVIDEND`](clasp/Резиденты%20Мабиз.js:32) | `dividend\|дивиденд\|profit\|прибыль` | Паттерны для классификации Dividend |
| [`MEMO_PATTERNS_OPEX`](clasp/Резиденты%20Мабиз.js:33) | `opex\|опекс\|fee\|комиссия` | Паттерны для классификации Opex |
| [`CLASSIFY_ENABLE`](clasp/Резиденты%20Мабиз.js:34) | `true` | Включение классификации |
| [`PROJECT_ID_REGEX`](clasp/Резиденты%20Мабиз.js:30) | `null` (дефолт `/\bP?\d{3,6}\b/`) | Regex для поиска project_id в memo |
| [`MAX_MEMO_FETCH_PER_RUN`](clasp/Резиденты%20Мабиз.js:22) | `300` | Лимит memo за запуск |
| [`MEMO_CACHE_TTL`](clasp/Резиденты%20Мабиз.js:21) | `21600` (6 часов) | TTL кэша memo |

> **Расхождение с README**: В [`README.md`](README.md:54) указано, что `MEMO_PATTERNS_*` и `CLASSIFY_ENABLE` задаются в CONST. Это **неверно** — они являются hardcoded константами в коде. Для изменения требуется правка кода.

### Скрытое состояние (User Properties / Cache)

| Хранилище | Данные | Управление |
|-----------|--------|------------|
| User Properties | Курсоры `cursor_payments_*` | [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149), [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78) |
| Script Cache | Memo для транзакций (ключ `memo:<hash>`) | [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js:621), TTL 6 часов |

## Первичная настройка

### Шаг 1: Создание структуры листов

1. Откройте Google Sheets
2. В меню **Stellar** → **Инициализировать новые листы** → [`initializeNewSheets()`](clasp/Резиденты%20Мабиз.js:2540)
3. Будет создано: `CLICKUP_SCHEMA`, `CLICKUP_TASKS`, `PROJECT_MAP`, `ANOMALIES`, `FACT_MONTHLY`, `KPI_RAW`

### Шаг 2: Заполнение CONST

Создайте лист `CONST` вручную со следующими обязательными ключами:

```
HORIZON_URL | https://archive.stellar.validationcloud.io/v1/...
START_DATE | 2024-01-01
END_DATE | 2024-12-31
MABIZ_MAIN | G...
MABIZ_DEFAULT | G...
MFBOND | G...
MABIZ_SETTLEMENT | G...
CLICKUP_API_KEY | ...
CLICKUP_WORKSPACE_ID | ...
CLICKUP_LIST_IDS | 12345,67890
```

### Шаг 3: Проверка конфигурации

1. Запустите **Обновить переводы** → [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js:149)
2. Проверьте `DEBUG_LOG` на наличие ошибок
3. Убедитесь, что данные появились в `TRANSFERS`

### Шаг 4: Синхронизация account metadata (опционально, но рекомендуется)

1. Подготовьте лист `ACCOUNTS` c колонками `account`, `label` (или эквивалентом в первых двух колонках).
2. Запустите [`updateAccountCreationDetails()`](clasp/Резиденты%20Мабиз.js) для заполнения `created_by`/`created_at` в `ACCOUNTS`.
3. Запустите [`syncAccountsMeta()`](clasp/Резиденты%20Мабиз.js) для построения `ACCOUNTS_META` и `ACCOUNT_SIGNERS`.

## Явный operational flow для Resident Tracking

RT-витрины **не являются самостоятельным источником данных**. Их upstream — только [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js).

Рекомендуемая последовательность полного обновления:
1. [`syncStellarTransfers()`](clasp/Резиденты%20Мабиз.js)
2. [`syncTransfersMemos()`](clasp/Резиденты%20Мабиз.js)
3. [`remappingProjectIds()`](clasp/Резиденты%20Мабиз.js)
4. [`reclassifyTransfers()`](clasp/Резиденты%20Мабиз.js)
5. [`syncResidentTracking()`](clasp/Резиденты%20Мабиз.js)
6. [`buildResidentTimeline()`](clasp/Резиденты%20Мабиз.js)
7. [`buildTokenFlows()`](clasp/Резиденты%20Мабиз.js)
8. [`buildIssuerStructure()`](clasp/Резиденты%20Мабиз.js)

Если пропустить шаг 5, витрины `RESIDENT_TIMELINE`/`TOKEN_FLOWS`/`ISSUER_STRUCTURE` могут отражать устаревший или пустой state.

## Проверка конфигурации

### Быстрая диагностика

1. Проверьте наличие всех обязательных ключей в CONST
2. Проверьте `DEBUG_LOG` на наличие записей stage: `syncStellarTransfers`
3. Проверьте `TRANSFERS` на наличие новых строк

### Типовые ошибки конфигурации

| Ошибка | Причина | Решение |
|--------|---------|---------|
| "HORIZON_URL не задан" | Ключ отсутствует в CONST | Добавьте ключ в CONST |
| "CLICKUP_LIST_IDS не заданы" | Пустой или отсутствует ключ | Заполните `CLICKUP_LIST_IDS` |
| Курсоры не сбрасываются | Курсоры в User Properties | Используйте [`resetAllCursors()`](clasp/Резиденты%20Мабиз.js:78) |
| Пустой TRANSFERS | Неправильные даты START_DATE/END_DATE | Проверьте формат `YYYY-MM-DD` |
| Нет memo | Очередь не обработана | Запустите **Догрузить memo** несколько раз |

## Безопасность

### Чувствительные данные (НЕ публиковать)

Следующие значения **не должны попадать** в публичный доступ:

| Данные | Где хранится | Риск при утечке |
|--------|--------------|-----------------|
| `CLICKUP_API_KEY` | CONST | Полный доступ к ClickUp workspace |
| `HORIZON_URL` | CONST | Может содержать API ключ в URL |
| Адреса фондов | CONST | Раскрытие структуры фондов |
| `CLICKUP_WORKSPACE_ID` | CONST | Идентификатор workspace |

### Рекомендации

1. **Не коммитьте** значения CONST в репозиторий
2. **Не экспортируйте** лист CONST в публичные файлы
3. **Используйте** минимальные права для ClickUp API ключа
4. **Регулярно обновляйте** токены ClickUp
5. **Проверяйте** DEBUG_LOG на наличие чувствительных данных в логах

### Что может попасть в логи

- tx_hash транзакций (не содержит приватных данных)
- Метрики количества строк
- Стадии выполнения
- Причины фильтрации (например, `roleOk = 0`)

## Апгрейд структуры листов

При изменении кода может потребоваться обновление структуры листов:

1. **Stellar** → **Апгрейд всех листов** → [`upgradeExistingSheets()`](clasp/Резиденты%20Мабиз.js:2602)
2. Функция добавит недостающие колонки в `TRANSFERS` и `RESIDENTS`
3. **Внимание**: Не изменяет порядок существующих колонок

## Связанные документы

- [Пользовательское меню](USER_MENU.md) — описание пунктов меню для пользователей
- [Структура листов и контракты данных](ADMIN_SHEETS_AND_DATA_CONTRACT.md) — подробная документация по каждому листу
- [Операционный runbook](ADMIN_RUNBOOK.md) — сценарии для администраторов
