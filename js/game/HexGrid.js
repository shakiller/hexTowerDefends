export class HexGrid {
    constructor(width = 15, height = 45) {
        this.width = width;
        this.height = height;
        this.hexSize = 20;
        this.hexHeight = this.hexSize * 2;
        this.hexWidth = Math.sqrt(3) * this.hexSize;
    }

    pixelToHex(x, y) {
        const q = (2/3 * x) / this.hexSize;
        const r = (-1/3 * x + Math.sqrt(3)/3 * y) / this.hexSize;
        return this.hexRound({q, r});
    }

    hexToPixel(hex) {
        const x = this.hexSize * (Math.sqrt(3) * hex.q + Math.sqrt(3)/2 * hex.r);
        const y = this.hexSize * (3/2 * hex.r);
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
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
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
