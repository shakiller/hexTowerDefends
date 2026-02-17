/**
 * Система логирования для записи важной информации в файл
 */
export class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 10000; // Максимальное количество логов в памяти
        this.enabled = true;
    }

    /**
     * Добавляет лог с временной меткой
     */
    log(level, category, message, data = null) {
        if (!this.enabled) return;

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level, // 'info', 'warn', 'error', 'debug'
            category, // 'soldier', 'worker', 'pathfinding', 'game', etc.
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        };

        this.logs.push(logEntry);

        // Ограничиваем размер массива логов
        if (this.logs.length > this.maxLogs) {
            this.logs.shift(); // Удаляем старые логи
        }

        // Также выводим в консоль для отладки (если доступна)
        if (console && console[level]) {
            const consoleMessage = `[${timestamp}] [${category}] ${message}`;
            if (data) {
                console[level](consoleMessage, data);
            } else {
                console[level](consoleMessage);
            }
        }
    }

    info(category, message, data = null) {
        this.log('info', category, message, data);
    }

    warn(category, message, data = null) {
        this.log('warn', category, message, data);
    }

    error(category, message, data = null) {
        this.log('error', category, message, data);
    }

    debug(category, message, data = null) {
        this.log('debug', category, message, data);
    }

    /**
     * Экспортирует логи в текстовый файл для скачивания
     */
    exportToFile() {
        try {
            if (this.logs.length === 0) {
                alert('Нет логов для экспорта. Запустите игру и попробуйте снова.');
                return;
            }

            let content = '=== ЛОГИ ИГРЫ ===\n';
            content += `Экспортировано: ${new Date().toISOString()}\n`;
            content += `Всего записей: ${this.logs.length}\n\n`;

            this.logs.forEach((entry, index) => {
                content += `[${index + 1}] ${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.category}]\n`;
                content += `Сообщение: ${entry.message}\n`;
                if (entry.data) {
                    content += `Данные:\n${entry.data}\n`;
                }
                content += '\n---\n\n';
            });

            // Создаём Blob и скачиваем файл
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `game-logs-${Date.now()}.txt`;
            link.style.display = 'none'; // Скрываем ссылку
            document.body.appendChild(link);
            
            // Используем setTimeout для гарантии, что элемент добавлен в DOM
            setTimeout(() => {
                link.click();
                // Удаляем элемент и освобождаем URL после небольшой задержки
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);
            }, 10);
            
            // Показываем сообщение об успехе
            const logStatusEl = document.getElementById('log-status');
            if (logStatusEl) {
                const originalText = logStatusEl.textContent;
                logStatusEl.textContent = `✅ Экспортировано ${this.logs.length} логов!`;
                logStatusEl.style.color = '#90e24a';
                setTimeout(() => {
                    logStatusEl.textContent = originalText;
                    logStatusEl.style.color = '#90e24a';
                }, 3000);
            }
        } catch (error) {
            console.error('Ошибка при экспорте логов:', error);
            alert('Ошибка при экспорте логов: ' + error.message);
        }
    }

    /**
     * Очищает все логи
     */
    clear() {
        this.logs = [];
    }

    /**
     * Возвращает количество логов
     */
    getLogCount() {
        return this.logs.length;
    }

    /**
     * Возвращает последние N логов
     */
    getRecentLogs(count = 100) {
        return this.logs.slice(-count);
    }
}

// Создаём глобальный экземпляр логгера
export const logger = new Logger();

// Делаем logger доступным глобально для использования в других модулях
if (typeof window !== 'undefined') {
    window.logger = logger;
}

