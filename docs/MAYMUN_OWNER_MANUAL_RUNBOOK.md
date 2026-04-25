# MAYMUN owner-approved manual write profile runbook

Документ фиксирует безопасный ручной запуск фактической записи в `MAYMUN_*` по варианту B.

## Статус и ограничения

- PR: Draft.
- Merge status: HOLD.
- No cron.
- No live ClickUp/Telegram projection.
- No unattended CLI automation (`clasp run` не используется).
- No runtime / credentials / provider wiring changes.

## Single source of truth: safe run profile

### Профиль A (default safe)

- Функции MAYMUN вызываются в dry-run.
- `normalizeOptions_` принудительно оставляет `dryRun=true` для обычных вызовов.

### Профиль B (owner-approved manual write)

- Отдельный ручной entrypoint: `runMaymunAssetLayerOwnerApprovedWrite(options)`.
- Допускается только в контексте Apps Script UI/manual operator.
- Не подключается к `initializeNewSheets()` / `upgradeExistingSheets()`.
- Не подключается к cron и unattended path.

## Что пишет owner-approved профиль

### Профиль B.1: Owner-approved manual write (демонстрационный payload)

Функция `runMaymunAssetLayerOwnerApprovedWrite()` может создавать/обновлять строки в листах:

- `MAYMUN_EVENTS` (append событий, включая transfer-backed события).
- `MAYMUN_DECISIONS` (upsert manual review decision).
- `MAYMUN_ALLOCATIONS` (upsert allocation).
- `MAYMUN_EXPENSES` (append expense).
- `MAYMUN_RUNWAY` (append runway snapshot).

Идемпотентность transfer-backed событий: дедуп по `tx_hash + op_id`.

### Профиль B.2: Write selected TRANSFER (реальные данные из выбранной строки)

Функция `runMaymunAssetLayerWriteSelectedTransfer()` позволяет оператору:

1. Выбрать одну строку в листе `TRANSFERS`.
2. Запустить меню `MAYMUN: Write selected TRANSFER`.
3. Система автоматически:
   - Читает реальные значения из выбранной строки.
   - Создаёт `MAYMUN_EVENT` с правильным `event_type` по `direction/class`.
   - При необходимости создаёт `MAYMUN_DECISION` для `manual_review` кейсов.
   - Выполняет dedup по `tx_hash + op_id`.
   - Возвращает результат оператору через alert и `DEBUG_LOG`.

Поддерживаемые event_type правила MVP:
- `direction=IN, class=Dividend` → `event_type=dividend_received`, `event_status=confirmed`, `confidence=high`
- `direction=IN, class=Funding` → `event_type=funding_received`, `event_status=manual_review`, `confidence=medium`
- `direction=OUT` → `event_type=outgoing_transfer`, `event_status=manual_review`, `confidence=medium`
- Иначе → `event_type=transfer_detected`, `event_status=manual_review`, `confidence=low`

## Пошаговый запуск (Apps Script UI)

1. Откройте таблицу и дождитесь меню `Stellar`.
2. При необходимости выполните `MAYMUN: Dry-run init/check листов`.
3. Запустите `MAYMUN: Owner-approved manual write profile`.
4. Проверьте `DEBUG_LOG` по `run_id` текущего запуска.

## Precheck (обязательный)

Перед фактической записью выполняются:

- row counts по всем `MAYMUN_*` до запуска;
- наличие листов;
- проверка заголовков;
- dry-run preview того же payload;
- подтверждение, что запуск из отдельного manual entrypoint.

При провале precheck запись не выполняется.

## Postcheck (обязательный)

После записи фиксируются:

- row deltas;
- количество строк в `DEBUG_LOG` по `run_id`;
- список add/update действий;
- repeat/dedup check (повтор append transfer-backed события должен вернуть `duplicate_skipped`).

## Owner marker

В `DEBUG_LOG` пишется явный owner marker:

- stage: `runMaymunAssetLayerOwnerApprovedWrite.owner_marker`
- fund_key: `OWNER_GO`
- details: owner GO marker string

## Почему нельзя вызывать unattended

- Функция валидирует UI/manual context.
- По контракту безопасности path предназначен только для ручного оператора.
- Не интегрируется в cron, `clasp run`, init/upgrade entrypoints.

## Rollback

Если запись выполнена ошибочно:

1. Найдите `run_id` проблемного запуска в `DEBUG_LOG`.
2. Для каждого `MAYMUN_*` листа отфильтруйте строки, добавленные/изменённые этим запуском:
   - по ключам из postcheck (`event_id`, `decision_id`, `allocation_id`, `expense_id`, `snapshot_id`);
   - по `created_by` и временным меткам запуска.
3. Удалите ошибочные строки вручную в UI (или откатите значения при update).
4. Повторно выполните dry-run профиль для валидации.
5. Зафиксируйте rollback-результат в `DEBUG_LOG` отдельной записью оператора.

## Reviewer packet checklist

Перед owner review вернуть:

1. Список новых/изменённых функций.
2. Почему вызов невозможен unattended.
3. Какие строки в `MAYMUN_*` могут быть созданы/изменены.
4. Как устроены precheck/postcheck.
5. Как подтверждается dedup `tx_hash + op_id`.
6. Как выполнить rollback.
7. Результат теста в safe Apps Script UI context.
8. Подтверждение, что cron/live projection/runtime/credentials не менялись.
