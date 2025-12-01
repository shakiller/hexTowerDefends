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

    createSoldier(startPos, playerId, type) {
        // startPos может быть array координатами {x, y} или hex координатами {q, r, s}
        // Преобразуем в array координаты если нужно
        const arrPos = startPos.x !== undefined && startPos.y !== undefined ? startPos : 
                      { x: startPos.q, y: startPos.r + Math.floor(startPos.q / 2) };
        
        const gameState = this.gameBloc.getState();
        const player = gameState.players[playerId];
        
        const soldierConfig = this.getSoldierConfig(type);
        if (player.gold < soldierConfig.cost) {
            console.log('Недостаточно золота для солдата. Нужно:', soldierConfig.cost, 'Есть:', player.gold);
            return false;
        }

        // Определяем целевую позицию (вражеские ворота) - используем array координаты
        const centerX = Math.floor(this.hexGrid.width / 2); // Центр индекс 7 → столбец 8 (чётный с 1)
        // Для игрока 1 ворота на последней строке, на чётной позиции (считая с 1): индекс 7 → столбец 8
        const targetX = centerX; // Центр (индекс 7 → столбец 8, чётный с 1)
        const targetY = playerId === 1 ? 0 : this.hexGrid.height - 1; // Игрок 1 идёт к верху, игрок 2 к последней строке

        const soldier = {
            id: this.soldierIdCounter++,
            playerId,
            x: arrPos.x,
            y: arrPos.y,
            type,
            level: 1,
            health: soldierConfig.health,
            maxHealth: soldierConfig.health,
            damage: soldierConfig.damage,
            speed: soldierConfig.speed,
            targetX,
            targetY
        };

        this.state.soldiers.push(soldier);
        this.gameBloc.updatePlayerGold(playerId, -soldierConfig.cost);
        this.emit();
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
            basic: { health: 50, damage: 5, speed: 1.0, cost: 50 },
            strong: { health: 100, damage: 10, speed: 1.5, cost: 100 }
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
            const baseSpeed = soldier.type === 'strong' ? 1.5 : 1.0;
            soldier.speed = baseSpeed * this.speedMultiplier;
        });
        this.emit();
    }

    updateSoldiers(deltaTime, towerBloc) {
        const soldiersToRemove = [];
        
        this.state.soldiers.forEach(soldier => {
            // Движение к цели
            const dx = soldier.targetX - soldier.x;
            const dy = soldier.targetY - soldier.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0.5) {
                soldier.x += (dx / distance) * soldier.speed * deltaTime * 0.01;
                soldier.y += (dy / distance) * soldier.speed * deltaTime * 0.01;
            } else {
                // Достиг базы противника
                const enemyPlayerId = soldier.playerId === 1 ? 2 : 1;
                this.gameBloc.updatePlayerHealth(enemyPlayerId, soldier.damage);
                soldiersToRemove.push(soldier.id);
            }

            // Проверка попадания под огонь башен
            const towers = towerBloc.getState().towers;
            towers.forEach(tower => {
                if (tower.playerId !== soldier.playerId) {
                    const towerDx = soldier.x - tower.x;
                    const towerDy = soldier.y - tower.y;
                    const towerDistance = Math.sqrt(towerDx * towerDx + towerDy * towerDy);
                    
                    if (towerDistance <= tower.range) {
                        soldier.health -= tower.damage * deltaTime * 0.01;
                        if (soldier.health <= 0) {
                            soldiersToRemove.push(soldier.id);
                        }
                    }
                }
            });
        });
        
        // Удаляем солдат, которые достигли цели или погибли
        soldiersToRemove.forEach(id => this.removeSoldier(id));
        
        if (soldiersToRemove.length > 0) {
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
