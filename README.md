# mcp-graylog

MCP-сервер (stdio) для поиска сообщений в Graylog 6.x (проверялся на API 6.1). Для поиска используется Views Search API (`POST /api/views/search/sync`).

## Инструменты

| Tool | Назначение |
|---|---|
| `search_messages` | Поиск по запросу Graylog/Lucene. Параметры: `query`, `range_seconds` **или** `from`/`to` (ISO 8601), `streams`, `fields`, `limit`, `offset`, `sort` |
| `list_streams` | Список streams (id, title, description, disabled) |
| `get_message` | Полное сообщение по `index` и `id` из результатов поиска |

Поле `message` длиннее 2000 символов в результатах поиска обрезается (`message_truncated: true`). Полный текст возвращает `get_message`.

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

## Подключение

**Claude Code:**

```sh
claude mcp add graylog -e GRAYLOG_URL=https://graylog.local:9000 -e GRAYLOG_TOKEN=xxx -e GRAYLOG_VERIFY_SSL=false -- node C:/Projects/MCPGraylog/dist/index.js
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

## Отладка

```sh
# задать GRAYLOG_* в окружении, затем:
npm run inspect
```
