# ТЗ: Orchestrator MABIZ Sheets (Apps Script) — ClickUp + Stellar

## 1) Цели (Definition of Done)

**DoD-1.** Скрипт даёт *полную инвентаризацию* того, что реально есть в ClickUp и в блокчейне (какие поля/статусы/списки, какие активы/эмитенты/контрагенты/мемо-паттерны).
**DoD-2.** Транзакции больше не “рисуются нулями”: формируются **Funding / Dividend / Repayment / WriteOff** (как в годовом отчёте) на основе фактических переводов + правил классификации. 
**DoD-3.** В RESIDENTS появляется управляемость: куратор/кейс-статус/следующий шаг/дедлайн, и авто-проверка платёжной дисциплины по Next_Payment_Due.
**DoD-4.** План-факт и KPI собираются ежемесячно автоматически, как требует бюджетный цикл. 

---

## 2) Источники данных и “канонические справочники”

### 2.1 Stellar accounts (CONST)

Жёстко прописать (и валидировать на старте):

* `MABIZ_MAIN = GAQ5...MABIZ`
* `MABIZ_DEFAULT = GCI7...MTLD`
* `MFBOND = GCKC...MFB`
* `MABIZ_SETTLEMENT = GCJY...MBG`
  Источник: Положение. 

### 2.2 ClickUp

Оркестратор должен уметь работать в двух режимах:

* **Inventory mode (обязателен)**: получить Spaces/Folders/Lists + statuses + custom fields (название, тип, id, допустимые значения), и выгрузить в лист `CLICKUP_SCHEMA`.
* **Sync mode**: тянуть задачи/проекты, маппить к `Project_ID` и писать в `CLICKUP_TASKS`.

**Ключевое требование:** в ClickUp должен быть единый идентификатор `Project_ID` (лучше custom field). Если нет — оркестратор должен построить **таблицу неоднозначностей** (по имени/тикеру/issuer) и требовать ручной привязки.

---

## 3) Листы и структура (что именно добавить/поменять)

### 3.1 Новые листы

1. `CLICKUP_SCHEMA` — инвентаризация ClickUp (списки/поля/статусы).
2. `CLICKUP_TASKS` — raw выгрузка задач (id, name, status, assignee, due, updated, + нужные custom fields).
3. `PROJECT_MAP` — вручную/полуавто таблица соответствия: `Project_ID ↔ clickup_task_id ↔ issuer/account ↔ token`.
4. `ANOMALIES` — проблемы маппинга транзакций и проектов (AMBIGUOUS/UNMAPPED).
5. `FACT_MONTHLY` — агрегаты по месяцам: Funding/Dividend/Repayment/WriteOff/OPEX (+ отдельно ПИФ-часть).

### 3.2 Расширить существующие

**TRANSFERS**: добавить колонки:

* `fund_account_key` (каким аккаунтом собрали)
* `asset_code`, `asset_issuer`, `asset_full=CODE:ISSUER|XLM`
* `op_id/paging_token`
* `direction` (IN/OUT относительно fund_account)
* `counterparty_type` (RESIDENT / FUND / EXTERNAL / UNKNOWN)
* `project_id` (или AMBIGUOUS/UNMAPPED)
* `class` (Funding/Dividend/Repayment/WriteOff/Fee/OPEX/Unknown)
* `class_override` (ручное исправление)
* `tags` (например `D` для дефолт-контура)

**RESIDENTS**: добавить управленческие колонки:

* `Curator`
* `Case_Status` (OK/WATCH/DEFAULT/EXIT + “PREDEFAULT”)
* `Next_Action`, `Next_Action_Due`
* `Next_Payment_Due` (если пусто — оркестратор должен подсветить как “нет графика”)
* `Last_Payment_Date`, `Last_Payment_Amount`
* `Outstanding_EUR` (если известно)

---

## 4) Доработка получения транзакций (Stellar)

### 4.1 Главный принцип: append-only + дедупликация

Сейчас типовая ошибка таких скриптов — **очистка листа TRANSFERS** и перезапись. Запретить.

**Требование:**

* `TRANSFERS` только дополняется,
* дедуп по ключу `tx_hash + op_id` (или `op_id` если уникален),
* курсоры хранятся в `CONST` по каждому fund_account отдельно.

### 4.2 Фильтры (то, что ты просил “какие фильтры”)

Сделать конфиг в `CONST`:

**Фильтр по сторонам (counterparty scope):**

* `FUND_RESIDENT_ONLY` (основной для отчётности MABIZ)
* `FUND_FUND` (внутренние перемещения MABIZ/MFBond/Default)
* `RESIDENT_RESIDENT` (обычно выключено, но полезно для расследований)
* `ALL_RELEVANT`

**Фильтр по активам:**

* `include_native_xlm` (обычно false)
* `asset_allowlist` (опционально)
* `asset_blocklist` (обязателен, если есть шум)

**Фильтр по суммам:**

* `min_amount` (в русской локали всё равно хранить числом, а формат — отображением)

### 4.3 Маппинг транзакций к проекту

Алгоритм (строгий, чтобы потом автоматизировать KPI и дефолты):

1. если `from` или `to` входит в `RESIDENTS.Account_s` → `project_id` найден
2. иначе если `asset_issuer` совпал с `RESIDENTS.Asset_issuer` → `project_id` найден
3. иначе если memo содержит `Project_ID` (паттерн) → `project_id` найден
4. иначе → `UNMAPPED` и запись в `ANOMALIES` (с подсказкой, что совпало частично)

Если совпало >1 — `AMBIGUOUS` + список кандидатов.

### 4.4 Классификация Funding/Dividend/Repayment/WriteOff

Классы должны быть совместимы с годовым отчётом 2025 (именно эти категории). 

Правила (минимальный набор, расширяемый):

* OUT из fund_account → чаще **Funding** (если контрагент = RESIDENT)
* IN в fund_account от RESIDENT → чаще **Dividend** или **Repayment**
* Repayment различать через:

  * memo-паттерны (“repay/return/погаш/возврат”)
  * или отдельный справочник `MEMO_RULES`
* WriteOff: только если есть явное событие (ручной override или отдельная операция/протокол)

**Важно:** `class_override` всегда имеет приоритет над авто-классом.

### 4.5 Дефолт-контур в данных

Оркестратор обязан:

* помечать токены/проекты, у которых активы переведены/учтены на `MABIZ_DEFAULT` (тег `D`),
* поддерживать статус “S9 / DEFAULT” в соответствии с акселераторным регламентом (S9) и регламентом дефолтов. 

---

## 5) ClickUp: “полное инфо” и синхронизация

### 5.1 Inventory mode (обязателен)

Функция `clickupInventory()` выгружает:

* Space/Folder/List дерево
* статусы по листам
* custom fields (id, name, type, options)
* пользователей/assignees (минимум id+name)

Пишет в `CLICKUP_SCHEMA` и лог.

### 5.2 Sync mode

`syncClickUpTasks()`:

* тянет задачи из заданных Lists,
* пишет/апдейтит `CLICKUP_TASKS`,
* по `PROJECT_MAP` обновляет в RESIDENTS поля:

  * `Curator`, `Next_Action`, `Next_Action_Due`, `Next_Payment_Due`, `Work_Status/Notes`, `Folder_Link`.

---

## 6) План-факт и KPI (чтобы из этого реально делать план 2026)

### 6.1 FACT_MONTHLY

Ежемесячная агрегировка:

* Funding / Dividend / Repayment / WriteOff
* OPEX (если ввести справочник “OPEX контрагенты/кошельки/мемо-паттерны”)
* отдельно: PIF-операции (MFBond) — как требует бюджетный регламент (раздельный учёт). 

### 6.2 KPI-слои (под твою рамку KPI_4_Слоя)

Оркестратор не “думает KPI”, он даёт *сырые метрики*:

* **Проектный слой**: количество проектов по стадиям S0–S9 (из ClickUp + RESIDENTS.Code_Status). 
* **Договорённости/ответственность**: доля проектов с заполненными: Curator, Offer_Status, Next_Payment_Due, Next_Action_Due; просрочки.
* **Репутация/экосистема**: кол-во проектов с публичными апдейтами (если есть поле/задача “Monthly update published”).
* **Экономическая устойчивость**: funding vs dividend vs repayment по месяцам + концентрация по топ-эмитентам.

---

## 7) Диагностика (чтобы не было “0 строк” молча)

Расширить `DEBUG_LOG`:

* `run_id`, `module` (stellar/clickup/aggregate)
* `cursor_before/after` по каждому fund_account
* `api_calls`, `rows_fetched`, `rows_appended`, `dedup_skipped`
* `unmapped_count`, `ambiguous_count`
* `classified_counts` по классам
* `errors` с stacktrace

---

## 8) Приоритет внедрения (чтобы быстро далось в руки)

**P0 (must):** append-only TRANSFERS + дедуп + cursor per account; Inventory ClickUp; PROJECT_MAP; ANOMALIES; FACT_MONTHLY.
**P1:** авто-маппинг project_id (issuer/account/memo); классификация + override; обновление RESIDENTS (last/next payment).
**P2:** richer баланс (effects), OPEX-справочник, двусторонний sync с ClickUp.

---

Запроси в момент необходимости выполнить и проверить:

1. **ClickUp API token** + список List IDs (или Space/Folder IDs) где живут резиденты/кейсы.
2. Решение: где лежит “истина” по `Project_ID` (лучше custom field в ClickUp).
3. Явный список “фондовых” аккаунтов (берём из Положения, но если есть ещё — дописать). 
4. Справочник мемо-паттернов (минимум 10–20 строк) для Dividend/Repayment/OPEX — иначе классификация будет “грязной”.
