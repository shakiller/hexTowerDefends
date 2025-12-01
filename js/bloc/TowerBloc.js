export class TowerBloc {
    constructor(gameBloc) {
        this.gameBloc = gameBloc;
        this.state = {
            towers: [] // {id, playerId, x, y, type, level, damage, range, cost}
        };
        this.listeners = [];
        this.towerIdCounter = 0;
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

        // Не ставим башни на базах (первый и последний столбец)
        // Ширина поля - 15, значит индексы 0-14
        if (arrPos.x === 0 || arrPos.x === 14) {
            console.log('Нельзя ставить башни на базе. x =', arrPos.x);
            return false;
        }
        
        // Проверка границ поля
        if (arrPos.x < 1 || arrPos.x >= 14 || arrPos.y < 0 || arrPos.y >= 45) {
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
            cost: towerConfig.cost
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
        tower.range = Math.floor(tower.range * 1.2);
        
        this.gameBloc.updatePlayerGold(tower.playerId, -upgradeCost);
        this.emit();
        return true;
    }

    getTowerConfig(type) {
        const configs = {
            basic: { damage: 10, range: 3, cost: 100 },
            strong: { damage: 20, range: 4, cost: 200 }
        };
        return configs[type] || configs.basic;
    }

    getTowerAt(hex) {
        // Конвертируем hex координаты в array координаты для сравнения
        const arr = { x: hex.q, y: hex.r + Math.floor(hex.q / 2) };
        return this.state.towers.find(t => t.x === arr.x && t.y === arr.y);
    }

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state.towers = [];
        this.towerIdCounter = 0;
        this.emit();
    }
}
