export class SoldierBloc {
    constructor(gameBloc) {
        this.gameBloc = gameBloc;
        this.state = {
            soldiers: [] // {id, playerId, x, y, type, level, health, damage, speed, targetX, targetY}
        };
        this.listeners = [];
        this.soldierIdCounter = 0;
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

    createSoldier(startHex, playerId, type) {
        const gameState = this.gameBloc.getState();
        const player = gameState.players[playerId];
        
        const soldierConfig = this.getSoldierConfig(type);
        if (player.gold < soldierConfig.cost) {
            return false;
        }

        // Определяем целевую позицию (вражеская база)
        const targetX = playerId === 1 ? 44 : 0;
        const targetY = Math.floor(this.gameBloc.state.players[playerId].baseHealth % 15);

        const soldier = {
            id: this.soldierIdCounter++,
            playerId,
            x: startHex.x,
            y: startHex.y,
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
        const configs = {
            basic: { health: 50, damage: 5, speed: 1, cost: 50 },
            strong: { health: 100, damage: 10, speed: 1.5, cost: 100 }
        };
        return configs[type] || configs.basic;
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
