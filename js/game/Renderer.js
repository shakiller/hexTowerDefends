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
        
        // Вычисляем размеры с учетом гексагональной сетки
        const hexWidth = this.hexGrid.hexWidth;
        const hexHeight = this.hexGrid.hexHeight * 0.75;
        
        const requiredWidth = this.hexGrid.width * hexWidth;
        const requiredHeight = this.hexGrid.height * hexHeight;
        
        const scaleX = maxWidth / requiredWidth;
        const scaleY = maxHeight / requiredHeight;
        const scale = Math.min(scaleX, scaleY, 1);
        
        this.canvas.width = requiredWidth * scale;
        this.canvas.height = requiredHeight * scale;
        this.scale = scale;
        
        this.hexGrid.hexSize *= scale;
        this.hexGrid.hexHeight = this.hexGrid.hexSize * 2;
        this.hexGrid.hexWidth = Math.sqrt(3) * this.hexGrid.hexSize;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, 20);
        
        for (let x = 0; x < this.hexGrid.width; x++) {
            for (let y = 0; y < this.hexGrid.height; y++) {
                const hex = this.hexGrid.arrayToHex(x, y);
                const pixelPos = this.hexGrid.hexToPixel(hex);
                
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
        this.ctx.translate(this.canvas.width / 2, 20);
        
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
            this.ctx.font = `${this.hexGrid.hexSize * 0.3}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(tower.level, pixelPos.x, pixelPos.y + size * 0.1);
        });
        
        this.ctx.restore();
    }

    drawSoldiers(soldiers) {
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, 20);
        
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
        this.ctx.translate(this.canvas.width / 2, 20);
        
        const hex = this.hexGrid.arrayToHex(cell.x, cell.y);
        this.hexGrid.drawHex(this.ctx, hex, null, color);
        this.ctx.lineWidth = 3;
        
        this.ctx.restore();
    }

    drawBases() {
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, 20);
        
        // База игрока 1 (слева)
        for (let y = 0; y < this.hexGrid.width; y++) {
            const hex = this.hexGrid.arrayToHex(0, y);
            this.hexGrid.drawHex(this.ctx, hex, 'rgba(74, 144, 226, 0.5)', '#4a90e2');
        }
        
        // База игрока 2 (справа)
        for (let y = 0; y < this.hexGrid.width; y++) {
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
