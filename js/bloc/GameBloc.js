export class GameBloc {
    constructor() {
        this.state = {
            gameMode: null, // 'pvp', 'pve', 'campaign'
            currentPlayer: 1, // 1 or 2
            gameState: 'menu', // 'menu', 'playing', 'paused', 'victory'
            level: 1,
            winner: null,
            players: {
                1: { gold: 500, baseHealth: 100 },
                2: { gold: 500, baseHealth: 100 }
            }
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

    startGame(mode) {
        this.state.gameMode = mode;
        this.state.gameState = 'playing';
        this.state.currentPlayer = 1;
        this.state.winner = null;
        
        // Инициализация в зависимости от режима
        if (mode === 'campaign') {
            this.state.level = 1;
            this.state.players[1].gold = 500;
            this.state.players[1].baseHealth = 100;
            this.state.players[2].gold = 500;
            this.state.players[2].baseHealth = 100;
        } else {
            this.state.players[1].gold = 500;
            this.state.players[1].baseHealth = 100;
            this.state.players[2].gold = 500;
            this.state.players[2].baseHealth = 100;
        }
        
        this.emit();
    }

    pauseGame() {
        if (this.state.gameState === 'playing') {
            this.state.gameState = 'paused';
        } else if (this.state.gameState === 'paused') {
            this.state.gameState = 'playing';
        }
        this.emit();
    }

    switchPlayer() {
        if ((this.state.gameMode === 'pve' || this.state.gameMode === 'campaign') && this.state.currentPlayer === 2) {
            return; // Бот играет автоматически в режимах PvE и Campaign
        }
        this.state.currentPlayer = this.state.currentPlayer === 1 ? 2 : 1;
        this.emit();
    }

    updatePlayerGold(playerId, amount) {
        this.state.players[playerId].gold += amount;
        this.emit();
    }

    updatePlayerHealth(playerId, damage) {
        this.state.players[playerId].baseHealth = Math.max(0, this.state.players[playerId].baseHealth - damage);
        if (this.state.players[playerId].baseHealth <= 0) {
            this.state.gameState = 'victory';
            this.state.winner = playerId === 1 ? 2 : 1;
        }
        this.emit();
    }

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state = {
            gameMode: null,
            currentPlayer: 1,
            gameState: 'menu',
            level: 1,
            winner: null,
            players: {
                1: { gold: 500, baseHealth: 100 },
                2: { gold: 500, baseHealth: 100 }
            }
        };
        this.emit();
    }

    nextLevel() {
        if (this.state.gameMode === 'campaign') {
            this.state.level++;
            this.state.players[1].gold = 500 + this.state.level * 100;
            this.state.players[1].baseHealth = 100;
            this.state.players[2].gold = 500 + this.state.level * 50;
            this.state.players[2].baseHealth = 100;
            this.state.gameState = 'playing';
            this.state.currentPlayer = 1;
            this.emit();
        }
    }
}
