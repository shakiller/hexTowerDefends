export class BotAI {
    constructor(gameBloc, towerBloc, soldierBloc, hexGrid) {
        this.gameBloc = gameBloc;
        this.towerBloc = towerBloc;
        this.soldierBloc = soldierBloc;
        this.hexGrid = hexGrid;
        this.lastActionTime = 0;
        this.actionInterval = 2000; // Действие каждые 2 секунды
    }

    update(currentTime) {
        const gameState = this.gameBloc.getState();
        
        // Бот играет за игрока 2 в режимах PvE и Campaign
        if ((gameState.gameMode !== 'pve' && gameState.gameMode !== 'campaign') || gameState.currentPlayer !== 2) {
            return;
        }

        if (currentTime - this.lastActionTime < this.actionInterval) {
            return;
        }

        this.lastActionTime = currentTime;
        this.makeDecision();
    }

    makeDecision() {
        const gameState = this.gameBloc.getState();
        const player = gameState.players[2];
        const towerState = this.towerBloc.getState();
        const soldierState = this.soldierBloc.getState();

        // Простая стратегия: случайные действия
        const action = Math.random();

        if (action < 0.4 && player.gold >= 50) {
            // Отправить солдата
            const startY = Math.floor(Math.random() * Math.min(this.hexGrid.width, this.hexGrid.height));
            const startHex = this.hexGrid.arrayToHex(this.hexGrid.width - 1, startY);
            this.soldierBloc.createSoldier(startHex, 2, 'basic');
        } else if (action < 0.7 && player.gold >= 100) {
            // Построить башню (ближе к своей базе)
            const x = Math.floor(Math.random() * 10) + (this.hexGrid.width - 15);
            const y = Math.floor(Math.random() * (this.hexGrid.height - 10)) + 5;
            const hex = this.hexGrid.arrayToHex(x, y);
            this.towerBloc.createTower(hex, 2, 'basic');
        } else if (action < 0.9 && towerState.towers.length > 0 && player.gold >= 50) {
            // Улучшить случайную башню
            const botTowers = towerState.towers.filter(t => t.playerId === 2);
            if (botTowers.length > 0) {
                const randomTower = botTowers[Math.floor(Math.random() * botTowers.length)];
                this.towerBloc.upgradeTower(randomTower.id);
            }
        }

        // Переход хода (только в режиме PvP, в PvE и Campaign бот играет автоматически)
        if (gameState.gameMode === 'pvp') {
            setTimeout(() => {
                this.gameBloc.switchPlayer();
            }, 500);
        }
    }
}
