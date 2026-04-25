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

Функция может создавать/обновлять строки в листах:

- `MAYMUN_EVENTS` (append событий, включая transfer-backed события).
- `MAYMUN_DECISIONS` (upsert manual review decision).
- `MAYMUN_ALLOCATIONS` (upsert allocation).
- `MAYMUN_EXPENSES` (append expense).
- `MAYMUN_RUNWAY` (append runway snapshot).

Идемпотентность transfer-backed событий: дедуп по `tx_hash + op_id`.

Дополнительно для ручной цепочки allocation/runway:

- `runMaymunAssetLayerCreateAllocationFromSelectedDecision()`:
  - пишет только при `decision_status=approved` и `owner_go_status=approved`;
  - использует `upsertMaymunAllocation()` с ключом `decision_id + bucket + allocation_type`;
  - маппинг MVP: `bucket=runway`, `allocation_status=confirmed`;
  - `allocation_type` определяется приоритетно по связанному `MAYMUN_EVENTS` (`dividend_received`/`funding_received`/`direction=in` -> `planned_inflow`), иначе fallback по `decision_type`;
  - при пустых `approved_by`/`approved_at` пишется warning в `DEBUG_LOG` (`allocation_from_decision.approval_audit_missing`).
  - если для того же `decision_id + bucket` уже есть allocation с противоположным `allocation_type`, запись блокируется (`allocation_blocked_conflicting_allocation_type`) до ручного разрешения.
- `runMaymunAssetLayerCreateRunwaySnapshot()`:
  - запускать только с активного листа `MAYMUN_ALLOCATIONS` и выбранной ровно одной data-row;
  - выбранная allocation должна быть `allocation_status=confirmed`;
  - `asset_code` scope берётся из выбранной allocation;
  - агрегирует только подтверждённые строки (`allocation_status=confirmed`, `expense_status in (paid, confirmed)`) в выбранном `asset_code`;
  - создаёт append-only запись в `MAYMUN_RUNWAY`;
  - считает `net_confirmed_runway` и `forecast_runway`;
  - блокирует duplicate snapshot при совпадении `asset_code` + нормализованного `source_allocation_ids` (stage `runway_snapshot.duplicate_blocked`, append не выполняется);
  - заполняет legacy alias fields: `snapshot_date` (из `snapshot_at`), `confirmed_liquidity=confirmed_balance`, `pending_liquidity=0`, `liquidatable_assets_value=confirmed_balance`, `status=manual_snapshot`, `comment=Manual runway snapshot for selected allocation asset scope`;
  - `monthly_burn`, `runway_days`, `self_sufficiency_ratio` остаются пустыми (нет burn/model в MVP), `top_risk` = `manual_review_required` только при наличии ignored pending/manual_review rows, иначе пусто.

## Пошаговый запуск (Apps Script UI)

1. Откройте таблицу и дождитесь меню `Stellar`.
2. При необходимости выполните `MAYMUN: Dry-run init/check листов`.
3. Запустите `MAYMUN: Owner-approved manual write profile`.
4. Для цепочки после фиксации transfer выполните:
   - `MAYMUN: Create allocation from selected DECISION` (на выбранной строке листа `MAYMUN_DECISIONS`);
   - `MAYMUN: Create runway snapshot` (на выбранной строке листа `MAYMUN_ALLOCATIONS`).

Правило блокера для selected TRANSFER:

- Если `project_id` неразрешён (`UNMAPPED`, `UNKNOWN`, пусто и аналоги), событие записывается только как `event_status=manual_review` и `confidence=low`.
- Для такого события обязательно создаётся `MAYMUN_DECISIONS` с `decision_status=pending_approval`, `owner_go_status=pending`, `reason=project_mapping_required`.
- `IN + Dividend` не даёт auto-confirmed путь при неразрешённом `project_id`: сначала нужен ручной mapping на проект из `RESIDENTS`.
5. Проверьте `DEBUG_LOG` по `run_id` текущего запуска.

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
