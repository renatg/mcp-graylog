# mcp-graylog

MCP-сервер (stdio) для поиска сообщений в Graylog 6.x (проверялся на API 6.1). Для поиска используется Views Search API (`POST /api/views/search/sync`).

## Инструменты

| Tool | Назначение |
|---|---|
| `search_messages` | Поиск по запросу Graylog/Lucene. Параметры: `instance`, `query`, `range_seconds` **или** `from`/`to` (ISO 8601), `streams`, `fields`, `limit`, `offset`, `sort` |
| `list_streams` | Список streams (id, title, description, disabled). Параметр: `instance` |
| `get_message` | Полное сообщение по `index` и `id` из результатов поиска. Параметр: `instance` |
| `list_instances` | Список настроенных инстансов Graylog (name, url, default, verifySsl) |

Поле `message` длиннее 2000 символов в результатах поиска обрезается (`message_truncated: true`). Полный текст возвращает `get_message`.

Параметр `instance` необязательный. Если его не указать, запрос уйдёт в инстанс по умолчанию. Имя сравнивается без учёта регистра.

## Установка

Требуется Node.js 22.19+.

```sh
npm install
npm run build
```

## Настройка

| Переменная | По умолчанию | Описание |
|---|---|---|
| `GRAYLOG_URL` | — | Адрес Graylog, например `https://graylog.local:9000` (`/api` можно не указывать) |
| `GRAYLOG_TOKEN` | — | API-токен: *System → Users → Edit tokens* |
| `GRAYLOG_VERIFY_SSL` | `true` | `false` — не проверять TLS-сертификат |
| `GRAYLOG_TIMEOUT_MS` | `30000` | Таймаут HTTP-запроса |
| `GRAYLOG_MAX_LIMIT` | `500` | Верхний предел `limit` |

У пользователя, которому принадлежит токен, должны быть права на чтение нужных streams.

### Токен из другой переменной окружения

Значение `GRAYLOG_TOKEN` (и `GRAYLOG_<NAME>_TOKEN`) может быть ссылкой вида `${VAR}`. В этом случае токен берётся из переменной окружения `VAR`. Так секрет можно хранить в системном окружении и не писать его в конфиг MCP-клиента:

```json
"env": {
  "GRAYLOG_URL": "https://graylog.local:9000",
  "GRAYLOG_TOKEN": "${GRAYLOG_SECRET}"
}
```

Ссылкой считается только значение целиком. Если `VAR` не задана, сервер не запустится и сообщит об ошибке. В `claude mcp add` значение берите в одинарные кавычки, чтобы оболочка не раскрыла его сама: `-e 'GRAYLOG_TOKEN=${GRAYLOG_SECRET}'`.

### Несколько инстансов

Задайте список имён в `GRAYLOG_INSTANCES`. Для каждого имени нужны свои переменные `GRAYLOG_<NAME>_*`: имя пишется в верхнем регистре, `-` заменяется на `_`. Первое имя в списке становится инстансом по умолчанию. Если `GRAYLOG_INSTANCES` задан, `GRAYLOG_URL` и `GRAYLOG_TOKEN` игнорируются.

| Переменная | Описание |
|---|---|
| `GRAYLOG_INSTANCES` | Имена через запятую, например `prod,stage` (буквы, цифры, `_`, `-`) |
| `GRAYLOG_<NAME>_URL` | Адрес инстанса |
| `GRAYLOG_<NAME>_TOKEN` | API-токен инстанса |
| `GRAYLOG_<NAME>_VERIFY_SSL` | Необязательно. По умолчанию берётся `GRAYLOG_VERIFY_SSL` |
| `GRAYLOG_<NAME>_TIMEOUT_MS` | Необязательно. По умолчанию берётся `GRAYLOG_TIMEOUT_MS` |
| `GRAYLOG_<NAME>_MAX_LIMIT` | Необязательно. По умолчанию берётся `GRAYLOG_MAX_LIMIT` |

```sh
GRAYLOG_INSTANCES=prod,stage
GRAYLOG_PROD_URL=https://graylog-prod.local:9000
GRAYLOG_PROD_TOKEN=xxx
GRAYLOG_STAGE_URL=https://graylog-stage.local:9000
GRAYLOG_STAGE_TOKEN=yyy
GRAYLOG_STAGE_VERIFY_SSL=false
```

## Подключение

**Claude Code:**

```sh
claude mcp add graylog -e GRAYLOG_URL=https://graylog.local:9000 -e GRAYLOG_TOKEN=xxx -e GRAYLOG_VERIFY_SSL=false -- node C:/Projects/MCPGraylog/dist/index.js
```

Несколько инстансов:

```sh
claude mcp add graylog -e GRAYLOG_INSTANCES=prod,stage -e GRAYLOG_PROD_URL=https://graylog-prod.local:9000 -e GRAYLOG_PROD_TOKEN=xxx -e GRAYLOG_STAGE_URL=https://graylog-stage.local:9000 -e GRAYLOG_STAGE_TOKEN=yyy -- node C:/Projects/MCPGraylog/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "graylog": {
      "command": "node",
      "args": ["C:/Projects/MCPGraylog/dist/index.js"],
      "env": {
        "GRAYLOG_URL": "https://graylog.local:9000",
        "GRAYLOG_TOKEN": "xxx",
        "GRAYLOG_VERIFY_SSL": "false"
      }
    }
  }
}
```

**OpenCode** (`opencode.json` в корне проекта или `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "graylog": {
      "type": "local",
      "command": ["node", "C:/Projects/MCPGraylog/dist/index.js"],
      "enabled": true,
      "environment": {
        "GRAYLOG_URL": "https://graylog.local:9000",
        "GRAYLOG_TOKEN": "xxx",
        "GRAYLOG_VERIFY_SSL": "false"
      }
    }
  }
}
```

В OpenCode переменные окружения задаются в `environment`, а команда с аргументами — одним массивом `command`.

## Отладка

```sh
# задать GRAYLOG_* в окружении, затем:
npm run inspect
```
