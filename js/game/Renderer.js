import { HexGrid } from './HexGrid.js';

export class Renderer {
    constructor(canvas, hexGrid) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.hexGrid = hexGrid;
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
        
        // Устанавливаем реальные размеры канваса - делаем его достаточно большим
        // Убеждаемся что поле 15x45 помещается полностью без обрезки
        // Используем рассчитанную ширину, но не меньше минимума
        // Убеждаемся что канвас достаточно широкий - не ограничиваем
        this.canvas.width = Math.max(canvasWidth, 1600); // Минимум 1600 пикселей ширины для поля 15 столбцов
        this.canvas.height = Math.max(canvasHeight, 1300); // Минимум 1300 пикселей высоты для поля 45 рядов
        
        console.log('Canvas setup:', {
            hexSize: this.hexGrid.hexSize,
            hexWidth: this.hexGrid.hexWidth,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
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
        
        // Центрируем сетку на канвасе
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
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
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
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
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
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
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        const hex = this.hexGrid.arrayToHex(cell.x, cell.y);
        this.hexGrid.drawHex(this.ctx, hex, null, color);
        this.ctx.lineWidth = 3;
        
        this.ctx.restore();
    }

    drawBases() {
        this.ctx.save();
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
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

    render(gameState, towerState, soldierState, playerState) {
        this.clear();
        this.drawGrid();
        this.drawBases();
        
        // Подсветка доступных ячеек для размещения
        if (playerState.selectedTowerType || playerState.selectedSoldierType) {
            this.drawPlacementPreview(gameState, playerState, towerState);
        }
        
        this.drawTowers(towerState.towers);
        this.drawSoldiers(soldierState.soldiers);
        
        if (playerState.selectedCell) {
            this.drawSelection(playerState.selectedCell, 'yellow');
        }
    }

    drawPlacementPreview(gameState, playerState, towerState) {
        this.ctx.save();
        
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
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

}
