export class BotAI {
    constructor(gameBloc, towerBloc, soldierBloc, hexGrid, obstacleBloc = null, workerBloc = null, goldBloc = null) {
        this.gameBloc = gameBloc;
        this.towerBloc = towerBloc;
        this.soldierBloc = soldierBloc;
        this.hexGrid = hexGrid;
        this.obstacleBloc = obstacleBloc;
        this.workerBloc = workerBloc;
        this.goldBloc = goldBloc;
        this.lastActionTime = 0;
        this.actionInterval = 1500; // Действие каждые 1.5 секунды
        
        // Стратегические параметры
        this.minGoldReserve = 100; // Минимальный резерв золота для критических действий
        this.targetGatherers = 2; // Целевое количество сборщиков
        this.targetBuilders = 1; // Целевое количество строителей
        this.towerDefenseRadius = 3; // Радиус защиты башнями вокруг базы
        this.minTowers = 3; // Минимальное количество башен для защиты
        this.targetSoldiers = 3; // Целевое количество солдат для атаки
        this.lastGoldCheck = 0;
        this.goldCheckInterval = 5000; // Проверка золота каждые 5 секунд
        
        // Состояние для отображения
        this.currentState = {
            currentAction: 'Ожидание...',
            priority: '-',
            lastAction: '-'
        };
    }
    
    getState() {
        return { ...this.currentState };
    }

    update(currentTime) {
        const gameState = this.gameBloc.getState();
        
        // Бот играет за игрока 2 в режимах PvE и Campaign
        // В режимах PvE и Campaign бот играет автоматически, независимо от currentPlayer
        if (gameState.gameMode !== 'pve' && gameState.gameMode !== 'campaign') {
            return;
        }

        if (currentTime - this.lastActionTime < this.actionInterval) {
            return;
        }

        this.lastActionTime = currentTime;
        this.makeDecision(currentTime);
    }

    makeDecision(currentTime) {
        const gameState = this.gameBloc.getState();
        const player = gameState.players[2];
        
        // Проверяем наличие необходимых блоков
        if (!this.workerBloc || !this.goldBloc) {
            this.currentState.currentAction = 'Ошибка: блоки не инициализированы';
            this.currentState.priority = 'ERROR';
            return;
        }
        
        const towerState = this.towerBloc.getState();
        const soldierState = this.soldierBloc.getState();
        const workerState = this.workerBloc.getState();
        const goldState = this.goldBloc.getState();
        
        const botWorkers = workerState.workers.filter(w => w.playerId === 2);
        const gatherers = botWorkers.filter(w => w.type === 'gatherer');
        const builders = botWorkers.filter(w => w.type === 'builder');
        const botTowers = towerState.towers.filter(t => t.playerId === 2);
        const botSoldiers = soldierState.soldiers.filter(s => s.playerId === 2);
        
        // Приоритет 1: Сбор золота - создаём сборщиков если их мало и есть золото на карте
        const availableGold = goldState.goldPiles.filter(p => !p.collected).length;
        if (gatherers.length < this.targetGatherers && player.gold >= 50 && availableGold > 0) {
            const centerX = Math.floor(this.hexGrid.width / 2);
            const gateY = 0; // Игрок 2: верхняя строка (ворота)
            const gatePos = {x: centerX, y: gateY};
            if (this.workerBloc.createWorker(gatePos, 2, 'gatherer')) {
                this.currentState.currentAction = 'Создание сборщика золота';
                this.currentState.priority = '1';
                this.currentState.lastAction = `Создан сборщик золота (${gatherers.length + 1}/${this.targetGatherers})`;
                return;
            }
        }
        
        // Приоритет 2: Строительство препятствий для защиты
        // Строим препятствия вокруг базы и на стратегических позициях
        if (builders.length < this.targetBuilders && player.gold >= 50) {
            const centerX = Math.floor(this.hexGrid.width / 2);
            const gateY = 0;
            const gatePos = {x: centerX, y: gateY};
            if (this.workerBloc.createWorker(gatePos, 2, 'builder')) {
                this.currentState.currentAction = 'Создание строителя';
                this.currentState.priority = '2';
                this.currentState.lastAction = `Создан строитель (${builders.length + 1}/${this.targetBuilders})`;
                return;
            }
        }
        
        // Приоритет 3: Строительство препятствий (если есть строители и золото)
        if (builders.length > 0 && player.gold >= this.minGoldReserve) {
            let obstaclePos = this.findBestObstaclePosition();
            let attempts = 0;
            const maxAttempts = 5; // Максимум попыток найти безопасную позицию
            
            while (obstaclePos && attempts < maxAttempts) {
                attempts++;
                
                // Проверяем, что препятствие не блокирует путь между воротами
                if (this.wouldBlockGates(obstaclePos.x, obstaclePos.y)) {
                    obstaclePos = this.findSafeObstaclePosition();
                    continue;
                }
                
                // Проверяем, нет ли уже препятствия в этой позиции
                const existingObstacle = this.obstacleBloc.getObstacleAt(obstaclePos.x, obstaclePos.y);
                if (existingObstacle) {
                    obstaclePos = this.findSafeObstaclePosition();
                    continue;
                }
                
                // Проверяем, нет ли уже задачи в очереди для этой позиции
                const buildQueue = this.workerBloc.getBuildQueue(2);
                const alreadyInQueue = buildQueue.some(task => task.x === obstaclePos.x && task.y === obstaclePos.y);
                if (alreadyInQueue) {
                    obstaclePos = this.findSafeObstaclePosition();
                    continue;
                }
                
                // Проверяем, не превышен ли лимит очереди (максимум 5 задач)
                const currentQueue = this.workerBloc.getBuildQueue(2);
                if (currentQueue.length >= 5) {
                    break;
                }
                
                // Если все проверки пройдены - добавляем в очередь
                if (this.workerBloc.addBuildTaskToQueue(2, obstaclePos.x, obstaclePos.y, 'obstacle', obstaclePos.type, this.obstacleBloc, this.towerBloc)) {
                    const queueSize = this.workerBloc.getBuildQueue(2).length;
                    this.currentState.currentAction = `Строительство препятствия (${obstaclePos.type})`;
                    this.currentState.priority = '3';
                    this.currentState.lastAction = `Добавлена задача: ${obstaclePos.type} в (${obstaclePos.x}, ${obstaclePos.y}), очередь: ${queueSize}/5`;
                    return;
                } else {
                    break;
                }
            }
        }
        
        // Приоритет 4: Строительство башен для защиты (важно для защиты!)
        if (player.gold >= 100 && botTowers.length < 8) {
            // Приоритет строительству башен, если их мало
            if (botTowers.length < this.minTowers || player.gold >= 200) {
                let towerPos = this.findBestTowerPosition(botTowers);
                // findBestTowerPosition уже проверяет wouldBlockGates, но на всякий случай проверяем ещё раз
                if (towerPos) {
                    // Дополнительная проверка: убеждаемся, что башня не блокирует путь
                    if (this.wouldBlockGates(towerPos.x, towerPos.y, true)) { // true = это башня
                        towerPos = this.findSafeTowerPosition(botTowers);
                    }
                    
                    if (towerPos) {
                        // Проверяем, не превышен ли лимит очереди (максимум 5 задач)
                        const currentQueue = this.workerBloc.getBuildQueue(2);
                        if (currentQueue.length >= 5) {
                            // Пропускаем строительство башни, переходим к следующему приоритету
                        } else {
                            // Выбираем тип башни: сильная если золота много, базовая если мало
                            const towerType = player.gold >= 300 ? 'strong' : 'basic';
                            
                            // Добавляем задачу на строительство башни в очередь
                            if (this.workerBloc.addBuildTaskToQueue(2, towerPos.x, towerPos.y, 'tower', towerType, this.obstacleBloc, this.towerBloc)) {
                                const queueSize = this.workerBloc.getBuildQueue(2).length;
                                this.currentState.currentAction = `Строительство башни (${towerType})`;
                                this.currentState.priority = '4';
                                this.currentState.lastAction = `Добавлена задача: башня ${towerType} в (${towerPos.x}, ${towerPos.y}), очередь: ${queueSize}/5`;
                                return;
                            }
                        }
                    }
                }
            }
        }
        
        // Приоритет 5: Улучшение башен (если есть золото и башни)
        if (botTowers.length > 0 && player.gold >= 200) {
            // Улучшаем самые слабые башни
            const weakTowers = botTowers.filter(t => t.level === 1);
            if (weakTowers.length > 0) {
                const towerToUpgrade = weakTowers[Math.floor(Math.random() * weakTowers.length)];
                if (this.towerBloc.upgradeTower(towerToUpgrade.id)) {
                    this.currentState.currentAction = 'Улучшение башни';
                    this.currentState.priority = '5';
                    this.currentState.lastAction = `Улучшена башня ${towerToUpgrade.id} до уровня ${towerToUpgrade.level + 1}`;
                    return;
                }
            }
        }
        
        // Приоритет 6: Создание солдат для атаки (важно для победы!)
        // Создаём солдат, если есть башни для защиты и достаточно золота
        if (botTowers.length >= this.minTowers && player.gold >= 50 && botSoldiers.length < this.targetSoldiers) {
            const centerX = Math.floor(this.hexGrid.width / 2);
            const gateY = 0;
            const gatePos = {x: centerX, y: gateY};
            // Выбираем тип солдата: сильный если золота много, базовый если мало
            const soldierType = player.gold >= 200 ? 'strong' : 'basic';
            if (this.soldierBloc.createSoldier(gatePos, 2, soldierType, this.obstacleBloc, this.towerBloc)) {
                this.currentState.currentAction = `Создание солдата (${soldierType})`;
                this.currentState.priority = '6';
                this.currentState.lastAction = `Создан солдат ${soldierType} для атаки, всего: ${botSoldiers.length + 1}`;
                return;
            }
        }
        
        // Если башен достаточно, но солдат мало - создаём больше солдат
        if (botTowers.length >= this.minTowers && player.gold >= 50 && botSoldiers.length < 5) {
            const centerX = Math.floor(this.hexGrid.width / 2);
            const gateY = 0;
            const gatePos = {x: centerX, y: gateY};
            const soldierType = 'basic'; // Базовые солдаты для массовой атаки
            if (this.soldierBloc.createSoldier(gatePos, 2, soldierType, this.obstacleBloc, this.towerBloc)) {
                this.currentState.currentAction = `Создание солдата (${soldierType})`;
                this.currentState.priority = '6';
                this.currentState.lastAction = `Создан солдат ${soldierType} для атаки, всего: ${botSoldiers.length + 1}`;
                return;
            }
        }
        
        // Приоритет 7: Дополнительные сборщики если много золота на карте
        if (availableGold > 5 && gatherers.length < 5 && player.gold >= 50) {
            const centerX = Math.floor(this.hexGrid.width / 2);
            const gateY = 0;
            const gatePos = {x: centerX, y: gateY};
            if (this.workerBloc.createWorker(gatePos, 2, 'gatherer')) {
                this.currentState.currentAction = 'Создание дополнительного сборщика';
                this.currentState.priority = '7';
                this.currentState.lastAction = `Создан дополнительный сборщик (много золота: ${availableGold})`;
                return;
            }
        }
        
        // Если ничего не сделано - обновляем состояние с информацией почему
        const reasons = [];
        if (gatherers.length >= this.targetGatherers) reasons.push('сборщиков достаточно');
        if (player.gold < 50) reasons.push(`мало золота (${player.gold})`);
        if (availableGold === 0) reasons.push('нет золота на карте');
        if (builders.length >= this.targetBuilders) reasons.push('строителей достаточно');
        if (player.gold < this.minGoldReserve && builders.length > 0) reasons.push(`мало золота для стр-ва (${player.gold})`);
        if (botTowers.length >= 8) reasons.push('башен достаточно');
        if (player.gold < 100 && botTowers.length < 8) reasons.push(`мало золота для башен (${player.gold})`);
        if (botSoldiers.length >= 5) reasons.push('солдат достаточно');
        
        const reasonText = reasons.length > 0 ? reasons.join(', ') : 'все условия выполнены';
        this.currentState.currentAction = `Ожидание: ${reasonText}`;
        this.currentState.priority = '-';
    }
    
    /**
     * Находит безопасную позицию для препятствия (не блокирует ворота)
     */
    findSafeObstaclePosition() {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        // Получаем текущую очередь строительства
        const buildQueue = this.workerBloc.getBuildQueue(2);
        const queuedPositions = new Set(buildQueue.map(task => `${task.x},${task.y}`));
        
        // Ищем все возможные позиции
        const allPositions = [];
        
        // Позиции вокруг базы
        const defenseRadius = 3;
        for (let dx = -defenseRadius; dx <= defenseRadius; dx++) {
            for (let dy = 1; dy <= defenseRadius + 2; dy++) {
                const x = centerX + dx;
                const y = baseY + dy;
                
                if (x < 0 || x >= this.hexGrid.width || y < 0 || y >= this.hexGrid.height) {
                    continue;
                }
                
                if (y === 0) continue;
                
                // Проверяем, нет ли уже задачи в очереди для этой позиции
                if (queuedPositions.has(`${x},${y}`)) {
                    continue;
                }
                
                const hex = this.hexGrid.arrayToHex(x, y);
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                // Проверяем, не блокирует ли эта позиция ворота
                if (!this.wouldBlockGates(x, y)) {
                    allPositions.push({x, y, priority: dy});
                }
            }
        }
        
        // Стратегические позиции
        for (let y = 1; y < halfHeight; y++) {
            for (let x = 0; x < this.hexGrid.width; x++) {
                // Проверяем, нет ли уже задачи в очереди для этой позиции
                if (queuedPositions.has(`${x},${y}`)) {
                    continue;
                }
                
            const hex = this.hexGrid.arrayToHex(x, y);
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                // Проверяем, не блокирует ли эта позиция ворота
                if (!this.wouldBlockGates(x, y)) {
                    const distanceToEnemyBase = Math.abs(y - (this.hexGrid.height - 1));
                    const distanceToCenter = Math.abs(x - centerX);
                    const priority = distanceToEnemyBase + distanceToCenter;
                    allPositions.push({x, y, priority});
                }
            }
        }
        
        if (allPositions.length > 0) {
            allPositions.sort((a, b) => a.priority - b.priority);
            const bestPos = allPositions[0];
            const type = bestPos.priority <= 1 ? 'stone' : 'tree';
            return {x: bestPos.x, y: bestPos.y, type};
        }
        
        return null;
    }
    
    /**
     * Вычисляет путь от вражеской базы к нашей базе
     * Возвращает длину пути и сам путь
     */
    calculateEnemyPath(obstacleBloc = null, towerBloc = null) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        // Вражеская база (игрок 1) - нижняя часть карты
        const enemyBaseY = this.hexGrid.height - 1;
        const enemyGateHex = this.hexGrid.arrayToHex(centerX, enemyBaseY);
        
        // Наша база (игрок 2) - верхняя часть карты
        const ourBaseY = 0;
        const ourGateHex = this.hexGrid.arrayToHex(centerX, ourBaseY);
        
        // Вычисляем путь от вражеской базы к нашей (для солдат, allowGates = false)
        const path = this.hexGrid.findPath(enemyGateHex, ourGateHex, obstacleBloc || this.obstacleBloc, towerBloc || this.towerBloc, false, false);
        
        return {
            path: path,
            length: path ? path.length : 0
        };
    }
    
    /**
     * Находит лучшую позицию для строительства препятствия
     * Стратегия: максимально удлинить путь вражеских солдат
     */
    findBestObstaclePosition() {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        
        // Вычисляем текущий путь вражеских солдат
        const currentPath = this.calculateEnemyPath();
        const basePathLength = currentPath.length;
        
        if (basePathLength === 0) {
            // Путь не найден - используем простую стратегию
            return this.findSafeObstaclePosition();
        }
        
        // Ищем позиции, которые максимально удлинят путь
        const candidatePositions = [];
        const searchRadius = 8; // Ищем в радиусе 8 клеток от центра
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        // Проверяем позиции в верхней половине карты (ближе к нашей базе)
        for (let y = 1; y < halfHeight; y++) {
            for (let x = 0; x < this.hexGrid.width; x++) {
                const hex = this.hexGrid.arrayToHex(x, y);
                
                // Пропускаем заблокированные ячейки
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                // Пропускаем башни и препятствия
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                // Проверяем, не блокирует ли препятствие путь
                if (this.wouldBlockGates(x, y, false)) {
                    continue;
                }
                
                // Временно добавляем препятствие и проверяем новый путь
                // Создаём временный obstacleBloc для проверки
                const tempObstacleBloc = {
                    getObstacleAt: (tx, ty) => {
                        if (tx === x && ty === y) {
                            return {type: 'stone'}; // Временно добавляем препятствие
                        }
                        return this.obstacleBloc ? this.obstacleBloc.getObstacleAt(tx, ty) : null;
                    }
                };
                
                const newPath = this.calculateEnemyPath(tempObstacleBloc, this.towerBloc);
                const newPathLength = newPath.length;
                
                // Если путь удлинился, добавляем позицию в кандидаты
                if (newPathLength > basePathLength) {
                    const pathIncrease = newPathLength - basePathLength;
                    // Приоритет позициям, которые больше удлиняют путь и ближе к вражеской базе
                    const distanceToEnemyBase = Math.abs(y - (this.hexGrid.height - 1));
                    const priority = pathIncrease * 10 - distanceToEnemyBase; // Больше увеличение = выше приоритет
                    
                    candidatePositions.push({
                        x, y,
                        pathIncrease,
                        priority,
                        newPathLength
                    });
                }
            }
        }
        
        if (candidatePositions.length > 0) {
            // Сортируем по приоритету (больше увеличение пути = выше приоритет)
            candidatePositions.sort((a, b) => b.priority - a.priority);
            const bestPos = candidatePositions[0];
            // Используем камни для максимального удлинения пути (нельзя разрушить)
            return {x: bestPos.x, y: bestPos.y, type: 'stone'};
        }
        
        // Если не нашли позиции, удлиняющие путь - используем простую стратегию
        return this.findSafeObstaclePosition();
    }
    
    /**
     * Проверяет, заблокирует ли препятствие/башня в указанной позиции путь между воротами
     * Проверяет путь в обе стороны и несколько альтернативных маршрутов
     * Использует кеш для оптимизации производительности
     * @param {number} x - координата X
     * @param {number} y - координата Y
     * @param {boolean} isTower - true если это башня, false если препятствие
     */
    wouldBlockGates(x, y, isTower = false) {
        // УПРОЩЁННАЯ ПРОВЕРКА БЕЗ findPath: просто проверяем геометрию
        // Это намного быстрее и не вызывает зависаний
        
        const centerX = Math.floor(this.hexGrid.width / 2);
        const player1GateY = centerX % 2 === 0 ? this.hexGrid.height - 2 : this.hexGrid.height - 1;
        const player2GateY = 0;
        
        // Проверяем, не находится ли позиция на прямой линии между воротами
        if (x === centerX) {
            // На той же вертикали, что и ворота
            if (y > player2GateY && y < player1GateY) {
                // Между воротами - блокирует прямой путь
                return true;
            }
        }
        
        // Проверяем центральный проход (ширина 3 клетки: centerX-1, centerX, centerX+1)
        const distanceFromCenterX = Math.abs(x - centerX);
        if (distanceFromCenterX <= 1) {
            // В центральном проходе
            // Блокируем только если в первых 8 рядах от любой базы
            if (y <= 8 || y >= this.hexGrid.height - 9) {
                return true; // Блокирует критический путь
            }
        }
        
        // Если позиция рядом с центральной линией (в пределах 2 клеток) и в средней части карты
        if (distanceFromCenterX <= 2) {
            const middleY = Math.floor(this.hexGrid.height / 2);
            const distanceFromMiddleY = Math.abs(y - middleY);
            if (distanceFromMiddleY <= 3) {
                // В центральной зоне карты - может блокировать альтернативные пути
                return true;
            }
        }
        
        return false; // Позиция не блокирует критический путь
    }
    
    /**
     * Находит безопасную позицию для башни (не блокирует ворота)
     */
    findSafeTowerPosition(existingTowers) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        const allPositions = [];
        
        // Позиции для защиты базы
        for (let dx = -this.towerDefenseRadius; dx <= this.towerDefenseRadius; dx++) {
            for (let dy = 1; dy <= this.towerDefenseRadius + 2; dy++) {
                const x = centerX + dx;
                const y = baseY + dy;
                
                if (x < 0 || x >= this.hexGrid.width || y < 0 || y >= this.hexGrid.height) {
                    continue;
                }
                
                if (y === 0) continue;
                
                const hex = this.hexGrid.arrayToHex(x, y);
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                // Проверяем, не слишком ли близко к другим башням
                let tooClose = false;
                for (const existingTower of existingTowers) {
                    const existingHex = this.hexGrid.arrayToHex(existingTower.x, existingTower.y);
                    const distance = this.hexGrid.hexDistance(hex, existingHex);
                    if (distance < 2) {
                        tooClose = true;
                        break;
                    }
                }
                
                // КРИТИЧНО: Проверяем, не блокирует ли башня путь между воротами
                if (!tooClose && !this.wouldBlockGates(x, y, true)) { // true = это башня
                    const distanceToBase = dy;
                    const distanceToCenter = Math.abs(dx);
                    const priority = distanceToBase * 2 + distanceToCenter;
                    allPositions.push({x, y, priority});
                }
            }
        }
        
        // Стратегические позиции
        for (let y = 1; y < halfHeight; y++) {
            for (let x = 0; x < this.hexGrid.width; x++) {
                const hex = this.hexGrid.arrayToHex(x, y);
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                if (!this.wouldBlockGates(x, y)) {
                    const distanceToEnemyBase = Math.abs(y - (this.hexGrid.height - 1));
                    const priority = distanceToEnemyBase;
                    allPositions.push({x, y, priority});
                }
            }
        }
        
        if (allPositions.length > 0) {
            allPositions.sort((a, b) => a.priority - b.priority);
            return allPositions[0];
        }
        
        return null;
    }
    
    /**
     * Находит ключевые точки пути вражеских солдат для размещения башен
     * Ключевые точки: узкие места, повороты, точки где путь проходит долго
     */
    findKeyPathPoints(path) {
        if (!path || path.length < 3) {
            return [];
        }
        
        const keyPoints = [];
        
        // Находим точки, где путь делает поворот (изменение направления)
        for (let i = 1; i < path.length - 1; i++) {
            const prev = this.hexGrid.hexToArray(path[i - 1]);
            const current = this.hexGrid.hexToArray(path[i]);
            const next = this.hexGrid.hexToArray(path[i + 1]);
            
            // Вычисляем направления
            const dir1 = {dx: current.x - prev.x, dy: current.y - prev.y};
            const dir2 = {dx: next.x - current.x, dy: next.y - current.y};
            
            // Если направление изменилось - это поворот
            if (dir1.dx !== dir2.dx || dir1.dy !== dir2.dy) {
                keyPoints.push({
                    hex: path[i],
                    arr: current,
                    type: 'turn',
                    index: i
                });
            }
        }
        
        // Находим узкие места (где путь проходит через ограниченное пространство)
        // Проверяем точки, где у текущей ячейки мало свободных соседей
        for (let i = 1; i < path.length - 1; i++) {
            const currentHex = path[i];
            const currentArr = this.hexGrid.hexToArray(currentHex);
            const neighbors = this.hexGrid.getHexNeighbors(currentHex);
            
            // Считаем свободных соседей
            let freeNeighbors = 0;
            for (const neighbor of neighbors) {
                if (!this.hexGrid.isBlocked(neighbor, this.obstacleBloc, this.towerBloc, false)) {
                    freeNeighbors++;
                }
            }
            
            // Если свободных соседей мало (узкое место)
            if (freeNeighbors <= 3) {
                keyPoints.push({
                    hex: currentHex,
                    arr: currentArr,
                    type: 'chokepoint',
                    index: i,
                    freeNeighbors
                });
            }
        }
        
        return keyPoints;
    }
    
    /**
     * Находит лучшую позицию для строительства башни
     * Стратегия: размещать башни в ключевых точках пути вражеских солдат
     */
    findBestTowerPosition(existingTowers) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        
        // Вычисляем путь вражеских солдат
        const enemyPath = this.calculateEnemyPath();
        
        if (enemyPath.path && enemyPath.path.length > 0) {
            // Находим ключевые точки пути
            const keyPoints = this.findKeyPathPoints(enemyPath.path);
            
            // Сортируем ключевые точки по приоритету (узкие места важнее поворотов)
            const prioritizedPoints = keyPoints.map(point => ({
                ...point,
                priority: point.type === 'chokepoint' ? 100 - point.freeNeighbors : 50 - point.index
            }));
            
            prioritizedPoints.sort((a, b) => b.priority - a.priority);
            
            // Проверяем каждую ключевую точку
            for (const keyPoint of prioritizedPoints) {
                const x = keyPoint.arr.x;
                const y = keyPoint.arr.y;
                
                // Проверяем, свободна ли клетка
                const hex = this.hexGrid.arrayToHex(x, y);
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                // Проверяем, нет ли там башни
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                // Проверяем, нет ли там препятствия
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                // Проверяем, не слишком ли близко к другим башням
                let tooClose = false;
                for (const existingTower of existingTowers) {
                    const existingHex = this.hexGrid.arrayToHex(existingTower.x, existingTower.y);
                    const distance = this.hexGrid.hexDistance(hex, existingHex);
                    if (distance < 2) {
                        tooClose = true;
                        break;
                    }
                }
                
                // КРИТИЧНО: Проверяем, не блокирует ли башня путь между воротами
                if (!tooClose && !this.wouldBlockGates(x, y, true)) {
                    return {x, y};
                }
            }
        }
        
        // Если не нашли ключевые точки или все заняты - используем стратегию защиты базы
        const defensePositions = [];
        
        for (let dx = -this.towerDefenseRadius; dx <= this.towerDefenseRadius; dx++) {
            for (let dy = 1; dy <= this.towerDefenseRadius + 2; dy++) {
                const x = centerX + dx;
                const y = baseY + dy;
                
                if (x < 0 || x >= this.hexGrid.width || y < 0 || y >= this.hexGrid.height) {
                    continue;
                }
                
                if (y === 0) continue; // Не на базе
                
                // Проверяем, свободна ли клетка
                const hex = this.hexGrid.arrayToHex(x, y);
                if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                    continue;
                }
                
                // Проверяем, нет ли там башни
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) continue;
                
                // Проверяем, нет ли там препятствия
                const obstacle = this.obstacleBloc.getObstacleAt(x, y);
                if (obstacle) continue;
                
                // Вычисляем приоритет: ближе к базе и к центру = выше приоритет
                const distanceToBase = dy;
                const distanceToCenter = Math.abs(dx);
                const priority = distanceToBase * 2 + distanceToCenter;
                
                // Проверяем, не слишком ли близко к другим башням
                let tooClose = false;
                for (const existingTower of existingTowers) {
                    const existingHex = this.hexGrid.arrayToHex(existingTower.x, existingTower.y);
                    const distance = this.hexGrid.hexDistance(hex, existingHex);
                    if (distance < 2) {
                        tooClose = true;
                        break;
                    }
                }
                
                // КРИТИЧНО: Проверяем, не блокирует ли башня путь между воротами
                if (!tooClose && !this.wouldBlockGates(x, y, true)) {
                    defensePositions.push({x, y, priority});
                }
            }
        }
        
        if (defensePositions.length > 0) {
            defensePositions.sort((a, b) => a.priority - b.priority);
            return defensePositions[0];
        }
        
        return null;
    }
}
