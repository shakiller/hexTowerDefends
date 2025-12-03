export class SoldierBloc {
    constructor(gameBloc, hexGrid) {
        this.gameBloc = gameBloc;
        this.hexGrid = hexGrid;
        this.state = {
            soldiers: [] // {id, playerId, x, y, type, level, health, damage, speed, targetX, targetY}
        };
        this.listeners = [];
        this.soldierIdCounter = 0;
        this.speedMultiplier = 0.05; // Глобальный множитель скорости солдат (по умолчанию 0.05)
        
        // Настройки атаки солдат
        this.attackSettings = {
            basic: {
                fireRate: 1000,  // Скорость стрельбы (мс между выстрелами)
                damage: 5        // Урон за выстрел
            },
            strong: {
                fireRate: 1500,  // Сильный солдат стреляет медленнее
                damage: 10        // Но наносит больше урона
            }
        };
        
        // Настройки здоровья солдат
        this.healthSettings = {
            basic: 50,   // Здоровье слабого солдата
            strong: 100   // Здоровье сильного солдата
        };
    }
    
    getAttackSettings() {
        return {
            basic: { ...this.attackSettings.basic },
            strong: { ...this.attackSettings.strong }
        };
    }
    
    setAttackSetting(type, setting, value) {
        if (this.attackSettings[type] && this.attackSettings[type].hasOwnProperty(setting)) {
            if (setting === 'fireRate') {
                this.attackSettings[type][setting] = Math.max(100, value); // Минимум 100мс
            } else if (setting === 'damage') {
                this.attackSettings[type][setting] = Math.max(1, value); // Минимум 1 урон
            }
        }
    }
    
    getHealthSettings() {
        return { ...this.healthSettings };
    }
    
    setHealthSetting(type, value) {
        if (this.healthSettings.hasOwnProperty(type)) {
            this.healthSettings[type] = Math.max(1, value); // Минимум 1 HP
        }
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    emit() {
        console.log(`SoldierBloc.emit() вызван. Слушателей: ${this.listeners.length}, Солдат в массиве: ${this.state.soldiers.length}`);
        this.listeners.forEach(listener => listener(this.state));
    }

    createSoldier(startPos, playerId, type, obstacleBloc = null, towerBloc = null) {
        // startPos может быть array координатами {x, y} или hex координатами {q, r, s}
        // Преобразуем в array координаты если нужно
        const arrPos = startPos.x !== undefined && startPos.y !== undefined ? startPos : 
                      { x: startPos.q, y: startPos.r + Math.floor(startPos.q / 2) };
        
        const gameState = this.gameBloc.getState();
        const player = gameState.players[playerId];
        
        const soldierConfig = this.getSoldierConfig(type);
        console.log('=== createSoldier вызван ===', {
            startPos,
            playerId,
            type,
            playerGold: player.gold,
            soldierCost: soldierConfig.cost,
            hasObstacleBloc: !!obstacleBloc,
            hasTowerBloc: !!towerBloc
        });
        
        if (player.gold < soldierConfig.cost) {
            console.log('❌ Недостаточно золота для солдата. Нужно:', soldierConfig.cost, 'Есть:', player.gold);
            return false;
        }

        // Определяем целевую позицию (вражеские ворота) - используем array координаты
        const centerX = Math.floor(this.hexGrid.width / 2); // Центр индекс 7 → столбец 8 (чётный с 1)
        // Для игрока 1 ворота на последней строке, на чётной позиции (считая с 1): индекс 7 → столбец 8
        const targetX = centerX; // Центр (индекс 7 → столбец 8, чётный с 1)
        const targetY = playerId === 1 ? 0 : this.hexGrid.height - 1; // Игрок 1 идёт к верху, игрок 2 к последней строке

        // Примечание: проверка пути выполняется в updateSoldiers
        // Здесь просто создаём солдата, путь будет вычислен позже

        const soldier = {
            id: this.soldierIdCounter++,
            playerId,
            currentHexIndex: 0, // Индекс текущей ячейки в пути
            path: null, // Массив гексагонов пути (будет вычислен в updateSoldiers)
            startX: arrPos.x,
            startY: arrPos.y,
            x: arrPos.x, // Текущая позиция (array координаты)
            y: arrPos.y,
            moveProgress: 0, // Прогресс движения от текущей ячейки к следующей (0.0 - 1.0)
            direction: 0, // Направление движения в радианах
            lastPathRecalculation: 0, // Время последнего пересчёта пути (в миллисекундах)
            targetX,
            targetY,
            type,
            level: 1,
            health: soldierConfig.health,
            maxHealth: soldierConfig.health,
            damage: soldierConfig.damage,
            speed: soldierConfig.speed,
            canDestroyTrees: soldierConfig.canDestroyTrees || false,
            destroyingTree: false,
            treeTarget: null,
            treeDirection: 0,
            treeHitProgress: 0,
            treeHitsCount: 0,
            originalPath: null,
            originalTargetX: targetX,
            originalTargetY: targetY,
            attackingBase: false,
            lastBaseAttackTime: 0,
            baseAttackTarget: null
        };

        this.state.soldiers.push(soldier);
        console.log('✅ Солдат добавлен в массив. Всего солдат:', this.state.soldiers.length);
        this.gameBloc.updatePlayerGold(playerId, -soldierConfig.cost);
        console.log('✅ Солдат создан успешно:', {
            id: soldier.id,
            playerId: soldier.playerId,
            type: soldier.type,
            startPos: { x: soldier.startX, y: soldier.startY },
            targetPos: { x: soldier.targetX, y: soldier.targetY },
            soldiersInArray: this.state.soldiers.length
        });
        this.emit();
        console.log('✅ emit() вызван для SoldierBloc');
        return true;
    }

    upgradeSoldier(soldierId) {
        const soldier = this.state.soldiers.find(s => s.id === soldierId);
        if (!soldier) return false;

        const gameState = this.gameBloc.getState();
        const player = gameState.players[soldier.playerId];
        
        const upgradeCost = Math.floor(50 * soldier.level);
        if (player.gold < upgradeCost) {
            return false;
        }

        soldier.level++;
        soldier.maxHealth = Math.floor(soldier.maxHealth * 1.3);
        soldier.health = soldier.maxHealth;
        soldier.damage = Math.floor(soldier.damage * 1.3);
        
        this.gameBloc.updatePlayerGold(soldier.playerId, -upgradeCost);
        this.emit();
        return true;
    }

    getSoldierConfig(type) {
        const baseConfigs = {
            basic: { 
                health: this.healthSettings.basic, 
                damage: 5, 
                speed: 1.0, 
                cost: 50, 
                canDestroyTrees: false 
            },
            strong: { 
                health: this.healthSettings.strong, 
                damage: 10, 
                speed: 0.6, 
                cost: 100, 
                canDestroyTrees: true 
            } // Медленнее, но может ломать деревья
        };
        const config = baseConfigs[type] || baseConfigs.basic;
        // Применяем глобальный множитель скорости
        return {
            ...config,
            speed: config.speed * this.speedMultiplier
        };
    }

    setSpeedMultiplier(multiplier) {
        this.speedMultiplier = multiplier;
        // Обновляем скорость существующих солдат
        this.state.soldiers.forEach(soldier => {
            const soldierConfig = this.getSoldierConfig(soldier.type);
            soldier.speed = soldierConfig.speed; // Используем правильную скорость из конфига
        });
        this.emit();
    }

    updateSoldiers(deltaTime, towerBloc, obstacleBloc = null) {
        // Убрали избыточное логирование для производительности
        const soldiersToRemove = [];
        const currentTime = performance.now();
        
        // Ограничиваем deltaTime, чтобы избежать больших скачков при первом кадре
        const normalizedDeltaTime = Math.min(deltaTime, 100); // Максимум 100мс за кадр
        
        // Интервал пересчёта пути (в миллисекундах) - пересчитываем каждые 500мс
        const PATH_RECALCULATION_INTERVAL = 500;
        
        this.state.soldiers.forEach(soldier => {
            // Обработка режима разрушения дерева
            if (soldier.destroyingTree && soldier.treeTarget) {
                const treeObstacle = obstacleBloc ? obstacleBloc.getObstacleAt(soldier.treeTarget.x, soldier.treeTarget.y) : null;
                
                if (!treeObstacle || treeObstacle.type !== 'tree') {
                    // Дерево уже разрушено или не существует - возвращаемся к оригинальному пути
                    soldier.destroyingTree = false;
                    soldier.treeTarget = null;
                    soldier.treeHitProgress = 0;
                    soldier.treeHitsCount = 0;
                    if (soldier.originalPath) {
                        soldier.path = soldier.originalPath;
                        soldier.targetX = soldier.originalTargetX;
                        soldier.targetY = soldier.originalTargetY;
                        soldier.originalPath = null;
                        // Находим ближайшую ячейку в пути
                        const currentArr = this.hexGrid.hexToArray(this.hexGrid.arrayToHex(soldier.x, soldier.y));
                        let closestIndex = 0;
                        let minDistance = Infinity;
                        soldier.path.forEach((hex, index) => {
                            const hexArr = this.hexGrid.hexToArray(hex);
                            const dx = hexArr.x - currentArr.x;
                            const dy = hexArr.y - currentArr.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestIndex = index;
                            }
                        });
                        soldier.currentHexIndex = closestIndex;
                        soldier.moveProgress = 0;
                    }
                    // Принудительно пересчитываем пути для всех солдат, так как препятствие изменилось
                    this.state.soldiers.forEach(s => {
                        if (s.id !== soldier.id && s.path) {
                            s.lastPathRecalculation = 0; // Принудительный пересчёт
                        }
                    });
                    return; // Пропускаем обработку движения в этом кадре
                }
                
                // Проверяем, достигли ли мы ячейки рядом с деревом
                const currentHexIndex = Math.floor(soldier.currentHexIndex);
                if (soldier.path && currentHexIndex >= soldier.path.length - 1) {
                    // Достигли ячейки рядом с деревом - начинаем разрушение
                    const currentHex = soldier.path[currentHexIndex];
                    const currentArr = this.hexGrid.hexToArray(currentHex);
                    
                    // Проверяем, что мы рядом с деревом
                    const treeArr = { x: soldier.treeTarget.x, y: soldier.treeTarget.y };
                    const dx = treeArr.x - currentArr.x;
                    const dy = treeArr.y - currentArr.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance <= 1.5) { // Рядом с деревом (соседняя ячейка)
                        // Анимация удара
                        // Время одного удара = время прохождения одной ячейки
                        // Для сильного солдата скорость 0.6, значит время прохождения ячейки больше
                        const baseSpeed = soldier.type === 'strong' ? 0.6 : 1.0;
                        // Расстояние между центрами ячеек примерно hexSize * sqrt(3) * 0.87
                        const cellDistance = this.hexGrid.hexSize * Math.sqrt(3) * 0.87;
                        // Скорость в пикселях за миллисекунду
                        const pixelSpeed = baseSpeed * this.speedMultiplier;
                        // Время прохождения одной ячейки в миллисекундах
                        const cellTravelTime = cellDistance / pixelSpeed;
                        const HIT_DURATION = cellTravelTime; // Длительность одного удара = время прохождения ячейки
                        const hitsNeeded = obstacleBloc.getDurabilitySettings().tree;
                        
                        soldier.treeHitProgress += normalizedDeltaTime / HIT_DURATION;
                        
                        if (soldier.treeHitProgress >= 1.0) {
                            // Один удар завершён
                            soldier.treeHitProgress = 0;
                            soldier.treeHitsCount++;
                            
                            // Наносим урон дереву
                            const destroyed = obstacleBloc.damageObstacle(soldier.treeTarget.id, 1);
                            
                            if (destroyed || soldier.treeHitsCount >= hitsNeeded) {
                                // Дерево разрушено
                                soldier.destroyingTree = false;
                                soldier.treeTarget = null;
                                soldier.treeHitProgress = 0;
                                soldier.treeHitsCount = 0;
                                
                                // Возвращаемся к оригинальному пути
                                if (soldier.originalPath) {
                                    soldier.path = soldier.originalPath;
                                    soldier.targetX = soldier.originalTargetX;
                                    soldier.targetY = soldier.originalTargetY;
                                    soldier.originalPath = null;
                                    const currentHexForPath = this.hexGrid.arrayToHex(soldier.x, soldier.y);
                                    const targetHex = this.hexGrid.arrayToHex(soldier.targetX, soldier.targetY);
                                    soldier.path = this.hexGrid.findPath(currentHexForPath, targetHex, obstacleBloc, towerBloc);
                                    soldier.currentHexIndex = 0;
                                    soldier.moveProgress = 0;
                                }
                                
                                // Принудительно пересчитываем пути для всех солдат
                                this.state.soldiers.forEach(s => {
                                    if (s.id !== soldier.id && s.path) {
                                        s.lastPathRecalculation = 0;
                                    }
                                });
                            }
                        }
                        return; // Не двигаемся, только бьём
                    }
                }
            }
            
            // Если путь ещё не вычислен, вычисляем его
            if (!soldier.path || soldier.path.length === 0) {
                const startHex = this.hexGrid.arrayToHex(soldier.startX, soldier.startY);
                const targetHex = this.hexGrid.arrayToHex(soldier.targetX, soldier.targetY);
                soldier.path = this.hexGrid.findPath(startHex, targetHex, obstacleBloc, towerBloc);
                soldier.currentHexIndex = 0;
                soldier.x = soldier.startX;
                soldier.y = soldier.startY;
                soldier.moveProgress = 0;
                soldier.direction = 0;
                soldier.lastPathRecalculation = performance.now();
            }
            
            // Если путь пустой после попытки вычисления, проверяем, не рядом ли с базой
            if (!soldier.path || soldier.path.length === 0) {
                // Проверяем текущую позицию - может быть, мы уже рядом с базой
                const currentHex = this.hexGrid.arrayToHex(soldier.x, soldier.y);
                const currentArr = this.hexGrid.hexToArray(currentHex);
                const centerX = Math.floor(this.hexGrid.width / 2);
                const enemyPlayerId = soldier.playerId === 1 ? 2 : 1;
                
                // Определяем координаты базы врага
                let isNearEnemyBase = false;
                if (enemyPlayerId === 2) {
                    // Вражеская база игрока 2 (вверху) - вся верхняя строка (y === 0)
                    isNearEnemyBase = currentArr.y === 0 || currentArr.y === 1;
                } else {
                    // Вражеская база игрока 1 (внизу) - две строки
                    const isOnPlayer1BaseRow1 = currentArr.y === this.hexGrid.height - 2 && currentArr.x % 2 === 0;
                    const isOnPlayer1BaseRow2 = currentArr.y === this.hexGrid.height - 1 && currentArr.x % 2 === 1;
                    const isNearPlayer1Base = currentArr.y >= this.hexGrid.height - 3;
                    isNearEnemyBase = isOnPlayer1BaseRow1 || isOnPlayer1BaseRow2 || isNearPlayer1Base;
                }
                
                if (!isNearEnemyBase) {
                    // Возвращаем деньги за солдата
                    const soldierConfig = this.getSoldierConfig(soldier.type);
                    this.gameBloc.updatePlayerGold(soldier.playerId, soldierConfig.cost);
                    soldiersToRemove.push(soldier.id);
                    return;
                }
                // Если рядом с базой - продолжаем обработку для атаки
            }
            
            // Получаем текущую позицию солдата
            let currentHex, currentArr;
            const currentHexIndex = Math.floor(soldier.currentHexIndex);
            
            if (soldier.path && soldier.path.length > 0 && currentHexIndex < soldier.path.length) {
                currentHex = soldier.path[currentHexIndex];
                currentArr = this.hexGrid.hexToArray(currentHex);
            } else {
                // Если пути нет, используем текущую позицию солдата
                currentHex = this.hexGrid.arrayToHex(soldier.x, soldier.y);
                currentArr = this.hexGrid.hexToArray(currentHex);
            }
            
            // Проверяем, находится ли солдат на базе врага или рядом с ней
            const centerX = Math.floor(this.hexGrid.width / 2);
            const enemyPlayerId = soldier.playerId === 1 ? 2 : 1;
            
            // Определяем координаты базы врага
            let isOnEnemyBase = false;
            let isNearEnemyBase = false;
            
            if (enemyPlayerId === 2) {
                // Вражеская база игрока 2 (вверху) - вся верхняя строка (y === 0)
                isOnEnemyBase = currentArr.y === 0;
                isNearEnemyBase = currentArr.y <= 1; // В пределах 1 клетки от базы
            } else {
                // Вражеская база игрока 1 (внизу) - две строки
                const isOnPlayer1BaseRow1 = currentArr.y === this.hexGrid.height - 2 && currentArr.x % 2 === 0;
                const isOnPlayer1BaseRow2 = currentArr.y === this.hexGrid.height - 1 && currentArr.x % 2 === 1;
                isOnEnemyBase = isOnPlayer1BaseRow1 || isOnPlayer1BaseRow2;
                isNearEnemyBase = currentArr.y >= this.hexGrid.height - 3; // В пределах 2 клеток от базы
            }
            
            // Если солдат на базе врага или рядом - атакуем её
            if (isOnEnemyBase || isNearEnemyBase) {
                const currentTime = performance.now();
                const timeSinceLastAttack = currentTime - (soldier.lastBaseAttackTime || 0);
                
                // Обновляем настройки атаки
                if (soldier.type === 'basic') {
                    soldier.attackFireRate = this.attackSettings.basic.fireRate;
                    soldier.attackDamage = this.attackSettings.basic.damage;
                } else if (soldier.type === 'strong') {
                    soldier.attackFireRate = this.attackSettings.strong.fireRate;
                    soldier.attackDamage = this.attackSettings.strong.damage;
                }
                
                // Атакуем базу с интервалом
                if (timeSinceLastAttack >= soldier.attackFireRate) {
                    soldier.lastBaseAttackTime = currentTime;
                    this.gameBloc.updatePlayerHealth(enemyPlayerId, soldier.attackDamage);
                    soldier.attackingBase = true;
                    const targetY = enemyPlayerId === 2 ? 0 : this.hexGrid.height - 1;
                    soldier.baseAttackTarget = {
                        x: centerX,
                        y: targetY,
                        time: currentTime
                    };
                }
                // Останавливаем движение, но не удаляем солдата
                return;
            }
            
            // Если достигли конца пути и не рядом с базой - удаляем солдата
            if (soldier.path && currentHexIndex >= soldier.path.length - 1) {
                soldiersToRemove.push(soldier.id);
                return;
            }
            
            // Если пути нет и не рядом с базой - удаляем солдата
            if (!soldier.path || soldier.path.length === 0) {
                soldiersToRemove.push(soldier.id);
                return;
            }
            
            const nextHex = soldier.path[currentHexIndex + 1];
            const nextArr = this.hexGrid.hexToArray(nextHex);
            
            // Периодически пересчитываем путь, чтобы учитывать изменения препятствий
            // НО только если солдат уже прошёл хотя бы одну ячейку, чтобы избежать зацикливания
            const timeSinceLastRecalculation = currentTime - (soldier.lastPathRecalculation || 0);
            const needsPeriodicRecalculation = timeSinceLastRecalculation >= PATH_RECALCULATION_INTERVAL && currentHexIndex > 0;
            
            // Проверяем, не заблокирован ли следующий шаг пути
            // Если заблокирован или прошло достаточно времени - пересчитываем путь от текущей позиции
            const nextStepBlocked = this.hexGrid.isBlocked(nextHex, obstacleBloc, towerBloc);
            if (nextStepBlocked || needsPeriodicRecalculation) {
                // Пересчитываем путь (логирование убрано для производительности)
                
                // Используем текущую ячейку из пути как стартовую позицию для нового пути
                // Это гарантирует, что мы не вернёмся назад
                const currentHexForPath = currentHex; // Используем текущую ячейку из пути
                const targetHex = this.hexGrid.arrayToHex(soldier.targetX, soldier.targetY);
                soldier.path = this.hexGrid.findPath(currentHexForPath, targetHex, obstacleBloc, towerBloc);
                soldier.lastPathRecalculation = currentTime;
                
                // Если путь не найден, не удаляем солдата сразу - даём шанс найти альтернативный путь
                if (!soldier.path || soldier.path.length === 0) {
                    // Проверяем, не рядом ли с базой врага - если да, атакуем
                    const currentHexForCheck = this.hexGrid.arrayToHex(soldier.x, soldier.y);
                    const currentArrForCheck = this.hexGrid.hexToArray(currentHexForCheck);
                    const centerX = Math.floor(this.hexGrid.width / 2);
                    const enemyPlayerId = soldier.playerId === 1 ? 2 : 1;
                    
                    let isNearEnemyBase = false;
                    if (enemyPlayerId === 2) {
                        isNearEnemyBase = currentArrForCheck.y <= 2;
                    } else {
                        isNearEnemyBase = currentArrForCheck.y >= this.hexGrid.height - 3;
                    }
                    
                    if (isNearEnemyBase) {
                        // Рядом с базой - продолжаем атаку, путь найдётся позже
                        soldier.path = null; // Сбросим путь, попробуем найти позже
                        return;
                    }
                    
                    // Если не рядом с базой и путь не найден - пробуем найти путь к ближайшей точке к базе
                    const targetY = enemyPlayerId === 2 ? 1 : this.hexGrid.height - 2;
                    const alternativeTargetHex = this.hexGrid.arrayToHex(centerX, targetY);
                    soldier.path = this.hexGrid.findPath(currentHexForPath, alternativeTargetHex, obstacleBloc, towerBloc);
                    
                    if (!soldier.path || soldier.path.length === 0) {
                        // Всё ещё нет пути - только тогда удаляем
                        const soldierConfig = this.getSoldierConfig(soldier.type);
                        this.gameBloc.updatePlayerGold(soldier.playerId, soldierConfig.cost);
                        soldiersToRemove.push(soldier.id);
                        return;
                    } else {
                        // Обновили цель на альтернативную
                        const altTargetArr = this.hexGrid.hexToArray(alternativeTargetHex);
                        soldier.targetX = altTargetArr.x;
                        soldier.targetY = altTargetArr.y;
                    }
                }
                
                // Проверяем, что первая ячейка нового пути совпадает с текущей
                // Если нет - ищем текущую ячейку в новом пути
                const firstHexInNewPath = soldier.path[0];
                const firstHexArr = this.hexGrid.hexToArray(firstHexInNewPath);
                const currentHexArr = this.hexGrid.hexToArray(currentHex);
                
                if (firstHexArr.x === currentHexArr.x && firstHexArr.y === currentHexArr.y) {
                    // Первая ячейка совпадает с текущей - всё хорошо, продолжаем с индекса 0
                    soldier.currentHexIndex = 0;
                } else {
                    // Ищем текущую ячейку в новом пути
                    let foundIndex = -1;
                    for (let i = 0; i < soldier.path.length; i++) {
                        const hexArr = this.hexGrid.hexToArray(soldier.path[i]);
                        if (hexArr.x === currentHexArr.x && hexArr.y === currentHexArr.y) {
                            foundIndex = i;
                            break;
                        }
                    }
                    
                    if (foundIndex >= 0) {
                        soldier.currentHexIndex = foundIndex;
                    } else {
                        // Текущая ячейка не найдена в новом пути - начинаем с начала
                        soldier.currentHexIndex = 0;
                    }
                }
                
                soldier.moveProgress = 0;
            }
            
            // Проверяем, что путь всё ещё валиден после пересчёта
            if (!soldier.path || soldier.path.length === 0) {
                return;
            }
            
            // Обновляем ссылки на текущую и следующую ячейки (на случай если путь пересчитан)
            const updatedCurrentHex = soldier.path[Math.floor(soldier.currentHexIndex)];
            const updatedNextHex = soldier.path[Math.floor(soldier.currentHexIndex) + 1];
            if (!updatedCurrentHex || !updatedNextHex) {
                return;
            }
            
            // Движение только от центра одной ячейки к центру другой
            // Устанавливаем текущую позицию точно в центр текущей ячейки
            const updatedCurrentArr = this.hexGrid.hexToArray(updatedCurrentHex);
            soldier.x = updatedCurrentArr.x;
            soldier.y = updatedCurrentArr.y;
            
            // Вычисляем расстояние до следующей ячейки в пикселях
            const currentPixel = this.hexGrid.hexToPixel(updatedCurrentHex);
            const nextPixel = this.hexGrid.hexToPixel(updatedNextHex);
            const pixelDx = nextPixel.x - currentPixel.x;
            const pixelDy = nextPixel.y - currentPixel.y;
            const pixelDistance = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
            
            // Сохраняем направление движения для поворота (вычисляем всегда)
            soldier.direction = Math.atan2(pixelDy, pixelDx);
            
            // Вычисляем прогресс движения (0.0 - 1.0)
            if (!soldier.moveProgress) {
                soldier.moveProgress = 0;
            }
            
            // Скорость движения в пикселях за миллисекунду
            const pixelSpeed = soldier.speed * normalizedDeltaTime;
            soldier.moveProgress += pixelSpeed / pixelDistance;
            
            if (soldier.moveProgress >= 1.0) {
                // Достигли следующей ячейки, переходим к следующей
                soldier.currentHexIndex += 1;
                soldier.moveProgress = 0;
                soldier.x = nextArr.x;
                soldier.y = nextArr.y;
            }

            // Атака солдата по башням
            if (towerBloc) {
                const currentTime = performance.now();
                const timeSinceLastAttack = currentTime - (soldier.lastAttackTime || 0);
                
                // Обновляем настройки атаки из текущих настроек
                if (soldier.type === 'basic') {
                    soldier.attackFireRate = this.attackSettings.basic.fireRate;
                    soldier.attackDamage = this.attackSettings.basic.damage;
                } else if (soldier.type === 'strong') {
                    soldier.attackFireRate = this.attackSettings.strong.fireRate;
                    soldier.attackDamage = this.attackSettings.strong.damage;
                }
                
                // Проверяем, может ли солдат атаковать
                if (timeSinceLastAttack >= soldier.attackFireRate) {
                    const soldierHex = this.hexGrid.arrayToHex(soldier.x, soldier.y);
                    const towers = towerBloc.getState().towers;
                    
                    // Ищем ближайшую вражескую башню в соседних клетках
                    let closestTower = null;
                    let minDistance = Infinity;
                    
                    towers.forEach(tower => {
                        if (tower.playerId === soldier.playerId) return; // Не атакуем свои башни
                        
                        const towerHex = this.hexGrid.arrayToHex(tower.x, tower.y);
                        const distance = this.hexGrid.hexDistance(soldierHex, towerHex);
                        
                        // Солдат может атаковать только соседние башни (расстояние <= 1)
                        if (distance <= 1 && distance < minDistance) {
                            minDistance = distance;
                            closestTower = tower;
                        }
                    });
                    
                    if (closestTower) {
                        // Атакуем башню
                        soldier.lastAttackTime = currentTime;
                        soldier.attackTarget = {
                            x: closestTower.x,
                            y: closestTower.y,
                            time: currentTime
                        };
                        
                        // Наносим урон башне
                        towerBloc.damageTower(closestTower.id, soldier.attackDamage);
                    } else {
                        soldier.attackTarget = null;
                    }
                }
            }
            
            // Урон от башен обрабатывается в TowerBloc.updateTowers()
            // Здесь только проверяем, не погиб ли солдат
            if (soldier.health <= 0) {
                soldiersToRemove.push(soldier.id);
            }
        });
        
        // Удаляем солдат, которые достигли цели или погибли
        if (soldiersToRemove.length > 0) {
            soldiersToRemove.forEach(id => {
                this.removeSoldier(id);
            });
            this.emit();
        }
    }

    removeSoldier(id) {
        this.state.soldiers = this.state.soldiers.filter(s => s.id !== id);
    }

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state.soldiers = [];
        this.soldierIdCounter = 0;
        this.emit();
    }
}
