export class TowerBloc {
    constructor(gameBloc, hexGrid) {
        this.gameBloc = gameBloc;
        this.hexGrid = hexGrid;
        this.state = {
            towers: [] // {id, playerId, x, y, type, level, damage, range, cost, lastShotTime, fireRate, health, maxHealth}
        };
        this.listeners = [];
        this.towerIdCounter = 0;
        
        // Настройки скорости стрельбы (в миллисекундах между выстрелами)
        this.fireRateSettings = {
            basic: 500,   // Маленькая башня: быстрая стрельба (500мс = 2 выстрела в секунду)
            strong: 1000  // Большая башня: медленная стрельба (1000мс = 1 выстрел в секунду)
        };
        
        // Настройки дальности стрельбы (в клетках)
        this.rangeSettings = {
            basic: 1,   // Маленькая башня: радиус 1 клетка
            strong: 2   // Большая башня: радиус 2 клетки
        };
        
        // Настройки урона башен
        this.damageSettings = {
            basic: 10,   // Маленькая башня: урон 10
            strong: 20   // Большая башня: урон 20
        };
        
        // Режим тестирования (стрельба по кругу)
        this.testMode = false;
    }
    
    getFireRateSettings() {
        return { ...this.fireRateSettings };
    }
    
    setFireRateSetting(type, value) {
        if (this.fireRateSettings.hasOwnProperty(type)) {
            this.fireRateSettings[type] = Math.max(100, value); // Минимум 100мс
        }
    }
    
    getRangeSettings() {
        return { ...this.rangeSettings };
    }
    
    setRangeSetting(type, value) {
        if (this.rangeSettings.hasOwnProperty(type)) {
            this.rangeSettings[type] = Math.max(1, Math.min(5, value)); // От 1 до 5 клеток
        }
    }
    
    getDamageSettings() {
        return { ...this.damageSettings };
    }
    
    setDamageSetting(type, value) {
        if (this.damageSettings.hasOwnProperty(type)) {
            this.damageSettings[type] = Math.max(1, value); // Минимум 1 урон
        }
    }
    
    initTestMode() {
        this.testMode = true;
        // Инициализируем углы для каждой башни (стрельба по кругу)
        this.state.towers.forEach(tower => {
            tower.testAngle = 0; // Начальный угол для стрельбы по кругу
        });
        this.emit();
    }
    
    stopTestMode() {
        this.testMode = false;
        this.state.towers.forEach(tower => {
            tower.testAngle = undefined;
            tower.lastShotTarget = null;
        });
        this.emit();
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

    createTower(pos, playerId, type) {
        // pos может быть array координатами {x, y} или hex координатами {q, r, s}
        // Преобразуем в array координаты если нужно
        const arrPos = pos.x !== undefined && pos.y !== undefined ? pos : 
                      { x: pos.q, y: pos.r + Math.floor(pos.q / 2) };
        
        const gameState = this.gameBloc.getState();
        const player = gameState.players[playerId];
        
        const towerConfig = this.getTowerConfig(type);
        if (player.gold < towerConfig.cost) {
            console.log('Недостаточно золота для башни. Нужно:', towerConfig.cost, 'Есть:', player.gold);
            return false;
        }

        // Не ставим башни на базах
        // База игрока 2 (вверху) - вся верхняя строка (y === 0)
        // База игрока 1 (внизу) - последняя строка (y === height - 1, только чётные ячейки)
        const isOnPlayer2Base = arrPos.y === 0;
        const isOnPlayer1Base = arrPos.y === this.hexGrid.height - 1 && arrPos.x % 2 === 1; // Последняя строка, чётные столбцы (с 1) → индексы нечётные
        if (isOnPlayer1Base || isOnPlayer2Base) {
            console.log('Нельзя ставить башни на базе. x =', arrPos.x, 'y =', arrPos.y);
            return false;
        }
        
        // Проверка границ поля
        if (arrPos.x < 0 || arrPos.x >= this.hexGrid.width || arrPos.y < 0 || arrPos.y >= this.hexGrid.height) {
            console.log('Башня вне границ поля. x =', arrPos.x, 'y =', arrPos.y);
            return false;
        }

        // Проверка, не занята ли клетка башней
        const existingTower = this.state.towers.find(t => 
            t.x === arrPos.x && t.y === arrPos.y
        );
        if (existingTower) {
            console.log('Клетка уже занята башней');
            return false;
        }

        const tower = {
            id: this.towerIdCounter++,
            playerId,
            x: arrPos.x,
            y: arrPos.y,
            type,
            level: 1,
            damage: towerConfig.damage,
            range: towerConfig.range,
            cost: towerConfig.cost,
            fireRate: towerConfig.fireRate,
            lastShotTime: 0,
            health: towerConfig.health || 100,
            maxHealth: towerConfig.health || 100
        };

        this.state.towers.push(tower);
        this.gameBloc.updatePlayerGold(playerId, -towerConfig.cost);
        this.emit();
        return true;
    }

    upgradeTower(towerId) {
        const tower = this.state.towers.find(t => t.id === towerId);
        if (!tower) return false;

        const gameState = this.gameBloc.getState();
        const player = gameState.players[tower.playerId];
        
        const upgradeCost = Math.floor(tower.cost * 0.5);
        if (player.gold < upgradeCost) {
            return false;
        }

        tower.level++;
        tower.damage = Math.floor(tower.damage * 1.5);
        // Радиус не увеличиваем при улучшении, он фиксированный для типа башни
        // tower.range остаётся прежним
        
        this.gameBloc.updatePlayerGold(tower.playerId, -upgradeCost);
        this.emit();
        return true;
    }

    getTowerConfig(type) {
        // Маленькая башня: радиус настраиваемый, быстрая стрельба
        // Большая башня: радиус настраиваемый, медленная стрельба
        // Обновляем fireRate, range и damage из текущих настроек
        const configs = {
            basic: { 
                damage: this.damageSettings.basic, 
                range: this.rangeSettings.basic, 
                cost: 100, 
                fireRate: this.fireRateSettings.basic,
                health: 50
            },
            strong: { 
                damage: this.damageSettings.strong, 
                range: this.rangeSettings.strong, 
                cost: 200, 
                fireRate: this.fireRateSettings.strong,
                health: 100
            }
        };
        const config = configs[type] || configs.basic;
        // Обновляем fireRate, range и damage из актуальных настроек
        if (type === 'basic') {
            config.fireRate = this.fireRateSettings.basic;
            config.range = this.rangeSettings.basic;
            config.damage = this.damageSettings.basic;
        } else if (type === 'strong') {
            config.fireRate = this.fireRateSettings.strong;
            config.range = this.rangeSettings.strong;
            config.damage = this.damageSettings.strong;
        }
        return config;
    }
    
    damageTower(towerId, damage) {
        const tower = this.state.towers.find(t => t.id === towerId);
        if (!tower) return false;
        
        tower.health -= damage;
        if (tower.health <= 0) {
            // Башня уничтожена
            this.state.towers = this.state.towers.filter(t => t.id !== towerId);
            this.emit();
            return true; // Уничтожена
        }
        this.emit();
        return false; // Повреждена, но не уничтожена
    }

    getTowerAt(hex) {
        // Конвертируем hex координаты в array координаты для сравнения
        // Используем тот же метод, что и в HexGrid.hexToArray
        const arrPos = this.hexGrid.hexToArray(hex);
        return this.state.towers.find(t => t.x === arrPos.x && t.y === arrPos.y);
    }

    getState() {
        return { ...this.state };
    }

    updateTowers(currentTime, soldiers, hexGrid) {
        // Обновляем башни и их стрельбу
        this.state.towers.forEach(tower => {
            // Обновляем fireRate, range и damage из текущих настроек
            if (tower.type === 'basic') {
                tower.fireRate = this.fireRateSettings.basic;
                tower.range = this.rangeSettings.basic;
                tower.damage = this.damageSettings.basic;
            } else if (tower.type === 'strong') {
                tower.fireRate = this.fireRateSettings.strong;
                tower.range = this.rangeSettings.strong;
                tower.damage = this.damageSettings.strong;
            }
            
            // Проверяем, может ли башня стрелять
            const timeSinceLastShot = currentTime - (tower.lastShotTime || 0);
            if (timeSinceLastShot < tower.fireRate) {
                return; // Ещё не прошло достаточно времени
            }
            
            // Режим тестирования: стрельба по кругу
            if (this.testMode) {
                const towerHex = hexGrid.arrayToHex(tower.x, tower.y);
                const towerPixel = hexGrid.hexToPixel(towerHex);
                
                // Инициализируем угол, если его нет
                if (tower.testAngle === undefined) {
                    tower.testAngle = 0;
                }
                
                // Вычисляем целевую точку на окружности радиуса range
                const radiusInPixels = tower.range * hexGrid.hexSize * 2; // Примерный радиус в пикселях
                const targetPixelX = towerPixel.x + Math.cos(tower.testAngle) * radiusInPixels;
                const targetPixelY = towerPixel.y + Math.sin(tower.testAngle) * radiusInPixels;
                
                // Конвертируем пиксели обратно в hex координаты для визуализации
                const targetHex = hexGrid.pixelToHex({ x: targetPixelX, y: targetPixelY });
                const targetArr = hexGrid.hexToArray(targetHex);
                
                // Стреляем
                tower.lastShotTime = currentTime;
                tower.lastShotTarget = {
                    x: targetArr.x,
                    y: targetArr.y,
                    time: currentTime
                };
                
                // Увеличиваем угол для следующего выстрела (по кругу)
                tower.testAngle += (Math.PI * 2) / 8; // 8 выстрелов на полный круг
                if (tower.testAngle >= Math.PI * 2) {
                    tower.testAngle -= Math.PI * 2;
                }
                
                return;
            }
            
            // Обычный режим: находим ближайшего вражеского солдата в радиусе
            const towerHex = hexGrid.arrayToHex(tower.x, tower.y);
            let closestSoldier = null;
            let minDistance = Infinity;
            
            soldiers.forEach(soldier => {
                if (soldier.playerId === tower.playerId) return; // Не стреляем по своим
                
                const soldierHex = hexGrid.arrayToHex(soldier.x, soldier.y);
                const distance = hexGrid.hexDistance(towerHex, soldierHex); // Расстояние в гексагональных единицах
                
                // tower.range уже в гексагональных единицах (1 клетка = 1 единица, 2 клетки = 2 единицы)
                if (distance <= tower.range && distance < minDistance) {
                    minDistance = distance;
                    closestSoldier = soldier;
                }
            });
            
            if (closestSoldier) {
                // Стреляем по солдату
                tower.lastShotTime = currentTime;
                
                // Для большой башни - зона поражения (все солдаты в целевой клетке получают урон)
                if (tower.type === 'strong') {
                    const targetHex = hexGrid.arrayToHex(closestSoldier.x, closestSoldier.y);
                    const targetArr = hexGrid.hexToArray(targetHex);
                    
                    // Находим всех солдат в целевой клетке
                    soldiers.forEach(soldier => {
                        if (soldier.playerId === tower.playerId) return; // Не стреляем по своим
                        
                        const soldierArr = hexGrid.hexToArray(hexGrid.arrayToHex(soldier.x, soldier.y));
                        if (soldierArr.x === targetArr.x && soldierArr.y === targetArr.y) {
                            soldier.health -= tower.damage;
                        }
                    });
                    
                    // Сохраняем информацию о выстреле для визуализации (зона поражения)
                    tower.lastShotTarget = {
                        x: targetArr.x,
                        y: targetArr.y,
                        time: currentTime,
                        isAreaAttack: true // Флаг зоны поражения
                    };
                } else {
                    // Маленькая башня стреляет только по одному солдату
                    closestSoldier.health -= tower.damage;
                    
                    // Сохраняем информацию о выстреле для визуализации
                    tower.lastShotTarget = {
                        x: closestSoldier.x,
                        y: closestSoldier.y,
                        time: currentTime,
                        isAreaAttack: false
                    };
                }
            }
        });
        
        this.emit();
    }

    reset() {
        this.state.towers = [];
        this.towerIdCounter = 0;
        this.emit();
    }
}
