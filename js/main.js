import { GameBloc } from './bloc/GameBloc.js';
import { PlayerBloc } from './bloc/PlayerBloc.js';
import { TowerBloc } from './bloc/TowerBloc.js';
import { SoldierBloc } from './bloc/SoldierBloc.js';
import { HexGrid } from './game/HexGrid.js';
import { Renderer } from './game/Renderer.js';
import { BotAI } from './game/BotAI.js';

class Game {
    constructor() {
        this.gameBloc = new GameBloc();
        this.playerBloc = new PlayerBloc(this.gameBloc);
        this.towerBloc = new TowerBloc(this.gameBloc);
        this.soldierBloc = new SoldierBloc(this.gameBloc);
        this.hexGrid = new HexGrid(15, 45);
        
        this.canvas = document.getElementById('game-canvas');
        this.renderer = new Renderer(this.canvas, this.hexGrid);
        this.botAI = new BotAI(this.gameBloc, this.towerBloc, this.soldierBloc, this.hexGrid);
        
        this.lastTime = 0;
        this.isRunning = false;
        
        this.setupEventListeners();
        this.setupBLoCSubscriptions();
        
        // Обработка изменения размера окна
        window.addEventListener('resize', () => {
            if (this.gameBloc.getState().gameState === 'playing') {
                this.renderer.setupCanvas();
                this.render();
            }
        });
    }

    setupEventListeners() {
        // Меню
        const btnPvp = document.getElementById('btn-pvp');
        const btnPve = document.getElementById('btn-pve');
        const btnCampaign = document.getElementById('btn-campaign');
        
        if (!btnPvp || !btnPve || !btnCampaign) {
            console.error('Кнопки меню не найдены!');
            return;
        }
        
        btnPvp.addEventListener('click', () => {
            console.log('Клик по PvP');
            this.startGame('pvp');
        });
        btnPve.addEventListener('click', () => {
            console.log('Клик по PvE');
            this.startGame('pve');
        });
        btnCampaign.addEventListener('click', () => {
            console.log('Клик по Campaign');
            this.startGame('campaign');
        });
        
        // Игровые кнопки
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.gameBloc.pauseGame();
        });
        document.getElementById('btn-menu').addEventListener('click', () => {
            this.showScreen('menu-screen');
            this.stopGame();
        });
        document.getElementById('btn-restart').addEventListener('click', () => {
            const gameState = this.gameBloc.getState();
            if (gameState.gameMode === 'campaign' && gameState.winner === 1) {
                // Очищаем состояние игры для следующего уровня
                this.towerBloc.reset();
                this.soldierBloc.reset();
                this.playerBloc.clearSelection();
                
                this.gameBloc.nextLevel();
                this.showScreen('game-screen');
                this.isRunning = true;
                this.lastTime = performance.now();
                this.gameLoop();
            } else {
                this.gameBloc.reset();
                this.startGame(gameState.gameMode);
            }
        });
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            this.showScreen('menu-screen');
            this.gameBloc.reset();
            this.stopGame();
        });
        
        // Панель башен
        document.querySelectorAll('.tower-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.playerBloc.selectTowerType(type);
            });
        });
        
        // Панель солдат
        document.querySelectorAll('.soldier-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.playerBloc.selectSoldierType(type);
            });
        });
        
        // Улучшения
        document.getElementById('btn-upgrade-tower').addEventListener('click', () => {
            const gameState = this.gameBloc.getState();
            const playerState = this.playerBloc.getState();
            if (playerState.selectedCell) {
                const hex = this.hexGrid.arrayToHex(playerState.selectedCell.x, playerState.selectedCell.y);
                const tower = this.towerBloc.getTowerAt(hex);
                if (tower) {
                    const success = this.towerBloc.upgradeTower(tower.id);
                    if (success && gameState.gameMode === 'pvp') {
                        this.gameBloc.switchPlayer();
                    }
                }
            }
        });
        
        document.getElementById('btn-upgrade-soldier').addEventListener('click', () => {
            const gameState = this.gameBloc.getState();
            const playerState = this.playerBloc.getState();
            const soldierState = this.soldierBloc.getState();
            if (playerState.selectedCell) {
                const hex = this.hexGrid.arrayToHex(playerState.selectedCell.x, playerState.selectedCell.y);
                const soldier = soldierState.soldiers.find(s => 
                    Math.floor(s.x) === hex.x && Math.floor(s.y) === hex.y
                );
                if (soldier) {
                    const success = this.soldierBloc.upgradeSoldier(soldier.id);
                    if (success && gameState.gameMode === 'pvp') {
                        this.gameBloc.switchPlayer();
                    }
                }
            }
        });
        
        // Клик по канвасу
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });
    }

    setupBLoCSubscriptions() {
        this.gameBloc.subscribe((state) => {
            this.updateUI(state);
        });
        
        this.playerBloc.subscribe((state) => {
            this.updatePlayerPanel(state);
        });
        
        this.towerBloc.subscribe(() => {
            this.render();
        });
        
        this.soldierBloc.subscribe(() => {
            this.render();
        });
    }

    startGame(mode) {
        // Очищаем состояние игры
        this.towerBloc.reset();
        this.soldierBloc.reset();
        this.playerBloc.clearSelection();
        
        this.gameBloc.startGame(mode);
        this.showScreen('game-screen');
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

    stopGame() {
        this.isRunning = false;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    updateUI(gameState) {
        // Обновление ресурсов игроков
        document.getElementById('p1-gold').textContent = gameState.players[1].gold;
        document.getElementById('p1-health').textContent = gameState.players[1].baseHealth;
        document.getElementById('p2-gold').textContent = gameState.players[2].gold;
        document.getElementById('p2-health').textContent = gameState.players[2].baseHealth;
        
        // Обновление кнопки паузы
        const pauseBtn = document.getElementById('btn-pause');
        pauseBtn.textContent = gameState.gameState === 'paused' ? 'Продолжить' : 'Пауза';
        
        // Обработка победы
        if (gameState.gameState === 'victory') {
            let victoryText = '';
            if (gameState.gameMode === 'campaign') {
                if (gameState.winner === 1) {
                    victoryText = `Уровень ${gameState.level} пройден!`;
                } else {
                    victoryText = `Игра окончена на уровне ${gameState.level}`;
                }
            } else {
                victoryText = `Победил Игрок ${gameState.winner}!`;
            }
            document.getElementById('victory-text').textContent = victoryText;
            this.showScreen('victory-screen');
            this.stopGame();
        }
    }

    updatePlayerPanel(playerState) {
        const gameState = this.gameBloc.getState();
        const currentPlayer = gameState.currentPlayer;
        
        // Обновление кнопок башен и солдат
        document.querySelectorAll('.tower-btn').forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            btn.disabled = gameState.players[currentPlayer].gold < cost;
        });
        
        document.querySelectorAll('.soldier-btn').forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            btn.disabled = gameState.players[currentPlayer].gold < cost;
        });
        
        // Обновление кнопок улучшений
        const upgradeTowerBtn = document.getElementById('btn-upgrade-tower');
        const upgradeSoldierBtn = document.getElementById('btn-upgrade-soldier');
        
        if (playerState.selectedCell) {
            const hex = this.hexGrid.arrayToHex(playerState.selectedCell.x, playerState.selectedCell.y);
            const tower = this.towerBloc.getTowerAt(hex);
            const soldierState = this.soldierBloc.getState();
            const soldier = soldierState.soldiers.find(s => 
                Math.floor(s.x) === hex.x && Math.floor(s.y) === hex.y
            );
            
            upgradeTowerBtn.disabled = !tower || tower.playerId !== currentPlayer;
            upgradeSoldierBtn.disabled = !soldier || soldier.playerId !== currentPlayer;
        } else {
            upgradeTowerBtn.disabled = true;
            upgradeSoldierBtn.disabled = true;
        }
    }

    handleCanvasClick(e) {
        const gameState = this.gameBloc.getState();
        if (gameState.gameState !== 'playing') return;
        if ((gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') && gameState.currentPlayer === 2) return; // Бот играет автоматически
        
        const rect = this.canvas.getBoundingClientRect();
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        const x = e.clientX - rect.left - offsetX;
        const y = e.clientY - rect.top - offsetY;
        
        const hex = this.hexGrid.pixelToHex(x, y);
        if (!this.hexGrid.isValidHex(hex)) return;
        
        const arrHex = this.hexGrid.hexToArray(hex);
        const playerState = this.playerBloc.getState();
        const currentPlayer = gameState.currentPlayer;
        
        // Выбор башни или солдата для улучшения
        if (!playerState.selectedTowerType && !playerState.selectedSoldierType) {
            this.playerBloc.selectCell(arrHex);
            return;
        }
        
        // Размещение башни
        if (playerState.selectedTowerType) {
            const success = this.towerBloc.createTower(arrHex, currentPlayer, playerState.selectedTowerType);
            if (success) {
                this.playerBloc.clearSelection();
                // В режиме кампании не переключаем игрока
                if (gameState.gameMode !== 'campaign') {
                    this.gameBloc.switchPlayer();
                }
            }
        }
        
        // Отправка солдата
        if (playerState.selectedSoldierType) {
            // Солдаты отправляются только со своей базы
            if ((currentPlayer === 1 && arrHex.x === 0) || 
                (currentPlayer === 2 && arrHex.x === this.hexGrid.width - 1)) {
                const success = this.soldierBloc.createSoldier(arrHex, currentPlayer, playerState.selectedSoldierType);
                if (success) {
                    this.playerBloc.clearSelection();
                    // В режиме кампании не переключаем игрока
                    if (gameState.gameMode !== 'campaign') {
                        this.gameBloc.switchPlayer();
                    }
                }
            }
        }
    }

    gameLoop(currentTime = performance.now()) {
        if (!this.isRunning) return;
        
        const deltaTime = currentTime - this.lastTime;
        const gameState = this.gameBloc.getState();
        
        if (gameState.gameState === 'playing') {
            // Обновление солдат
            this.soldierBloc.updateSoldiers(deltaTime, this.towerBloc);
            
            // Обновление бота
            this.botAI.update(currentTime);
        }
        
        this.render();
        this.lastTime = currentTime;
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    render() {
        const gameState = this.gameBloc.getState();
        const towerState = this.towerBloc.getState();
        const soldierState = this.soldierBloc.getState();
        const playerState = this.playerBloc.getState();
        
        this.renderer.render(gameState, towerState, soldierState, playerState);
    }
}

// Инициализация игры при загрузке
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('Инициализация игры...');
        new Game();
        console.log('Игра инициализирована успешно');
    } catch (error) {
        console.error('Ошибка при инициализации игры:', error);
        alert('Ошибка загрузки игры. Проверьте консоль браузера. Возможно, нужно запустить локальный сервер (например, через Python: python -m http.server или через Live Server в VS Code).');
    }
});
