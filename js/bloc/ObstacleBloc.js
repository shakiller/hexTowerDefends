export class ObstacleBloc {
    constructor() {
        this.state = {
            obstacles: []
        };
        this.listeners = [];
        
        // Настройки прочности объектов (настраиваемые параметры)
        this.durabilitySettings = {
            tree: 25,
            towerBasic: 50,
            towerStrong: 100,
            base: 100
        };
    }
    
    getDurabilitySettings() {
        return { ...this.durabilitySettings };
    }
    
    setDurabilitySetting(type, value) {
        if (this.durabilitySettings.hasOwnProperty(type)) {
            this.durabilitySettings[type] = Math.max(1, value);
        }
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
    
    getState() {
        return {
            obstacles: [...this.state.obstacles]
        };
    }

    addObstacle(x, y, type) {
        // type: 'stone' (камень, неуничтожимый) или 'tree' (дерево, можно разрушить)
        const obstacle = {
            id: this.state.obstacles.length,
            x,
            y,
            type,
            maxHealth: type === 'stone' ? Infinity : this.durabilitySettings.tree,
            health: type === 'stone' ? Infinity : this.durabilitySettings.tree // Камни неуничтожимы
        };
        
        this.state.obstacles.push(obstacle);
        this.emit();
        return obstacle;
    }

    removeObstacle(obstacleId) {
        this.state.obstacles = this.state.obstacles.filter(o => o.id !== obstacleId);
        this.emit();
    }

    getObstacleAt(x, y) {
        return this.state.obstacles.find(o => o.x === x && o.y === y);
    }

    damageObstacle(obstacleId, damage) {
        const obstacle = this.state.obstacles.find(o => o.id === obstacleId);
        if (!obstacle || obstacle.type === 'stone') return false;
        
        // У дерева есть здоровье
        obstacle.health -= damage;
        if (obstacle.health <= 0) {
            this.removeObstacle(obstacleId);
            return true; // Уничтожено
        }
        this.emit();
        return false; // Повреждено, но не уничтожено
    }

    isBlocked(x, y) {
        const obstacle = this.getObstacleAt(x, y);
        return obstacle !== undefined;
    }

    canPlaceAt(x, y) {
        // Нельзя ставить башни на препятствия
        return !this.isBlocked(x, y);
    }

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state.obstacles = [];
        this.emit();
    }
}


