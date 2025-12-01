# Запуск игры через localhost

## Способ 1: VS Code Live Server (самый простой)

1. Установите расширение **"Live Server"** в VS Code:
   - Нажмите `Ctrl+Shift+X`
   - Найдите "Live Server" (автор: Ritwick Dey)
   - Установите

2. Откройте `index.html` в VS Code

3. Нажмите правой кнопкой на `index.html` → **"Open with Live Server"**
   - Или нажмите на кнопку "Go Live" в правом нижнем углу VS Code

4. Браузер откроется автоматически на `http://localhost:5500` (или другом порту)

## Способ 2: Python сервер (уже настроен)

1. Убедитесь, что Python установлен

2. Двойной клик по `start-server.bat`

3. Или в терминале:
   ```bash
   python server.py
   ```

4. Откройте в браузере: `http://localhost:8000`

## Способ 3: Node.js сервер

1. Убедитесь, что Node.js установлен

2. В терминале:
   ```bash
   node server.js
   ```

3. Откройте в браузере: `http://localhost:8000`

## Способ 4: Python встроенный сервер

1. В терминале в папке проекта:
   ```bash
   python -m http.server 8000
   ```

2. Откройте в браузере: `http://localhost:8000`

## Рекомендуется: VS Code Live Server

Это самый удобный способ - автоматически перезагружает страницу при изменениях в коде!

