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
        const maxWidth = container.clientWidth - 40;
        const maxHeight = container.clientHeight - 40;
        
        // Вычисляем оптимальный размер гексагона для поля 15x45
        // Для pointy-top: горизонтальное расстояние между центрами = sqrt(3) * size
        // Вертикальное расстояние между центрами = 1.5 * size (с учетом offset)
        
        // Вычисляем размер, чтобы поле поместилось
        // Учитываем множители из настроек
        const horizontalMultiplier = 0.87;
        const verticalMultiplier = 1.17;
        const hexHorizontalSpacing = Math.sqrt(3) * horizontalMultiplier; // Относительное горизонтальное расстояние
        const hexVerticalSpacing = 1.5 * verticalMultiplier; // Относительное вертикальное расстояние
        
        const sizeByWidth = maxWidth / (this.hexGrid.width * hexHorizontalSpacing);
        const sizeByHeight = maxHeight / (this.hexGrid.height * hexVerticalSpacing);
        
        const optimalHexSize = Math.min(sizeByWidth, sizeByHeight) * 0.9;
        this.hexGrid.hexSize = Math.max(optimalHexSize, 12); // Минимум 12 пикселей
        
        this.hexGrid.hexHeight = this.hexGrid.hexSize * 2;
        this.hexGrid.hexWidth = Math.sqrt(3) * this.hexGrid.hexSize;
        
        // Размеры канваса для всей сетки
        const canvasWidth = this.hexGrid.width * this.hexGrid.hexWidth;
        const canvasHeight = this.hexGrid.height * this.hexGrid.hexSize * 1.5 + this.hexGrid.hexSize;
        
        this.canvas.width = Math.min(canvasWidth, maxWidth);
        this.canvas.height = Math.min(canvasHeight, maxHeight);
        
        console.log('Canvas setup:', {
            hexSize: this.hexGrid.hexSize,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            maxWidth,
            maxHeight
        });
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        this.ctx.save();
        
        // Центрируем сетку на канвасе
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth;
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
        
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth;
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
        
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth;
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
        
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth;
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
        
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth;
        const offsetX = Math.max(0, (this.canvas.width - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        // База игрока 1 (слева) - первый столбец по всей высоте
        for (let y = 0; y < this.hexGrid.height; y++) {
            const hex = this.hexGrid.arrayToHex(0, y);
            this.hexGrid.drawHex(this.ctx, hex, 'rgba(74, 144, 226, 0.5)', '#4a90e2');
        }
        
        // База игрока 2 (справа) - последний столбец по всей высоте
        for (let y = 0; y < this.hexGrid.height; y++) {
            const hex = this.hexGrid.arrayToHex(this.hexGrid.width - 1, y);
            this.hexGrid.drawHex(this.ctx, hex, 'rgba(226, 74, 74, 0.5)', '#e24a4a');
        }
        
        this.ctx.restore();
    }

    render(gameState, towerState, soldierState, playerState) {
        this.clear();
        this.drawGrid();
        this.drawBases();
        this.drawTowers(towerState.towers);
        this.drawSoldiers(soldierState.soldiers);
        
        if (playerState.selectedCell) {
            this.drawSelection(playerState.selectedCell, 'yellow');
        }
    }
}
