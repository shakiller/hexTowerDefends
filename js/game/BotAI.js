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
        this.minGoldReserve = 150; // Минимальный резерв золота для критических действий
        this.targetGatherers = 3; // Целевое количество сборщиков
        this.targetBuilders = 2; // Целевое количество строителей
        this.towerDefenseRadius = 3; // Радиус защиты башнями вокруг базы
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
        
        // Логируем вызов для отладки
        if (Math.random() < 0.01) { // Логируем примерно 1% вызовов
            console.log('[Bot] makeDecision вызван', {
                gameMode: gameState.gameMode,
                currentPlayer: gameState.currentPlayer,
                player2Gold: gameState.players[2].gold
            });
        }
        
        this.makeDecision(currentTime);
    }

    makeDecision(currentTime) {
        const gameState = this.gameBloc.getState();
        const player = gameState.players[2];
        
        // Проверяем наличие необходимых блоков
        if (!this.workerBloc || !this.goldBloc) {
            console.warn('[Bot] workerBloc или goldBloc не инициализированы!');
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
                console.log('[Bot] Создан сборщик золота');
                return;
            } else {
                console.warn('[Bot] Не удалось создать сборщика, возможно недостаточно золота или позиция занята');
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
                console.log('[Bot] Создан строитель');
                return;
            }
        }
        
        // Приоритет 3: Строительство препятствий (если есть строители и золото)
        if (builders.length > 0 && player.gold >= this.minGoldReserve) {
            let obstaclePos = this.findBestObstaclePosition();
            if (obstaclePos) {
                // Проверяем, что препятствие не блокирует путь между воротами
                if (this.wouldBlockGates(obstaclePos.x, obstaclePos.y)) {
                    console.warn(`[Bot] Препятствие в (${obstaclePos.x}, ${obstaclePos.y}) заблокирует ворота, ищем альтернативу`);
                    // Пробуем найти другую безопасную позицию
                    obstaclePos = this.findSafeObstaclePosition();
                    if (!obstaclePos) {
                        console.warn('[Bot] Не найдена безопасная позиция для препятствия');
                    }
                }
                
                if (obstaclePos) {
                    // Проверяем, нет ли уже препятствия в этой позиции
                    const existingObstacle = this.obstacleBloc.getObstacleAt(obstaclePos.x, obstaclePos.y);
                    if (existingObstacle) {
                        console.warn(`[Bot] Позиция (${obstaclePos.x}, ${obstaclePos.y}) уже занята препятствием, ищем другую`);
                        obstaclePos = this.findSafeObstaclePosition();
                        if (!obstaclePos) {
                            console.warn('[Bot] Не найдена свободная позиция для препятствия');
                        }
                    }
                    
                    // Проверяем, нет ли уже задачи в очереди для этой позиции
                    if (obstaclePos) {
                        const buildQueue = this.workerBloc.getBuildQueue(2);
                        const alreadyInQueue = buildQueue.some(task => task.x === obstaclePos.x && task.y === obstaclePos.y);
                        if (alreadyInQueue) {
                            console.warn(`[Bot] Позиция (${obstaclePos.x}, ${obstaclePos.y}) уже в очереди, ищем другую`);
                            obstaclePos = this.findSafeObstaclePosition();
                            if (!obstaclePos) {
                                console.warn('[Bot] Не найдена свободная позиция для препятствия');
                            }
                        }
                    }
                    
                    if (obstaclePos) {
                        // Добавляем задачу в очередь строительства
                        if (this.workerBloc.addBuildTaskToQueue(2, obstaclePos.x, obstaclePos.y, obstaclePos.type)) {
                            const queueSize = this.workerBloc.getBuildQueue(2).length;
                            this.currentState.currentAction = `Строительство препятствия (${obstaclePos.type})`;
                            this.currentState.priority = '3';
                            this.currentState.lastAction = `Добавлена задача: ${obstaclePos.type} в (${obstaclePos.x}, ${obstaclePos.y}), очередь: ${queueSize}`;
                            console.log(`[Bot] Добавлена задача на строительство препятствия (${obstaclePos.type}) в (${obstaclePos.x}, ${obstaclePos.y})`);
                            return;
                        } else {
                            console.warn('[Bot] Не удалось добавить задачу в очередь строительства');
                        }
                    }
                }
            } else {
                console.warn('[Bot] Не найдена позиция для строительства препятствия');
            }
        }
        
        // Приоритет 4: Строительство башен для защиты
        if (player.gold >= 100 && botTowers.length < 8) {
            let towerPos = this.findBestTowerPosition(botTowers);
            if (towerPos) {
                // Проверяем, что башня не блокирует путь между воротами
                // Башни тоже могут блокировать путь, так как они занимают клетку
                if (this.wouldBlockGates(towerPos.x, towerPos.y)) {
                    console.warn(`[Bot] Башня в (${towerPos.x}, ${towerPos.y}) заблокирует ворота, ищем альтернативу`);
                    // Пробуем найти другую безопасную позицию для башни
                    towerPos = this.findSafeTowerPosition(botTowers);
                    if (!towerPos) {
                        console.warn('[Bot] Не найдена безопасная позиция для башни');
                    }
                }
                
                if (towerPos) {
                    const hex = this.hexGrid.arrayToHex(towerPos.x, towerPos.y);
                    // Выбираем тип башни: сильная если золота много, базовая если мало
                    const towerType = player.gold >= 300 ? 'strong' : 'basic';
                    if (this.towerBloc.createTower(hex, 2, towerType)) {
                        this.currentState.currentAction = `Строительство башни (${towerType})`;
                        this.currentState.priority = '4';
                        this.currentState.lastAction = `Построена башня ${towerType} в (${towerPos.x}, ${towerPos.y}), всего: ${botTowers.length + 1}`;
                        console.log(`[Bot] Построена башня (${towerType}) в (${towerPos.x}, ${towerPos.y})`);
                        return;
                    } else {
                        console.warn(`[Bot] Не удалось построить башню в (${towerPos.x}, ${towerPos.y}), возможно позиция занята`);
                    }
                }
            } else {
                console.warn('[Bot] Не найдена позиция для строительства башни');
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
                    console.log(`[Bot] Улучшена башня ${towerToUpgrade.id}`);
                    return;
                }
            }
        }
        
        // Приоритет 6: Создание солдат для атаки (если достаточно золота)
        if (player.gold >= 100 && botSoldiers.length < 5) {
            const centerX = Math.floor(this.hexGrid.width / 2);
            const gateY = 0;
            const gatePos = {x: centerX, y: gateY};
            // Выбираем тип солдата: сильный если золота много, базовый если мало
            const soldierType = player.gold >= 250 ? 'strong' : 'basic';
            if (this.soldierBloc.createSoldier(gatePos, 2, soldierType, this.obstacleBloc, this.towerBloc)) {
                this.currentState.currentAction = `Создание солдата (${soldierType})`;
                this.currentState.priority = '6';
                this.currentState.lastAction = `Создан солдат ${soldierType} для атаки, всего: ${botSoldiers.length + 1}`;
                console.log(`[Bot] Создан солдат (${soldierType}) для атаки`);
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
                console.log('[Bot] Создан дополнительный сборщик (много золота на карте)');
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
        
        // Логируем состояние для отладки
        if (Math.random() < 0.05) { // Логируем примерно 5% случаев
            console.log('[Bot] Ожидание:', {
                gold: player.gold,
                gatherers: gatherers.length,
                builders: builders.length,
                towers: botTowers.length,
                soldiers: botSoldiers.length,
                availableGold,
                reasons
            });
        }
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
     * Находит лучшую позицию для строительства препятствия
     */
    findBestObstaclePosition() {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        
        // Ищем позиции вокруг базы для защиты
        const defensePositions = [];
        const defenseRadius = 2;
        
        for (let dx = -defenseRadius; dx <= defenseRadius; dx++) {
            for (let dy = 1; dy <= defenseRadius + 1; dy++) {
                const x = centerX + dx;
                const y = baseY + dy;
                
                if (x < 0 || x >= this.hexGrid.width || y < 0 || y >= this.hexGrid.height) {
                    continue;
                }
                
                // Проверяем, не на базе ли это
                if (y === 0) continue;
                
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
                
                defensePositions.push({x, y, priority: dy}); // Ближе к базе = выше приоритет
            }
        }
        
        if (defensePositions.length > 0) {
            // Сортируем по приоритету (ближе к базе)
            defensePositions.sort((a, b) => a.priority - b.priority);
            const bestPos = defensePositions[0];
            // Выбираем тип: камень для критических позиций, дерево для остальных
            const type = bestPos.priority <= 1 ? 'stone' : 'tree';
            return {x: bestPos.x, y: bestPos.y, type};
        }
        
        // Если не нашли позиции вокруг базы, ищем стратегические позиции
        const strategicPositions = [];
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
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
                
                // Приоритет позициям ближе к центру и к вражеской базе
                const distanceToEnemyBase = Math.abs(y - (this.hexGrid.height - 1));
                const distanceToCenter = Math.abs(x - centerX);
                const priority = distanceToEnemyBase + distanceToCenter;
                
                strategicPositions.push({x, y, priority});
            }
        }
        
        if (strategicPositions.length > 0) {
            strategicPositions.sort((a, b) => a.priority - b.priority);
            const bestPos = strategicPositions[0];
            return {x: bestPos.x, y: bestPos.y, type: 'tree'};
        }
        
        return null;
    }
    
    /**
     * Проверяет, заблокирует ли препятствие в указанной позиции путь между воротами
     */
    wouldBlockGates(x, y) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        
        // Координаты ворот игрока 1 (внизу)
        // Ворота могут быть на предпоследней строке (height - 2) с чётным x или на последней (height - 1) с нечётным x
        // Проверяем оба варианта
        let player1GateX = centerX;
        let player1GateY;
        if (centerX % 2 === 0) {
            // centerX чётный - ворота на предпоследней строке
            player1GateY = this.hexGrid.height - 2;
        } else {
            // centerX нечётный - ворота на последней строке
            player1GateY = this.hexGrid.height - 1;
        }
        
        // Координаты ворот игрока 2 (вверху)
        const player2GateX = centerX;
        const player2GateY = 0;
        
        // Преобразуем в hex координаты
        const gate1Hex = this.hexGrid.arrayToHex(player1GateX, player1GateY);
        const gate2Hex = this.hexGrid.arrayToHex(player2GateX, player2GateY);
        
        // Проверяем текущий путь (без препятствия)
        const currentPath = this.hexGrid.findPath(gate1Hex, gate2Hex, this.obstacleBloc, this.towerBloc, false);
        if (!currentPath || currentPath.length === 0) {
            // Путь уже заблокирован - не можем проверить
            console.warn('[Bot] Путь между воротами уже заблокирован!');
            return false; // Разрешаем строительство, так как путь уже заблокирован
        }
        
        // Временно добавляем препятствие для проверки
        const tempObstacle = this.obstacleBloc.addObstacle(x, y, 'stone');
        
        // Проверяем путь с временным препятствием
        const pathWithObstacle = this.hexGrid.findPath(gate1Hex, gate2Hex, this.obstacleBloc, this.towerBloc, false);
        
        // Удаляем временное препятствие
        this.obstacleBloc.removeObstacle(tempObstacle.id);
        
        // Если путь не найден с препятствием - оно блокирует ворота
        if (!pathWithObstacle || pathWithObstacle.length === 0) {
            return true; // Препятствие блокирует путь
        }
        
        return false; // Препятствие не блокирует путь
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
                
                if (!tooClose && !this.wouldBlockGates(x, y)) {
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
     * Находит лучшую позицию для строительства башни
     */
    findBestTowerPosition(existingTowers) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        
        // Ищем позиции для защиты базы
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
                
                if (!tooClose) {
                    defensePositions.push({x, y, priority});
                }
            }
        }
        
        if (defensePositions.length > 0) {
            defensePositions.sort((a, b) => a.priority - b.priority);
            return defensePositions[0];
        }
        
        // Если не нашли позиции вокруг базы, ищем стратегические позиции
        const strategicPositions = [];
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
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
                
                // Приоритет позициям ближе к вражеской базе
                const distanceToEnemyBase = Math.abs(y - (this.hexGrid.height - 1));
                const priority = distanceToEnemyBase;
                
                strategicPositions.push({x, y, priority});
            }
        }
        
        if (strategicPositions.length > 0) {
            strategicPositions.sort((a, b) => a.priority - b.priority);
            return strategicPositions[0];
        }
        
        return null;
    }
}
