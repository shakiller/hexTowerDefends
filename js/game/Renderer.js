import { HexGrid } from './HexGrid.js';

export class Renderer {
    constructor(canvas, hexGrid) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.hexGrid = hexGrid;
        
        // Виртуальный скролл внутри канваса
        this.scrollX = 0;
        this.scrollY = 0;
        
        this.setupCanvas();
    }

    setupCanvas() {
        const container = this.canvas.parentElement;
        
        // Если контейнер еще не имеет размеров, используем минимальные
        let maxWidth = container.clientWidth - 40;
        let maxHeight = container.clientHeight - 40;
        
        // Если размеры слишком маленькие, используем размеры окна или минимальные значения
        if (maxWidth < 300 || maxHeight < 300 || !maxWidth || !maxHeight || isNaN(maxWidth) || isNaN(maxHeight)) {
            maxWidth = Math.max(window.innerWidth - 100, 1000);
            maxHeight = Math.max(window.innerHeight - 250, 700);
            console.warn('Container too small or not initialized, using window dimensions:', { 
                maxWidth, 
                maxHeight,
                containerWidth: container.clientWidth,
                containerHeight: container.clientHeight
            });
        }
        
        // Вычисляем оптимальный размер гексагона для поля 15x45
        // Для pointy-top: горизонтальное расстояние между центрами = sqrt(3) * size
        // Вертикальное расстояние между центрами = 1.5 * size (с учетом offset)
        
        // Вычисляем размер, чтобы поле поместилось
        // Учитываем множители из настроек
        const horizontalMultiplier = 0.87;
        const verticalMultiplier = 1.17;
        const hexHorizontalSpacing = Math.sqrt(3) * horizontalMultiplier; // Относительное горизонтальное расстояние
        const hexVerticalSpacing = 1.5 * verticalMultiplier; // Относительное вертикальное расстояние
        
        // Рассчитываем размер гексагона на основе высоты (приоритет вертикали)
        // По ширине делаем больше, чтобы было место для прокрутки
        const sizeByHeight = maxHeight / (this.hexGrid.height * hexVerticalSpacing);
        
        // Минимальный размер для хорошей видимости - делаем гексагоны больше
        // Используем более крупный размер для широкого поля
        // Увеличиваем размер для более широкого поля
        // Увеличиваем размер для более широкого поля - не ограничиваем минимальным
        const optimalHexSize = Math.max(sizeByHeight * 0.98, 25); // Минимум 25 пикселей для широкого поля
        this.hexGrid.hexSize = optimalHexSize;
        
        this.hexGrid.hexHeight = this.hexGrid.hexSize * 2;
        this.hexGrid.hexWidth = Math.sqrt(3) * this.hexGrid.hexSize;
        
        // Размеры канваса для всей сетки с учетом множителей
        // Не ограничиваем по ширине - будет прокрутка
        const canvasWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const canvasHeight = this.hexGrid.height * this.hexGrid.hexSize * 1.5 * verticalMultiplier + this.hexGrid.hexSize;
        
        // Канвас должен быть размером видимой области (контейнера)
        // Вся сетка будет отрисовываться через виртуальный скролл
        this.canvas.width = maxWidth;
        this.canvas.height = maxHeight;
        
        // Сохраняем реальные размеры поля для ограничения скролла
        this.fieldWidth = Math.max(canvasWidth, 1600);
        this.fieldHeight = Math.max(canvasHeight, 1300);
        
        console.log('Canvas setup:', {
            hexSize: this.hexGrid.hexSize,
            hexWidth: this.hexGrid.hexWidth,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            fieldWidth: this.fieldWidth,
            fieldHeight: this.fieldHeight,
            calculatedWidth: canvasWidth,
            calculatedHeight: canvasHeight,
            maxWidth,
            maxHeight,
            containerWidth: container.clientWidth,
            containerHeight: container.clientHeight
        });
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Центрируем сетку на канвасе
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        for (let x = 0; x < this.hexGrid.width; x++) {
            for (let y = 0; y < this.hexGrid.height; y++) {
                const hex = this.hexGrid.arrayToHex(x, y);
                this.hexGrid.drawHex(
                    this.ctx,
                    hex,
                    '#1a3a5a',
                    '#2a4a6a'
                );
            }
        }
        
        this.ctx.restore();
    }

    drawTowers(towers) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        towers.forEach(tower => {
            const hex = this.hexGrid.arrayToHex(tower.x, tower.y);
            const pixelPos = this.hexGrid.hexToPixel(hex);
            
            // Рисуем прямоугольник-башню
            const size = this.hexGrid.hexSize * 0.6;
            this.ctx.fillStyle = tower.playerId === 1 ? '#4a90e2' : '#e24a4a';
            this.ctx.fillRect(
                pixelPos.x - size / 2,
                pixelPos.y - size / 2,
                size,
                size
            );
            
            // Уровень башни
            this.ctx.fillStyle = 'white';
            this.ctx.font = `${Math.max(this.hexGrid.hexSize * 0.3, 8)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(tower.level, pixelPos.x, pixelPos.y);
        });
        
        this.ctx.restore();
    }

    drawSoldiers(soldiers) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        soldiers.forEach(soldier => {
            // Конвертируем координаты массива в гексагональные координаты для отображения
            const hex = this.hexGrid.arrayToHex(Math.round(soldier.x), Math.round(soldier.y));
            const pixelPos = this.hexGrid.hexToPixel(hex);
            
            // Рисуем прямоугольник-солдата
            const size = this.hexGrid.hexSize * 0.4;
            this.ctx.fillStyle = soldier.playerId === 1 ? '#90e24a' : '#e2904a';
            this.ctx.fillRect(
                pixelPos.x - size / 2,
                pixelPos.y - size / 2,
                size,
                size
            );
            
            // HP бар
            const hpPercent = soldier.health / soldier.maxHealth;
            this.ctx.fillStyle = hpPercent > 0.5 ? '#4a90e2' : '#e24a4a';
            this.ctx.fillRect(
                pixelPos.x - size / 2,
                pixelPos.y - size / 2 - 5,
                size * hpPercent,
                3
            );
        });
        
        this.ctx.restore();
    }

    drawSelection(cell, color) {
        if (!cell) return;
        
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        const hex = this.hexGrid.arrayToHex(cell.x, cell.y);
        this.hexGrid.drawHex(this.ctx, hex, null, color);
        this.ctx.lineWidth = 3;
        
        this.ctx.restore();
    }

    drawBases() {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        // База игрока 1 (слева) - первый столбец по всей высоте
        for (let y = 0; y < this.hexGrid.height; y++) {
            const hex = this.hexGrid.arrayToHex(0, y);
            // Более яркая заливка для лучшей видимости
            this.hexGrid.drawHex(this.ctx, hex, 'rgba(74, 144, 226, 0.7)', '#4a90e2');
        }
        
        // База игрока 2 (справа) - последний столбец по всей высоте
        for (let y = 0; y < this.hexGrid.height; y++) {
            const hex = this.hexGrid.arrayToHex(this.hexGrid.width - 1, y);
            // Более яркая заливка для лучшей видимости
            this.hexGrid.drawHex(this.ctx, hex, 'rgba(226, 74, 74, 0.7)', '#e24a4a');
        }
        
        this.ctx.restore();
    }

    drawObstacles(obstacles) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        obstacles.forEach(obstacle => {
            const hex = this.hexGrid.arrayToHex(obstacle.x, obstacle.y);
            const pixelPos = this.hexGrid.hexToPixel(hex);
            
            if (obstacle.type === 'stone') {
                // Камень - серый прямоугольник
                const size = this.hexGrid.hexSize * 0.7;
                this.ctx.fillStyle = '#555555';
                this.ctx.strokeStyle = '#333333';
                this.ctx.lineWidth = 2;
                this.ctx.fillRect(
                    pixelPos.x - size / 2,
                    pixelPos.y - size / 2,
                    size,
                    size
                );
                this.ctx.strokeRect(
                    pixelPos.x - size / 2,
                    pixelPos.y - size / 2,
                    size,
                    size
                );
            } else if (obstacle.type === 'tree') {
                // Дерево - коричневый ствол с зеленой кроной
                const trunkWidth = this.hexGrid.hexSize * 0.3;
                const trunkHeight = this.hexGrid.hexSize * 0.4;
                const crownSize = this.hexGrid.hexSize * 0.6;
                
                // Ствол
                this.ctx.fillStyle = '#654321';
                this.ctx.fillRect(
                    pixelPos.x - trunkWidth / 2,
                    pixelPos.y + crownSize / 2,
                    trunkWidth,
                    trunkHeight
                );
                
                // Крона
                this.ctx.fillStyle = '#228B22';
                this.ctx.beginPath();
                this.ctx.arc(pixelPos.x, pixelPos.y, crownSize / 2, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Показываем здоровье дерева
                if (obstacle.health < 100) {
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                    this.ctx.fillRect(
                        pixelPos.x - crownSize / 2,
                        pixelPos.y - crownSize / 2 - 5,
                        crownSize * (obstacle.health / 100),
                        3
                    );
                }
            }
        });
        
        this.ctx.restore();
    }

    render(gameState, towerState, soldierState, playerState, mousePosition = null, mouseHistory = [], obstacleState = null) {
        this.clear();
        this.drawGrid();
        this.drawBases();
        
        // Рисуем препятствия перед башнями и солдатами
        if (obstacleState && obstacleState.obstacles) {
            this.drawObstacles(obstacleState.obstacles);
        }
        
        // Подсветка доступных ячеек для размещения
        if (playerState.selectedTowerType || playerState.selectedSoldierType) {
            this.drawPlacementPreview(gameState, playerState, towerState, obstacleState);
        }
        
        this.drawTowers(towerState.towers);
        this.drawSoldiers(soldierState.soldiers);
        
        if (playerState.selectedCell) {
            this.drawSelection(playerState.selectedCell, 'yellow');
        }
        
        // Визуализация позиции мыши для отладки
        if (mousePosition || mouseHistory.length > 0) {
            this.drawMouseDebug(mousePosition, mouseHistory);
        }
    }

    drawPlacementPreview(gameState, playerState, towerState, obstacleState = null) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        const currentPlayer = gameState.currentPlayer;
        const player = gameState.players[currentPlayer];
        
        // Подсветка для башен - все свободные ячейки
        if (playerState.selectedTowerType) {
            const towerCosts = { basic: 100, strong: 200 };
            const towerCost = towerCosts[playerState.selectedTowerType] || 100;
            
            for (let x = 0; x < this.hexGrid.width; x++) {
                for (let y = 0; y < this.hexGrid.height; y++) {
                    const hex = this.hexGrid.arrayToHex(x, y);
                    const existingTower = towerState.towers.find(t => t.x === x && t.y === y);
                    
                    // Не ставим башни на базах (первый и последний столбец)
                    if (x === 0 || x === this.hexGrid.width - 1) continue;
                    
                    // Проверка препятствий
                    const obstacle = obstacleState && obstacleState.obstacles ? 
                        obstacleState.obstacles.find(o => o.x === x && o.y === y) : null;
                    if (obstacle) continue; // Пропускаем ячейки с препятствиями
                    
                    if (!existingTower && player.gold >= towerCost) {
                        // Желтая подсветка для доступных ячеек
                        this.hexGrid.drawHex(this.ctx, hex, 'rgba(255, 255, 0, 0.2)', 'rgba(255, 255, 0, 0.5)');
                    } else if (existingTower && existingTower.playerId === currentPlayer) {
                        // Зеленая подсветка для своих башен (можно улучшить)
                        this.hexGrid.drawHex(this.ctx, hex, 'rgba(0, 255, 0, 0.2)', 'rgba(0, 255, 0, 0.5)');
                    }
                }
            }
        }
        
        // Подсветка для солдат - только база
        if (playerState.selectedSoldierType) {
            const soldierCosts = { basic: 50, strong: 100 };
            const soldierCost = soldierCosts[playerState.selectedSoldierType] || 50;
            
            const baseX = currentPlayer === 1 ? 0 : this.hexGrid.width - 1;
            for (let y = 0; y < this.hexGrid.height; y++) {
                const hex = this.hexGrid.arrayToHex(baseX, y);
                if (player.gold >= soldierCost) {
                    // Голубая подсветка для базы
                    this.hexGrid.drawHex(this.ctx, hex, 'rgba(0, 255, 255, 0.3)', 'rgba(0, 255, 255, 0.7)');
                }
            }
        }
        
        this.ctx.restore();
    }

    drawMouseDebug(mousePosition, mouseHistory) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Применяем тот же offset что и для сетки
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        // Рисуем шлейф - историю позиций
        if (mouseHistory.length > 1) {
            this.ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            
            for (let i = 0; i < mouseHistory.length; i++) {
                const point = mouseHistory[i];
                const age = Date.now() - point.time;
                const alpha = 1 - (age / 2000); // Исчезает за 2 секунды
                
                if (alpha > 0) {
                    const x = point.x;
                    const y = point.y;
                    
                    if (i === 0) {
                        this.ctx.moveTo(x, y);
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                }
            }
            
            this.ctx.stroke();
            
            // Рисуем точки шлейфа
            for (let i = 0; i < mouseHistory.length; i++) {
                const point = mouseHistory[i];
                const age = Date.now() - point.time;
                const alpha = Math.max(0, 1 - (age / 2000));
                
                if (alpha > 0) {
                    this.ctx.fillStyle = `rgba(255, 0, 255, ${alpha * 0.7})`;
                    this.ctx.beginPath();
                    this.ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
        
        // Рисуем текущую позицию мыши
        if (mousePosition) {
            // Большой круг в текущей позиции
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            this.ctx.strokeStyle = 'red';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(mousePosition.gridX, mousePosition.gridY, 8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Крестик
            this.ctx.strokeStyle = 'red';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(mousePosition.gridX - 12, mousePosition.gridY);
            this.ctx.lineTo(mousePosition.gridX + 12, mousePosition.gridY);
            this.ctx.moveTo(mousePosition.gridX, mousePosition.gridY - 12);
            this.ctx.lineTo(mousePosition.gridX, mousePosition.gridY + 12);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
        
        // Рисуем информацию о координатах в углу экрана (без трансформации)
        if (mousePosition) {
            this.ctx.save();
            this.ctx.font = '14px monospace';
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 3;
            
            const info = [
                `Client: (${(mousePosition.clientX || 0).toFixed(0)}, ${(mousePosition.clientY || 0).toFixed(0)})`,
                `Rect: (${(mousePosition.rectLeft || 0).toFixed(1)}, ${(mousePosition.rectTop || 0).toFixed(1)})`,
                `Visible: (${(mousePosition.visibleX || 0).toFixed(1)}, ${(mousePosition.visibleY || 0).toFixed(1)})`,
                `Scroll: (${(mousePosition.scrollX || 0).toFixed(0)}, ${(mousePosition.scrollY || 0).toFixed(0)})`,
                `Canvas: (${(mousePosition.fieldX || mousePosition.canvasX || 0).toFixed(1)}, ${(mousePosition.fieldY || mousePosition.canvasY || 0).toFixed(1)})`,
                `Grid: (${(mousePosition.gridX || 0).toFixed(1)}, ${(mousePosition.gridY || 0).toFixed(1)})`
            ];
            
            let y = 20;
            for (const line of info) {
                this.ctx.strokeText(line, 10, y);
                this.ctx.fillText(line, 10, y);
                y += 18;
            }
            
            this.ctx.restore();
        }
    }

}
