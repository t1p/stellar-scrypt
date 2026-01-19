#!/usr/bin/env zsh
# build_tags_tx.zsh - Генератор XDR для Stellar manage_data транзакций
# Создает транзакцию с N2*N3 операциями manage_data для тегирования адресов

# Загрузка утилит
source "$(dirname "$0")/utils.zsh"

# Глобальные переменные
if [[ -z "$PROJECT_DIR" ]]; then
    SCRIPT_DIR="$(dirname "$0")"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
else
    SCRIPT_DIR="$PROJECT_DIR/src"
fi
CONFIG_DIR="$PROJECT_DIR/config"
OUT_DIR="$PROJECT_DIR/out"
LOGS_DIR="$OUT_DIR/logs"

# Создание директорий, если не существуют
mkdir -p "$LOGS_DIR"

# Файлы
P2_FILE="$CONFIG_DIR/p2.txt"
P3_FILE="$CONFIG_DIR/p3.txt"
CONFIG_FILE="$CONFIG_DIR/config.env"
TX_XDR="$OUT_DIR/tx.xdr"
TX_DEBUG_JSON="$OUT_DIR/tx.debug.json"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOGS_DIR/run_${TIMESTAMP}.log"

# Функция для загрузки конфигурации
function load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_message "ERROR" "Файл конфигурации не найден: $CONFIG_FILE" "$LOG_FILE"
        exit 1
    fi
    source "$CONFIG_FILE"
    log_message "INFO" "Конфигурация загружена из $CONFIG_FILE" "$LOG_FILE"
}

# Функция для чтения списка адресов из файла
function read_addresses() {
    local file="$1"
    local -a addresses
    if [[ ! -f "$file" ]]; then
        log_message "ERROR" "Файл не найден: $file" "$LOG_FILE"
        exit 1
    fi
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Пропустить пустые строки и комментарии
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        addresses+=("$line")
    done < "$file"
    echo "${addresses[@]}"
}

# Функция валидации всех адресов
function validate_all_addresses() {
    local -a p2_addresses=("$@")
    local p2_count=${#p2_addresses[@]}
    local -a p3_addresses
    p3_addresses=($(read_addresses "$P3_FILE"))
    local p3_count=${#p3_addresses[@]}

    log_message "INFO" "Валидация $p2_count адресов из p2 и $p3_count из p3" "$LOG_FILE" >&2

    for addr in "${p2_addresses[@]}"; do
        if ! validate_address "$addr"; then
            log_message "ERROR" "Некорректный адрес в p2: $addr" "$LOG_FILE" >&2
            exit 1
        fi
    done

    for addr in "${p3_addresses[@]}"; do
        if ! validate_address "$addr"; then
            log_message "ERROR" "Некорректный адрес в p3: $addr" "$LOG_FILE" >&2
            exit 1
        fi
    done

    log_message "INFO" "Все адреса валидны" "$LOG_FILE" >&2
    echo "$p2_count $p3_count"
}

# Основная функция
function main() {
    log_message "INFO" "Запуск build_tags_tx.zsh" "$LOG_FILE"

    # Загрузка конфигурации
    load_config

    # Чтение и валидация адресов
    local -a p2_addresses
    p2_addresses=($(read_addresses "$P2_FILE"))
    local validation
    validation=($(validate_all_addresses "${p2_addresses[@]}"))
    local n2=${validation[1]}
    local n3=${validation[2]}

    local ops_count=$((n2 * n3))
    log_message "INFO" "Количество операций: $ops_count (N2=$n2, N3=$n3)" "$LOG_FILE"

    # Определение TX_SOURCE
    if [[ ${#p2_addresses[@]} -ge 3 ]]; then
        TX_SOURCE="${p2_addresses[3]}"  # Третий адрес (zsh: 1-based)
    else
        TX_SOURCE="${p2_addresses[1]}"
    fi
    log_message "INFO" "TX_SOURCE: $TX_SOURCE" "$LOG_FILE"

    # Расчет комиссии
    local min_fee=$((BASE_FEE * ops_count))
    local configured_fee=${MAX_FEE:-$min_fee}
    if [[ $configured_fee -lt $min_fee ]]; then
        configured_fee=$min_fee
    fi
    log_message "INFO" "Комиссия: min_fee=$min_fee, configured_fee=$configured_fee" "$LOG_FILE"

    # Сборка транзакции
    build_transaction "$n2" "$n3" "$configured_fee"

    # Обновление sequence
    update_sequence

    # Декодирование и проверка
    decode_and_verify "$ops_count"

    log_message "INFO" "Генерация завершена успешно" "$LOG_FILE"
}

# Функция сборки транзакции
function build_transaction() {
    local n2="$1"
    local n3="$2"
    local configured_fee="$3"
    
    local -a p2_addresses
    p2_addresses=($(read_addresses "$P2_FILE"))
    local -a p3_addresses
    p3_addresses=($(read_addresses "$P3_FILE"))

    # Найти индекс TX_SOURCE внутри p2 (важно для первой операции, т.к. tx new не принимает --operation-source-account)
    local tx_source_index=0
    for ((k=1; k<=n2; k++)); do
        if [[ "${p2_addresses[$k]}" == "$TX_SOURCE" ]]; then
            tx_source_index=$k
            break
        fi
    done
    if [[ $tx_source_index -eq 0 ]]; then
        log_message "ERROR" "TX_SOURCE ($TX_SOURCE) не найден в p2; невозможно собрать первую операцию корректно" "$LOG_FILE"
        exit 1
    fi

    log_message "INFO" "Начало сборки транзакции" "$LOG_FILE"

    # Первая операция должна соответствовать источнику = TX_SOURCE и j=1
    local i=$tx_source_index
    local j=1
    local src="${p2_addresses[$i]}"
    local target="${p3_addresses[$j]}"
    local data_name="D${j}"
    local data_value_hex=$(to_hex_ascii "$target")

    log_message "INFO" "Первая операция: name=$data_name, value_hex=$data_value_hex, op_source=$TX_SOURCE (index=$tx_source_index)" "$LOG_FILE"

    # Создание транзакции с первой операцией
    stellar tx new manage-data \
        --source-account "$TX_SOURCE" \
        --data-name "$data_name" \
        --data-value "$data_value_hex" \
        --fee "$configured_fee" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE" \
        --build-only \
        > "$TX_XDR" 2>>"$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        log_message "ERROR" "Не удалось создать первую операцию" "$LOG_FILE"
        exit 1
    fi

    # Добавление остальных операций
    for ((ii=1; ii<=n2; ii++)); do
        for ((jj=1; jj<=n3; jj++)); do
            # Пропустить первую операцию (уже добавлена через tx new и имеет op source = TX_SOURCE)
            if [[ $ii -eq $tx_source_index && $jj -eq 1 ]]; then
                continue
            fi

            src="${p2_addresses[$ii]}"
            target="${p3_addresses[$jj]}"
            data_name="D${jj}"
            data_value_hex=$(to_hex_ascii "$target")

            log_message "INFO" "Добавление операции: name=$data_name, value_hex=$data_value_hex, src=$src" "$LOG_FILE"

            # Добавление операции
            stellar tx operation add manage-data \
                --source-account "$TX_SOURCE" \
                --operation-source-account "$src" \
                --data-name "$data_name" \
                --data-value "$data_value_hex" \
                --fee "$configured_fee" \
                --rpc-url "$RPC_URL" \
                --network-passphrase "$NETWORK_PASSPHRASE" \
                --build-only \
                < "$TX_XDR" > "${TX_XDR}.tmp" 2>>"$LOG_FILE"

            if [[ $? -ne 0 ]]; then
                log_message "ERROR" "Не удалось добавить операцию $data_name" "$LOG_FILE"
                exit 1
            fi
            mv "${TX_XDR}.tmp" "$TX_XDR"
        done
    done

    log_message "INFO" "Сборка транзакции завершена" "$LOG_FILE"
}

# Функция обновления sequence
function update_sequence() {
    log_message "INFO" "Обновление sequence number" "$LOG_FILE"
    stellar tx update sequence-number next \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE" \
        < "$TX_XDR" > "${TX_XDR}.tmp" 2>>"$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        log_message "ERROR" "Не удалось обновить sequence" "$LOG_FILE"
        exit 1
    fi
    mv "${TX_XDR}.tmp" "$TX_XDR"
}

# Функция декодирования и проверки
function decode_and_verify() {
    local expected_ops="$1"

    log_message "INFO" "Декодирование транзакции" "$LOG_FILE"
    stellar tx decode \
        < "$TX_XDR" > "$TX_DEBUG_JSON" 2>>"$LOG_FILE"

    if [[ $? -ne 0 ]]; then
        log_message "ERROR" "Не удалось декодировать транзакцию" "$LOG_FILE"
        exit 1
    fi

    # Проверка количества операций
    local ops_count=$(jq '.tx.tx.operations | length' "$TX_DEBUG_JSON")
    if [[ $ops_count -ne $expected_ops ]]; then
        log_message "ERROR" "Количество операций не совпадает: ожидалось $expected_ops, получено $ops_count" "$LOG_FILE"
        exit 1
    fi

    # Проверка sourceAccount
    local tx_source=$(jq -r '.tx.tx.source_account' "$TX_DEBUG_JSON")
    if [[ "$tx_source" != "$TX_SOURCE" ]]; then
        log_message "ERROR" "TX source не совпадает: ожидалось $TX_SOURCE, получено $tx_source" "$LOG_FILE"
        exit 1
    fi

    log_message "INFO" "Проверка пройдена: $ops_count операций, source=$tx_source" "$LOG_FILE"
}

# Запуск
main "$@"
