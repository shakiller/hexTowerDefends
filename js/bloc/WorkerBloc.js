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
            lastMoveTime: performance.now(), // Время последнего движения (для проверки зависания)
            lastPosition: { x: arrPos.x, y: arrPos.y }, // Последняя позиция (для проверки зависания)
            health: type === 'gatherer' ? this.gathererSettings.health : this.builderSettings.health,
            maxHealth: type === 'gatherer' ? this.gathererSettings.health : this.builderSettings.health
        };

        this.state.workers.push(worker);
        this.gameBloc.updatePlayerGold(playerId, -cost);
        
        // Логируем создание рабочего
        if (typeof window !== 'undefined' && window.logger) {
            window.logger.info('worker', `Worker created: ID=${worker.id}, Player=${playerId}, Type=${type}`, {
                workerId: worker.id,
                playerId,
                type,
                x: arrPos.x,
                y: arrPos.y
            });
        } else if (typeof logger !== 'undefined') {
            logger.info('worker', `Worker created: ID=${worker.id}, Player=${playerId}, Type=${type}`, {
                workerId: worker.id,
                playerId,
                type,
                x: arrPos.x,
                y: arrPos.y
            });
        }
        
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
    addBuildTaskToQueue(playerId, targetX, targetY, buildType, buildSubType = null, obstacleBloc = null, towerBloc = null) {
        // buildType: 'obstacle' или 'tower' (или старый формат: 'stone', 'tree', 'basic', 'strong')
        // buildSubType: для obstacle - 'stone' или 'tree', для tower - 'basic' или 'strong'
        
        // ВАЖНО: Проверяем, не находится ли уже на этой позиции препятствие, башня или строитель
        if (obstacleBloc) {
            const existingObstacle = obstacleBloc.getObstacleAt(targetX, targetY);
            if (existingObstacle) {
                // На этой позиции уже есть препятствие
                return false;
            }
        }
        
        if (towerBloc) {
            // Проверяем башни через getState, так как у нас нет прямого доступа к hexGrid
            const towerState = towerBloc.getState();
            const existingTower = towerState.towers.find(t => t.x === targetX && t.y === targetY);
            if (existingTower) {
                // На этой позиции уже есть башня
                return false;
            }
        }
        
        // Проверяем, не находится ли строитель на этой позиции или не строит ли он там
        const builders = this.state.workers.filter(w => w.playerId === playerId && w.type === 'builder');
        for (const builder of builders) {
            // Проверяем текущую позицию строителя
            if (builder.x === targetX && builder.y === targetY) {
                // Строитель уже на этой позиции
                return false;
            }
            // Проверяем, не строит ли он на этой позиции
            if (builder.buildingTarget && builder.buildingTarget.x === targetX && builder.buildingTarget.y === targetY) {
                // Строитель уже строит на этой позиции
                return false;
            }
        }
        
        // Проверяем, нет ли уже такой задачи в очереди
        if (this.buildQueue[playerId]) {
            const duplicateTask = this.buildQueue[playerId].find(task => task.x === targetX && task.y === targetY);
            if (duplicateTask) {
                // Такая задача уже есть в очереди
                return false;
            }
        }
        
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
            closestBuilder.path = hexGrid.findPath(builderHex, targetHex, obstacleBloc, towerBloc, true, true);
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
                const shouldRemove = this.updateGatherer(worker, currentTime, normalizedDeltaTime, goldBloc, obstacleBloc, towerBloc, hexGrid);
                if (shouldRemove) {
                    workersToRemove.push(worker.id);
                }
            }
            // Логика для строителя
            else if (worker.type === 'builder') {
                const shouldRemove = this.updateBuilder(worker, currentTime, normalizedDeltaTime, obstacleBloc, towerBloc, hexGrid);
                if (shouldRemove) {
                    workersToRemove.push(worker.id);
                }
            }
        });

        // Удаляем погибших рабочих
        if (workersToRemove.length > 0) {
            this.state.workers = this.state.workers.filter(w => !workersToRemove.includes(w.id));
            this.emit();
        }
    }

    updateGatherer(worker, currentTime, normalizedDeltaTime, goldBloc, obstacleBloc, towerBloc, hexGrid) {
        // Логируем вызов updateGatherer (только первый раз или если нет пути)
        if ((!worker.path || worker.path.length === 0) && typeof window !== 'undefined' && window.logger) {
            window.logger.debug('worker', `updateGatherer called for worker ${worker.id}`, {
                workerId: worker.id,
                workerType: worker.type,
                playerId: worker.playerId,
                x: worker.x,
                y: worker.y,
                hasPath: !!worker.path,
                hasTargetGold: !!worker.targetGoldId,
                carryingGold: worker.carryingGold
            });
        }
        
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
                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true); // allowGates = true, allowObstacles = true для рабочих
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
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true); // allowGates = true, allowObstacles = true для рабочих
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
            
            // Логируем поиск золота
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.debug('worker', `Worker ${worker.id} searching for gold. Available piles: ${goldPiles.length}`, {
                    workerId: worker.id,
                    workerType: worker.type,
                    playerId: worker.playerId,
                    currentPos: { x: currentArr.x, y: currentArr.y },
                    availablePilesCount: goldPiles.length
                });
            }
            
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
                
                if (!targetHex) {
                    const warnMsg = `Worker ${worker.id}: Invalid target hex for gold at (${closestGold.x}, ${closestGold.y})`;
                    console.warn(warnMsg);
                    if (typeof window !== 'undefined' && window.logger) {
                        window.logger.warn('worker', warnMsg, {
                            workerId: worker.id,
                            goldX: closestGold.x,
                            goldY: closestGold.y
                        });
                    }
                    worker.targetGoldId = null;
                    worker.targetX = null;
                    worker.targetY = null;
                    return;
                }
                
                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true); // allowGates = true, allowObstacles = true для рабочих
                
                if (!worker.path || worker.path.length === 0) {
                    const warnMsg = `Worker ${worker.id}: Path not found to gold at (${closestGold.x}, ${closestGold.y})`;
                    console.warn(warnMsg);
                    if (typeof window !== 'undefined' && window.logger) {
                        window.logger.warn('worker', warnMsg, {
                            workerId: worker.id,
                            workerType: worker.type,
                            playerId: worker.playerId,
                            goldX: closestGold.x,
                            goldY: closestGold.y,
                            currentX: currentArr.x,
                            currentY: currentArr.y
                        });
                    } else if (typeof logger !== 'undefined') {
                        logger.warn('worker', warnMsg, {
                            workerId: worker.id,
                            workerType: worker.type,
                            playerId: worker.playerId,
                            goldX: closestGold.x,
                            goldY: closestGold.y,
                            currentX: currentArr.x,
                            currentY: currentArr.y
                        });
                    }
                    worker.targetGoldId = null;
                    worker.targetX = null;
                    worker.targetY = null;
                    return;
                }
                
                // Логируем успешное нахождение пути к золоту
                if (typeof window !== 'undefined' && window.logger) {
                    window.logger.info('worker', `Worker ${worker.id} found path to gold: ${worker.path.length} cells`, {
                        workerId: worker.id,
                        workerType: worker.type,
                        pathLength: worker.path.length,
                        goldX: closestGold.x,
                        goldY: closestGold.y
                    });
                }
                
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
                this.emit(); // Уведомляем об изменении пути
            } else {
                // Золото не найдено - рабочий остаётся на месте
                if (typeof window !== 'undefined' && window.logger) {
                    window.logger.debug('worker', `Worker ${worker.id}: No gold found to collect`, {
                        workerId: worker.id,
                        availablePilesCount: goldPiles.length
                    });
                }
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
                    // Обновляем время и позицию при движении
                    worker.lastMoveTime = currentTime;
                    worker.lastPosition = { x: worker.x, y: worker.y };
                }
            }
        }
        
        // Проверка зависания для сборщика
        // Различаем состояния:
        // 1. Нет задания (нет цели золота и не несёт золото) - НОРМАЛЬНО, не зависание
        // 2. Цель потеряна (золото исчезло) - НОРМАЛЬНО, не зависание
        // 3. Есть валидное задание, но не двигается - это может быть зависание
        
        // Сначала проверяем валидность цели золота
        let hasValidGoldTarget = false;
        if (worker.targetGoldId) {
            const goldPile = goldBloc.getState().goldPiles.find(p => p.id === worker.targetGoldId);
            if (goldPile && !goldPile.collected) {
                // Проверяем, не находится ли золото на базе (заблокировано)
                const goldHex = hexGrid.arrayToHex(goldPile.x, goldPile.y);
                const isBlocked = hexGrid.isBlocked(goldHex, obstacleBloc, towerBloc, false);
                if (!isBlocked) {
                    hasValidGoldTarget = true;
                } else {
                    // Золото на базе - сбрасываем цель
                    worker.targetGoldId = null;
                    worker.path = null;
                    worker.targetX = null;
                    worker.targetY = null;
                }
            } else {
                // Золото исчезло - сбрасываем цель
                worker.targetGoldId = null;
                worker.path = null;
                worker.targetX = null;
                worker.targetY = null;
            }
        }
        
        const hasTask = worker.carryingGold || hasValidGoldTarget;
        const isSearchingForGold = !worker.carryingGold && !hasValidGoldTarget;
        
        // Если нет задания или цель потеряна - это нормальное состояние, не зависание
        if (isSearchingForGold) {
            // Сборщик ищет новое золото - обновляем время, чтобы не считался зависшим
            worker.lastMoveTime = currentTime;
            worker.lastPosition = { x: worker.x, y: worker.y };
            return false; // Не удалять
        }
        
        // Если есть валидное задание - проверяем зависание
        if (hasTask) {
            const currentPos = { x: worker.x, y: worker.y };
            const hasMoved = currentPos.x !== worker.lastPosition.x || currentPos.y !== worker.lastPosition.y;
            const isPerformingTask = hasValidGoldTarget && currentArr.x === worker.targetX && currentArr.y === worker.targetY;
            
            // Зависание определяется только если:
            // - Есть валидное задание (несёт золото или идёт к валидному золоту)
            // - НЕ двигается
            // - НЕ выполняет задачу (не собирает золото)
            // - Есть путь (должен двигаться, но не может)
            const hasValidPath = worker.path && worker.path.length > 1;
            const shouldBeMoving = hasValidPath || (worker.carryingGold && !hasValidPath);
            
            if (!hasMoved && !isPerformingTask && shouldBeMoving) {
                const timeSinceLastMove = currentTime - (worker.lastMoveTime || currentTime);
                const STUCK_RECALCULATE_INTERVAL = 5000; // Пересчёт пути каждые 5 секунд
                const STUCK_REMOVE_TIME = 10000; // Удаление после 10 секунд
                
                // Пересчёт пути если не двигается более 5 секунд
                if (timeSinceLastMove >= STUCK_RECALCULATE_INTERVAL && timeSinceLastMove < STUCK_REMOVE_TIME) {
                    if (hasValidGoldTarget) {
                        const goldPile = goldBloc.getState().goldPiles.find(p => p.id === worker.targetGoldId);
                        if (goldPile && !goldPile.collected) {
                            const targetHex = hexGrid.arrayToHex(goldPile.x, goldPile.y);
                            const newPath = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                            if (newPath && newPath.length > 1) {
                                worker.path = newPath;
                                worker.currentHexIndex = 0;
                                worker.moveProgress = 0;
                                
                                if (typeof window !== 'undefined' && window.logger) {
                                    window.logger.warn('worker', `Worker ${worker.id} stuck, recalculating path to gold`, {
                                        workerId: worker.id,
                                        type: worker.type,
                                        position: { x: worker.x, y: worker.y },
                                        timeSinceLastMove: timeSinceLastMove.toFixed(0)
                                    });
                                }
                            } else {
                                // Путь не найден - сбрасываем цель, это не зависание
                                worker.targetGoldId = null;
                                worker.path = null;
                                worker.targetX = null;
                                worker.targetY = null;
                                worker.lastMoveTime = currentTime;
                                worker.lastPosition = { x: currentPos.x, y: currentPos.y };
                                return false; // Не удалять - путь не найден, это не зависание
                            }
                        } else {
                            // Золото исчезло - сбрасываем цель
                            worker.targetGoldId = null;
                            worker.path = null;
                            worker.targetX = null;
                            worker.targetY = null;
                            worker.lastMoveTime = currentTime;
                            worker.lastPosition = { x: currentPos.x, y: currentPos.y };
                            return false; // Не удалять - это нормальное состояние (поиск нового золота)
                        }
                    } else if (worker.carryingGold) {
                        // Несёт золото, но нет пути - пересчитываем путь на базу
                        const centerX = Math.floor(hexGrid.width / 2);
                        const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                        const targetHex = hexGrid.arrayToHex(centerX, baseY);
                        const newPath = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                        if (newPath && newPath.length > 1) {
                            worker.path = newPath;
                            worker.currentHexIndex = 0;
                            worker.moveProgress = 0;
                            worker.targetX = centerX;
                            worker.targetY = baseY;
                        } else {
                            // Путь на базу не найден - это критическая ситуация, но не зависание
                            // Обновляем время, чтобы дать ещё один шанс
                            worker.lastMoveTime = currentTime;
                            worker.lastPosition = { x: currentPos.x, y: currentPos.y };
                            return false; // Не удалять - путь не найден, но это не зависание
                        }
                    }
                }
                
                // Удаление только если:
                // - Не двигается более 10 секунд
                // - Есть валидное задание
                // - Есть валидный путь (должен двигаться, но не может)
                if (timeSinceLastMove >= STUCK_REMOVE_TIME && hasValidPath) {
                    if (typeof window !== 'undefined' && window.logger) {
                        window.logger.error('worker', `Worker ${worker.id} stuck for ${timeSinceLastMove.toFixed(0)}ms, removing`, {
                            workerId: worker.id,
                            type: worker.type,
                            position: { x: worker.x, y: worker.y },
                            hasPath: hasValidPath,
                            isPerformingTask,
                            hasTask,
                            carryingGold: worker.carryingGold,
                            targetGoldId: worker.targetGoldId,
                            hasValidGoldTarget
                        });
                    }
                    return true; // Удалить рабочего - реальное зависание
                }
            } else if (hasMoved) {
                worker.lastMoveTime = currentTime;
                worker.lastPosition = { x: currentPos.x, y: currentPos.y };
            }
        }
        
        return false; // Не удалять
    }

    updateBuilder(worker, currentTime, normalizedDeltaTime, obstacleBloc, towerBloc, hexGrid) {
        // Вычисляем текущую позицию - это будет обновляться по мере движения
        let currentHex = hexGrid.arrayToHex(worker.x, worker.y);
        let currentArr = hexGrid.hexToArray(currentHex);

        // ВАЖНО: Если у строителя есть задача (buildingTarget), он НЕ должен проверять очередь
        // Очередь проверяется только когда строитель физически на базе и не имеет задачи
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
                        // Создаём препятствие - проверяем стоимость и списываем золото
                        const obstacleCost = target.type === 'stone' ? 10 : 5; // Камни - 10, деревья - 5
                        const gameState = this.gameBloc.getState();
                        const player = gameState.players[worker.playerId];
                        
                        if (player.gold >= obstacleCost) {
                            obstacleBloc.addObstacle(target.x, target.y, target.type);
                            this.gameBloc.updatePlayerGold(worker.playerId, -obstacleCost);
                            buildSuccess = true;
                            
                            // Логируем создание препятствия
                            if (typeof window !== 'undefined' && window.logger) {
                                window.logger.info('worker', `Obstacle built: ${target.type} at (${target.x}, ${target.y})`, {
                                    workerId: worker.id,
                                    playerId: worker.playerId,
                                    obstacleType: target.type,
                                    x: target.x,
                                    y: target.y,
                                    cost: obstacleCost,
                                    remainingGold: player.gold - obstacleCost
                                });
                            } else if (typeof logger !== 'undefined') {
                                logger.info('worker', `Obstacle built: ${target.type} at (${target.x}, ${target.y})`, {
                                    workerId: worker.id,
                                    playerId: worker.playerId,
                                    obstacleType: target.type,
                                    x: target.x,
                                    y: target.y,
                                    cost: obstacleCost,
                                    remainingGold: player.gold - obstacleCost
                                });
                            }
                        } else {
                            buildSuccess = false;
                            const warnMsg = `Worker ${worker.id}: Недостаточно золота для препятствия ${target.type}. Нужно: ${obstacleCost}, есть: ${player.gold}`;
                            console.warn(warnMsg);
                            if (typeof window !== 'undefined' && window.logger) {
                                window.logger.warn('worker', warnMsg, {
                                    workerId: worker.id,
                                    playerId: worker.playerId,
                                    obstacleType: target.type,
                                    requiredGold: obstacleCost,
                                    availableGold: player.gold
                                });
                            } else if (typeof logger !== 'undefined') {
                                logger.warn('worker', warnMsg, {
                                    workerId: worker.id,
                                    playerId: worker.playerId,
                                    obstacleType: target.type,
                                    requiredGold: obstacleCost,
                                    availableGold: player.gold
                                });
                            }
                        }
                    }
                    
                    // Задача выполнена (или не удалась) - очищаем задачу и возвращаемся на базу
                    const centerX = Math.floor(hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                    const baseHex = hexGrid.arrayToHex(centerX, baseY);
                    
                    // Очищаем задачу строительства
                    worker.buildingTarget = null;
                    worker.lastBuildTime = currentTime;
                    worker.buildingProgress = 0;
                    
                    // ВАЖНО: Если мы построили препятствие на своей позиции, нужно найти соседнюю свободную ячейку
                    // для начала пути обратно на базу, иначе строитель застрянет
                    let pathToBase = null;
                    if (buildType === 'obstacle' && currentArr.x === target.x && currentArr.y === target.y) {
                        // Препятствие построено на нашей позиции - ищем соседнюю свободную ячейку
                        // Рабочие могут проходить через препятствия, поэтому проверяем с allowObstacles = true
                        const neighbors = hexGrid.getHexNeighbors(currentHex);
                        let foundFreeNeighbor = false;
                        for (const neighborHex of neighbors) {
                            if (hexGrid.isValidHex(neighborHex)) {
                                // Проверяем, не заблокирована ли ячейка башнями (рабочие могут проходить через препятствия)
                                const isBlocked = hexGrid.isBlocked(neighborHex, obstacleBloc, towerBloc, true, true);
                                if (!isBlocked) {
                                    // Нашли свободную соседнюю ячейку - создаём путь через неё
                                    // Сначала путь от текущей позиции к соседней ячейке
                                    const pathToNeighbor = hexGrid.findPath(currentHex, neighborHex, obstacleBloc, towerBloc, true, true);
                                    // Затем путь от соседней ячейки к базе
                                    const pathFromNeighborToBase = hexGrid.findPath(neighborHex, baseHex, obstacleBloc, towerBloc, true, true);
                                    
                                    if (pathToNeighbor && pathToNeighbor.length > 0 && pathFromNeighborToBase && pathFromNeighborToBase.length > 0) {
                                        // Объединяем пути: убираем дубликат соседней ячейки
                                        pathToBase = [...pathToNeighbor];
                                        // Добавляем путь от соседней ячейки к базе, пропуская первую ячейку (она уже есть)
                                        for (let i = 1; i < pathFromNeighborToBase.length; i++) {
                                            pathToBase.push(pathFromNeighborToBase[i]);
                                        }
                                        foundFreeNeighbor = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!foundFreeNeighbor) {
                            // Не нашли свободную соседнюю ячейку - пытаемся найти путь с текущей позиции
                            // Рабочие могут проходить через препятствия, поэтому путь должен найтись
                            pathToBase = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true, true);
                        }
                    } else {
                        // Обычный случай - путь на базу
                        pathToBase = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true, true);
                    }
                    
                    // Проверяем, что путь найден и содержит хотя бы две точки
                    if (!pathToBase || pathToBase.length === 0) {
                        // Путь не найден - пытаемся найти любой путь к базе
                        // Это может произойти, если препятствие полностью заблокировало путь
                        // В этом случае рабочий останется на месте до следующего кадра
                        console.warn(`Worker ${worker.id}: Cannot find path to base after building ${buildType} at (${target.x}, ${target.y})`);
                        // Очищаем задачу, но оставляем рабочего на месте
                        worker.buildingTarget = null;
                        worker.lastBuildTime = currentTime;
                        worker.buildingProgress = 0;
                        worker.path = null;
                        worker.targetX = null;
                        worker.targetY = null;
                        this.emit();
                        return;
                    }
                    
                    // Проверяем, что путь содержит хотя бы две точки (текущая позиция и следующая)
                    // Если путь содержит только одну точку, значит рабочий уже на базе или путь неправильный
                    if (pathToBase.length === 1) {
                        // Путь содержит только одну точку - проверяем, не на базе ли уже рабочий
                        const pathArr = hexGrid.hexToArray(pathToBase[0]);
                        if (pathArr.x === centerX && pathArr.y === baseY) {
                            // Рабочий уже на базе - очищаем задачу
                            worker.buildingTarget = null;
                            worker.lastBuildTime = currentTime;
                            worker.buildingProgress = 0;
                            worker.path = null;
                            worker.targetX = null;
                            worker.targetY = null;
                            this.emit();
                            return;
                        } else {
                            // Путь содержит только одну точку, но это не база - путь неправильный
                            console.warn(`Worker ${worker.id}: Path to base contains only one point (not base) after building ${buildType} at (${target.x}, ${target.y})`);
                            // Пытаемся найти путь ещё раз
                            pathToBase = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true, true);
                            if (!pathToBase || pathToBase.length <= 1) {
                                // Путь всё ещё не найден - очищаем задачу
                                worker.buildingTarget = null;
                                worker.lastBuildTime = currentTime;
                                worker.buildingProgress = 0;
                                worker.path = null;
                                worker.targetX = null;
                                worker.targetY = null;
                                this.emit();
                                return;
                            }
                        }
                    }
                    
                    // ВАЖНО: Находим текущую позицию строителя в пути для плавного движения
                    // Ищем, на какой позиции в пути находится текущая позиция строителя
                    let startIndex = 0;
                    let foundCurrentPosition = false;
                    
                    for (let i = 0; i < pathToBase.length; i++) {
                        const pathHex = pathToBase[i];
                        const pathArr = hexGrid.hexToArray(pathHex);
                        if (pathArr.x === currentArr.x && pathArr.y === currentArr.y) {
                            startIndex = i;
                            foundCurrentPosition = true;
                            break;
                        }
                    }
                    
                    // Если текущая позиция не найдена в пути, начинаем с начала
                    // Но если первая точка пути совпадает с текущей позицией, начинаем со следующей
                    if (!foundCurrentPosition && pathToBase.length > 0) {
                        const firstPathHex = pathToBase[0];
                        const firstPathArr = hexGrid.hexToArray(firstPathHex);
                        if (firstPathArr.x === currentArr.x && firstPathArr.y === currentArr.y) {
                            // Первая точка совпадает - начинаем со следующей
                            startIndex = 1;
                            if (startIndex >= pathToBase.length) {
                                // Путь содержит только текущую позицию - мы уже на базе
                                worker.buildingTarget = null;
                                worker.lastBuildTime = currentTime;
                                worker.buildingProgress = 0;
                                worker.path = null;
                                worker.targetX = null;
                                worker.targetY = null;
                                this.emit();
                                return;
                            }
                        }
                    }
                    
                    // Устанавливаем путь на базу, начиная с найденной позиции
                    worker.path = pathToBase;
                    worker.currentHexIndex = startIndex;
                    worker.moveProgress = 0; // Начинаем движение с 0% прогресса для плавности
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
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true); // allowGates = true, allowObstacles = true для рабочих
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
        // Если НЕТ задачи на строительство - проверяем, на базе ли мы, и если да - берём задачу из очереди
        // ВАЖНО: Очередь проверяется ТОЛЬКО когда строитель физически на базе И не имеет задачи
        else {
            const centerX = Math.floor(hexGrid.width / 2);
            const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
            const isOnBase = currentArr.x === centerX && currentArr.y === baseY;
            
            // КРИТИЧНО: Проверяем очередь ТОЛЬКО если строитель на базе И не имеет задачи
            if (isOnBase && !worker.buildingTarget) {
                // На базе и нет задачи - проверяем очередь задач
                if (this.buildQueue[worker.playerId] && this.buildQueue[worker.playerId].length > 0) {
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
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
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
                    } else {
                        // Нет задач в очереди - очищаем флаги движения
                        if (worker.path || worker.targetX !== null || worker.targetY !== null) {
                            worker.path = null;
                            worker.targetX = null;
                            worker.targetY = null;
                            worker.currentHexIndex = 0;
                            worker.moveProgress = 0;
                            this.emit();
                        }
                        return;
                    }
                } else {
                    // На базе, нет задачи и нет очереди - очищаем все флаги движения
                    if (worker.path || worker.targetX !== null || worker.targetY !== null) {
                        worker.path = null;
                        worker.targetX = null;
                        worker.targetY = null;
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        this.emit();
                    }
                    return;
                }
            } else {
                // Не на базе - если есть задача, идём к цели, иначе возвращаемся на базу
                if (worker.buildingTarget) {
                    // Есть задача - идём к цели
                    const target = worker.buildingTarget;
                    if (!worker.path || worker.targetX !== target.x || worker.targetY !== target.y) {
                        const targetHex = hexGrid.arrayToHex(target.x, target.y);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = target.x;
                        worker.targetY = target.y;
                        this.emit();
                    }
                } else {
                    // Нет задачи - возвращаемся на базу
                    const centerX = Math.floor(hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                    if (!worker.path || worker.targetX !== centerX || worker.targetY !== baseY) {
                        const targetHex = hexGrid.arrayToHex(centerX, baseY);
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = centerX;
                        worker.targetY = baseY;
                        this.emit();
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
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
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
                    worker.path = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true, true);
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
                const pixelSpeed = baseSpeed * normalizedDeltaTime * 1000; // Преобразуем обратно в пиксели
                if (pixelDistance > 0) {
                    worker.moveProgress += pixelSpeed / pixelDistance;
                }
                
                // Если прогресс >= 1.0, переходим к следующей ячейке
                if (worker.moveProgress >= 1.0) {
                    worker.currentHexIndex += 1;
                    worker.moveProgress = 0;
                    const nextArr = hexGrid.hexToArray(nextHex);
                    worker.x = nextArr.x;
                    worker.y = nextArr.y;
                    // Обновляем время и позицию при движении
                    worker.lastMoveTime = currentTime;
                    worker.lastPosition = { x: worker.x, y: worker.y };
                }
            }
            
            // Проверка зависания для строителя
            // Различаем состояния:
            // 1. Нет задачи и на базе - НОРМАЛЬНО, не зависание
            // 2. Нет задачи и не на базе, но идёт на базу - НОРМАЛЬНО, не зависание
            // 3. Есть задача, но не двигается - это может быть зависание
            
            const centerX = Math.floor(hexGrid.width / 2);
            const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
            const isOnBase = currentArr.x === centerX && currentArr.y === baseY;
            const hasTask = !!worker.buildingTarget;
            const isReturningToBase = !hasTask && worker.path && worker.targetX === centerX && worker.targetY === baseY;
            
            // Если нет задачи и на базе - это нормальное состояние, не зависание
            if (!hasTask && isOnBase) {
                worker.lastMoveTime = currentTime;
                worker.lastPosition = { x: worker.x, y: worker.y };
                return false; // Не удалять
            }
            
            // Если нет задачи, но идёт на базу - это нормальное состояние, не зависание
            if (!hasTask && isReturningToBase) {
                // Проверяем, действительно ли движется к базе
                const currentPos = { x: worker.x, y: worker.y };
                const hasMoved = currentPos.x !== worker.lastPosition.x || currentPos.y !== worker.lastPosition.y;
                if (hasMoved) {
                    worker.lastMoveTime = currentTime;
                    worker.lastPosition = { x: currentPos.x, y: currentPos.y };
                }
                return false; // Не удалять - это нормальное состояние (возврат на базу)
            }
            
            // Если есть задача - проверяем зависание
            if (hasTask) {
                const currentPos = { x: worker.x, y: worker.y };
                const hasMoved = currentPos.x !== worker.lastPosition.x || currentPos.y !== worker.lastPosition.y;
                const isPerformingTask = worker.buildingTarget && currentArr.x === worker.buildingTarget.x && currentArr.y === worker.buildingTarget.y;
                
                // Зависание определяется только если:
                // - Есть задача
                // - НЕ двигается
                // - НЕ выполняет задачу (не строит)
                // - Есть путь (должен двигаться, но не может)
                const shouldBeMoving = worker.path && worker.path.length > 1;
                
                if (!hasMoved && !isPerformingTask && shouldBeMoving) {
                    const timeSinceLastMove = currentTime - (worker.lastMoveTime || currentTime);
                    const STUCK_RECALCULATE_INTERVAL = 5000; // Пересчёт пути каждые 5 секунд
                    const STUCK_REMOVE_TIME = 10000; // Удаление после 10 секунд
                    
                    // Пересчёт пути если не двигается более 5 секунд
                    if (timeSinceLastMove >= STUCK_RECALCULATE_INTERVAL && timeSinceLastMove < STUCK_REMOVE_TIME) {
                        if (worker.buildingTarget) {
                            const targetHex = hexGrid.arrayToHex(worker.buildingTarget.x, worker.buildingTarget.y);
                            worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                            worker.currentHexIndex = 0;
                            worker.moveProgress = 0;
                            
                            if (typeof window !== 'undefined' && window.logger) {
                                window.logger.warn('worker', `Worker ${worker.id} stuck, recalculating path to building target`, {
                                    workerId: worker.id,
                                    type: worker.type,
                                    position: { x: worker.x, y: worker.y },
                                    timeSinceLastMove: timeSinceLastMove.toFixed(0)
                                });
                            }
                        }
                    }
                    
                    // Удаление если не двигается более 10 секунд, есть задача, но не может двигаться
                    if (timeSinceLastMove >= STUCK_REMOVE_TIME) {
                        if (typeof window !== 'undefined' && window.logger) {
                            window.logger.error('worker', `Worker ${worker.id} stuck for ${timeSinceLastMove.toFixed(0)}ms, removing`, {
                                workerId: worker.id,
                                type: worker.type,
                                position: { x: worker.x, y: worker.y },
                                hasPath: !!(worker.path && worker.path.length > 0),
                                isPerformingTask,
                                hasTask,
                                buildingTarget: worker.buildingTarget
                            });
                        }
                        return true; // Удалить рабочего
                    }
                } else if (hasMoved) {
                    worker.lastMoveTime = currentTime;
                    worker.lastPosition = { x: currentPos.x, y: currentPos.y };
                }
            }
            
            return false; // Не удалять
            // Обновляем currentArr на основе актуальной позиции worker.x и worker.y
            currentHex = hexGrid.arrayToHex(worker.x, worker.y);
            currentArr = hexGrid.hexToArray(currentHex);
            
            // Проверяем, достигли ли мы цели (только если есть задача)
            if (worker.buildingTarget) {
                const target = worker.buildingTarget;
                const isOnTarget = currentArr.x === target.x && currentArr.y === target.y;
                
                if (isOnTarget) {
                    // Достигли цели - очищаем путь и начинаем строительство
                    worker.path = null;
                    worker.targetX = null;
                    worker.targetY = null;
                    worker.currentHexIndex = 0;
                    worker.moveProgress = 0;
                    this.emit();
                    return; // Начинаем строительство в следующем кадре
                }
            }
            
            // Проверяем, достигли ли мы конца пути (каждый кадр)
            if (worker.path && worker.path.length > 0) {
                const finalHexIndex = worker.path.length - 1;
                const currentHexIndex = Math.floor(worker.currentHexIndex);
                
                // Если мы на последней ячейке пути или прошли её
                if (currentHexIndex >= finalHexIndex) {
                    // Достигли конца пути - обновляем позицию на финальную
                    const finalHex = worker.path[finalHexIndex];
                    const finalArr = hexGrid.hexToArray(finalHex);
                    worker.x = finalArr.x;
                    worker.y = finalArr.y;
                    worker.currentHexIndex = finalHexIndex;
                    worker.moveProgress = 0;
                    
                    // Обновляем currentArr для проверок
                    currentArr = finalArr;
                    currentHex = finalHex;
                    
                    // Очищаем путь
                    worker.path = null;
                    worker.targetX = null;
                    worker.targetY = null;
                    
                    // Проверяем, что делать дальше
                    if (worker.buildingTarget) {
                        const target = worker.buildingTarget;
                        if (currentArr.x === target.x && currentArr.y === target.y) {
                            // Достигли цели - начинаем строительство в следующем кадре
                            this.emit();
                            return;
                        } else {
                            // Не на цели - возможно, путь был неправильным, пересчитываем
                            const targetHex = hexGrid.arrayToHex(target.x, target.y);
                            worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                            if (worker.path && worker.path.length > 1) {
                                worker.currentHexIndex = 0;
                                worker.moveProgress = 0;
                                worker.targetX = target.x;
                                worker.targetY = target.y;
                                this.emit();
                            } else {
                                // Путь не найден - отменяем задачу и возвращаемся на базу
                                worker.buildingTarget = null;
                                const centerX = Math.floor(hexGrid.width / 2);
                                const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                                const baseHex = hexGrid.arrayToHex(centerX, baseY);
                                worker.path = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true, true);
                                if (worker.path && worker.path.length > 1) {
                                    worker.currentHexIndex = 0;
                                    worker.moveProgress = 0;
                                    worker.targetX = centerX;
                                    worker.targetY = baseY;
                                    this.emit();
                                } else {
                                    this.emit();
                                }
                            }
                            return;
                        }
                    } else {
                        // Нет задачи - проверяем, достигли ли мы базы
                        const centerX = Math.floor(hexGrid.width / 2);
                        const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                        const isOnBase = currentArr.x === centerX && currentArr.y === baseY;
                        if (isOnBase && !worker.buildingTarget) {
                            // Достигли базы и нет задачи - проверяем очередь задач
                            if (this.buildQueue[worker.playerId] && this.buildQueue[worker.playerId].length > 0) {
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
                                    const targetHex = hexGrid.arrayToHex(task.x, task.y);
                                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                                    if (worker.path && worker.path.length > 1) {
                                        worker.currentHexIndex = 0;
                                        worker.moveProgress = 0;
                                        this.emit();
                                    } else {
                                        // Путь не найден - возвращаем задачу в очередь
                                        worker.buildingTarget = null;
                                        worker.targetX = null;
                                        worker.targetY = null;
                                        this.buildQueue[worker.playerId].unshift(task);
                                        this.emit();
                                    }
                                }
                            } else {
                                this.emit();
                            }
                            return; // На базе
                        } else {
                            // Не на базе и нет задачи - идём на базу
                            const centerX = Math.floor(hexGrid.width / 2);
                            const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                            const baseHex = hexGrid.arrayToHex(centerX, baseY);
                            worker.path = hexGrid.findPath(currentHex, baseHex, obstacleBloc, towerBloc, true, true);
                            if (worker.path && worker.path.length > 1) {
                                worker.currentHexIndex = 0;
                                worker.moveProgress = 0;
                                worker.targetX = centerX;
                                worker.targetY = baseY;
                                this.emit();
                            } else {
                                this.emit();
                            }
                            return;
                        }
                    }
                }
            } else {
                // Достигли конца пути - обновляем позицию на финальную позицию пути
                const finalHex = worker.path[worker.path.length - 1];
                const finalArr = hexGrid.hexToArray(finalHex);
                
                // ВСЕГДА обновляем позицию, даже если она кажется правильной
                worker.x = finalArr.x;
                worker.y = finalArr.y;
                currentArr = finalArr;
                currentHex = finalHex;
                
                // Очищаем путь
                worker.path = null;
                worker.targetX = null;
                worker.targetY = null;
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
                
                // Проверяем, что делать дальше
                if (worker.buildingTarget) {
                    const target = worker.buildingTarget;
                    if (currentArr.x === target.x && currentArr.y === target.y) {
                        // Достигли цели - начинаем строительство в следующем кадре
                        this.emit();
                        return;
                    }
                } else {
                    // Нет задачи - проверяем, достигли ли мы базы
                    const centerX = Math.floor(hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                    if (currentArr.x === centerX && currentArr.y === baseY) {
                        // Достигли базы - проверяем очередь задач
                        if (this.buildQueue[worker.playerId] && this.buildQueue[worker.playerId].length > 0) {
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
                                const targetHex = hexGrid.arrayToHex(task.x, task.y);
                                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
                                if (worker.path && worker.path.length > 1) {
                                    worker.currentHexIndex = 0;
                                    worker.moveProgress = 0;
                                    this.emit();
                                    // Продолжаем выполнение - движение начнётся
                                } else {
                                    // Путь не найден - возвращаем задачу в очередь
                                    worker.buildingTarget = null;
                                    worker.targetX = null;
                                    worker.targetY = null;
                                    this.buildQueue[worker.playerId].unshift(task);
                                    this.emit();
                                }
                            }
                        } else {
                            this.emit();
                        }
                        return; // На базе
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
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc, true, true);
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

