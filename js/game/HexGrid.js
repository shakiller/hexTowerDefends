export class HexGrid {
    constructor(width = 15, height = 45) {
        this.width = width;
        this.height = height;
        this.hexSize = 15; // Базовый размер, будет масштабироваться
        this.hexHeight = this.hexSize * 2;
        this.hexWidth = Math.sqrt(3) * this.hexSize;
    }

    pixelToHex(x, y) {
        // Обратное преобразование для pointy-top с offset координатами
        // Сначала находим приблизительную колонку и строку
        const col = Math.round(x / (this.hexSize * Math.sqrt(3)));
        const row = Math.round(y / (this.hexSize * 1.5));
        
        // Конвертируем обратно в кубические координаты
        const q = col;
        const r = row - Math.floor(col / 2);
        return this.hexRound({q, r, s: -q - r});
    }

    hexToPixel(hex) {
        // Конвертируем кубические координаты в offset координаты (odd-r)
        const col = hex.q;
        const row = hex.r + Math.floor(hex.q / 2);
        
        // Для pointy-top гексагонов с odd-r offset координатами
        // Нечетные столбцы (col % 2 == 1) сдвигаются вниз на полвысоты
        const x = this.hexSize * Math.sqrt(3) * (col + 0.5);
        const y = this.hexSize * (3/2 * row + (col % 2) * 0.5);
        return { x, y };
    }

    hexRound(hex) {
        let q = Math.round(hex.q);
        let r = Math.round(hex.r);
        const s = Math.round(-hex.q - hex.r);

        const qDiff = Math.abs(q - hex.q);
        const rDiff = Math.abs(r - hex.r);
        const sDiff = Math.abs(s - (-hex.q - hex.r));

        if (qDiff > rDiff && qDiff > sDiff) {
            q = -r - s;
        } else if (rDiff > sDiff) {
            r = -q - s;
        }

        return { q, r, s: -q - r };
    }

    hexToArray(hex) {
        // Конвертируем кубические координаты в массив индексов
        const col = hex.q;
        const row = hex.r + Math.floor(hex.q / 2);
        return { x: col, y: row };
    }

    arrayToHex(x, y) {
        const q = x;
        const r = y - Math.floor(x / 2);
        const s = -q - r;
        return { q, r, s };
    }

    isValidHex(hex) {
        const arr = this.hexToArray(hex);
        return arr.x >= 0 && arr.x < this.width && arr.y >= 0 && arr.y < this.height;
    }

    getHexCorners(hex) {
        const center = this.hexToPixel(hex);
        const corners = [];
        // Для pointy-top гексагонов начинаем с верхней вершины (-PI/2)
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i - Math.PI / 2;
            corners.push({
                x: center.x + this.hexSize * Math.cos(angle),
                y: center.y + this.hexSize * Math.sin(angle)
            });
        }
        return corners;
    }

    drawHex(ctx, hex, fillStyle, strokeStyle) {
        const corners = this.getHexCorners(hex);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}
