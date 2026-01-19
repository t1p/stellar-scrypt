#!/usr/bin/env zsh
# utils.zsh - Вспомогательные функции для build_tags_tx.zsh

# Функция для конвертации строки в HEX ASCII (без пробелов)
# Аргумент: строка для конвертации
# Возвращает: hex-строку
function to_hex_ascii() {
    local input="$1"
    if [[ -z "$input" ]]; then
        echo "Ошибка: пустая строка для конвертации" >&2
        return 1
    fi
    # Используем printf + od для конвертации в hex (без зависимости от xxd)
    printf '%s' "$input" | od -An -tx1 | tr -d ' \n'
}

# Функция валидации Stellar-адреса
# Аргумент: адрес для проверки
# Возвращает: 0 если валиден, 1 если нет
function validate_address() {
    local addr="$1"
    if [[ -z "$addr" ]]; then
        echo "Ошибка: пустой адрес" >&2
        return 1
    fi
    # Проверка: начинается с G, длина 56 символов
    if [[ "$addr" =~ ^G && ${#addr} -eq 56 ]]; then
        return 0
    else
        echo "Ошибка: некорректный Stellar-адрес '$addr'" >&2
        return 1
    fi
}

# Функция логирования
# Аргументы: уровень (INFO, ERROR, WARN), сообщение, файл лога (опционально)
function log_message() {
    local level="$1"
    local message="$2"
    local logfile="${3:-}"

    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local formatted="[$timestamp] [$level] $message"

    # Вывод в консоль
    echo "$formatted"

    # Вывод в файл, если указан
    if [[ -n "$logfile" ]]; then
        echo "$formatted" >> "$logfile"
    fi
}
