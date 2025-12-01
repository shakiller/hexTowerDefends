export class ObstacleBloc {
    constructor() {
        this.state = {
            obstacles: []
        };
        this.listeners = [];
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

    addObstacle(x, y, type) {
        // type: 'stone' (камень, неуничтожимый) или 'tree' (дерево, можно разрушить)
        const obstacle = {
            id: this.state.obstacles.length,
            x,
            y,
            type,
            health: type === 'stone' ? Infinity : 100 // Камни неуничтожимы
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

