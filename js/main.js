import { GameBloc } from './bloc/GameBloc.js';
import { PlayerBloc } from './bloc/PlayerBloc.js';
import { TowerBloc } from './bloc/TowerBloc.js';
import { SoldierBloc } from './bloc/SoldierBloc.js';
import { ObstacleBloc } from './bloc/ObstacleBloc.js';
import { GoldBloc } from './bloc/GoldBloc.js';
import { WorkerBloc } from './bloc/WorkerBloc.js';
import { HexGrid } from './game/HexGrid.js';
import { Renderer } from './game/Renderer.js';
import { BotAI } from './game/BotAI.js';
import { logger } from './utils/Logger.js';

class Game {
    constructor() {
        this.gameBloc = new GameBloc();
        this.hexGrid = new HexGrid(15, 30); // 30 строк: сетка до 28, база на строке 29
        this.playerBloc = new PlayerBloc(this.gameBloc);
        this.towerBloc = new TowerBloc(this.gameBloc, this.hexGrid);
        this.soldierBloc = new SoldierBloc(this.gameBloc, this.hexGrid);
        this.obstacleBloc = new ObstacleBloc();
        this.goldBloc = new GoldBloc(this.hexGrid);
        this.workerBloc = new WorkerBloc(this.gameBloc, this.hexGrid);
        
        this.canvas = document.getElementById('game-canvas');
        this.renderer = new Renderer(this.canvas, this.hexGrid);
        this.botAI = new BotAI(this.gameBloc, this.towerBloc, this.soldierBloc, this.hexGrid, this.obstacleBloc, this.workerBloc, this.goldBloc);
        
        this.lastTime = 0;
        this.isRunning = false;
        this.wasDragForClick = false; // Инициализация флага для проверки drag
        this.lastGoldBaseCheck = 0; // Время последней проверки золота на базе
        this.lastGameLoopLog = 0; // Время последнего логирования gameLoop
        this.gameLoopCallCount = 0; // Счётчик вызовов gameLoop
        
        // Настройка визуальной отладки
        this.setupVisualDebug();
        
        // Отладка: отслеживание позиции мыши
        this.mousePosition = null;
        this.mouseHistory = []; // История позиций мыши для шлейфа
        this.maxHistoryLength = 50; // Максимальная длина истории
        
        // Отладка: последняя ошибка создания солдата
        this.lastSoldierCreationError = null;
        this.lastSoldierCreationAttempt = null;
        
        // Отслеживание двойного клика на дерево
        this.lastTreeClick = null;
        this.lastTreeClickTime = 0;
        this.doubleClickDelay = 300; // Задержка для двойного клика в мс
        
        this.setupEventListeners();
        this.setupDebugTabs();
        this.setupBLoCSubscriptions();
        this.setupDragToScroll();
        
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
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.startGame(mode);
        };
        
        // Простая регистрация - только addEventListener
        btnPvp.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMenuClick('pvp', e);
        });
        
        btnPve.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMenuClick('pve', e);
        });
        
        btnCampaign.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMenuClick('campaign', e);
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
            // Скрываем попап
            const victoryPopup = document.getElementById('victory-popup');
            if (victoryPopup) {
                victoryPopup.style.display = 'none';
            }
            
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
            // Скрываем попап
            const victoryPopup = document.getElementById('victory-popup');
            if (victoryPopup) {
                victoryPopup.style.display = 'none';
            }
            
            this.showScreen('menu-screen');
            this.gameBloc.reset();
            this.stopGame();
        });
        
        // Панель башен
        const towerButtons = document.querySelectorAll('.tower-btn');
        
        towerButtons.forEach((btn, index) => {
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
            });
        });
        
        // Тестовая кнопка соседей
        const btnTestNeighbors = document.getElementById('btn-test-neighbors');
        const btnCopyTestInfo = document.getElementById('btn-copy-test-info');
        const testInfoEl = document.getElementById('test-neighbors-info');
        
        if (btnTestNeighbors) {
            btnTestNeighbors.addEventListener('click', () => {
                const playerState = this.playerBloc.getState();
                this.playerBloc.toggleTestNeighborsMode();
                const newState = this.playerBloc.getState();
                btnTestNeighbors.textContent = newState.testNeighborsMode ? 'Выключить тест соседей' : 'Включить тест соседей';
                btnTestNeighbors.style.background = newState.testNeighborsMode ? '#ff6b6b' : '#4a90e2';
                if (btnCopyTestInfo) {
                    btnCopyTestInfo.style.display = newState.testNeighborsMode ? 'block' : 'none';
                }
                if (!newState.testNeighborsMode && testInfoEl) {
                    testInfoEl.textContent = '';
                }
            });
        }
        
        // Обработчик кнопки теста башен
        const btnTestTowers = document.getElementById('btn-test-towers');
        if (btnTestTowers) {
            btnTestTowers.addEventListener('click', () => {
                const playerState = this.playerBloc.getState();
                this.playerBloc.toggleTestTowersMode();
                const newState = this.playerBloc.getState();
                btnTestTowers.textContent = newState.testTowersMode ? 'Выключить тест башен' : 'Включить тест башен';
                btnTestTowers.style.background = newState.testTowersMode ? '#ff6b6b' : '#4a90e2';
                
                if (newState.testTowersMode) {
                    // Инициализируем тестовый режим для всех башен
                    this.towerBloc.initTestMode();
                } else {
                    // Выключаем тестовый режим
                    this.towerBloc.stopTestMode();
                }
            });
        }
        
        // Кнопка копирования информации о соседях
        if (btnCopyTestInfo && testInfoEl) {
            btnCopyTestInfo.addEventListener('click', () => {
                const text = testInfoEl.textContent || '';
                if (text) {
                    navigator.clipboard.writeText(text).then(() => {
                        btnCopyTestInfo.textContent = 'Скопировано!';
                        setTimeout(() => {
                            btnCopyTestInfo.textContent = 'Копировать информацию';
                        }, 2000);
                    }).catch(err => {
                        // Ошибка копирования
                        // Fallback для старых браузеров
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        btnCopyTestInfo.textContent = 'Скопировано!';
                        setTimeout(() => {
                            btnCopyTestInfo.textContent = 'Копировать информацию';
                        }, 2000);
                    });
                }
            });
        }

        // Панель солдат
        const soldierButtons = document.querySelectorAll('.soldier-btn');
        soldierButtons.forEach((btn, index) => {
            console.log(`Регистрация обработчика для кнопки солдата ${index}:`, btn);
            btn.addEventListener('click', (e) => {
                console.log('🔴🔴🔴 КНОПКА СОЛДАТА НАЖАТА! 🔴🔴🔴', { 
                    target: e.target, 
                    currentTarget: e.currentTarget,
                    button: btn 
                });
                e.stopPropagation();
                
                const type = e.target.dataset.type || e.target.closest('.soldier-btn')?.dataset.type || btn.dataset.type;
                console.log('Тип солдата извлечен:', type);
                if (!type) {
                    console.log('=== СОЗДАНИЕ СОЛДАТА: тип не найден ===');
                    this.lastSoldierCreationError = 'Тип солдата не найден';
                    this.lastSoldierCreationAttempt = { type: null, timestamp: Date.now() };
                    this.updateSoldierDebugInfo();
                    return;
                }
                
                console.log('=== НАЖАТИЕ КНОПКИ СОЗДАНИЯ СОЛДАТА ===', { type, button: e.target });
                
                const gameState = this.gameBloc.getState();
                // В режимах PvE и Campaign игрок всегда 1, бот играет автоматически
                // В PvP используется currentPlayer
                const playerId = (gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') ? 1 : gameState.currentPlayer;
                
                // Сразу создаем солдата у ворот
                // Центр: индекс 7 → столбец 8 (чётный с 1) → используется индекс 7
                const centerX = Math.floor(this.hexGrid.width / 2); // Центр индекс 7
                // Для игрока 1 ворота на последней строке, на чётной позиции (считая с 1): индекс 7 → столбец 8
                const gateX = centerX; // Оба используют центр
                const gateY = playerId === 1 ? this.hexGrid.height - 1 : 0; // Игрок 1: последняя строка, Игрок 2: верхняя строка
                const gatePos = {x: gateX, y: gateY};
                
                const player = gameState.players[playerId];
                const soldierConfig = this.soldierBloc.getSoldierConfig(type);
                
                console.log('=== ПАРАМЕТРЫ СОЗДАНИЯ СОЛДАТА ===', {
                    type,
                    playerId,
                    gameMode: gameState.gameMode,
                    gatePos,
                    playerGold: player.gold,
                    soldierCost: soldierConfig.cost,
                    hasObstacleBloc: !!this.obstacleBloc,
                    hasTowerBloc: !!this.towerBloc
                });
                
                this.lastSoldierCreationAttempt = {
                    type,
                    playerId,
                    gatePos,
                    playerGold: player.gold,
                    soldierCost: soldierConfig.cost,
                    timestamp: Date.now()
                };
                this.lastSoldierCreationError = null;
                
                const success = this.soldierBloc.createSoldier(gatePos, playerId, type, this.obstacleBloc, this.towerBloc);
                console.log('=== РЕЗУЛЬТАТ СОЗДАНИЯ СОЛДАТА ===', { success });
                
                if (success) {
                    this.updateUI(this.gameBloc.getState());
                }
            });
        });
        
        // Обработчики для кнопок создания рабочих
        const workerButtons = document.querySelectorAll('.worker-btn');
        workerButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.dataset.type;
                const cost = parseInt(btn.dataset.cost);
                
                const gameState = this.gameBloc.getState();
                const currentPlayer = gameState.currentPlayer;
                const playerId = currentPlayer;
                
                // Находим позицию ворот для создания рабочего
                const centerX = Math.floor(this.hexGrid.width / 2);
                const gateY = playerId === 1 ? this.hexGrid.height - 1 : 0;
                const gatePos = { x: centerX, y: gateY };
                
                const success = this.workerBloc.createWorker(gatePos, playerId, type);
                if (success) {
                    this.updateUI(this.gameBloc.getState());
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
                        // В режиме PvP (онлайн) оба игрока играют одновременно, переключение не требуется
                    }
                }
            }
        });
        
        // Кнопка отмены выбора
        const cancelBtn = document.getElementById('btn-cancel-selection');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.playerBloc.clearSelection();
                // Обновляем UI после очистки выбора, чтобы кнопки обновились
                this.updatePlayerPanel(this.playerBloc.getState());
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
                    // В режиме PvP (онлайн) оба игрока играют одновременно, переключение не требуется
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
        
        // Обработчики для слайдеров прочности объектов
        const treeDurabilitySlider = document.getElementById('tree-durability');
        const treeDurabilityValue = document.getElementById('tree-durability-value');
        if (treeDurabilitySlider && treeDurabilityValue) {
            treeDurabilitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                treeDurabilityValue.textContent = value;
                this.obstacleBloc.setDurabilitySetting('tree', value);
                console.log('Прочность дерева изменена на:', value);
            });
        }
        
        const towerBasicDurabilitySlider = document.getElementById('tower-basic-durability');
        const towerBasicDurabilityValue = document.getElementById('tower-basic-durability-value');
        if (towerBasicDurabilitySlider && towerBasicDurabilityValue) {
            towerBasicDurabilitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerBasicDurabilityValue.textContent = value;
                this.obstacleBloc.setDurabilitySetting('towerBasic', value);
                console.log('Прочность маленькой башни изменена на:', value);
            });
        }
        
        const towerStrongDurabilitySlider = document.getElementById('tower-strong-durability');
        const towerStrongDurabilityValue = document.getElementById('tower-strong-durability-value');
        if (towerStrongDurabilitySlider && towerStrongDurabilityValue) {
            towerStrongDurabilitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerStrongDurabilityValue.textContent = value;
                this.obstacleBloc.setDurabilitySetting('towerStrong', value);
                console.log('Прочность большой башни изменена на:', value);
            });
        }
        
        const baseDurabilitySlider = document.getElementById('base-durability');
        const baseDurabilityValue = document.getElementById('base-durability-value');
        if (baseDurabilitySlider && baseDurabilityValue) {
            baseDurabilitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                baseDurabilityValue.textContent = value;
                this.obstacleBloc.setDurabilitySetting('base', value);
                console.log('Прочность базы изменена на:', value);
            });
        }
        
        // Обработчики для слайдеров скорости стрельбы башен
        const towerBasicFireRateSlider = document.getElementById('tower-basic-firerate');
        const towerBasicFireRateValue = document.getElementById('tower-basic-firerate-value');
        if (towerBasicFireRateSlider && towerBasicFireRateValue) {
            towerBasicFireRateSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerBasicFireRateValue.textContent = value;
                this.towerBloc.setFireRateSetting('basic', value);
                // Обновляем fireRate для существующих башен
                this.towerBloc.getState().towers.forEach(tower => {
                    if (tower.type === 'basic') {
                        tower.fireRate = value;
                    }
                });
                console.log('Скорость стрельбы маленькой башни изменена на:', value, 'мс');
            });
        }
        
        const towerStrongFireRateSlider = document.getElementById('tower-strong-firerate');
        const towerStrongFireRateValue = document.getElementById('tower-strong-firerate-value');
        if (towerStrongFireRateSlider && towerStrongFireRateValue) {
            towerStrongFireRateSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerStrongFireRateValue.textContent = value;
                this.towerBloc.setFireRateSetting('strong', value);
                // Обновляем fireRate для существующих башен
                this.towerBloc.getState().towers.forEach(tower => {
                    if (tower.type === 'strong') {
                        tower.fireRate = value;
                    }
                });
                console.log('Скорость стрельбы большой башни изменена на:', value, 'мс');
            });
        }
        
        // Обработчики для слайдеров дальности стрельбы башен
        const towerBasicRangeSlider = document.getElementById('tower-basic-range');
        const towerBasicRangeValue = document.getElementById('tower-basic-range-value');
        if (towerBasicRangeSlider && towerBasicRangeValue) {
            towerBasicRangeSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerBasicRangeValue.textContent = value;
                this.towerBloc.setRangeSetting('basic', value);
                // Обновляем range для существующих башен
                this.towerBloc.getState().towers.forEach(tower => {
                    if (tower.type === 'basic') {
                        tower.range = value;
                    }
                });
                console.log('Дальность стрельбы маленькой башни изменена на:', value, 'клеток');
            });
        }
        
        const towerStrongRangeSlider = document.getElementById('tower-strong-range');
        const towerStrongRangeValue = document.getElementById('tower-strong-range-value');
        if (towerStrongRangeSlider && towerStrongRangeValue) {
            towerStrongRangeSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerStrongRangeValue.textContent = value;
                this.towerBloc.setRangeSetting('strong', value);
                // Обновляем range для существующих башен
                this.towerBloc.getState().towers.forEach(tower => {
                    if (tower.type === 'strong') {
                        tower.range = value;
                    }
                });
                console.log('Дальность стрельбы большой башни изменена на:', value, 'клеток');
            });
        }
        
        // Обработчики для слайдеров урона башен
        const towerBasicDamageSlider = document.getElementById('tower-basic-damage');
        const towerBasicDamageValue = document.getElementById('tower-basic-damage-value');
        if (towerBasicDamageSlider && towerBasicDamageValue) {
            towerBasicDamageSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerBasicDamageValue.textContent = value;
                this.towerBloc.setDamageSetting('basic', value);
                // Обновляем damage для существующих башен
                this.towerBloc.getState().towers.forEach(tower => {
                    if (tower.type === 'basic') {
                        tower.damage = value;
                    }
                });
                console.log('Урон маленькой башни изменён на:', value);
            });
        }
        
        const towerStrongDamageSlider = document.getElementById('tower-strong-damage');
        const towerStrongDamageValue = document.getElementById('tower-strong-damage-value');
        if (towerStrongDamageSlider && towerStrongDamageValue) {
            towerStrongDamageSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                towerStrongDamageValue.textContent = value;
                this.towerBloc.setDamageSetting('strong', value);
                // Обновляем damage для существующих башен
                this.towerBloc.getState().towers.forEach(tower => {
                    if (tower.type === 'strong') {
                        tower.damage = value;
                    }
                });
                console.log('Урон большой башни изменён на:', value);
            });
        }
        
        // Обработчики для слайдеров атаки солдат
        const soldierBasicFireRateSlider = document.getElementById('soldier-basic-firerate');
        const soldierBasicFireRateValue = document.getElementById('soldier-basic-firerate-value');
        if (soldierBasicFireRateSlider && soldierBasicFireRateValue) {
            soldierBasicFireRateSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                soldierBasicFireRateValue.textContent = value;
                this.soldierBloc.setAttackSetting('basic', 'fireRate', value);
                // Обновляем для существующих солдат
                this.soldierBloc.getState().soldiers.forEach(soldier => {
                    if (soldier.type === 'basic') {
                        soldier.attackFireRate = value;
                    }
                });
                console.log('Скорость стрельбы слабого солдата изменена на:', value, 'мс');
            });
        }
        
        const soldierBasicDamageSlider = document.getElementById('soldier-basic-damage');
        const soldierBasicDamageValue = document.getElementById('soldier-basic-damage-value');
        if (soldierBasicDamageSlider && soldierBasicDamageValue) {
            soldierBasicDamageSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                soldierBasicDamageValue.textContent = value;
                this.soldierBloc.setAttackSetting('basic', 'damage', value);
                // Обновляем для существующих солдат
                this.soldierBloc.getState().soldiers.forEach(soldier => {
                    if (soldier.type === 'basic') {
                        soldier.attackDamage = value;
                    }
                });
                console.log('Урон слабого солдата изменён на:', value);
            });
        }
        
        const soldierStrongFireRateSlider = document.getElementById('soldier-strong-firerate');
        const soldierStrongFireRateValue = document.getElementById('soldier-strong-firerate-value');
        if (soldierStrongFireRateSlider && soldierStrongFireRateValue) {
            soldierStrongFireRateSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                soldierStrongFireRateValue.textContent = value;
                this.soldierBloc.setAttackSetting('strong', 'fireRate', value);
                // Обновляем для существующих солдат
                this.soldierBloc.getState().soldiers.forEach(soldier => {
                    if (soldier.type === 'strong') {
                        soldier.attackFireRate = value;
                    }
                });
                console.log('Скорость стрельбы сильного солдата изменена на:', value, 'мс');
            });
        }
        
        const soldierStrongDamageSlider = document.getElementById('soldier-strong-damage');
        const soldierStrongDamageValue = document.getElementById('soldier-strong-damage-value');
        if (soldierStrongDamageSlider && soldierStrongDamageValue) {
            soldierStrongDamageSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                soldierStrongDamageValue.textContent = value;
                this.soldierBloc.setAttackSetting('strong', 'damage', value);
                // Обновляем для существующих солдат
                this.soldierBloc.getState().soldiers.forEach(soldier => {
                    if (soldier.type === 'strong') {
                        soldier.attackDamage = value;
                    }
                });
                console.log('Урон сильного солдата изменён на:', value);
            });
        }
        
        // Обработчики для слайдеров здоровья солдат
        const soldierBasicHealthSlider = document.getElementById('soldier-basic-health');
        const soldierBasicHealthValue = document.getElementById('soldier-basic-health-value');
        if (soldierBasicHealthSlider && soldierBasicHealthValue) {
            soldierBasicHealthSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                soldierBasicHealthValue.textContent = value;
                this.soldierBloc.setHealthSetting('basic', value);
                // Обновляем здоровье для существующих солдат (пропорционально)
                this.soldierBloc.getState().soldiers.forEach(soldier => {
                    if (soldier.type === 'basic') {
                        const healthPercent = soldier.health / soldier.maxHealth;
                        soldier.maxHealth = value;
                        soldier.health = Math.max(1, Math.floor(value * healthPercent));
                    }
                });
                console.log('Здоровье слабого солдата изменено на:', value);
            });
        }
        
        const soldierStrongHealthSlider = document.getElementById('soldier-strong-health');
        const soldierStrongHealthValue = document.getElementById('soldier-strong-health-value');
        if (soldierStrongHealthSlider && soldierStrongHealthValue) {
            soldierStrongHealthSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                soldierStrongHealthValue.textContent = value;
                this.soldierBloc.setHealthSetting('strong', value);
                // Обновляем здоровье для существующих солдат (пропорционально)
                this.soldierBloc.getState().soldiers.forEach(soldier => {
                    if (soldier.type === 'strong') {
                        const healthPercent = soldier.health / soldier.maxHealth;
                        soldier.maxHealth = value;
                        soldier.health = Math.max(1, Math.floor(value * healthPercent));
                    }
                });
                console.log('Здоровье сильного солдата изменено на:', value);
            });
        }
        
        // Обработчики для настроек рабочих-сборщиков
        const gathererCapacitySlider = document.getElementById('gatherer-capacity');
        const gathererCapacityValue = document.getElementById('gatherer-capacity-value');
        if (gathererCapacitySlider && gathererCapacityValue) {
            gathererCapacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                gathererCapacityValue.textContent = value;
                this.workerBloc.setGathererSetting('capacity', value);
            });
        }
        
        const gathererHealthSlider = document.getElementById('gatherer-health');
        const gathererHealthValue = document.getElementById('gatherer-health-value');
        if (gathererHealthSlider && gathererHealthValue) {
            gathererHealthSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                gathererHealthValue.textContent = value;
                this.workerBloc.setGathererSetting('health', value);
            });
        }
        
        const gathererGatherSpeedSlider = document.getElementById('gatherer-gather-speed');
        const gathererGatherSpeedValue = document.getElementById('gatherer-gather-speed-value');
        if (gathererGatherSpeedSlider && gathererGatherSpeedValue) {
            gathererGatherSpeedSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                gathererGatherSpeedValue.textContent = value;
                this.workerBloc.setGathererSetting('gatherSpeed', value);
            });
        }
        
        const gathererMoveSpeedSlider = document.getElementById('gatherer-move-speed');
        const gathererMoveSpeedValue = document.getElementById('gatherer-move-speed-value');
        if (gathererMoveSpeedSlider && gathererMoveSpeedValue) {
            gathererMoveSpeedSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                gathererMoveSpeedValue.textContent = value.toFixed(1);
                this.workerBloc.setGathererSetting('moveSpeed', value);
            });
        }
        
        // Обработчики для настроек рабочих-строителей
        const builderHealthSlider = document.getElementById('builder-health');
        const builderHealthValue = document.getElementById('builder-health-value');
        if (builderHealthSlider && builderHealthValue) {
            builderHealthSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                builderHealthValue.textContent = value;
                this.workerBloc.setBuilderSetting('health', value);
            });
        }
        
        const builderMoveSpeedSlider = document.getElementById('builder-move-speed');
        const builderMoveSpeedValue = document.getElementById('builder-move-speed-value');
        if (builderMoveSpeedSlider && builderMoveSpeedValue) {
            builderMoveSpeedSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                builderMoveSpeedValue.textContent = value.toFixed(1);
                this.workerBloc.setBuilderSetting('moveSpeed', value);
            });
        }
        
        const builderBuildSpeedSlider = document.getElementById('builder-build-speed');
        const builderBuildSpeedValue = document.getElementById('builder-build-speed-value');
        if (builderBuildSpeedSlider && builderBuildSpeedValue) {
            builderBuildSpeedSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                builderBuildSpeedValue.textContent = value;
                this.workerBloc.setBuilderSetting('buildSpeed', value);
            });
        }
        
        console.log('Обработчики клика зарегистрированы');
    }

    setupBLoCSubscriptions() {
        this.gameBloc.subscribe((state) => {
            this.updateUI(state);
            // Обновляем кнопки при изменении золота
            const playerState = this.playerBloc.getState();
            this.updatePlayerPanel(playerState);
        });
        
        this.playerBloc.subscribe((state) => {
            console.log('PlayerBloc состояние изменилось:', state);
            this.updatePlayerPanel(state);
            this.render(); // Перерисовываем при изменении выбора башни/солдата
        });
        
        this.towerBloc.subscribe(() => {
            this.render();
        });
        
        this.soldierBloc.subscribe((state) => {
            console.log('=== SoldierBloc состояние изменилось ===', {
                soldiersCount: state.soldiers ? state.soldiers.length : 0,
                soldiers: state.soldiers ? state.soldiers.map(s => ({ id: s.id, playerId: s.playerId, type: s.type, hasPath: !!s.path })) : []
            });
            this.render();
        });
        
        this.obstacleBloc.subscribe(() => {
            this.render();
        });
        
        this.goldBloc.subscribe(() => {
            this.render();
        });
        
        this.workerBloc.subscribe(() => {
            this.render();
        });

        // Настройка кнопки экспорта логов
        this.setupLogExport();
    }

    setupLogExport() {
        // Ждём, пока DOM полностью загрузится
        setTimeout(() => {
            const btnExportLogs = document.getElementById('btn-export-logs');
            if (btnExportLogs) {
                btnExportLogs.addEventListener('click', () => {
                    if (typeof window !== 'undefined' && window.logger) {
                        window.logger.exportToFile();
                    } else if (typeof logger !== 'undefined') {
                        logger.exportToFile();
                    } else {
                        alert('Логгер не инициализирован');
                    }
                });
                console.log('✅ Кнопка экспорта логов настроена');
            } else {
                console.warn('⚠️ Кнопка экспорта логов не найдена');
            }

            // Обновляем статус логов каждые 2 секунды
            setInterval(() => {
                const logStatusEl = document.getElementById('log-status');
                if (logStatusEl) {
                    let count = 0;
                    if (typeof window !== 'undefined' && window.logger) {
                        count = window.logger.getLogCount();
                    } else if (typeof logger !== 'undefined') {
                        count = logger.getLogCount();
                    }
                    logStatusEl.textContent = `Логов: ${count}`;
                    if (count > 0) {
                        logStatusEl.style.color = '#90e24a';
                    } else {
                        logStatusEl.style.color = '#999';
                    }
                }
            }, 2000);
        }, 100);
    }

    startGame(mode) {
        console.log('=== startGame ВЫЗВАН ===', mode);
        
        // Логируем начало игры
        if (typeof window !== 'undefined' && window.logger) {
            window.logger.info('game', `Game started: mode=${mode}`, { mode, timestamp: Date.now() });
        } else if (typeof logger !== 'undefined') {
            logger.info('game', `Game started: mode=${mode}`, { mode, timestamp: Date.now() });
        }
        
        // Очищаем состояние игры
        this.towerBloc.reset();
        this.soldierBloc.reset();
        this.obstacleBloc.reset();
        this.goldBloc.reset();
        this.workerBloc.reset();
        this.playerBloc.clearSelection();
        
        // Генерируем золото на поле (одинаковое количество на обеих половинах)
        this.goldBloc.generateGold(50, 10); // 50 золота в каждой куче, 10 куч на каждую половину
        
        // Логируем генерацию золота
        const goldState = this.goldBloc.getState();
        if (typeof window !== 'undefined' && window.logger) {
            window.logger.info('game', `Gold generated: ${goldState.goldPiles.length} piles`, {
                pilesCount: goldState.goldPiles.length,
                piles: goldState.goldPiles.map(p => ({ x: p.x, y: p.y, amount: p.amount }))
            });
        } else if (typeof logger !== 'undefined') {
            logger.info('game', `Gold generated: ${goldState.goldPiles.length} piles`, {
                pilesCount: goldState.goldPiles.length,
                piles: goldState.goldPiles.map(p => ({ x: p.x, y: p.y, amount: p.amount }))
            });
        }
        
        // Удаляем золото с базы (если оно там есть по ошибке)
        this.goldBloc.removeGoldFromBase(this.obstacleBloc, this.towerBloc);
        
        // Препятствия теперь устанавливаются вручную через UI (отключена автоматическая генерация)
        
        console.log('Запуск игры в режиме:', mode);
        this.gameBloc.startGame(mode);
        console.log('Состояние игры после startGame:', this.gameBloc.getState());
        
        this.showScreen('game-screen');
        console.log('Экран игры показан');
        
        // Обновляем имя игрока 2 / бота в зависимости от режима
        const updatedGameState = this.gameBloc.getState();
        this.updateUI(updatedGameState);
        
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
        // Проверяем, что игроки существуют перед обновлением UI
        if (!gameState || !gameState.players) {
            // Если игроки не инициализированы, инициализируем их
            if (this.gameBloc) {
                const state = this.gameBloc.getState();
                if (state && state.players) {
                    gameState = state;
                } else {
                    // Принудительно создаём игроков, если их нет
                    gameState = {
                        ...gameState,
                        players: {
                            1: { gold: 500, baseHealth: 100 },
                            2: { gold: 500, baseHealth: 100 }
                        }
                    };
                }
            }
        }
        
        // Обновляем информацию о первом игроке
        const p1GoldEl = document.getElementById('p1-gold');
        const p1HealthEl = document.getElementById('p1-health');
        const player1Info = document.getElementById('player1-info');
        
        if (player1Info) {
            // Убеждаемся, что элемент видим
            player1Info.style.display = 'block';
            player1Info.style.visibility = 'visible';
            player1Info.style.opacity = '1';
        }
        
        if (gameState.players && gameState.players[1]) {
            if (p1GoldEl) {
                p1GoldEl.textContent = gameState.players[1].gold || 0;
                p1GoldEl.style.display = 'inline';
            }
            if (p1HealthEl) {
                p1HealthEl.textContent = gameState.players[1].baseHealth || 0;
                p1HealthEl.style.display = 'inline';
            }
        } else {
            // Если игрок не существует, устанавливаем значения по умолчанию
            if (p1GoldEl) {
                p1GoldEl.textContent = '500';
            }
            if (p1HealthEl) {
                p1HealthEl.textContent = '100';
            }
        }
        
        // Обновляем информацию о втором игроке
        if (gameState.players && gameState.players[2]) {
            const p2GoldEl = document.getElementById('p2-gold');
            const p2HealthEl = document.getElementById('p2-health');
            if (p2GoldEl) {
                p2GoldEl.textContent = gameState.players[2].gold || 0;
            }
            if (p2HealthEl) {
                p2HealthEl.textContent = gameState.players[2].baseHealth || 0;
            }
        }
        
        // Обновление имени игрока 1
        const player1Header = document.querySelector('#player1-info h3');
        if (player1Header) {
            player1Header.textContent = 'Игрок 1';
            player1Header.style.display = 'block';
            player1Header.style.visibility = 'visible';
        }
        
        // Обновление имени игрока 2 / бота в зависимости от режима
        const player2Header = document.querySelector('#player2-info h3');
        if (player2Header) {
            if (gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') {
                player2Header.textContent = 'Бот';
            } else {
                player2Header.textContent = 'Игрок 2';
            }
        }
        
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
            } else if (gameState.gameMode === 'pve') {
                if (gameState.winner === 1) {
                    victoryText = 'Вы победили!';
                } else {
                    victoryText = 'Бот победил!';
                }
            } else {
                victoryText = `Победил Игрок ${gameState.winner}!`;
            }
            document.getElementById('victory-text').textContent = victoryText;
            const victoryPopup = document.getElementById('victory-popup');
            if (victoryPopup) {
                victoryPopup.style.display = 'block';
            }
            this.stopGame();
        } else {
            const victoryPopup = document.getElementById('victory-popup');
            if (victoryPopup) {
                victoryPopup.style.display = 'none';
            }
        }
    }

    updatePlayerPanel(playerState) {
        const gameState = this.gameBloc.getState();
        // В режимах PvE и Campaign для UI всегда показываем игрока 1
        // В PvP используем currentPlayer
        const currentPlayer = (gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') ? 1 : gameState.currentPlayer;
        
        // Обновление кнопок башен и солдат
        document.querySelectorAll('.tower-btn').forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            btn.disabled = gameState.players[currentPlayer].gold < cost;
        });
        
        document.querySelectorAll('.soldier-btn').forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            btn.disabled = gameState.players[currentPlayer].gold < cost;
        });
        
        // Обновление кнопок рабочих
        document.querySelectorAll('.worker-btn').forEach(btn => {
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
        
        // Проверка, открыта ли вкладка "Ячейки" для отладки
        const cellTab = document.getElementById('debug-tab-cells');
        const cellInfo = document.getElementById('cell-debug-info');
        if (cellTab && cellInfo && cellInfo.style.display === 'block') {
            // Сохраняем выбранную ячейку для отладки
            this.selectedCellForDebug = { hex, arrHex };
            this.updateCellDebugInfo();
            return; // Не обрабатываем клик дальше в режиме отладки ячеек
        }
        
        const playerState = this.playerBloc.getState();
        // В режимах PvE и Campaign игрок всегда 1, бот играет автоматически
        // В PvP используется currentPlayer
        const currentPlayer = (gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') ? 1 : gameState.currentPlayer;
        
        console.log('Состояние:', {
            selectedTowerType: playerState.selectedTowerType,
            selectedSoldierType: playerState.selectedSoldierType,
            currentPlayer,
            gold: gameState.players[currentPlayer].gold
        });
        
        // Тестовый режим соседей
        if (playerState.testNeighborsMode) {
            console.log('=== ТЕСТОВЫЙ РЕЖИМ: выбор ячейки для просмотра соседей ===', hex);
            this.playerBloc.setTestSelectedHex(hex);
            // Обновление информации произойдёт в gameLoop
            this.render(); // Принудительная перерисовка
            return;
        }

        // Проверка двойного клика на дерево для активации разрушения (ПЕРЕД проверкой размещения препятствия)
        const obstacle = this.obstacleBloc.getObstacleAt(arrHex.x, arrHex.y);
        if (obstacle && obstacle.type === 'tree' && !playerState.selectedObstacleType) {
            const currentTime = performance.now();
            const isDoubleClick = this.lastTreeClick && 
                                 this.lastTreeClick.x === arrHex.x && 
                                 this.lastTreeClick.y === arrHex.y &&
                                 (currentTime - this.lastTreeClickTime) < this.doubleClickDelay;
            
            if (isDoubleClick) {
                // Двойной клик на дерево - активируем разрушение
                console.log(`Двойной клик на дерево (${arrHex.x}, ${arrHex.y})`);
                
                // Находим ближайшего сильного солдата, который может разрушить дерево
                const soldiers = this.soldierBloc.getState().soldiers;
                const strongSoldiers = soldiers.filter(s => s.canDestroyTrees && !s.destroyingTree);
                
                if (strongSoldiers.length === 0) {
                    console.log('Нет сильных солдат для разрушения дерева');
                    this.lastTreeClick = null;
                    this.lastTreeClickTime = 0;
                    return;
                }
                
                // Находим ближайшего солдата к дереву
                let closestSoldier = null;
                let minDistance = Infinity;
                strongSoldiers.forEach(soldier => {
                    const dx = soldier.x - arrHex.x;
                    const dy = soldier.y - arrHex.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestSoldier = soldier;
                    }
                });
                
                if (closestSoldier) {
                    // Проверяем, что дерево на вражеской территории
                    if (this.soldierBloc.isOnEnemyTerritory(arrHex.x, arrHex.y, closestSoldier.playerId)) {
                        this.soldierBloc.startDestroyingTree(closestSoldier.id, arrHex.x, arrHex.y, obstacle.id, this.obstacleBloc);
                        console.log(`Солдат ${closestSoldier.id} начал разрушение дерева`);
                    } else {
                        console.log('Дерево не на вражеской территории');
                    }
                }
                
                this.lastTreeClick = null;
                this.lastTreeClickTime = 0;
                return;
            } else {
                // Первый клик - сохраняем для проверки двойного клика
                this.lastTreeClick = { x: arrHex.x, y: arrHex.y };
                this.lastTreeClickTime = currentTime;
                return;
            }
        } else {
            // Клик не на дерево - сбрасываем отслеживание двойного клика
            this.lastTreeClick = null;
            this.lastTreeClickTime = 0;
        }

        // Размещение препятствия
        if (playerState.selectedObstacleType) {
            let obstacleInfo = '=== РАЗМЕЩЕНИЕ ПРЕПЯТСТВИЯ ===\n';
            obstacleInfo += `Тип препятствия: ${playerState.selectedObstacleType}\n`;
            obstacleInfo += `Позиция: x=${arrHex.x}, y=${arrHex.y}\n`;
            obstacleInfo += `Текущий игрок: ${currentPlayer}\n`;
            obstacleInfo += `Режим игры: ${gameState.gameMode}\n\n`;
            this.showDebugMessage(obstacleInfo);
            
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
            
            // Ищем ближайшего свободного строителя
            const allWorkers = this.workerBloc.getState().workers;
            let debugInfo = '=== ПОИСК СТРОИТЕЛЕЙ ===\n';
            debugInfo += `Всего рабочих: ${allWorkers.length}\n`;
            debugInfo += `Текущий игрок: ${currentPlayer}\n\n`;
            
            allWorkers.forEach((w, idx) => {
                const matchesPlayer = w.playerId === currentPlayer;
                const matchesType = w.type === 'builder';
                const hasNoTarget = !w.buildingTarget;
                const passesFilter = matchesPlayer && matchesType && hasNoTarget;
                
                debugInfo += `Рабочий [${idx}]: ID=${w.id}, P=${w.playerId}, T=${w.type}\n`;
                debugInfo += `  Позиция: x=${w.x}, y=${w.y}\n`;
                debugInfo += `  buildingTarget: ${w.buildingTarget ? JSON.stringify(w.buildingTarget) : 'нет'}\n`;
                debugInfo += `  Совпадает игрок: ${matchesPlayer}\n`;
                debugInfo += `  Тип builder: ${matchesType}\n`;
                debugInfo += `  Нет задачи: ${hasNoTarget}\n`;
                debugInfo += `  Проходит фильтр: ${passesFilter}\n\n`;
            });
            
            const builders = allWorkers.filter(w => {
                // Проверяем все условия по отдельности для отладки
                const isCorrectPlayer = w.playerId === currentPlayer;
                const isBuilder = w.type === 'builder';
                // Более строгая проверка: buildingTarget должен быть null или undefined
                const hasNoTarget = w.buildingTarget === null || w.buildingTarget === undefined;
                
                const matches = isCorrectPlayer && isBuilder && hasNoTarget;
                
                if (w.type === 'builder') {
                    debugInfo += `Строитель ${w.id} (игрок ${w.playerId}):\n`;
                    debugInfo += `  Совпадает игрок: ${isCorrectPlayer}\n`;
                    debugInfo += `  Тип builder: ${isBuilder}\n`;
                    debugInfo += `  Нет задачи: ${hasNoTarget}\n`;
                    debugInfo += `  buildingTarget: ${w.buildingTarget} (тип: ${typeof w.buildingTarget})\n`;
                    debugInfo += `  Проходит фильтр: ${matches}\n\n`;
                }
                
                return matches;
            });
            
            debugInfo += `Найдено свободных строителей: ${builders.length}\n`;
            this.showDebugMessage(debugInfo);
            
            if (builders.length === 0) {
                // Нет свободных строителей - проверяем, есть ли строители вообще
                const buildersForPlayer = allWorkers.filter(w => 
                    w.playerId === currentPlayer && 
                    w.type === 'builder'
                );
                
                if (buildersForPlayer.length === 0) {
                    // Нет строителей вообще - показываем ошибку
                    let errorMsg = 'Нет строителей!\n\n';
                    errorMsg += `Текущий игрок: ${currentPlayer}\n`;
                    errorMsg += `Всего рабочих: ${allWorkers.length}\n\n`;
                    errorMsg += 'Создайте строителя через панель "Рабочие" для размещения препятствий.';
                    this.showDebugMessage(errorMsg);
                    alert('Нет строителей!\n\nСоздайте строителя через панель "Рабочие" для размещения препятствий.');
                    this.playerBloc.clearSelection();
                    return;
                }
                
                // Есть строители, но все заняты - добавляем в очередь
                this.workerBloc.addBuildTaskToQueue(currentPlayer, arrHex.x, arrHex.y, playerState.selectedObstacleType);
                
                // Обновляем отображение очереди
                this.updateBuildQueueDisplay();
                
                // Показываем сообщение о добавлении в очередь
                const obstacleTypeName = playerState.selectedObstacleType === 'stone' ? 'Камень' : 'Дерево';
                const queueSize = this.workerBloc.getBuildQueue(currentPlayer).length;
                const message = `Задача добавлена в очередь!\n\n${obstacleTypeName} (${arrHex.x}, ${arrHex.y})\n\nПозиция в очереди: ${queueSize}`;
                this.showDebugMessage(message);
                
                this.playerBloc.clearSelection();
                return;
            }
            
            // Находим ближайшего строителя
            let closestBuilder = null;
            let minDistance = Infinity;
            
            builders.forEach(builder => {
                const builderHex = this.hexGrid.arrayToHex(builder.x, builder.y);
                const targetHex = this.hexGrid.arrayToHex(arrHex.x, arrHex.y);
                const distance = this.hexGrid.hexDistance(builderHex, targetHex);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestBuilder = builder;
                }
            });
            
            if (closestBuilder) {
                // Даём задание строителю
                let taskInfo = '=== НАЗНАЧЕНИЕ ЗАДАЧИ СТРОИТЕЛЮ ===\n';
                taskInfo += `Строитель ID: ${closestBuilder.id}\n`;
                taskInfo += `Позиция строителя: x=${closestBuilder.x}, y=${closestBuilder.y}\n`;
                taskInfo += `Целевая позиция: x=${arrHex.x}, y=${arrHex.y}\n`;
                taskInfo += `Тип препятствия: ${playerState.selectedObstacleType}\n\n`;
                
                const taskAssigned = this.workerBloc.assignBuildTask(closestBuilder.id, arrHex.x, arrHex.y, playerState.selectedObstacleType);
                taskInfo += `Результат назначения: ${taskAssigned ? 'УСПЕХ' : 'ОШИБКА'}\n\n`;
                
                if (taskAssigned) {
                    // Проверяем, что задача действительно назначена
                    const workerAfter = this.workerBloc.getState().workers.find(w => w.id === closestBuilder.id);
                    if (workerAfter) {
                        taskInfo += `Состояние после назначения:\n`;
                        taskInfo += `  ID: ${workerAfter.id}\n`;
                        taskInfo += `  buildingTarget: ${workerAfter.buildingTarget ? JSON.stringify(workerAfter.buildingTarget) : 'нет'}\n`;
                        taskInfo += `  targetX: ${workerAfter.targetX}\n`;
                        taskInfo += `  targetY: ${workerAfter.targetY}\n`;
                    }
                    taskInfo += '\n✅ Задача успешно назначена строителю!';
                } else {
                    taskInfo += '❌ Не удалось назначить задачу строителю!';
                    alert('Ошибка: не удалось назначить задачу строителю.');
                }
                
                this.showDebugMessage(taskInfo);
                this.playerBloc.clearSelection();
                return;
            }
            
            // Если по какой-то причине не удалось найти строителя
            let errorInfo = '❌ Не удалось найти строителя\n\n';
            errorInfo += `Найдено строителей: ${builders.length}\n`;
            this.showDebugMessage(errorInfo);
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
                // Обновляем UI после изменения золота
                this.updatePlayerPanel(this.playerBloc.getState());
                // В режиме PvP (онлайн) оба игрока играют одновременно, переключение не требуется
            } else {
                console.log('Не удалось разместить башню - проверьте консоль выше');
            }
        }
        
    }

    gameLoop(currentTime = performance.now()) {
        // Логируем начало gameLoop (только первые несколько раз)
        if (!this.gameLoopCallCount) {
            this.gameLoopCallCount = 0;
        }
        this.gameLoopCallCount++;
        
        if (this.gameLoopCallCount <= 10) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.debug('game', `gameLoop START #${this.gameLoopCallCount}`, {
                    callNumber: this.gameLoopCallCount,
                    isRunning: this.isRunning,
                    currentTime: currentTime.toFixed(2)
                });
            }
        }
        
        if (!this.isRunning) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.warn('game', 'gameLoop: игра не запущена (isRunning = false)');
            }
            console.log('gameLoop: игра не запущена (isRunning = false)');
            return;
        }
        
        // При первом кадре lastTime может быть 0, поэтому ограничиваем deltaTime
        const deltaTime = this.lastTime > 0 ? currentTime - this.lastTime : 16; // 16мс = ~60 FPS
        const gameState = this.gameBloc.getState();
        
        // Логируем каждый вызов gameLoop (только первые несколько раз для отладки)
        if (this.gameLoopCallCount <= 10 || this.gameLoopCallCount % 60 === 0) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.debug('game', `gameLoop call #${this.gameLoopCallCount}: isRunning=${this.isRunning}, gameState=${gameState.gameState}`, {
                    callNumber: this.gameLoopCallCount,
                    isRunning: this.isRunning,
                    gameState: gameState.gameState,
                    deltaTime: deltaTime.toFixed(2)
                });
            }
        }
        
        // Обновление башен (стрельба) - всегда, даже в тестовом режиме
        try {
            const soldiers = this.soldierBloc.getState().soldiers;
            const workers = this.workerBloc.getState().workers;
            const playerState = this.playerBloc.getState();
            // В тестовом режиме башен передаём позицию мыши для реакции на курсор
            const mouseHex = playerState.testTowersMode && this.mousePosition && this.mousePosition.hex ? 
                             this.mousePosition.hex : null;
            this.towerBloc.updateTowers(currentTime, soldiers, this.hexGrid, mouseHex, workers);
        } catch (error) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.error('game', `Error in updateTowers: ${error.message}`, { error: error.toString(), stack: error.stack });
            }
            console.error('Error in updateTowers:', error);
        }
        
        if (gameState.gameState === 'playing') {
            // Обновление солдат
            // Убрали избыточное логирование для производительности
            this.soldierBloc.updateSoldiers(deltaTime, this.towerBloc, this.obstacleBloc);
            
            // Обновление рабочих
            this.workerBloc.updateWorkers(deltaTime, currentTime, this.goldBloc, this.obstacleBloc, this.towerBloc, this.hexGrid);
            
            // Логируем вызов gameLoop (только раз в секунду для отладки)
            if (!this.lastGameLoopLog || currentTime - this.lastGameLoopLog > 1000) {
                this.lastGameLoopLog = currentTime;
                const soldierState = this.soldierBloc.getState();
                const workerState = this.workerBloc.getState();
                if (typeof window !== 'undefined' && window.logger) {
                    window.logger.debug('game', `gameLoop: ${soldierState.soldiers.length} soldiers, ${workerState.workers.length} workers`, {
                        soldiersCount: soldierState.soldiers.length,
                        workersCount: workerState.workers.length,
                        gameState: gameState.gameState
                    });
                }
            }
            
            // Периодически проверяем и удаляем золото с базы (раз в 5 секунд)
            if (!this.lastGoldBaseCheck || currentTime - this.lastGoldBaseCheck > 5000) {
                this.goldBloc.removeGoldFromBase(this.obstacleBloc, this.towerBloc);
                this.lastGoldBaseCheck = currentTime;
            }
            
            // Проверяем и выполняем регенерацию золота
            this.goldBloc.checkAndRegenerate(currentTime, this.obstacleBloc, this.towerBloc);
            
            // Обновление бота
            this.botAI.update(currentTime);
        }
        
        // Обновление отладочной информации о солдатах и рабочих
        this.updateSoldierDebugInfo();
        this.updateWorkerDebugInfo();
        this.updateCellDebugInfo();
        
        // Обновление панели очереди строительства
        this.updateBuildQueueDisplay();
        
        // Обновление панели состояния бота
        this.updateBotStatusDisplay();
        
        // Обновление информации о тестировании соседей
        if (playerState.testNeighborsMode && playerState.testSelectedHex) {
            this.updateTestNeighborsInfo(playerState.testSelectedHex);
        }
        
        // Обновление UI
        try {
            this.updateUI(gameState);
        } catch (error) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.error('game', `Error in updateUI: ${error.message}`, { error: error.toString(), stack: error.stack });
            }
            console.error('Error in updateUI:', error);
        }
        
        try {
            this.render();
        } catch (error) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.error('game', `Error in render: ${error.message}`, { error: error.toString(), stack: error.stack });
            }
            console.error('Error in render:', error);
        }
        
        this.lastTime = currentTime;
        
        // Логируем запрос следующего кадра (только первые несколько раз)
        if (this.gameLoopCallCount <= 10) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.debug('game', `gameLoop END #${this.gameLoopCallCount} - Requesting next frame`, {
                    callNumber: this.gameLoopCallCount,
                    isRunning: this.isRunning,
                    gameState: gameState.gameState
                });
            }
        }
        
        // КРИТИЧНО: Всегда вызываем requestAnimationFrame, даже если была ошибка
        try {
            requestAnimationFrame((time) => this.gameLoop(time));
            if (this.gameLoopCallCount <= 10) {
                if (typeof window !== 'undefined' && window.logger) {
                    window.logger.debug('game', `requestAnimationFrame scheduled for call #${this.gameLoopCallCount + 1}`);
                }
            }
        } catch (error) {
            if (typeof window !== 'undefined' && window.logger) {
                window.logger.error('game', `Error in requestAnimationFrame: ${error.message}`, { error: error.toString(), stack: error.stack });
            }
            console.error('Error in requestAnimationFrame:', error);
            // Пытаемся продолжить через setTimeout
            setTimeout(() => this.gameLoop(performance.now()), 16);
        }
    }

    updateSoldierDebugInfo() {
        const debugInfoEl = document.getElementById('soldier-debug-info');
        if (!debugInfoEl) return;
        
        const soldierState = this.soldierBloc.getState();
        const soldiers = soldierState.soldiers;
        
        let info = '';
        
        // Информация о последнем поиске пути
        const pathfindingDebug = this.hexGrid.lastPathfindingDebug;
        if (pathfindingDebug.startHex) {
            info += `=== ОТЛАДКА ПОИСКА ПУТИ ===\n`;
            info += `Старт: hex(${pathfindingDebug.startHex.q},${pathfindingDebug.startHex.r},${pathfindingDebug.startHex.s}) = arr(${pathfindingDebug.startArr.x},${pathfindingDebug.startArr.y})\n`;
            info += `Цель: hex(${pathfindingDebug.targetHex.q},${pathfindingDebug.targetHex.r},${pathfindingDebug.targetHex.s}) = arr(${pathfindingDebug.targetArr.x},${pathfindingDebug.targetArr.y})\n`;
            info += `Расстояние: ${pathfindingDebug.distance !== null ? pathfindingDebug.distance.toFixed(2) : 'неизвестно'}\n`;
            info += `Итераций: ${pathfindingDebug.iterations}\n`;
            info += `OpenSet в конце: ${pathfindingDebug.finalOpenSetSize}\n`;
            
            if (pathfindingDebug.neighbors && pathfindingDebug.neighbors.length > 0) {
                info += `\nСоседи старта (${pathfindingDebug.neighbors.length} из 6 возможных):\n`;
                pathfindingDebug.neighbors.forEach((n, i) => {
                    info += `  ${i+1}. hex(${n.hex}) = arr${n.arr} ${n.blocked ? '❌ ЗАБЛОКИРОВАН' : '✅ свободен'}\n`;
                });
            }
            
            if (pathfindingDebug.iterationsDetails && pathfindingDebug.iterationsDetails.length > 0) {
                info += `\nДетали итераций:\n`;
                pathfindingDebug.iterationsDetails.forEach(detail => {
                    info += `  Итерация ${detail.iteration}: current=${detail.currentArr}, dist=${detail.distanceToTarget.toFixed(1)}, f=${detail.fScore}, g=${detail.gScore}, open=${detail.openSetSize}, closed=${detail.closedSetSize}\n`;
                    if (detail.addedNodes && detail.addedNodes.length > 0) {
                        info += `    Добавлено узлов: ${detail.addedToOpenSet}/${detail.unblockedNeighbors}\n`;
                        detail.addedNodes.forEach(node => {
                            info += `      - ${node}\n`;
                        });
                    }
                });
            }
            
            if (pathfindingDebug.pathFound) {
                info += `\n✅ Путь найден! Длина: ${pathfindingDebug.pathLength}\n`;
            } else if (pathfindingDebug.error) {
                info += `\n❌ ОШИБКА: ${pathfindingDebug.error}\n`;
            }
            
            info += `\n`;
        }
        
        // Информация о последней попытке создания
        if (this.lastSoldierCreationAttempt) {
            const attempt = this.lastSoldierCreationAttempt;
            const timeAgo = ((Date.now() - attempt.timestamp) / 1000).toFixed(1);
            info += `=== ПОСЛЕДНЯЯ ПОПЫТКА СОЗДАНИЯ (${timeAgo}с назад) ===\n`;
            info += `Тип: ${attempt.type || 'неизвестно'}\n`;
            info += `Игрок: ${attempt.playerId}\n`;
            info += `Ворота: x=${attempt.gatePos?.x} y=${attempt.gatePos?.y}\n`;
            info += `Золото: ${attempt.playerGold} (нужно: ${attempt.soldierCost})\n`;
            if (this.lastSoldierCreationError) {
                info += `❌ ОШИБКА: ${this.lastSoldierCreationError}\n`;
            } else {
                info += `✅ Успешно\n`;
            }
            info += `\n`;
        }
        
        // Информация о солдатах
        const actualSoldiersCount = soldiers ? soldiers.length : 0;
        
        if (actualSoldiersCount === 0) {
            info += `Нет солдат (проверено в updateSoldierDebugInfo)\n`;
            if (this.lastSoldierCreationError) {
                info += `\nПричина ошибки: ${this.lastSoldierCreationError}\n`;
            }
            // Показываем, был ли солдат создан, но потом удалён
            if (this.lastSoldierCreationAttempt && !this.lastSoldierCreationError) {
                info += `\n⚠️ Солдат был создан (успешно), но не отображается.\n`;
                info += `Возможно, был удалён в updateSoldiers из-за отсутствия пути.\n`;
            }
        } else {
            info += `Всего солдат: ${actualSoldiersCount}\n\n`;
            soldiers.forEach((soldier, index) => {
                const dx = soldier.targetX - soldier.x;
                const dy = soldier.targetY - soldier.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                const pathInfo = soldier.path ? `Путь: ${soldier.path.length} ячеек` : 'Путь: не вычислен';
                
                info += `[${index}] ID:${soldier.id} P:${soldier.playerId} T:${soldier.type}\n`;
                info += `  Позиция: x=${soldier.x.toFixed(3)} y=${soldier.y.toFixed(3)}\n`;
                info += `  Цель: tx=${soldier.targetX} ty=${soldier.targetY}\n`;
                info += `  ${pathInfo}\n`;
                info += `  Расстояние до цели: ${distance.toFixed(3)}\n`;
                info += `  Скорость: ${soldier.speed.toFixed(4)}\n`;
                info += `  Здоровье: ${soldier.health.toFixed(1)}/${soldier.maxHealth}\n`;
                info += `\n`;
            });
        }
        
        debugInfoEl.textContent = info;
    }

    updateWorkerDebugInfo() {
        const debugInfoEl = document.getElementById('worker-debug-info');
        if (!debugInfoEl) return;
        
        const workerState = this.workerBloc.getState();
        const workers = workerState.workers;
        
        // Фильтруем только строителей
        const builders = workers.filter(w => w.type === 'builder');
        
        let info = '';
        
        const actualBuildersCount = builders ? builders.length : 0;
        
        if (actualBuildersCount === 0) {
            info += `Нет строителей\n`;
        } else {
            info += `Всего строителей: ${actualBuildersCount}\n\n`;
            builders.forEach((worker, index) => {
                const pathInfo = worker.path ? `Путь: ${worker.path.length} ячеек, индекс: ${worker.currentHexIndex.toFixed(2)}` : 'Путь: не вычислен';
                const progressInfo = worker.path ? `Прогресс: ${(worker.moveProgress * 100).toFixed(1)}%` : '';
                
                info += `[${index}] ID:${worker.id} P:${worker.playerId} T:${worker.type}\n`;
                info += `  Позиция: x=${worker.x} y=${worker.y}\n`;
                info += `  ${pathInfo}\n`;
                if (progressInfo) info += `  ${progressInfo}\n`;
                info += `  Здоровье: ${worker.health.toFixed(1)}/${worker.maxHealth}\n`;
                
                if (worker.type === 'builder') {
                    // Определяем состояние строителя
                    const centerX = Math.floor(this.hexGrid.width / 2);
                    const baseY = worker.playerId === 1 ? this.hexGrid.height - 1 : 0;
                    const isOnBase = worker.x === centerX && worker.y === baseY;
                    
                    let state = 'Неизвестно';
                    if (worker.buildingTarget) {
                        const target = worker.buildingTarget;
                        const isOnTarget = worker.x === target.x && worker.y === target.y;
                        if (isOnTarget) {
                            state = '🔨 СТРОИТ';
                        } else {
                            state = '🚶 ИДЁТ К ЦЕЛИ';
                        }
                    } else if (isOnBase) {
                        state = '✅ СВОБОДЕН (на базе)';
                    } else if (worker.targetX === centerX && worker.targetY === baseY) {
                        state = '🏠 ВОЗВРАТ НА БАЗУ';
                    } else {
                        state = '❓ НЕИЗВЕСТНОЕ СОСТОЯНИЕ';
                    }
                    
                    info += `  Состояние: ${state}\n`;
                    info += `  Задача строительства: ${worker.buildingTarget ? `${worker.buildingTarget.type} на (${worker.buildingTarget.x},${worker.buildingTarget.y})` : 'нет'}\n`;
                    if (worker.targetX !== null && worker.targetY !== null) {
                        info += `  Цель: x=${worker.targetX} y=${worker.targetY}\n`;
                    }
                    info += `  Путь: ${worker.path ? `${worker.path.length} ячеек, индекс: ${worker.currentHexIndex.toFixed(2)}` : 'нет'}\n`;
                    info += `  Прогресс движения: ${(worker.moveProgress * 100).toFixed(1)}%\n`;
                }
                info += `\n`;
            });
            
            // Показываем информацию об очереди задач
            const queueInfo = this.workerBloc.getBuildQueueInfo();
            if (queueInfo[1] > 0 || queueInfo[2] > 0) {
                info += `=== ОЧЕРЕДЬ ЗАДАЧ ===\n`;
                info += `Игрок 1: ${queueInfo[1]} задач\n`;
                info += `Игрок 2: ${queueInfo[2]} задач\n`;
                
                // Показываем детали очереди для игрока 1
                if (queueInfo[1] > 0) {
                    const queue1 = this.workerBloc.getBuildQueue(1);
                    queue1.forEach((task, idx) => {
                        info += `  [1] ${idx + 1}. ${task.type} на (${task.x}, ${task.y})\n`;
                    });
                }
                
                // Показываем детали очереди для игрока 2
                if (queueInfo[2] > 0) {
                    const queue2 = this.workerBloc.getBuildQueue(2);
                    queue2.forEach((task, idx) => {
                        info += `  [2] ${idx + 1}. ${task.type} на (${task.x}, ${task.y})\n`;
                    });
                }
                info += `\n`;
            }
        }
        
        debugInfoEl.textContent = info;
    }

    updateCellDebugInfo() {
        const debugInfoEl = document.getElementById('cell-debug-info');
        if (!debugInfoEl) return;
        
        if (!this.selectedCellForDebug) {
            debugInfoEl.textContent = 'Кликните на ячейку для просмотра её состояния';
            return;
        }
        
        const { hex, arrHex } = this.selectedCellForDebug;
        const normalizedHex = this.hexGrid.hexRound(hex);
        
        // Проверяем состояние ячейки
        const isBlockedSoldier = this.hexGrid.isBlocked(normalizedHex, this.obstacleBloc, this.towerBloc, false);
        const isBlockedWorker = this.hexGrid.isBlocked(normalizedHex, this.obstacleBloc, this.towerBloc, true);
        
        // Проверяем покрашенную зону базы
        const centerX = Math.floor(this.hexGrid.width / 2);
        const isOnPlayer2Base = arrHex.y === 0;
        // База игрока 1 состоит из двух строк:
        // 1. Предпоследняя строка (height - 2) с чётными индексами x
        // 2. Последняя строка (height - 1) с нечётными индексами x
        const isOnPlayer1BaseRow1 = arrHex.y === this.hexGrid.height - 2 && arrHex.x % 2 === 0;
        const isOnPlayer1BaseRow2 = arrHex.y === this.hexGrid.height - 1 && arrHex.x % 2 === 1;
        const isOnPlayer1Base = isOnPlayer1BaseRow1 || isOnPlayer1BaseRow2;
        const isGatePlayer2 = arrHex.x === centerX && arrHex.y === 0;
        const isGatePlayer1Row1 = arrHex.x === centerX && arrHex.y === this.hexGrid.height - 2 && centerX % 2 === 0;
        const isGatePlayer1Row2 = arrHex.x === centerX && arrHex.y === this.hexGrid.height - 1 && centerX % 2 === 1;
        const isGatePlayer1 = isGatePlayer1Row1 || isGatePlayer1Row2;
        const isGate = isGatePlayer2 || isGatePlayer1;
        
        // Проверяем препятствия
        const obstacle = this.obstacleBloc.getObstacleAt(arrHex.x, arrHex.y);
        
        // Проверяем башни
        const towerState = this.towerBloc.getState();
        const tower = towerState.towers.find(t => t.x === arrHex.x && t.y === arrHex.y);
        
        // Проверяем золото
        const goldState = this.goldBloc.getState();
        const goldPile = goldState.goldPiles.find(p => p.x === arrHex.x && p.y === arrHex.y && !p.collected);
        
        // Проверяем солдат
        const soldierState = this.soldierBloc.getState();
        const soldiers = soldierState.soldiers.filter(s => s.x === arrHex.x && s.y === arrHex.y);
        
        // Проверяем рабочих
        const workerState = this.workerBloc.getState();
        const workers = workerState.workers.filter(w => w.x === arrHex.x && w.y === arrHex.y);
        
        // Формируем информацию
        let info = `=== СОСТОЯНИЕ ЯЧЕЙКИ ===\n\n`;
        info += `Координаты:\n`;
        info += `  Hex: (${hex.q}, ${hex.r}, ${hex.s})\n`;
        info += `  Array: (${arrHex.x}, ${arrHex.y})\n\n`;
        
        info += `Покрашенная зона базы:\n`;
        info += `  База игрока 1: ${isOnPlayer1Base ? 'ДА' : 'НЕТ'}\n`;
        info += `  База игрока 2: ${isOnPlayer2Base ? 'ДА' : 'НЕТ'}\n`;
        info += `  Ворота: ${isGate ? 'ДА' : 'НЕТ'}\n`;
        if (isGate) {
            info += `    Ворота игрока 1: ${isGatePlayer1 ? 'ДА' : 'НЕТ'}\n`;
            info += `    Ворота игрока 2: ${isGatePlayer2 ? 'ДА' : 'НЕТ'}\n`;
        }
        info += `\n`;
        
        info += `Блокировка:\n`;
        info += `  Для солдат: ${isBlockedSoldier ? 'ЗАБЛОКИРОВАНА' : 'ДОСТУПНА'}\n`;
        info += `  Для рабочих: ${isBlockedWorker ? 'ЗАБЛОКИРОВАНА' : 'ДОСТУПНА'}\n`;
        info += `\n`;
        
        info += `Объекты на ячейке:\n`;
        if (obstacle) {
            info += `  Препятствие: ${obstacle.type} (прочность: ${obstacle.health})\n`;
        } else {
            info += `  Препятствие: нет\n`;
        }
        
        if (tower) {
            info += `  Башня: ${tower.type} (здоровье: ${tower.health}/${tower.maxHealth})\n`;
        } else {
            info += `  Башня: нет\n`;
        }
        
        if (goldPile) {
            info += `  Золото: ${goldPile.amount} единиц\n`;
        } else {
            info += `  Золото: нет\n`;
        }
        
        if (soldiers.length > 0) {
            info += `  Солдаты: ${soldiers.length}\n`;
            soldiers.forEach((s, i) => {
                info += `    ${i + 1}. ID: ${s.id}, тип: ${s.type}, игрок: ${s.playerId}, здоровье: ${s.health}/${s.maxHealth}\n`;
            });
        } else {
            info += `  Солдаты: нет\n`;
        }
        
        if (workers.length > 0) {
            info += `  Рабочие: ${workers.length}\n`;
            workers.forEach((w, i) => {
                info += `    ${i + 1}. ID: ${w.id}, тип: ${w.type}, игрок: ${w.playerId}, здоровье: ${w.health}/${w.maxHealth}\n`;
            });
        } else {
            info += `  Рабочие: нет\n`;
        }
        
        debugInfoEl.textContent = info;
    }

    setupVisualDebug() {
        const closeBtn = document.getElementById('close-debug-message');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const debugMsg = document.getElementById('debug-message');
                if (debugMsg) {
                    debugMsg.style.display = 'none';
                }
            });
        }
        
        // Обработчик для кнопки закрытия панели очереди
        const closeQueueBtn = document.getElementById('close-build-queue');
        if (closeQueueBtn) {
            closeQueueBtn.addEventListener('click', () => {
                const queuePanel = document.getElementById('build-queue-panel');
                if (queuePanel) {
                    queuePanel.style.display = 'none';
                }
            });
        }
        
        // Обработчик для панели состояния бота
        const closeBotStatusBtn = document.getElementById('close-bot-status');
        if (closeBotStatusBtn) {
            closeBotStatusBtn.addEventListener('click', () => {
                const botStatusPanel = document.getElementById('bot-status-panel');
                if (botStatusPanel) {
                    botStatusPanel.style.display = 'none';
                }
            });
        }
    }
    
    showDebugMessage(message) {
        const debugMsg = document.getElementById('debug-message');
        const debugContent = document.getElementById('debug-message-content');
        if (debugMsg && debugContent) {
            debugContent.textContent = message;
            debugMsg.style.display = 'block';
            // Автоматически скрываем через 10 секунд
            setTimeout(() => {
                debugMsg.style.display = 'none';
            }, 10000);
        }
    }

    setupDebugTabs() {
        const soldierTab = document.getElementById('debug-tab-soldiers');
        const workerTab = document.getElementById('debug-tab-workers');
        const cellTab = document.getElementById('debug-tab-cells');
        const soldierInfo = document.getElementById('soldier-debug-info');
        const workerInfo = document.getElementById('worker-debug-info');
        const cellInfo = document.getElementById('cell-debug-info');
        
        if (!soldierTab || !workerTab || !cellTab || !soldierInfo || !workerInfo || !cellInfo) return;
        
        soldierTab.addEventListener('click', () => {
            soldierTab.style.background = '#4a90e2';
            workerTab.style.background = '#666';
            cellTab.style.background = '#666';
            soldierInfo.style.display = 'block';
            workerInfo.style.display = 'none';
            cellInfo.style.display = 'none';
        });
        
        workerTab.addEventListener('click', () => {
            soldierTab.style.background = '#666';
            workerTab.style.background = '#4a90e2';
            cellTab.style.background = '#666';
            soldierInfo.style.display = 'none';
            workerInfo.style.display = 'block';
            cellInfo.style.display = 'none';
        });
        
        cellTab.addEventListener('click', () => {
            soldierTab.style.background = '#666';
            workerTab.style.background = '#666';
            cellTab.style.background = '#4a90e2';
            soldierInfo.style.display = 'none';
            workerInfo.style.display = 'none';
            cellInfo.style.display = 'block';
        });
        
        // Сохраняем ссылку на выбранную ячейку
        this.selectedCellForDebug = null;
    }

    updateTestNeighborsInfo(selectedHex) {
        const infoEl = document.getElementById('test-neighbors-info');
        if (!infoEl) return;
        
        const normalizedHex = this.hexGrid.hexRound(selectedHex);
        const arrPos = this.hexGrid.hexToArray(normalizedHex);
        const neighbors = this.hexGrid.getHexNeighbors(normalizedHex);
        
        // Обратное преобразование для проверки
        const backToHex = this.hexGrid.arrayToHex(arrPos.x, arrPos.y);
        
        let info = `Выбранная ячейка:\n`;
        info += `  Hex: (${normalizedHex.q}, ${normalizedHex.r}, ${normalizedHex.s})\n`;
        info += `  Array: (${arrPos.x}, ${arrPos.y})\n`;
        info += `  Проверка обратного преобразования: Hex(${backToHex.q}, ${backToHex.r}, ${backToHex.s})\n`;
        info += `  Разница: q=${normalizedHex.q - backToHex.q}, r=${normalizedHex.r - backToHex.r}\n\n`;
        info += `Соседи (${neighbors.length} из 6):\n`;
        
        neighbors.forEach((neighbor, index) => {
            const neighborArr = this.hexGrid.hexToArray(neighbor);
            const backNeighborHex = this.hexGrid.arrayToHex(neighborArr.x, neighborArr.y);
            const blocked = this.hexGrid.isBlocked(neighbor, this.obstacleBloc, this.towerBloc);
            const diffX = neighborArr.x - arrPos.x;
            const diffY = neighborArr.y - arrPos.y;
            info += `  ${index + 1}. Hex: (${neighbor.q}, ${neighbor.r}, ${neighbor.s}) → Array: (${neighborArr.x}, ${neighborArr.y}) [Δx=${diffX}, Δy=${diffY}] ${blocked ? '❌ ЗАБЛОКИРОВАН' : '✅'}\n`;
            info += `      Обратное: Hex(${backNeighborHex.q}, ${backNeighborHex.r}, ${backNeighborHex.s})\n`;
        });
        
        // Показываем, какие соседи отсутствуют (должно быть 6)
        if (neighbors.length < 6) {
            info += `\n⚠️ Отсутствует ${6 - neighbors.length} соседей (возможно, за границами)\n`;
        }
        
        infoEl.textContent = info;
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
        
        const goldState = this.goldBloc.getState();
        const workerState = this.workerBloc.getState();
        const currentTime = performance.now();
        this.renderer.render(gameState, towerState, soldierState, playerState, this.mousePosition, obstacleState, goldState, workerState, currentTime);
    }
    
    updateBotStatusDisplay() {
        const botStatusPanel = document.getElementById('bot-status-panel');
        if (!botStatusPanel) return;
        
        const gameState = this.gameBloc.getState();
        
        // Показываем панель только в режимах PvE и Campaign
        if (gameState.gameMode === 'pve' || gameState.gameMode === 'campaign') {
            botStatusPanel.style.display = 'block';
        } else {
            botStatusPanel.style.display = 'none';
            return;
        }
        
        const botState = this.botAI.getState();
        const player = gameState.players[2];
        const towerState = this.towerBloc.getState();
        const soldierState = this.soldierBloc.getState();
        const workerState = this.workerBloc.getState();
        const goldState = this.goldBloc.getState();
        
        const botWorkers = workerState.workers.filter(w => w.playerId === 2);
        const gatherers = botWorkers.filter(w => w.type === 'gatherer');
        const builders = botWorkers.filter(w => w.type === 'builder');
        const botTowers = towerState.towers.filter(t => t.playerId === 2);
        const botSoldiers = soldierState.soldiers.filter(s => s.playerId === 2);
        const availableGold = goldState.goldPiles.filter(p => !p.collected).length;
        
        // Обновляем содержимое
        const currentActionEl = document.getElementById('bot-current-action');
        const priorityEl = document.getElementById('bot-priority');
        const goldEl = document.getElementById('bot-gold');
        const gatherersEl = document.getElementById('bot-gatherers');
        const buildersEl = document.getElementById('bot-builders');
        const towersEl = document.getElementById('bot-towers');
        const soldiersEl = document.getElementById('bot-soldiers');
        const availableGoldEl = document.getElementById('bot-available-gold');
        const lastActionEl = document.getElementById('bot-last-action');
        
        if (currentActionEl) currentActionEl.textContent = botState.currentAction || 'Ожидание...';
        if (priorityEl) priorityEl.textContent = botState.priority || '-';
        if (goldEl) goldEl.textContent = `${player.gold} (резерв: ${this.botAI.minGoldReserve})`;
        if (gatherersEl) gatherersEl.textContent = `${gatherers.length}/${this.botAI.targetGatherers}`;
        if (buildersEl) buildersEl.textContent = `${builders.length}/${this.botAI.targetBuilders}`;
        if (towersEl) towersEl.textContent = `${botTowers.length} (макс: 8)`;
        if (soldiersEl) soldiersEl.textContent = `${botSoldiers.length} (макс: 5)`;
        if (availableGoldEl) availableGoldEl.textContent = availableGold;
        if (lastActionEl) lastActionEl.textContent = botState.lastAction || '-';
    }
    
    updateBuildQueueDisplay() {
        const queuePanel = document.getElementById('build-queue-panel');
        const queueContent = document.getElementById('build-queue-content');
        if (!queuePanel || !queueContent) return;
        
        const workers = this.workerBloc.getState().workers;
        const buildQueue = {
            1: this.workerBloc.getBuildQueue(1),
            2: this.workerBloc.getBuildQueue(2)
        };
        
        // Проверяем, есть ли задачи в очереди или выполняются ли задачи
        const hasQueue1 = buildQueue[1].length > 0;
        const hasQueue2 = buildQueue[2].length > 0;
        const hasActiveBuilders = workers.some(w => w.type === 'builder' && w.buildingTarget);
        
        // Показываем панель, если есть задачи в очереди или активные строители
        if (hasQueue1 || hasQueue2 || hasActiveBuilders) {
            queuePanel.style.display = 'block';
        } else {
            queuePanel.style.display = 'none';
            return;
        }
        
        let html = '';
        
        // Обрабатываем каждого игрока
        for (let playerId = 1; playerId <= 2; playerId++) {
            const queue = buildQueue[playerId];
            const playerBuilders = workers.filter(w => w.playerId === playerId && w.type === 'builder');
            const activeBuilders = playerBuilders.filter(w => w.buildingTarget);
            
            if (queue.length > 0 || activeBuilders.length > 0) {
                html += `<div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #555;">`;
                html += `<strong style="color: ${playerId === 1 ? '#4a90e2' : '#e24a4a'}; font-size: 1.1em;">Игрок ${playerId}</strong><br>`;
                
                // Показываем активные задачи (выполняемые строителями)
                if (activeBuilders.length > 0) {
                    html += `<div style="margin-top: 8px; margin-bottom: 8px;">`;
                    html += `<strong style="color: #4a90e2;">Выполняются:</strong><br>`;
                    activeBuilders.forEach(builder => {
                        const task = builder.buildingTarget;
                        const taskTypeName = task.type === 'stone' ? 'Камень' : task.type === 'tree' ? 'Дерево' : task.type;
                        const state = this.getBuilderState(builder);
                        html += `<div style="margin-left: 10px; margin-top: 5px; padding: 5px; background: rgba(74, 144, 226, 0.2); border-radius: 4px;">`;
                        html += `🔨 <strong>Строитель #${builder.id}</strong><br>`;
                        html += `   Задача: ${taskTypeName} (${task.x}, ${task.y})<br>`;
                        html += `   Состояние: <span style="color: #4a90e2;">${state}</span>`;
                        html += `</div>`;
                    });
                    html += `</div>`;
                }
                
                // Показываем очередь ожидающих задач
                if (queue.length > 0) {
                    html += `<div style="margin-top: 8px;">`;
                    html += `<strong style="color: #ffa500;">В очереди (${queue.length}):</strong><br>`;
                    queue.forEach((task, index) => {
                        const taskTypeName = task.type === 'stone' ? 'Камень' : task.type === 'tree' ? 'Дерево' : task.type;
                        html += `<div style="margin-left: 10px; margin-top: 5px; padding: 5px; background: rgba(255, 165, 0, 0.2); border-radius: 4px;">`;
                        html += `${index + 1}. ${taskTypeName} (${task.x}, ${task.y})`;
                        html += `</div>`;
                    });
                    html += `</div>`;
                } else if (activeBuilders.length === 0) {
                    html += `<div style="margin-top: 8px; color: #888; font-style: italic;">Очередь пуста</div>`;
                }
                
                html += `</div>`;
            }
        }
        
        if (!html) {
            html = '<div style="color: #888; font-style: italic;">Очередь пуста</div>';
        }
        
        queueContent.innerHTML = html;
    }
    
    getBuilderState(builder) {
        if (!builder.buildingTarget) {
            // Проверяем, на базе ли строитель
            const currentHex = this.hexGrid.arrayToHex(builder.x, builder.y);
            const currentArr = this.hexGrid.hexToArray(currentHex);
            const centerX = Math.floor(this.hexGrid.width / 2);
            const baseY = builder.playerId === 1 ? this.hexGrid.height - 1 : 0;
            const isAtBase = currentArr.x === centerX && currentArr.y === baseY;
            return isAtBase ? 'СВОБОДЕН (на базе)' : 'СВОБОДЕН';
        }
        
        const target = builder.buildingTarget;
        const currentHex = this.hexGrid.arrayToHex(builder.x, builder.y);
        const currentArr = this.hexGrid.hexToArray(currentHex);
        const centerX = Math.floor(this.hexGrid.width / 2);
        const baseY = builder.playerId === 1 ? this.hexGrid.height - 1 : 0;
        
        // Проверяем, достиг ли цели
        const isAtTarget = currentArr.x === target.x && currentArr.y === target.y;
        
        if (isAtTarget) {
            // На месте строительства
            // Проверяем, есть ли путь обратно на базу (значит строительство завершено)
            if (builder.path && builder.path.length > 0) {
                const lastPathHex = builder.path[builder.path.length - 1];
                const lastPathArr = this.hexGrid.hexToArray(lastPathHex);
                const isReturning = lastPathArr.x === centerX && lastPathArr.y === baseY;
                if (isReturning) {
                    return 'ВОЗВРАТ НА БАЗУ';
                }
            }
            // Если на цели, но нет пути на базу - строим
            if (builder.buildingProgress !== undefined && builder.buildingProgress < 1) {
                const progress = Math.floor(builder.buildingProgress * 100);
                return `СТРОИТ (${progress}%)`;
            }
            // Если buildingProgress не установлен, но мы на цели - строим
            return 'СТРОИТ';
        }
        
        // Проверяем, возвращается ли на базу (по пути)
        if (builder.path && builder.path.length > 0) {
            const lastPathHex = builder.path[builder.path.length - 1];
            const lastPathArr = this.hexGrid.hexToArray(lastPathHex);
            const isReturning = lastPathArr.x === centerX && lastPathArr.y === baseY;
            
            if (isReturning && !isAtTarget) {
                return 'ВОЗВРАТ НА БАЗУ';
            }
        }
        
        // Идёт к цели
        return 'ИДЁТ К ЦЕЛИ';
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

