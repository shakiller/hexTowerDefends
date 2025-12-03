export class WorkerBloc {
    constructor(gameBloc, hexGrid) {
        this.gameBloc = gameBloc;
        this.hexGrid = hexGrid;
        this.state = {
            workers: [] // {id, playerId, x, y, type, targetX, targetY, carryingGold, goldAmount, buildingTarget, ...}
        };
        this.listeners = [];
        this.workerIdCounter = 0;
        
        // Настройки рабочих-сборщиков
        this.gathererSettings = {
            capacity: 10,      // Вместительность
            health: 30,         // Жизнь
            gatherSpeed: 1000,  // Скорость сбора (мс на единицу золота)
            moveSpeed: 0.8      // Скорость перемещения (множитель от базовой скорости)
        };
        
        // Настройки рабочих-строителей
        this.builderSettings = {
            health: 30,         // Жизнь
            moveSpeed: 0.8,     // Скорость перемещения
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
                this.builderSettings[setting] = Math.max(0.1, Math.min(2.0, value));
            }
        }
    }

    assignBuildTask(workerId, targetX, targetY, obstacleType) {
        const worker = this.state.workers.find(w => w.id === workerId);
        if (!worker || worker.type !== 'builder') return false;

        worker.buildingTarget = { x: targetX, y: targetY, type: obstacleType };
        worker.targetX = targetX;
        worker.targetY = targetY;
        worker.buildingProgress = 0;
        
        this.emit();
        return true;
    }

    updateWorkers(deltaTime, currentTime, goldBloc, obstacleBloc, towerBloc, hexGrid) {
        const normalizedDeltaTime = deltaTime / 1000; // Преобразуем в секунды
        const workersToRemove = [];

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

    updateGatherer(worker, currentTime, deltaTime, goldBloc, obstacleBloc, towerBloc, hexGrid) {
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
                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc);
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
                worker.targetX = centerX;
                worker.targetY = baseY;
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
                const goldArr = { x: goldPile.x, y: goldPile.y };
                const distance = Math.sqrt(Math.pow(goldArr.x - currentArr.x, 2) + Math.pow(goldArr.y - currentArr.y, 2));

                // Если рядом с золотом - собираем
                if (distance <= 1.5) {
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
                        worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc);
                        worker.currentHexIndex = 0;
                        worker.moveProgress = 0;
                        worker.targetX = goldArr.x;
                        worker.targetY = goldArr.y;
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
                const pileHex = hexGrid.arrayToHex(pile.x, pile.y);
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
                worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc);
                worker.currentHexIndex = 0;
                worker.moveProgress = 0;
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
                worker.moveProgress += pixelSpeed / pixelDistance;
                
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
        const currentHex = hexGrid.arrayToHex(worker.x, worker.y);
        const currentArr = hexGrid.hexToArray(currentHex);

        // Если есть задача на строительство
        if (worker.buildingTarget) {
            const target = worker.buildingTarget;
            const distance = Math.sqrt(Math.pow(target.x - currentArr.x, 2) + Math.pow(target.y - currentArr.y, 2));

            // Если рядом с местом строительства - строим
            if (distance <= 1.5) {
                const timeSinceLastBuild = currentTime - (worker.lastBuildTime || 0);
                if (timeSinceLastBuild >= this.builderSettings.buildSpeed) {
                    // Создаём препятствие
                    obstacleBloc.addObstacle(target.x, target.y, target.type);
                    
                    // Задача выполнена - возвращаемся на базу
                    worker.buildingTarget = null;
                    worker.path = null;
                    worker.targetX = null;
                    worker.targetY = null;
                    worker.lastBuildTime = currentTime;
                    
                    // Идём на базу
                    const centerX = Math.floor(hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
                    const targetHex = hexGrid.arrayToHex(centerX, baseY);
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc);
                    worker.currentHexIndex = 0;
                    worker.moveProgress = 0;
                    worker.targetX = centerX;
                    worker.targetY = baseY;
                    this.emit();
                    return;
                }
                return; // Не двигаемся пока строим
            } else {
                // Идём к месту строительства
                if (!worker.path || worker.targetX !== target.x || worker.targetY !== target.y) {
                    const targetHex = hexGrid.arrayToHex(target.x, target.y);
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc);
                    worker.currentHexIndex = 0;
                    worker.moveProgress = 0;
                    worker.targetX = target.x;
                    worker.targetY = target.y;
                }
            }
        }
        // Если на базе и нет задачи - ничего не делаем
        else {
            const centerX = Math.floor(hexGrid.width / 2);
            const baseY = worker.playerId === 1 ? hexGrid.height - 1 : 0;
            if (currentArr.x === centerX && currentArr.y === baseY) {
                // На базе, ждём задания
                return;
            } else {
                // Возвращаемся на базу
                if (!worker.path || worker.targetX !== centerX || worker.targetY !== baseY) {
                    const targetHex = hexGrid.arrayToHex(centerX, baseY);
                    worker.path = hexGrid.findPath(currentHex, targetHex, obstacleBloc, towerBloc);
                    worker.currentHexIndex = 0;
                    worker.moveProgress = 0;
                    worker.targetX = centerX;
                    worker.targetY = baseY;
                }
            }
        }

        // Движение рабочего
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
                
                const baseSpeed = 1.0 * this.builderSettings.moveSpeed;
                const pixelSpeed = baseSpeed * normalizedDeltaTime * 1000;
                worker.moveProgress += pixelSpeed / pixelDistance;
                
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

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state.workers = [];
        this.workerIdCounter = 0;
        this.emit();
    }
}

