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
        
        // Система обучения стратегии игрока 1
        this.learnedStrategy = {
            lastAnalysisTime: 0,
            analysisInterval: 5000, // Анализ каждые 5 секунд
            towerPatterns: [], // Паттерны размещения башен
            obstaclePatterns: [] // Паттерны размещения препятствий
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

        // Инициализируем learnedStrategy, если его нет (на случай проблем с кэшем)
        if (!this.learnedStrategy) {
            this.learnedStrategy = {
                lastAnalysisTime: 0,
                analysisInterval: 5000, // Анализ каждые 5 секунд
                towerPatterns: [], // Паттерны размещения башен
                obstaclePatterns: [] // Паттерны размещения препятствий
            };
        }

        // Периодически анализируем стратегию первого игрока для обучения
        if (currentTime - this.learnedStrategy.lastAnalysisTime >= this.learnedStrategy.analysisInterval) {
            this.analyzePlayer1Strategy();
            this.learnedStrategy.lastAnalysisTime = currentTime;
        }

        if (currentTime - this.lastActionTime < this.actionInterval) {
            return;
        }

        this.lastActionTime = currentTime;
        this.makeDecision(currentTime);
    }
    
    /**
     * Анализирует стратегию первого игрока и сохраняет паттерны для обучения
     */
    analyzePlayer1Strategy() {
        // Инициализируем learnedStrategy, если его нет
        if (!this.learnedStrategy) {
            this.learnedStrategy = {
                lastAnalysisTime: 0,
                analysisInterval: 5000,
                towerPatterns: [],
                obstaclePatterns: []
            };
        }
        const towerState = this.towerBloc.getState();
        const centerX = Math.floor(this.hexGrid.width / 2);
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        // Находим башни первого игрока
        const player1Towers = towerState.towers.filter(t => t.playerId === 1);
        
        // Находим препятствия первого игрока (на его территории)
        const player1Obstacles = [];
        if (this.obstacleBloc) {
            // Получаем препятствия через getState()
            const obstacleState = this.obstacleBloc.getState();
            const allObstacles = obstacleState.obstacles || [];
            for (const obstacle of allObstacles) {
                // Определяем, на чьей территории препятствие (по Y координате)
                const obstacleY = obstacle.y;
                if (obstacleY >= halfHeight) {
                    // Территория игрока 1
                    player1Obstacles.push(obstacle);
                }
            }
        }
        
        // Анализируем паттерны размещения башен
        if (player1Towers.length > 0) {
            // Группируем башни по расстоянию от центра и от базы
            const towerPatterns = player1Towers.map(tower => {
                const distanceFromCenter = Math.abs(tower.x - centerX);
                const distanceFromBase = Math.abs(tower.y - (this.hexGrid.height - 1));
                return {
                    x: tower.x,
                    y: tower.y,
                    distanceFromCenter,
                    distanceFromBase,
                    type: tower.type
                };
            });
            
            // Сохраняем паттерны (ограничиваем количество для производительности)
            this.learnedStrategy.towerPatterns = towerPatterns.slice(0, 10);
        }
        
        // Анализируем паттерны размещения препятствий
        if (player1Obstacles.length > 0) {
            // Группируем препятствия по расстоянию от центра
            const obstaclePatterns = player1Obstacles.map(obstacle => {
                const distanceFromCenter = Math.abs(obstacle.x - centerX);
                const distanceFromBase = Math.abs(obstacle.y - (this.hexGrid.height - 1));
                return {
                    x: obstacle.x,
                    y: obstacle.y,
                    distanceFromCenter,
                    distanceFromBase,
                    type: obstacle.type
                };
            });
            
            // Сохраняем паттерны (ограничиваем количество для производительности)
            this.learnedStrategy.obstaclePatterns = obstaclePatterns.slice(0, 20);
        }
    }
    
    /**
     * Находит позицию для препятствия на основе изученной стратегии первого игрока
     */
    findObstaclePositionFromLearning() {
        // Инициализируем learnedStrategy, если его нет
        if (!this.learnedStrategy) {
            this.learnedStrategy = {
                lastAnalysisTime: 0,
                analysisInterval: 5000,
                towerPatterns: [],
                obstaclePatterns: []
            };
        }
        if (this.learnedStrategy.obstaclePatterns.length === 0) {
            return null;
        }
        
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // База бота (игрок 2)
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        // Берём случайный паттерн препятствия первого игрока
        const pattern = this.learnedStrategy.obstaclePatterns[
            Math.floor(Math.random() * this.learnedStrategy.obstaclePatterns.length)
        ];
        
        // Адаптируем паттерн для территории бота (зеркально относительно середины карты)
        // Если препятствие первого игрока на расстоянии distanceFromBase от его базы,
        // ставим препятствие на таком же расстоянии от нашей базы
        const adaptedY = baseY + pattern.distanceFromBase;
        const adaptedX = centerX + (pattern.x - centerX); // Сохраняем смещение от центра
        
        // Проверяем, что позиция на территории бота
        if (!this.isInBotTerritory(adaptedX, adaptedY)) {
            return null;
        }
        
        // Проверяем, свободна ли позиция
        const hex = this.hexGrid.arrayToHex(adaptedX, adaptedY);
        if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
            return null;
        }
        
        const tower = this.towerBloc.getTowerAt(hex);
        if (tower) return null;
        
        const obstacle = this.obstacleBloc.getObstacleAt(adaptedX, adaptedY);
        if (obstacle) return null;
        
        // Проверяем, не блокирует ли путь
        if (this.wouldBlockGates(adaptedX, adaptedY, false)) {
            return null;
        }
        
        return {
            x: adaptedX,
            y: adaptedY,
            type: pattern.type // Используем тот же тип препятствия
        };
    }
    
    /**
     * Находит позицию для башни на основе изученной стратегии первого игрока
     */
    findTowerPositionFromLearning(existingTowers) {
        // Инициализируем learnedStrategy, если его нет
        if (!this.learnedStrategy) {
            this.learnedStrategy = {
                lastAnalysisTime: 0,
                analysisInterval: 5000,
                towerPatterns: [],
                obstaclePatterns: []
            };
        }
        if (this.learnedStrategy.towerPatterns.length === 0) {
            return null;
        }
        
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // База бота (игрок 2)
        
        // Берём случайный паттерн башни первого игрока
        const pattern = this.learnedStrategy.towerPatterns[
            Math.floor(Math.random() * this.learnedStrategy.towerPatterns.length)
        ];
        
        // Адаптируем паттерн для территории бота
        const adaptedY = baseY + pattern.distanceFromBase;
        const adaptedX = centerX + (pattern.x - centerX); // Сохраняем смещение от центра
        
        // Проверяем, что позиция на территории бота
        if (!this.isInBotTerritory(adaptedX, adaptedY)) {
            return null;
        }
        
        // Проверяем, свободна ли позиция
        const hex = this.hexGrid.arrayToHex(adaptedX, adaptedY);
        if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
            return null;
        }
        
        const tower = this.towerBloc.getTowerAt(hex);
        if (tower) return null;
        
        const obstacle = this.obstacleBloc.getObstacleAt(adaptedX, adaptedY);
        if (obstacle) return null;
        
        // Проверяем, не слишком ли близко к другим башням
        for (const existingTower of existingTowers) {
            const existingHex = this.hexGrid.arrayToHex(existingTower.x, existingTower.y);
            const distance = this.hexGrid.hexDistance(hex, existingHex);
            if (distance < 2) {
                return null;
            }
        }
        
        // Проверяем, не блокирует ли путь
        if (this.wouldBlockGates(adaptedX, adaptedY, true)) {
            return null;
        }
        
        return {
            x: adaptedX,
            y: adaptedY
        };
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
        // Проверяем стоимость препятствий: камни - 10, деревья - 5
        const obstacleCost = 10; // Минимальная стоимость (для камней)
        if (builders.length > 0 && player.gold >= Math.max(this.minGoldReserve, obstacleCost)) {
            // Сначала пробуем использовать изученную стратегию первого игрока
            let obstaclePos = this.findObstaclePositionFromLearning();
            
            // Если не нашли по изученной стратегии, используем обычную логику
            if (!obstaclePos) {
                obstaclePos = this.findBestObstaclePosition();
            }
            let attempts = 0;
            const maxAttempts = 5; // Максимум попыток найти безопасную позицию
            
            while (obstaclePos && attempts < maxAttempts) {
                attempts++;
                
                // Проверяем стоимость выбранного препятствия
                const requiredCost = obstaclePos.type === 'stone' ? 10 : 5;
                if (player.gold < requiredCost) {
                    // Недостаточно золота для этого типа препятствия - пробуем другой тип
                    obstaclePos = this.findSafeObstaclePosition();
                    if (obstaclePos) {
                        const newRequiredCost = obstaclePos.type === 'stone' ? 10 : 5;
                        if (player.gold < newRequiredCost) {
                            break; // Недостаточно золота даже для дешёвого препятствия
                        }
                    }
                    continue;
                }
                
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
        
        // Приоритет 3.5: КРИТИЧЕСКАЯ ЗАЩИТА БАЗЫ - если вражеские солдаты атакуют базу
        const enemySoldiers = soldierState.soldiers.filter(s => s.playerId === 1);
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // База бота (игрок 2)
        const baseUnderAttack = enemySoldiers.some(soldier => {
            // Проверяем, атакует ли солдат базу или находится рядом с ней
            if (soldier.attackingBase || soldier.baseAttackTarget) {
                return true;
            }
            // Проверяем, находится ли солдат рядом с базой (в пределах 3 клеток)
            const soldierHex = this.hexGrid.arrayToHex(soldier.x, soldier.y);
            const baseHex = this.hexGrid.arrayToHex(centerX, baseY);
            const distance = this.hexGrid.hexDistance(soldierHex, baseHex);
            return distance <= 3;
        });
        
        if (baseUnderAttack && player.gold >= 100) {
            // СРОЧНО ставим башню рядом с базой для защиты
            let defenseTowerPos = this.findDefenseTowerPositionNearBase(botTowers);
            if (defenseTowerPos) {
                const currentQueue = this.workerBloc.getBuildQueue(2);
                if (currentQueue.length < 5) {
                    const towerType = player.gold >= 200 ? 'strong' : 'basic';
                    if (this.workerBloc.addBuildTaskToQueue(2, defenseTowerPos.x, defenseTowerPos.y, 'tower', towerType, this.obstacleBloc, this.towerBloc)) {
                        const queueSize = this.workerBloc.getBuildQueue(2).length;
                        this.currentState.currentAction = `КРИТИЧЕСКАЯ ЗАЩИТА: Башня у базы (${towerType})`;
                        this.currentState.priority = '3.5';
                        this.currentState.lastAction = `База под атакой! Башня ${towerType} в (${defenseTowerPos.x}, ${defenseTowerPos.y}), очередь: ${queueSize}/5`;
                        return;
                    }
                }
            }
        }
        
        // Приоритет 4: Строительство башен для защиты (важно для защиты!)
        if (player.gold >= 100 && botTowers.length < 8) {
            // Приоритет строительству башен, если их мало
            if (botTowers.length < this.minTowers || player.gold >= 200) {
                // Сначала пробуем использовать изученную стратегию первого игрока
                let towerPos = this.findTowerPositionFromLearning(botTowers);
                
                // Если не нашли по изученной стратегии, используем обычную логику
                if (!towerPos) {
                    towerPos = this.findBestTowerPosition(botTowers);
                }
                // findBestTowerPosition уже проверяет wouldBlockGates, но на всякий случай проверяем ещё раз
                if (towerPos) {
                    // КРИТИЧНО: Проверяем, что башня на территории бота
                    if (!this.isInBotTerritory(towerPos.x, towerPos.y)) {
                        // Башня не на территории бота - ищем другую позицию
                        towerPos = this.findSafeTowerPosition(botTowers);
                    }
                    
                    // Дополнительная проверка: убеждаемся, что башня не блокирует путь
                    if (towerPos && this.wouldBlockGates(towerPos.x, towerPos.y, true)) { // true = это башня
                        towerPos = this.findSafeTowerPosition(botTowers);
                    }
                    
                    if (towerPos) {
                        // Финальная проверка территории
                        if (!this.isInBotTerritory(towerPos.x, towerPos.y)) {
                            towerPos = null;
                        }
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
     * ТОЛЬКО на территории бота и по бокам от центра (создаём узкие проходы шириной 1 клетка)
     */
    findSafeObstaclePosition() {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        // Получаем текущую очередь строительства
        const buildQueue = this.workerBloc.getBuildQueue(2);
        const queuedPositions = new Set(buildQueue.map(task => `${task.x},${task.y}`));
        
        // Ищем все возможные позиции ТОЛЬКО на территории бота
        const allPositions = [];
        
        // Ищем позиции в верхней половине карты (территория бота)
        for (let y = 1; y < halfHeight; y++) {
            for (let x = 0; x < this.hexGrid.width; x++) {
                // КРИТИЧНО: Проверяем, что позиция на территории бота
                if (!this.isInBotTerritory(x, y)) {
                    continue;
                }
                
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
                
                // Проверяем, не блокирует ли препятствие путь
                if (this.wouldBlockGates(x, y, false)) {
                    continue;
                }
                
                // ВАЖНО: Приоритет позициям по бокам от центра (создаём узкие проходы шириной 1 клетка)
                // Центральная линия (x === centerX) - это проход, не ставим там препятствия
                const distanceFromCenter = Math.abs(x - centerX);
                
                // Пропускаем центральную линию (проход шириной 1 клетка)
                if (distanceFromCenter === 0) {
                    continue; // Не ставим препятствия на центральной линии
                }
                
                // Приоритет позициям по бокам от центра (создаём узкие проходы)
                // Чем дальше от центра, тем выше приоритет (но не слишком далеко)
                const priority = distanceFromCenter * 20 + (halfHeight - y); // Боковые позиции приоритетнее, ближе к базе
                
                allPositions.push({x, y, priority, distanceFromCenter});
            }
        }
        
        if (allPositions.length > 0) {
            // Сортируем по приоритету
            allPositions.sort((a, b) => b.priority - a.priority);
            const bestPos = allPositions[0];
            // Используем камни для создания прочных препятствий
            return {x: bestPos.x, y: bestPos.y, type: 'stone'};
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
     * Проверяет, находится ли позиция на пути вражеских солдат
     */
    isOnEnemyPath(x, y, path) {
        if (!path || path.length === 0) return false;
        
        for (const pathHex of path) {
            const pathArr = this.hexGrid.hexToArray(pathHex);
            if (pathArr.x === x && pathArr.y === y) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Проверяет, находится ли позиция на территории бота (игрок 2)
     * Территория бота - верхняя половина карты (y < height / 2)
     * НО: не слишком близко к краям карты (минимум 2 клетки от края)
     */
    isInBotTerritory(x, y) {
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        // Проверяем, что позиция в верхней половине и не на базе
        if (y >= halfHeight || y <= 0) {
            return false;
        }
        // Проверяем, что позиция не слишком близко к краям карты
        if (x < 2 || x >= this.hexGrid.width - 2) {
            return false; // Не ставим препятствия по краям карты
        }
        return true;
    }
    
    /**
     * Находит лучшую позицию для строительства препятствия
     * Стратегия: ставить препятствия только на пути вражеских солдат и только на своей территории
     * Создавать узкие проходы шириной 1 клетка
     */
    findBestObstaclePosition() {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        
        // Вычисляем текущий путь вражеских солдат
        const currentPath = this.calculateEnemyPath();
        const basePathLength = currentPath.length;
        
        if (basePathLength === 0 || !currentPath.path || currentPath.path.length === 0) {
            // Путь не найден - используем простую стратегию
            return this.findSafeObstaclePosition();
        }
        
        // ВАЖНО: Ставим препятствия только на пути вражеских солдат
        // Ищем позиции на пути, которые максимально удлинят путь при размещении препятствия
        const candidatePositions = [];
        
        // Проверяем только позиции на текущем пути вражеских солдат
        for (let i = 1; i < currentPath.path.length - 1; i++) {
            const pathHex = currentPath.path[i];
            const pathArr = this.hexGrid.hexToArray(pathHex);
            const x = pathArr.x;
            const y = pathArr.y;
            
            // КРИТИЧНО: Проверяем, что позиция на территории бота
            if (!this.isInBotTerritory(x, y)) {
                continue; // Пропускаем позиции вне территории бота
            }
            
            // Пропускаем заблокированные ячейки
            const hex = this.hexGrid.arrayToHex(x, y);
            if (this.hexGrid.isBlocked(hex, this.obstacleBloc, this.towerBloc, false)) {
                continue;
            }
            
            // Пропускаем башни и препятствия
            const tower = this.towerBloc.getTowerAt(hex);
            if (tower) continue;
            
            const obstacle = this.obstacleBloc.getObstacleAt(x, y);
            if (obstacle) continue;
            
            // ВАЖНО: Не ставим препятствия на центральной линии (проход шириной 1 клетка)
            const distanceFromCenter = Math.abs(x - centerX);
            if (distanceFromCenter === 0) {
                continue; // Не ставим препятствия на центральной линии (проход)
            }
            
            // Проверяем, не блокирует ли препятствие путь полностью
            if (this.wouldBlockGates(x, y, false)) {
                continue;
            }
            
            // Временно добавляем препятствие и проверяем новый путь
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
            
            // Если путь удлинился и путь всё ещё существует, добавляем позицию в кандидаты
            if (newPathLength > basePathLength && newPathLength > 0) {
                const pathIncrease = newPathLength - basePathLength;
                // Приоритет позициям, которые больше удлиняют путь
                // Предпочитаем позиции ближе к нашей базе (в конце пути) - создаём защиту ближе к базе
                // Бонус за позиции по бокам от центра (создаём узкие проходы)
                const pathIndex = i; // Индекс на пути
                const distanceToOurBase = currentPath.path.length - i; // Расстояние до нашей базы
                const sideBonus = distanceFromCenter > 1 ? 50 : 0; // Бонус за позиции по бокам
                const baseProximityBonus = Math.max(0, 20 - distanceToOurBase); // Бонус за близость к базе (макс 20)
                const priority = pathIncrease * 100 + baseProximityBonus + sideBonus - pathIndex; // Больше увеличение = выше приоритет
                
                candidatePositions.push({
                    x, y,
                    pathIncrease,
                    priority,
                    newPathLength,
                    pathIndex,
                    distanceFromCenter
                });
            }
        }
        
        if (candidatePositions.length > 0) {
            // Сортируем по приоритету (больше увеличение пути = выше приоритет)
            candidatePositions.sort((a, b) => b.priority - a.priority);
            const bestPos = candidatePositions[0];
            // Используем камни для максимального удлинения пути (нельзя разрушить)
            return {x: bestPos.x, y: bestPos.y, type: 'stone'};
        }
        
        // Если не нашли позиции на пути - используем простую стратегию
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
                
                // КРИТИЧНО: Проверяем, что позиция на территории бота
                if (!this.isInBotTerritory(x, y)) {
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
        
        // Стратегические позиции ТОЛЬКО на территории бота
        for (let y = 1; y < halfHeight; y++) {
            for (let x = 0; x < this.hexGrid.width; x++) {
                // КРИТИЧНО: Проверяем, что позиция на территории бота
                if (!this.isInBotTerritory(x, y)) {
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
     * Проверяет, может ли башня в позиции (towerX, towerY) простреливать проход
     * Проход - это последовательность ячеек пути
     */
    canTowerCoverPassage(towerX, towerY, passageHexes, towerRange) {
        const towerHex = this.hexGrid.arrayToHex(towerX, towerY);
        
        // Получаем все гексы в радиусе башни
        const towerRangeHexes = this.hexGrid.getHexesInRange(towerHex, towerRange);
        const towerRangeSet = new Set(towerRangeHexes.map(h => this.hexGrid.hexKey(h)));
        
        // Проверяем, покрывает ли башня хотя бы часть прохода
        let coveredCount = 0;
        for (const passageHex of passageHexes) {
            const passageKey = this.hexGrid.hexKey(passageHex);
            if (towerRangeSet.has(passageKey)) {
                coveredCount++;
            }
        }
        
        // Башня должна покрывать хотя бы 50% прохода или минимум 2 ячейки
        return coveredCount >= Math.max(2, Math.ceil(passageHexes.length * 0.5));
    }
    
    /**
     * Находит проходы в пути (узкие места, где можно разместить башни для обстрела)
     */
    findPassagesInPath(path, passageWidth = 3) {
        if (!path || path.length < passageWidth) {
            return [];
        }
        
        const passages = [];
        
        // Ищем участки пути длиной passageWidth
        for (let i = 0; i <= path.length - passageWidth; i++) {
            const passageHexes = path.slice(i, i + passageWidth);
            passages.push({
                hexes: passageHexes,
                startIndex: i,
                endIndex: i + passageWidth - 1
            });
        }
        
        return passages;
    }
    
    /**
     * Находит лучшую позицию для строительства башни
     * Стратегия: размещать башни так, чтобы их зона поражения перекрывала проходы в пути вражеских солдат
     */
    findBestTowerPosition(existingTowers) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = 0; // Игрок 2: верхняя строка
        
        // Получаем радиус башни (используем базовый радиус)
        const towerConfig = this.towerBloc.getTowerConfig('basic');
        const towerRange = towerConfig.range || 3;
        
        // Вычисляем путь вражеских солдат
        const enemyPath = this.calculateEnemyPath();
        
        if (enemyPath.path && enemyPath.path.length > 0) {
            // Находим проходы в пути (участки пути длиной 3-5 ячеек)
            const passages = this.findPassagesInPath(enemyPath.path, 3);
            
            // Для каждого прохода ищем позиции для башен, которые могут его простреливать
            const towerCandidates = [];
            
            for (const passage of passages) {
                // Ищем позиции вокруг прохода, где можно поставить башню
                const passageCenterIndex = Math.floor(passage.startIndex + (passage.endIndex - passage.startIndex) / 2);
                const passageCenterHex = enemyPath.path[passageCenterIndex];
                const passageCenterArr = this.hexGrid.hexToArray(passageCenterHex);
                
                // Ищем позиции в радиусе башни + 1 от центра прохода
                const searchRadius = towerRange + 2;
                
                for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                        const x = passageCenterArr.x + dx;
                        const y = passageCenterArr.y + dy;
                        
                        if (x < 0 || x >= this.hexGrid.width || y < 0 || y >= this.hexGrid.height) {
                            continue;
                        }
                        
                        if (y === 0) continue; // Не на базе
                        
                        // КРИТИЧНО: Проверяем, что позиция на территории бота
                        if (!this.isInBotTerritory(x, y)) {
                            continue; // Пропускаем позиции вне территории бота
                        }
                        
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
                        
                        if (tooClose) continue;
                        
                        // КРИТИЧНО: Проверяем, не блокирует ли башня путь между воротами
                        if (this.wouldBlockGates(x, y, true)) {
                            continue;
                        }
                        
                        // Проверяем, может ли башня простреливать проход
                        if (this.canTowerCoverPassage(x, y, passage.hexes, towerRange)) {
                            // Вычисляем приоритет: чем больше прохода покрывает башня, тем выше приоритет
                            const towerHex = this.hexGrid.arrayToHex(x, y);
                            const towerRangeHexes = this.hexGrid.getHexesInRange(towerHex, towerRange);
                            const towerRangeSet = new Set(towerRangeHexes.map(h => this.hexGrid.hexKey(h)));
                            
                            let coveredCount = 0;
                            for (const passageHex of passage.hexes) {
                                if (towerRangeSet.has(this.hexGrid.hexKey(passageHex))) {
                                    coveredCount++;
                                }
                            }
                            
                            const coverageRatio = coveredCount / passage.hexes.length;
                            // Приоритет: больше покрытие прохода = выше приоритет
                            // Также предпочитаем позиции ближе к вражеской базе
                            const priority = coverageRatio * 1000 - passage.startIndex;
                            
                            towerCandidates.push({
                                x, y,
                                priority,
                                coverageRatio,
                                coveredCount,
                                passageIndex: passage.startIndex
                            });
                        }
                    }
                }
            }
            
            if (towerCandidates.length > 0) {
                // Сортируем по приоритету
                towerCandidates.sort((a, b) => b.priority - a.priority);
                return {x: towerCandidates[0].x, y: towerCandidates[0].y};
            }
            
            // Если не нашли позиции для проходов, используем ключевые точки
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
                
                // КРИТИЧНО: Проверяем, что позиция на территории бота
                if (!this.isInBotTerritory(x, y)) {
                    continue; // Пропускаем позиции вне территории бота
                }
                
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
