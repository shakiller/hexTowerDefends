export class WorkerBloc {
    constructor(gameBloc, hexGrid) {
        this.gameBloc = gameBloc;
        this.hexGrid = hexGrid;
        this.state = {
            workers: [] // {id, playerId, x, y, type, targetX, targetY, carryingGold, goldAmount, buildingTarget, ...}
        };
        this.listeners = [];
        this.workerIdCounter = 0;
        
        // Очередь задач на строительство для каждого игрока
        // Формат: { playerId: [{x, y, type}, ...] }
        this.buildQueue = {
            1: [],
            2: []
        };
        
        // Настройки рабочих-сборщиков
        this.gathererSettings = {
            capacity: 10,      // Вместительность
            health: 30,         // Жизнь
            gatherSpeed: 1000,  // Скорость сбора (мс на единицу золота)
            moveSpeed: 0.1      // Скорость перемещения (множитель от базовой скорости)
        };
        
        // Настройки рабочих-строителей
        this.builderSettings = {
            health: 30,         // Жизнь
            moveSpeed: 0.1,     // Скорость перемещения
            buildSpeed: 2000    // Скорость строительства (мс)
        };
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    emit() {
        this.listeners.forEach(listener => listener(this.state));
    }

    createWorker(startPos, playerId, type) {
        const arrPos = startPos.x !== undefined && startPos.y !== undefined ? startPos : 
                      { x: startPos.q, y: startPos.r + Math.floor(startPos.q / 2) };
        
        const gameState = this.gameBloc.getState();
        const player = gameState.players[playerId];
        
        const cost = 50; // Стоимость как простой солдат
        if (player.gold < cost) {
            return false;
        }

        const worker = {
            id: this.workerIdCounter++,
            playerId,
            x: arrPos.x,
            y: arrPos.y,
            type, // 'gatherer' или 'builder'
            currentHexIndex: 0,
            path: null,
            moveProgress: 0,
            direction: 0,
            targetX: null,
            targetY: null,
            targetGoldId: null,
            carryingGold: false,
            goldAmount: 0,
            buildingTarget: null, // {x, y, type} для строителя
            buildingProgress: 0,
            lastGatherTime: 0,
            lastBuildTime: 0,
            health: type === 'gatherer' ? this.gathererSettings.health : this.builderSettings.health,
            maxHealth: type === 'gatherer' ? this.gathererSettings.health : this.builderSettings.health
        };

        this.state.workers.push(worker);
        this.gameBloc.updatePlayerGold(playerId, -cost);
        this.emit();
        return true;
    }

    getGathererSettings() {
        return { ...this.gathererSettings };
    }

    setGathererSetting(setting, value) {
        if (this.gathererSettings.hasOwnProperty(setting)) {
            if (setting === 'capacity' || setting === 'health') {
                this.gathererSettings[setting] = Math.max(1, value);
            } else if (setting === 'gatherSpeed') {
                this.gathererSettings[setting] = Math.max(100, value);
            } else if (setting === 'moveSpeed') {
                this.gathererSettings[setting] = Math.max(0.1, Math.min(2.0, value));
            }
        }
    }

    getBuilderSettings() {
        return { ...this.builderSettings };
    }

    setBuilderSetting(setting, value) {
        if (this.builderSettings.hasOwnProperty(setting)) {
            if (setting === 'health') {
                this.builderSettings[setting] = Math.max(1, value);
            } else if (setting === 'buildSpeed') {
                this.builderSettings[setting] = Math.max(100, value);
            } else if (setting === 'moveSpeed') {
                this.builderSettings[setting] = Math.max(0.01, Math.min(0.2, value));
            }
        }
    }

    assignBuildTask(workerId, targetX, targetY, obstacleType) {
        const worker = this.state.workers.find(w => w.id === workerId);
        if (!worker || worker.type !== 'builder') return false;

        worker.buildingTarget = { 
            x: targetX, 
            y: targetY, 
            buildType: 'obstacle',
            type: obstacleType 
        };
        worker.targetX = targetX;
        worker.targetY = targetY;
        worker.buildingProgress = 0;
        
        this.emit();
        return true;
    }
    
    // Добавить задачу в очередь
    addBuildTaskToQueue(playerId, targetX, targetY, buildType, buildSubType = null) {
        // buildType: 'obstacle' или 'tower' (или старый формат: 'stone', 'tree', 'basic', 'strong')
        // buildSubType: для obstacle - 'stone' или 'tree', для tower - 'basic' или 'strong'
        
        // Обратная совместимость: если buildType это тип препятствия или башни
        let actualBuildType = buildType;
        let actualSubType = buildSubType || buildType;
        
        if (buildType === 'stone' || buildType === 'tree') {
            actualBuildType = 'obstacle';
            actualSubType = buildType;
        } else if (buildType === 'basic' || buildType === 'strong') {
            actualBuildType = 'tower';
            actualSubType = buildType;
        } else {
            // Новый формат: buildType уже 'obstacle' или 'tower'
            actualSubType = buildSubType || (buildType === 'obstacle' ? 'stone' : 'basic');
        }
        
        if (!this.buildQueue[playerId]) {
            this.buildQueue[playerId] = [];
        }
        this.buildQueue[playerId].push({ 
            x: targetX, 
            y: targetY, 
            buildType: actualBuildType, // 'obstacle' или 'tower'
            type: actualSubType // 'stone', 'tree', 'basic', 'strong'
        });
        this.emit();
        return true;
    }
    
    // Попытаться назначить задачу из очереди свободному строителю
    assignTaskFromQueue(playerId, obstacleBloc, towerBloc, hexGrid) {
        if (!this.buildQueue[playerId] || this.buildQueue[playerId].length === 0) {
            return false; // Очередь пуста
        }
        
        // Ищем свободных строителей этого игрока
        const freeBuilders = this.state.workers.filter(w => 
            w.playerId === playerId && 
            w.type === 'builder' && 
            !w.buildingTarget
        );
        
        if (freeBuilders.length === 0) {
            return false; // Нет свободных строителей
        }
        
        // Берем первую задачу из очереди
        const task = this.buildQueue[playerId].shift();
        if (!task) {
            return false;
        }
        
        // Находим ближайшего свободного строителя к задаче
        let closestBuilder = null;
        let minDistance = Infinity;
        
        freeBuilders.forEach(builder => {
            const builderHex = hexGrid.arrayToHex(builder.x, builder.y);
            const targetHex = hexGrid.arrayToHex(task.x, task.y);
            const distance = hexGrid.hexDistance(builderHex, targetHex);
            if (distance < minDistance) {
                minDistance = distance;
                closestBuilder = builder;
            }
        });
        
        if (closestBuilder) {
            // Назначаем задачу строителю
            closestBuilder.buildingTarget = { 
                x: task.x, 
                y: task.y, 
                buildType: task.buildType || (task.type === 'stone' || task.type === 'tree' ? 'obstacle' : 'tower'),
                type: task.type || task.buildSubType || 'stone' 
            };
            closestBuilder.targetX = task.x;
            closestBuilder.targetY = task.y;
            closestBuilder.buildingProgress = 0;
            
            // Вычисляем путь сразу
            const builderHex = hexGrid.arrayToHex(closestBuilder.x, closestBuilder.y);
            const targetHex = hexGrid.arrayToHex(task.x, task.y);
            closestBuilder.path = hexGrid.findPath(builderHex, targetHex, obstacleBloc, towerBloc, true);
            closestBuilder.currentHexIndex = 0;
            closestBuilder.moveProgress = 0;
            
            // Проверяем, что путь найден
            if (!closestBuilder.path || closestBuilder.path.length <= 1) {
                // Возвращаем задачу в очередь
                closestBuilder.buildingTarget = null;
                closestBuilder.targetX = null;
                closestBuilder.targetY = null;
                closestBuilder.path = null;
                this.buildQueue[playerId].unshift(task);
                this.emit();
                return false;
            }
            
            this.emit();
            return true;
        }
        
        // Если не удалось назначить, возвращаем задачу в очередь
        this.buildQueue[playerId].unshift(task);
        return false;
    }

    updateWorkers(deltaTime, currentTime, goldBloc, obstacleBloc, towerBloc, hexGrid) {
        const normalizedDeltaTime = deltaTime / 1000; // Преобразуем в секунды
        const workersToRemove = [];
        
        // Проверяем очереди задач для обоих игроков и назначаем задачи свободным строителям
        // Делаем это в начале каждого кадра, чтобы сразу назначить задачи освободившимся строителям
        let queueChanged = false;
        if (this.assignTaskFromQueue(1, obstacleBloc, towerBloc, hexGrid)) {
            queueChanged = true;
        }
        if (this.assignTaskFromQueue(2, obstacleBloc, towerBloc, hexGrid)) {
            queueChanged = true;
        }
        if (queueChanged) {
            this.emit(); // Уведомляем об изменении очереди
        }

        this.state.workers.forEach(worker => {
            // Обновляем настройки из текущих значений
            if (worker.type === 'gatherer') {
                worker.maxHealth = this.gathererSettings.health;
                worker.health = Math.min(worker.health, worker.maxHealth);
            } else if (worker.type === 'builder') {
                worker.maxHealth = this.builderSettings.health;
                worker.health = Math.min(worker.health, worker.maxHealth);
            }

            // Проверка здоровья
            if (worker.health <= 0) {
                workersToRemove.push(worker.id);
                return;
            }

            // Логика для сборщика золота
            if (worker.type === 'gatherer') {
                this.updateGatherer(worker, currentTime, normalizedDeltaTime, goldBloc, obstacleBloc, towerBloc, hexGrid);
            }
            // Логика для строителя
            else if (worker.type === 'builder') {
                this.updateBuilder(worker, currentTime, normalizedDeltaTime, obstacleBloc, towerBloc, hexGrid);
            }
        });

        // Удаляем погибших рабочих
        if (workersToRemove.length > 0) {
            this.state.workers = this.state.workers.filter(w => !workersToRemove.includes(w.id));
            this.emit();
        }
    }

    updateGatherer(worker, currentTime, normalizedDeltaTime, goldBloc, obstacleBloc, towerBloc, hexGrid) {
        const currentHex = hexGrid.arrayToHex(worker.x, worker.y);
        const currentArr = hexGrid.hexToArray(currentHex);

        // Если рабочий несёт золото - идём на базу
        if (worker.carryingGold) {
            const centerX = Math.floor(hexGrid.width / 2);
            const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
            
            // Если уже на базе - сдаём золото
            if (currentArr.x === centerX && currentArr.y === baseY) {
                this.gameBloc.updatePlayerGold(worker.playerId, worker.goldAmount);
                worker.carryingGold = false;
                worker.goldAmount = 0;
                worker.targetGoldId = null;
                worker.path = null;
                worker.targetX = null;
                worker.targetY = null;
                this.emit();
                return;
            }

            // Идём на базу
            if (!worker.path || worker.targetX !== centerX || worker.targetY !== baseY) {
                const targetHex = hexGrid.arrayToHex(centerX, baseY);
                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true); // allowGates = true для рабочих
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
                worker.targetX = centerX;
                worker.targetY = baseY;
                this.emit(); // Уведомляем об изменении пути
            }
        }
        // Если рабочий собирает золото
        else if (worker.targetGoldId) {
            const goldPile = goldBloc.getState().goldPiles.find(p => p.id === worker.targetGoldId);
            if (!goldPile || goldPile.collected) {
                // Золото уже собрано - ищем новое
                worker.targetGoldId = null;
                worker.path = null;
                worker.targetX = null;
                worker.targetY = null;
            } else {
                // Проверяем, не находится ли золото на базе (заблокировано для рабочих)
                const goldHex = hexGrid.arrayToHex(goldPile.x, goldPile.y);
                const isBlocked = hexGrid.isBlocked(goldHex, obstacleBloc, towerBloc, false); // allowGates = false для проверки базы
                
                if (isBlocked) {
                    // Золото на базе - отменяем задачу
                    worker.targetGoldId = null;
                    worker.path = null;
                    worker.targetX = null;
                    worker.targetY = null;
                    this.emit();
                    return;
                }
                const goldArr = { x: goldPile.x, y: goldPile.y };
                // Проверяем, находится ли рабочий в той же клетке, что и золото
                const isOnSameCell = currentArr.x === goldArr.x && currentArr.y === goldArr.y;

                // Если рабочий в той же клетке, что и золото - собираем
                if (isOnSameCell) {
                    const timeSinceLastGather = currentTime - (worker.lastGatherTime || 0);
                    if (timeSinceLastGather >= this.gathererSettings.gatherSpeed) {
                        const collected = goldBloc.collectGold(worker.targetGoldId, 1);
                        worker.goldAmount += collected;
                        worker.lastGatherTime = currentTime;

                        // Если собрали до предела или золото закончилось
                        if (worker.goldAmount >= this.gathererSettings.capacity || !goldPile || goldPile.collected) {
                            worker.carryingGold = true;
                            worker.targetGoldId = null;
                            worker.path = null;
                        }
                    }
                    return; // Не двигаемся пока собираем
                } else {
                    // Идём к золоту
                    if (!worker.path || worker.targetX !== goldArr.x || worker.targetY !== goldArr.y) {
                        const targetHex = hexGrid.arrayToHex(goldArr.x, goldArr.y);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true); // allowGates = true для рабочих
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = goldArr.x;
                        worker.targetY = goldArr.y;
                        this.emit(); // Уведомляем об изменении пути
                    }
                }
            }
        }
        // Ищем новое золото
        else {
            const goldPiles = goldBloc.getState().goldPiles.filter(p => !p.collected);
            let closestGold = null;
            let minDistance = Infinity;

            goldPiles.forEach(pile => {
                // Проверяем, не находится ли золото на базе (заблокировано для рабочих)
                const pileHex = hexGrid.arrayToHex(pile.x, pile.y);
                const isBlocked = hexGrid.isBlocked(pileHex, obstacleBloc, towerBloc, false); // allowGates = false для проверки базы
                
                // Пропускаем золото на базе (кроме ворот, но ворота не должны иметь золота)
                if (isBlocked) {
                    return; // Пропускаем это золото
                }
                
                const distance = hexGrid.hexDistance(currentHex, pileHex);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestGold = pile;
                }
            });

            if (closestGold) {
                worker.targetGoldId = closestGold.id;
                worker.targetX = closestGold.x;
                worker.targetY = closestGold.y;
                const targetHex = hexGrid.arrayToHex(closestGold.x, closestGold.y);
                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true); // allowGates = true для рабочих
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
                
                // Отладка
                if (!worker.path || worker.path.length === 0) {
                    // Путь к золоту не найден
                } else {
                    // Путь к золоту найден
                }
                
                this.emit(); // Уведомляем об изменении пути
            } else {
                // Золото не найдено
            }
        }

        // Движение рабочего (аналогично солдату)
        if (worker.path && worker.path.length > 1) {
            const currentHexIndex = Math.floor(worker.currentHexIndex);
            if (currentHexIndex < worker.path.length - 1) {
                const currentHex = worker.path[currentHexIndex];
                const nextHex = worker.path[currentHexIndex + 1];
                const currentPixel = hexGrid.hexToPixel(currentHex);
                const nextPixel = hexGrid.hexToPixel(nextHex);
                
                const pixelDx = nextPixel.x - currentPixel.x;
                const pixelDy = nextPixel.y - currentPixel.y;
                const pixelDistance = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
                
                worker.direction = Math.atan2(pixelDy, pixelDx);
                
                const baseSpeed = 1.0 * this.gathererSettings.moveSpeed;
                const pixelSpeed = baseSpeed * normalizedDeltaTime * 1000; // Преобразуем обратно в пиксели
                if (pixelDistance > 0) {
                    worker.moveProgress += pixelSpeed / pixelDistance;
                }
                
                if (worker.moveProgress >= 1.0) {
                    worker.currentHexIndex += 1;
                    worker.moveProgress = 0;
                    const nextArr = hexGrid.hexToArray(nextHex);
                    worker.x = nextArr.x;
                    worker.y = nextArr.y;
                }
            }
        }
    }

    updateBuilder(worker, currentTime, deltaTime, obstacleBloc, towerBloc, hexGrid) {
        // Вычисляем текущую позицию - это будет обновляться по мере движения
        let currentHex = hexGrid.arrayToHex(worker.x, worker.y);
        let currentArr = hexGrid.hexToArray(currentHex);

        // Если есть задача на строительство
        if (worker.buildingTarget) {
            const target = worker.buildingTarget;
            // Проверяем, находится ли рабочий в той же клетке, что и место строительства
            const isOnSameCell = currentArr.x === target.x && currentArr.y === target.y;
            

            // Если рабочий в той же клетке, что и место строительства - строим
            if (isOnSameCell) {
                const timeSinceLastBuild = currentTime - (worker.lastBuildTime || 0);
                if (timeSinceLastBuild >= this.builderSettings.buildSpeed) {
                    // Определяем тип строительства
                    const buildType = target.buildType || (target.type === 'stone' || target.type === 'tree' ? 'obstacle' : 'tower');
                    
                    let buildSuccess = false;
                    if (buildType === 'tower') {
                        // Строим башню
                        const towerType = target.type || 'basic';
                        const targetHex = hexGrid.arrayToHex(target.x, target.y);
                        buildSuccess = towerBloc.createTower(targetHex, worker.playerId, towerType);
                    } else {
                        // Создаём препятствие
                        obstacleBloc.addObstacle(target.x, target.y, target.type);
                        buildSuccess = true;
                    }
                    
                    // Задача выполнена (или не удалась) - очищаем задачу и возвращаемся на базу
                    const centerX = Math.floor(hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                    const baseHex = hexGrid.arrayToHex(centerX, baseY);
                    
                    // Очищаем задачу строительства
                    worker.buildingTarget = null;
                    worker.lastBuildTime = currentTime;
                    worker.buildingProgress = 0;
                    
                    // Вычисляем путь на базу
                    worker.path = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true); // allowGates = true для рабочих
                    worker.currentHexIndex = 0;
                    worker.moveProgress = 0;
                    worker.targetX = centerX;
                    worker.targetY = baseY;
                    
                    this.emit();
                    
                    // Продолжаем выполнение, чтобы строитель начал двигаться к базе
                    // После возвращения на базу в следующем кадре получит новую задачу
                    // НЕ возвращаемся здесь, чтобы движение началось
                    // Обновляем currentHex и currentArr для дальнейшей обработки
                    currentHex = hexGrid.arrayToHex(worker.x, worker.y);
                    currentArr = hexGrid.hexToArray(currentHex);
                } else {
                    // Ещё строим - не двигаемся
                    return;
                }
            } else {
                // Идём к месту строительства
                if (!worker.path || worker.targetX !== target.x || worker.targetY !== target.y) {
                    const targetHex = hexGrid.arrayToHex(target.x, target.y);
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true); // allowGates = true для рабочих
                    worker.currentHexIndex = 0;
                    worker.moveProgress = 0;
                    worker.targetX = target.x;
                    worker.targetY = target.y;
                    
                    // Уведомляем об изменении пути
                    if (!worker.path || worker.path.length === 0) {
                        // Путь не найден
                    } else {
                        // Проверяем, что последняя ячейка пути действительно является целью
                        const lastPathHex = worker.path[worker.path.length - 1];
                        const lastPathArr = hexGrid.hexToArray(lastPathHex);
                        if (lastPathArr.x !== target.x || lastPathArr.y !== target.y) {
                            // Добавляем цель в конец пути, если она не там
                            worker.path.push(targetHex);
                        }
                    }
                    this.emit(); // Уведомляем об изменении пути
                }
            }
        }
        // Если на базе и нет задачи - проверяем очередь
        else {
            const centerX = Math.floor(hexGrid.width / 2);
            const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
            if (currentArr.x === centerX && currentArr.y === baseY) {
                // На базе - сначала проверяем очередь задач
                if (!worker.buildingTarget && this.buildQueue[worker.playerId] && this.buildQueue[worker.playerId].length > 0) {
                    const task = this.buildQueue[worker.playerId].shift();
                    if (task) {
                        worker.buildingTarget = { 
                            x: task.x, 
                            y: task.y, 
                            buildType: task.buildType || (task.type === 'stone' || task.type === 'tree' ? 'obstacle' : 'tower'),
                            type: task.type || task.buildSubType || 'stone' 
                        };
                        worker.targetX = task.x;
                        worker.targetY = task.y;
                        worker.buildingProgress = 0;
                        // Вычисляем путь к цели сразу
                        const targetHex = hexGrid.arrayToHex(task.x, task.y);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true);
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        
                        // Проверяем, что путь найден
                        if (!worker.path || worker.path.length <= 1) {
                            // Если путь не найден, очищаем задачу и возвращаем её в очередь
                            worker.buildingTarget = null;
                            worker.targetX = null;
                            worker.targetY = null;
                            worker.path = null;
                            this.buildQueue[worker.playerId].unshift(task);
                            this.emit();
                            return;
                        }
                        
                        this.emit();
                        // Продолжаем обработку - путь будет использован в секции движения ниже
                        // НЕ возвращаемся, чтобы движение началось в этом же кадре
                    } else {
                        return; // Нет задач в очереди
                    }
                } else if (!worker.buildingTarget) {
                    // На базе, нет задачи и нет очереди - очищаем все флаги движения
                    if (worker.path || worker.targetX !== null || worker.targetY !== null) {
                        worker.path = null;
                        worker.targetX = null;
                        worker.targetY = null;
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        this.emit(); // Уведомляем об изменении состояния
                    }
                    return; // На базе, нет задачи и нет очереди
                }
                
                // Если есть buildingTarget (только что назначен из очереди или уже был), 
                // но путь не вычислен или слишком короткий - вычисляем заново
                if (worker.buildingTarget) {
                    const target = worker.buildingTarget;
                    // Проверяем, что путь правильный и ведёт к цели
                    if (!worker.path || worker.path.length <= 1 || worker.targetX !== target.x || worker.targetY !== target.y) {
                        const targetHex = hexGrid.arrayToHex(target.x, target.y);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true);
                        if (worker.path && worker.path.length > 1) {
                            worker.currentHexIndex = 0;
                            worker.moveProgress = 0;
                            worker.targetX = target.x;
                            worker.targetY = target.y;
                            this.emit();
                        } else {
                            return;
                        }
                    }
                    // Если путь есть и правильный - продолжаем обработку, чтобы начать движение
                }
            } else {
                // Не на базе - если есть задача, идём к цели, иначе возвращаемся на базу
                if (worker.buildingTarget) {
                    // Есть задача - идём к цели
                    const target = worker.buildingTarget;
                    if (!worker.path || worker.targetX !== target.x || worker.targetY !== target.y) {
                        const targetHex = hexGrid.arrayToHex(target.x, target.y);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true);
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = target.x;
                        worker.targetY = target.y;
                        this.emit();
                    }
                } else {
                    // Нет задачи - возвращаемся на базу
                    if (!worker.path || worker.targetX !== centerX || worker.targetY !== baseY) {
                        const targetHex = hexGrid.arrayToHex(centerX, baseY);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true); // allowGates = true для рабочих
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = centerX;
                        worker.targetY = baseY;
                        this.emit(); // Уведомляем об изменении пути
                    }
                }
            }
        }

        // Движение рабочего
        // Важно: проверяем, что путь есть и он валидный
        if (worker.path && worker.path.length > 1) {
            // Если у строителя есть задача, но путь ведёт не к цели - пересчитываем путь
            if (worker.buildingTarget) {
                const target = worker.buildingTarget;
                if (worker.targetX !== target.x || worker.targetY !== target.y) {
                    // Путь не соответствует задаче - пересчитываем
                    const targetHex = hexGrid.arrayToHex(target.x, target.y);
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true);
                    if (worker.path && worker.path.length > 1) {
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = target.x;
                        worker.targetY = target.y;
                        this.emit();
                    } else {
                        return;
                    }
                }
            }
            // Если нет задачи, но есть путь - проверяем, ведёт ли он на базу
            else if (!worker.buildingTarget) {
                const centerX = Math.floor(hexGrid.width / 2);
                const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                // Если путь не ведёт на базу - пересчитываем
                if (worker.targetX !== centerX || worker.targetY !== baseY) {
                    const baseHex = hexGrid.arrayToHex(centerX, baseY);
                    worker.path = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true);
                    if (worker.path && worker.path.length > 1) {
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = centerX;
                        worker.targetY = baseY;
                        this.emit();
                    }
                }
            }
            
            const currentHexIndex = Math.floor(worker.currentHexIndex);
            if (currentHexIndex < worker.path.length - 1) {
                const currentHex = worker.path[currentHexIndex];
                const nextHex = worker.path[currentHexIndex + 1];
                const currentPixel = hexGrid.hexToPixel(currentHex);
                const nextPixel = hexGrid.hexToPixel(nextHex);
                
                const pixelDx = nextPixel.x - currentPixel.x;
                const pixelDy = nextPixel.y - currentPixel.y;
                const pixelDistance = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
                
                worker.direction = Math.atan2(pixelDy, pixelDx);
                
                const baseSpeed = 1.0 * this.builderSettings.moveSpeed;
                const pixelSpeed = baseSpeed * deltaTime * 1000; // deltaTime уже нормализован в секундах
                if (pixelDistance > 0) {
                    worker.moveProgress += pixelSpeed / pixelDistance;
                }
                
                if (worker.moveProgress >= 1.0) {
                    worker.currentHexIndex += 1;
                    worker.moveProgress = 0;
                    const nextArr = hexGrid.hexToArray(nextHex);
                    worker.x = nextArr.x;
                    worker.y = nextArr.y;
                }
            } else {
                // Достигли конца пути - обновляем позицию на финальную позицию пути
                const finalHex = worker.path[worker.path.length - 1];
                const finalArr = hexGrid.hexToArray(finalHex);
                
                // ВСЕГДА обновляем позицию, даже если она кажется правильной
                // Это важно, так как currentArr может быть устаревшим
                worker.x = finalArr.x;
                worker.y = finalArr.y;
                // Обновляем currentArr для дальнейших проверок
                currentArr = finalArr;
                currentHex = finalHex;
                
                // Пересчитываем currentHex и currentArr из обновлённой позиции для точности
                const updatedHex = hexGrid.arrayToHex(worker.x, worker.y);
                const updatedArr = hexGrid.hexToArray(updatedHex);
                currentArr = updatedArr;
                currentHex = updatedHex;
                
                // Если это была задача на строительство и мы достигли конца пути - проверяем, на цели ли мы
                if (worker.buildingTarget) {
                    const target = worker.buildingTarget;
                    // Проверяем, достигли ли мы цели
                    if (currentArr.x === target.x && currentArr.y === target.y) {
                        // Достигли цели - очищаем путь и начинаем строительство
                        worker.path = null;
                        worker.targetX = null;
                        worker.targetY = null;
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        this.emit();
                        return; // Начинаем строительство в следующем кадре
                    }
                } else {
                    // Нет задачи - проверяем, достигли ли мы базы
                    const centerX = Math.floor(hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                    if (currentArr.x === centerX && currentArr.y === baseY) {
                        // Достигли базы - очищаем путь
                        worker.path = null;
                        worker.targetX = null;
                        worker.targetY = null;
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        this.emit();
                        return; // На базе, в следующем кадре получим новую задачу
                    }
                }
                
                // Если есть buildingTarget, но мы не на цели - проверяем, что делать дальше
                if (worker.buildingTarget) {
                    const target = worker.buildingTarget;
                    // Достигли конца пути, но не на цели - возможно, путь не вёл точно к цели
                    
                    // Проверяем, можем ли мы переместиться на цель напрямую (соседняя ячейка)
                    const targetHex = hexGrid.arrayToHex(target.x, target.y);
                    const distance = hexGrid.hexDistance(currentHex, targetHex);
                    
                    if (distance <= 1) {
                        // Цель рядом - перемещаемся туда
                        worker.x = target.x;
                        worker.y = target.y;
                        currentArr = { x: target.x, y: target.y };
                        currentHex = targetHex;
                        // Очищаем путь и начинаем строительство
                        worker.path = null;
                        worker.targetX = null;
                        worker.targetY = null;
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        this.emit();
                        // Продолжаем выполнение - строительство начнётся в следующем кадре
                        return;
                    } else {
                        // Цель далеко - пересчитываем путь
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true);
                        if (worker.path && worker.path.length > 1) {
                            worker.currentHexIndex = 0;
                            worker.moveProgress = 0;
                            worker.targetX = target.x;
                            worker.targetY = target.y;
                            this.emit();
                        } else {
                            // Отменяем задачу
                            worker.buildingTarget = null;
                            worker.path = null;
                            worker.targetX = null;
                            worker.targetY = null;
                            this.emit();
                        }
                    }
                }
            }
        } else if (worker.buildingTarget && (!worker.path || worker.path.length <= 1)) {
            // Есть задача, но нет пути - пытаемся найти путь снова
            const target = worker.buildingTarget;
            const targetHex = hexGrid.arrayToHex(target.x, target.y);
            worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true);
            if (worker.path && worker.path.length > 0) {
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
                this.emit(); // Уведомляем об изменении пути
            }
        }
    }

    getState() {
        return { ...this.state };
    }
    
    getBuildQueue(playerId) {
        return this.buildQueue[playerId] ? [...this.buildQueue[playerId]] : [];
    }
    
    getBuildQueueInfo() {
        return {
            1: this.buildQueue[1] ? this.buildQueue[1].length : 0,
            2: this.buildQueue[2] ? this.buildQueue[2].length : 0
        };
    }

    reset() {
        this.state.workers = [];
        this.workerIdCounter = 0;
        this.buildQueue = {
            1: [],
            2: []
        };
        this.emit();
    }
}

