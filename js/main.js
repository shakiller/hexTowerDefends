console.log('=== НАЧАЛО ЗАГРУЗКИ main.js ===');
console.log('Если вы видите это сообщение, значит модуль main.js загружается!');

import { GameBloc } from './bloc/GameBloc.js';
import { PlayerBloc } from './bloc/PlayerBloc.js';
import { TowerBloc } from './bloc/TowerBloc.js';
import { SoldierBloc } from './bloc/SoldierBloc.js';
import { ObstacleBloc } from './bloc/ObstacleBloc.js';
import { HexGrid } from './game/HexGrid.js';
import { Renderer } from './game/Renderer.js';
import { BotAI } from './game/BotAI.js';

console.log('=== ИМПОРТЫ ЗАГРУЖЕНЫ ===');

class Game {
    constructor() {
        this.gameBloc = new GameBloc();
        this.hexGrid = new HexGrid(15, 52); // 52 строки (0-51): сетка до 50, база на новой строке 51 с только чётными ячейками
        this.playerBloc = new PlayerBloc(this.gameBloc);
        this.towerBloc = new TowerBloc(this.gameBloc, this.hexGrid);
        this.soldierBloc = new SoldierBloc(this.gameBloc, this.hexGrid);
        this.obstacleBloc = new ObstacleBloc();
        
        this.canvas = document.getElementById('game-canvas');
        this.renderer = new Renderer(this.canvas, this.hexGrid);
        this.botAI = new BotAI(this.gameBloc, this.towerBloc, this.soldierBloc, this.hexGrid);
        
        this.lastTime = 0;
        this.isRunning = false;
        this.wasDragForClick = false; // Инициализация флага для проверки drag
        
        // Отладка: отслеживание позиции мыши
        this.mousePosition = null;
        this.mouseHistory = []; // История позиций мыши для шлейфа
        this.maxHistoryLength = 50; // Максимальная длина истории
        
        console.log('Вызов setupEventListeners...');
        this.setupEventListeners();
        console.log('setupEventListeners завершён');
        
        console.log('Вызов setupBLoCSubscriptions...');
        this.setupBLoCSubscriptions();
        console.log('setupBLoCSubscriptions завершён');
        
        console.log('Вызов setupDragToScroll...');
        this.setupDragToScroll();
        console.log('setupDragToScroll завершён');
        
        console.log('=== КОНСТРУКТОР Game ЗАВЕРШЁН ===');
        
        // Обработка изменения размера окна
        window.addEventListener('resize', () => {
            if (this.gameBloc.getState().gameState === 'playing') {
                this.renderer.setupCanvas();
                this.render();
            }
        });
    }

    setupDragToScroll() {
        const container = document.getElementById('game-board-container');
        let isDragging = false;
        let startX, startY;
        let scrollLeft, scrollTop;

        // Drag-to-scroll только при зажатии ПРАВОЙ кнопки мыши
        // Левой кнопкой на канвасе - только клики
        container.addEventListener('mousedown', (e) => {
            // НИКОГДА не трогаем канвас - он для игры
            if (e.target === this.canvas || this.canvas.contains(e.target)) {
                return;
            }
            
            // Только правая кнопка для drag-to-scroll на фоне контейнера
            if (e.button === 2) {
                isDragging = true;
                startX = e.pageX;
                startY = e.pageY;
                scrollLeft = container.scrollLeft;
                scrollTop = container.scrollTop;
                container.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });
        
        // Прокрутка колесиком мыши
        container.addEventListener('wheel', (e) => {
            container.scrollLeft += e.deltaX;
            container.scrollTop += e.deltaY;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const walkX = (e.pageX - startX);
            const walkY = (e.pageY - startY);
            container.scrollLeft = scrollLeft - walkX;
            container.scrollTop = scrollTop - walkY;
            e.preventDefault();
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                container.style.cursor = '';
            }
        });

        container.addEventListener('mouseleave', () => {
            if (isDragging) {
                isDragging = false;
                container.style.cursor = '';
            }
        });
        
        // Блокируем контекстное меню только на фоне контейнера
        container.addEventListener('contextmenu', (e) => {
            if (e.target === container && e.target !== this.canvas && !this.canvas.contains(e.target)) {
                e.preventDefault();
            }
        });
    }

    setupEventListeners() {
        console.log('=== setupEventListeners НАЧАЛО ===');
        // Меню
        const btnPvp = document.getElementById('btn-pvp');
        const btnPve = document.getElementById('btn-pve');
        const btnCampaign = document.getElementById('btn-campaign');
        
        if (!btnPvp || !btnPve || !btnCampaign) {
            console.error('Кнопки меню не найдены!', {
                btnPvp: !!btnPvp,
                btnPve: !!btnPve,
                btnCampaign: !!btnCampaign
            });
            console.error('Ищем кнопки через querySelector...');
            const btnPvp2 = document.querySelector('#btn-pvp');
            const btnPve2 = document.querySelector('#btn-pve');
            const btnCampaign2 = document.querySelector('#btn-campaign');
            console.error('Результаты querySelector:', {
                btnPvp2: !!btnPvp2,
                btnPve2: !!btnPve2,
                btnCampaign2: !!btnCampaign2
            });
            return;
        }
        
        console.log('Кнопки меню найдены:', {
            btnPvp: btnPvp,
            btnPve: btnPve,
            btnCampaign: btnCampaign
        });
        
        // Используем и addEventListener и onclick для надёжности
        const handleMenuClick = (mode, e) => {
            console.log(`=== КЛИК ПО ${mode.toUpperCase()} ===`);
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.startGame(mode);
        };
        
        // Простая регистрация - только addEventListener
        btnPvp.addEventListener('click', (e) => {
            console.log('=== КЛИК ПО PVP (addEventListener) ===', e);
            e.preventDefault();
            e.stopPropagation();
            handleMenuClick('pvp', e);
        });
        
        btnPve.addEventListener('click', (e) => {
            console.log('=== КЛИК ПО PVE (addEventListener) ===', e);
            e.preventDefault();
            e.stopPropagation();
            handleMenuClick('pve', e);
        });
        
        btnCampaign.addEventListener('click', (e) => {
            console.log('=== КЛИК ПО CAMPAIGN (addEventListener) ===', e);
            e.preventDefault();
            e.stopPropagation();
            handleMenuClick('campaign', e);
        });
        
        console.log('Обработчики кнопок меню зарегистрированы');
        console.log('Попробуйте кликнуть по кнопке - должно появиться сообщение');
        
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
        const towerButtons = document.querySelectorAll('.tower-btn');
        console.log('Найдено кнопок башен:', towerButtons.length);
        
        towerButtons.forEach((btn, index) => {
            console.log(`Регистрация обработчика для кнопки башни ${index}:`, btn);
            btn.addEventListener('click', (e) => {
                console.log('=== КЛИК ПО КНОПКЕ БАШНИ ===');
                const type = e.target.dataset.type || e.target.closest('.tower-btn')?.dataset.type;
                console.log('Тип башни:', type);
                
                if (!type) {
                    console.error('Тип башни не найден!', e.target);
                    return;
                }
                
                const playerState = this.playerBloc.getState();
                // Если уже выбран этот тип - отменяем выбор
                if (playerState.selectedTowerType === type) {
                    this.playerBloc.clearSelection();
                } else {
                    this.playerBloc.selectTowerType(type);
                }
                const newState = this.playerBloc.getState();
                console.log('Состояние после выбора башни:', newState);
            });
        });
        
        // Панель солдат
        document.querySelectorAll('.soldier-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type || e.target.closest('.soldier-btn')?.dataset.type;
                if (!type) return;
                
                const gameState = this.gameBloc.getState();
                const currentPlayer = gameState.currentPlayer;
                
                // Сразу создаем солдата у ворот
                // Центр: индекс 7 → столбец 8 (чётный с 1) → используется индекс 7
                const centerX = Math.floor(this.hexGrid.width / 2); // Центр индекс 7
                // Для игрока 1 ворота на последней строке, на чётной позиции (считая с 1): индекс 7 → столбец 8
                const gateX = currentPlayer === 1 ? centerX : centerX; // Оба используют центр
                const gateY = currentPlayer === 1 ? this.hexGrid.height - 1 : 0; // Игрок 1: последняя строка, Игрок 2: верхняя строка
                const gatePos = {x: gateX, y: gateY};
                
                console.log('Создание солдата у ворот:', { gatePos, currentPlayer });
                
                const success = this.soldierBloc.createSoldier(gatePos, currentPlayer, type);
                if (success) {
                    // В режиме кампании не переключаем игрока
                    if (gameState.gameMode !== 'campaign') {
                        this.gameBloc.switchPlayer();
                    }
                } else {
                    console.log('Не удалось создать солдата. Недостаточно золота или другая ошибка.');
                }
            });
        });
        
        // Панель препятствий
        document.querySelectorAll('.obstacle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type || e.target.closest('.obstacle-btn')?.dataset.type;
                if (!type) return;
                
                const playerState = this.playerBloc.getState();
                // Если уже выбран этот тип - отменяем выбор
                if (playerState.selectedObstacleType === type) {
                    this.playerBloc.clearSelection();
                } else {
                    this.playerBloc.selectObstacleType(type);
                }
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
                    if (success) {
                        this.playerBloc.clearSelection();
                        if (gameState.gameMode === 'pvp') {
                            this.gameBloc.switchPlayer();
                        }
                    }
                }
            }
        });
        
        // Кнопка отмены выбора
        const cancelBtn = document.getElementById('btn-cancel-selection');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.playerBloc.clearSelection();
            });
        }
        
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
        
        // Клик по канвасу - самый простой обработчик без блокировок
        if (!this.canvas) {
            console.error('Канвас не найден!');
            return;
        }
        
        console.log('Регистрация обработчика клика на канвасе');
        console.log('Канвас:', this.canvas);
        console.log('Размер канваса:', this.canvas.width, 'x', this.canvas.height);
        
        // Обработчик клика на канвасе
        this.canvas.addEventListener('click', (e) => {
            console.log('=== КЛИК НА КАНВАСЕ ЗАРЕГИСТРИРОВАН ===', {
                button: e.button,
                clientX: e.clientX,
                clientY: e.clientY,
                target: e.target,
                currentTarget: e.currentTarget
            });
            e.stopPropagation();
            this.handleCanvasClick(e);
        }, false);
        
        // Также mousedown для отладки
        this.canvas.addEventListener('mousedown', (e) => {
            console.log('=== MOUSEDOWN НА КАНВАСЕ ===', e.button);
        }, false);
        
        // Отслеживание движения мыши для подсветки ячейки
        this.canvas.addEventListener('mousemove', (e) => {
            this.updateMousePosition(e);
            this.render(); // Перерисовываем для подсветки ячейки
        }, false);
        
        // Очистка позиции при уходе мыши с канваса
        this.canvas.addEventListener('mouseleave', () => {
            this.mousePosition = null;
            this.render();
        }, false);
        
        // Обработчик скролла для виртуального скролла внутри канваса
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.renderer.scrollX += e.deltaX;
            this.renderer.scrollY += e.deltaY;
            
            // Ограничиваем скролл размерами поля
            const maxScrollX = Math.max(0, this.renderer.fieldWidth - this.canvas.width);
            const maxScrollY = Math.max(0, this.renderer.fieldHeight - this.canvas.height);
            this.renderer.scrollX = Math.max(0, Math.min(maxScrollX, this.renderer.scrollX));
            this.renderer.scrollY = Math.max(0, Math.min(maxScrollY, this.renderer.scrollY));
            
            this.render();
        }, { passive: false });
        
        // Настройка скорости солдат
        const speedSlider = document.getElementById('soldier-speed-slider');
        const speedValue = document.getElementById('soldier-speed-value');
        if (speedSlider && speedValue) {
            speedSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                speedValue.textContent = value.toFixed(2);
                this.soldierBloc.setSpeedMultiplier(value);
                console.log('Скорость солдат изменена на:', value);
            });
        }
        
        console.log('Обработчики клика зарегистрированы');
    }

    setupBLoCSubscriptions() {
        this.gameBloc.subscribe((state) => {
            this.updateUI(state);
        });
        
        this.playerBloc.subscribe((state) => {
            console.log('PlayerBloc состояние изменилось:', state);
            this.updatePlayerPanel(state);
            this.render(); // Перерисовываем при изменении выбора башни/солдата
        });
        
        this.towerBloc.subscribe(() => {
            this.render();
        });
        
        this.soldierBloc.subscribe(() => {
            this.render();
        });
        
        this.obstacleBloc.subscribe(() => {
            this.render();
        });
    }

    startGame(mode) {
        console.log('=== startGame ВЫЗВАН ===', mode);
        
        // Очищаем состояние игры
        this.towerBloc.reset();
        this.soldierBloc.reset();
        this.obstacleBloc.reset();
        this.playerBloc.clearSelection();
        
        // Препятствия теперь устанавливаются вручную через UI (отключена автоматическая генерация)
        
        console.log('Запуск игры в режиме:', mode);
        this.gameBloc.startGame(mode);
        console.log('Состояние игры после startGame:', this.gameBloc.getState());
        
        this.showScreen('game-screen');
        console.log('Экран игры показан');
        
        // Пересчитываем размеры канваса после показа экрана
        // Используем requestAnimationFrame для гарантии отрисовки
        requestAnimationFrame(() => {
            this.renderer.setupCanvas();
            this.render();
        });
        
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

    initObstacles() {
        // Добавляем случайные препятствия на карту
        // Камни - неуничтожимые
        // Деревья - можно разрушить
        
        const numStones = 10; // Количество камней
        const numTrees = 20;  // Количество деревьев
        
        // Камни
        for (let i = 0; i < numStones; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * (this.hexGrid.width - 2)) + 1; // Не на базах
                y = Math.floor(Math.random() * this.hexGrid.height);
            } while (this.obstacleBloc.getObstacleAt(x, y)); // Проверка, что клетка свободна
            
            this.obstacleBloc.addObstacle(x, y, 'stone');
        }
        
        // Деревья
        for (let i = 0; i < numTrees; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * (this.hexGrid.width - 2)) + 1; // Не на базах
                y = Math.floor(Math.random() * this.hexGrid.height);
            } while (this.obstacleBloc.getObstacleAt(x, y)); // Проверка, что клетка свободна
            
            this.obstacleBloc.addObstacle(x, y, 'tree');
        }
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
        const cancelBtn = document.getElementById('btn-cancel-selection');
        
        // Показываем/скрываем кнопку отмены в зависимости от выбора
        if (cancelBtn) {
            if (playerState.selectedTowerType || playerState.selectedSoldierType || playerState.selectedObstacleType) {
                cancelBtn.style.display = 'block';
            } else {
                cancelBtn.style.display = 'none';
            }
        }
        
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
        console.log('=== ОБРАБОТКА КЛИКА НА КАНВАСЕ ===');
        
        const gameState = this.gameBloc.getState();
        console.log('Состояние игры:', gameState.gameState);
        
        if (gameState.gameState !== 'playing') {
            console.log('Игра не запущена! Текущее состояние:', gameState.gameState);
            console.log('Запустите игру через меню (PvP/PvE/Campaign)');
            return;
        }
        if ((gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') && gameState.currentPlayer === 2) {
            console.log('Ход бота');
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const container = document.getElementById('game-board-container');
        
        // Координаты клика относительно видимой части канваса
        const visibleX = e.clientX - rect.left;
        const visibleY = e.clientY - rect.top;
        
        // Используем виртуальный скролл из Renderer
        const scrollX = this.renderer.scrollX;
        const scrollY = this.renderer.scrollY;
        
        // Координаты относительно всего поля (с учётом скролла)
        const fieldX = visibleX + scrollX;
        const fieldY = visibleY + scrollY;
        
        // Вычисляем offset так же, как в Renderer
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.renderer.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        
        // Финальные координаты относительно сетки
        const x = fieldX - offsetX;
        const y = fieldY - offsetY;
        
        console.log('Координаты клика:', { 
            clientX: e.clientX, 
            clientY: e.clientY,
            rectLeft: rect.left,
            rectTop: rect.top,
            scrollLeft: container.scrollLeft, 
            scrollTop: container.scrollTop,
            offsetX,
            offsetY,
            calculatedX: x, 
            calculatedY: y 
        });
        
        const hex = this.hexGrid.pixelToHex(x, y);
        console.log('Гексагон из координат:', hex);
        
        if (!this.hexGrid.isValidHex(hex)) {
            console.log('Гексагон вне границ');
            return;
        }
        
        const arrHex = this.hexGrid.hexToArray(hex);
        console.log('Выбранная ячейка массива:', arrHex);
        
        const playerState = this.playerBloc.getState();
        const currentPlayer = gameState.currentPlayer;
        
        console.log('Состояние:', {
            selectedTowerType: playerState.selectedTowerType,
            selectedSoldierType: playerState.selectedSoldierType,
            currentPlayer,
            gold: gameState.players[currentPlayer].gold
        });
        
        // Размещение препятствия
        if (playerState.selectedObstacleType) {
            // Нельзя ставить препятствия на базах
            // База игрока 2 (вверху) - вся верхняя строка (y === 0)
            // База игрока 1 (внизу) - последняя строка (y === height - 1, только чётные ячейки)
            const isOnPlayer2Base = arrHex.y === 0;
            const isOnPlayer1Base = arrHex.y === this.hexGrid.height - 1 && arrHex.x % 2 === 1; // Последняя строка, чётные столбцы (с 1) → индексы нечётные
            if (isOnPlayer1Base || isOnPlayer2Base) {
                console.log('Нельзя ставить препятствия на базе');
                return;
            }
            
            // Проверяем, не занята ли клетка
            const existingObstacle = this.obstacleBloc.getObstacleAt(arrHex.x, arrHex.y);
            const hex = this.hexGrid.arrayToHex(arrHex.x, arrHex.y);
            const existingTower = this.towerBloc.getTowerAt(hex);
            
            if (existingObstacle) {
                // Если клик на существующем препятствии - удаляем его (если дерево)
                if (existingObstacle.type === 'tree') {
                    this.obstacleBloc.removeObstacle(existingObstacle.id);
                    this.playerBloc.clearSelection();
                    return;
                } else {
                    console.log('Камень нельзя удалить');
                    return;
                }
            }
            
            if (existingTower) {
                console.log('Нельзя ставить препятствие на башне');
                return;
            }
            
            // Размещаем препятствие
            this.obstacleBloc.addObstacle(arrHex.x, arrHex.y, playerState.selectedObstacleType);
            this.playerBloc.clearSelection();
            return;
        }
        
        // Выбор башни или солдата для улучшения
        if (!playerState.selectedTowerType && !playerState.selectedSoldierType) {
            console.log('Выбор ячейки для просмотра/улучшения');
            this.playerBloc.selectCell(arrHex);
            return;
        }
        
        // Размещение башни
        if (playerState.selectedTowerType) {
            // Проверяем, есть ли уже башня на этой ячейке
            const hex = this.hexGrid.arrayToHex(arrHex.x, arrHex.y);
            const existingTower = this.towerBloc.getTowerAt(hex);
            
            // Если клик на свою башню - выбираем её для улучшения
            if (existingTower && existingTower.playerId === currentPlayer) {
                console.log('Выбрана башня для улучшения');
                this.playerBloc.clearSelection();
                this.playerBloc.selectCell(arrHex);
                return;
            }
            
            // Если клик на пустую ячейку, которая не подходит для размещения - отменяем выбор
            if (!existingTower) {
                // Проверяем, можно ли поставить башню здесь
                // База игрока 2 (вверху) - вся верхняя строка (y === 0)
                // База игрока 1 (внизу) - последняя строка (y === height - 1, только чётные ячейки)
                const isOnPlayer2Base = arrHex.y === 0;
                const isOnPlayer1Base = arrHex.y === this.hexGrid.height - 1 && arrHex.x % 2 === 1; // Последняя строка, чётные столбцы (с 1) → индексы нечётные
                if (isOnPlayer1Base || isOnPlayer2Base) {
                    console.log('Нельзя ставить башни на базе - отмена выбора');
                    this.playerBloc.clearSelection();
                    return;
                }
            }
            
            // Проверка препятствий
            const obstacle = this.obstacleBloc.getObstacleAt(arrHex.x, arrHex.y);
            if (obstacle) {
                console.log('Нельзя ставить башню на препятствии');
                return;
            }
            
            console.log('ПОПЫТКА РАЗМЕСТИТЬ БАШНЮ:', {
                type: playerState.selectedTowerType,
                position: arrHex,
                player: currentPlayer
            });
            const success = this.towerBloc.createTower(arrHex, currentPlayer, playerState.selectedTowerType);
            console.log('РЕЗУЛЬТАТ РАЗМЕЩЕНИЯ БАШНИ:', success);
            
            if (success) {
                console.log('Башня успешно размещена!');
                this.playerBloc.clearSelection();
                // В режиме кампании не переключаем игрока
                if (gameState.gameMode !== 'campaign') {
                    this.gameBloc.switchPlayer();
                }
            } else {
                console.log('Не удалось разместить башню - проверьте консоль выше');
            }
        }
        
    }

    gameLoop(currentTime = performance.now()) {
        if (!this.isRunning) return;
        
        // При первом кадре lastTime может быть 0, поэтому ограничиваем deltaTime
        const deltaTime = this.lastTime > 0 ? currentTime - this.lastTime : 16; // 16мс = ~60 FPS
        const gameState = this.gameBloc.getState();
        
        if (gameState.gameState === 'playing') {
            // Обновление солдат
            this.soldierBloc.updateSoldiers(deltaTime, this.towerBloc);
            
            // Обновление бота
            this.botAI.update(currentTime);
        }
        
        // Обновление отладочной информации о солдатах
        this.updateSoldierDebugInfo();
        
        this.render();
        this.lastTime = currentTime;
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    updateSoldierDebugInfo() {
        const debugInfoEl = document.getElementById('soldier-debug-info');
        if (!debugInfoEl) return;
        
        const soldierState = this.soldierBloc.getState();
        const soldiers = soldierState.soldiers;
        
        if (soldiers.length === 0) {
            debugInfoEl.textContent = 'Нет солдат';
            return;
        }
        
        let info = `Всего солдат: ${soldiers.length}\n\n`;
        soldiers.forEach((soldier, index) => {
            const dx = soldier.targetX - soldier.x;
            const dy = soldier.targetY - soldier.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            info += `[${index}] ID:${soldier.id} P:${soldier.playerId} T:${soldier.type}\n`;
            info += `  Позиция: x=${soldier.x.toFixed(3)} y=${soldier.y.toFixed(3)}\n`;
            info += `  Цель: tx=${soldier.targetX} ty=${soldier.targetY}\n`;
            info += `  Расстояние до цели: ${distance.toFixed(3)}\n`;
            info += `  Скорость: ${soldier.speed.toFixed(4)}\n`;
            info += `  Здоровье: ${soldier.health.toFixed(1)}/${soldier.maxHealth}\n`;
            info += `\n`;
        });
        
        debugInfoEl.textContent = info;
    }

    updateMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const container = document.getElementById('game-board-container');
        
        // Координаты относительно видимой части канваса
        const visibleX = e.clientX - rect.left;
        const visibleY = e.clientY - rect.top;
        
        // Используем виртуальный скролл из Renderer
        const scrollX = this.renderer.scrollX;
        const scrollY = this.renderer.scrollY;
        
        // Координаты относительно всего поля (с учётом скролла)
        const fieldX = visibleX + scrollX;
        const fieldY = visibleY + scrollY;
        
        // Вычисляем offset
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.renderer.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        
        // Координаты относительно сетки
        const gridX = fieldX - offsetX;
        const gridY = fieldY - offsetY;
        
        // Преобразуем в hex координаты для подсветки ячейки
        const hex = this.hexGrid.pixelToHex(gridX, gridY);
        
        // Сохраняем позицию с hex координатами
        this.mousePosition = {
            hex: this.hexGrid.isValidHex(hex) ? hex : null
        };
    }

    render() {
        const gameState = this.gameBloc.getState();
        const towerState = this.towerBloc.getState();
        const soldierState = this.soldierBloc.getState();
        const playerState = this.playerBloc.getState();
        const obstacleState = this.obstacleBloc.getState();
        
        this.renderer.render(gameState, towerState, soldierState, playerState, this.mousePosition, obstacleState);
    }
}

// Инициализация игры при загрузке (только один раз)
if (document.readyState === 'loading') {
    console.log('=== ОЖИДАНИЕ DOMContentLoaded ===');
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    console.log('=== DOM УЖЕ ЗАГРУЖЕН, ИНИЦИАЛИЗИРУЕМ СРАЗУ ===');
    initGame();
}

function initGame() {
    if (window.game) {
        console.log('Игра уже инициализирована, пропускаем');
        return;
    }
    
    try {
        console.log('=== СОЗДАНИЕ Game ===');
        window.game = new Game();
        console.log('=== ИГРА УСПЕШНО ИНИЦИАЛИЗИРОВАНА ===');
    } catch (error) {
        console.error('=== ОШИБКА ПРИ ИНИЦИАЛИЗАЦИИ ИГРЫ ===', error);
        console.error('Stack:', error.stack);
        alert('Ошибка загрузки игры. Проверьте консоль браузера (F12). Ошибка: ' + error.message);
    }
}

