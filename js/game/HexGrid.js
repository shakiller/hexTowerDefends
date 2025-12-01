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
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const verticalMultiplier = 1.17;
        const offsetMultiplier = 0.87;
        
        // Обратное преобразование:
        // x = hexSize * sqrt(3) * col * horizontalMultiplier
        // col = x / (hexSize * sqrt(3) * horizontalMultiplier)
        const col = Math.round(x / (this.hexSize * Math.sqrt(3) * horizontalMultiplier));
        
        // y = hexSize * 1.5 * row * verticalMultiplier + ((col + 1) % 2) * hexSize * offsetMultiplier
        // Сначала вычитаем offset для нечётных столбцов
        const offsetY = y - ((col + 1) % 2) * this.hexSize * offsetMultiplier;
        const row = Math.round(offsetY / (this.hexSize * 1.5 * verticalMultiplier));
        
        // Конвертируем обратно в кубические координаты (odd-r offset)
        const q = col;
        const r = row - Math.floor(col / 2);
        return this.hexRound({q, r, s: -q - r});
    }

    hexToPixel(hex) {
        // Используем offset координаты (odd-r)
        // q - это колонка, r - это строка в offset координатах
        const col = hex.q;
        const row = hex.r + Math.floor(hex.q / 2);
        
        // Для pointy-top гексагонов с настройками:
        // Горизонтальное расстояние: 0.87
        // Вертикальное расстояние: 1.17
        // Сдвиг четных столбцов: 0.87
        const horizontalMultiplier = 0.87;
        const verticalMultiplier = 1.17;
        const offsetMultiplier = 0.87;
        
        const x = this.hexSize * Math.sqrt(3) * col * horizontalMultiplier;
        const y = this.hexSize * 1.5 * row * verticalMultiplier + ((col + 1) % 2) * this.hexSize * offsetMultiplier;
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

    getHexNeighbors(hex) {
        // Возвращает соседей гексагона (6 направлений)
        const directions = [
            { q: 1, r: 0, s: -1 },   // Восток
            { q: 1, r: -1, s: 0 },   // Северо-восток
            { q: 0, r: -1, s: 1 },   // Северо-запад
            { q: -1, r: 0, s: 1 },   // Запад
            { q: -1, r: 1, s: 0 },   // Юго-запад
            { q: 0, r: 1, s: -1 }    // Юго-восток
        ];
        
        const neighbors = [];
        for (const dir of directions) {
            const neighbor = {
                q: hex.q + dir.q,
                r: hex.r + dir.r,
                s: hex.s + dir.s
            };
            if (this.isValidHex(neighbor)) {
                neighbors.push(neighbor);
            }
        }
        return neighbors;
    }

    hexDistance(hex1, hex2) {
        // Расстояние между двумя гексагонами (кубические координаты)
        return (Math.abs(hex1.q - hex2.q) + Math.abs(hex1.r - hex2.r) + Math.abs(hex1.s - hex2.s)) / 2;
    }

    findPath(startHex, targetHex, obstacleBloc = null, towerBloc = null) {
        // Простой жадный алгоритм поиска пути (движение к ближайшему соседу к цели)
        // Если нужно обходить препятствия - использовать A*
        const path = [];
        let current = { ...startHex };
        
        // Ограничиваем максимальную длину пути
        const maxPathLength = 100;
        let iterations = 0;
        
        while (iterations < maxPathLength) {
            iterations++;
            path.push({ ...current });
            
            // Если достигли цели
            if (current.q === targetHex.q && current.r === targetHex.r) {
                break;
            }
            
            // Находим ближайшего соседа к цели
            const neighbors = this.getHexNeighbors(current);
            let bestNeighbor = null;
            let bestDistance = Infinity;
            
            for (const neighbor of neighbors) {
                // Проверяем препятствия
                const arrPos = this.hexToArray(neighbor);
                if (obstacleBloc) {
                    const obstacle = obstacleBloc.getObstacleAt(arrPos.x, arrPos.y);
                    if (obstacle) continue; // Пропускаем препятствия
                }
                
                // Проверяем башни
                if (towerBloc) {
                    const tower = towerBloc.getTowerAt(neighbor);
                    if (tower) continue; // Пропускаем башни
                }
                
                // Проверяем, не был ли этот гексагон уже в пути (избегаем циклов)
                const alreadyInPath = path.some(p => p.q === neighbor.q && p.r === neighbor.r);
                if (alreadyInPath) continue;
                
                const distance = this.hexDistance(neighbor, targetHex);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestNeighbor = neighbor;
                }
            }
            
            if (!bestNeighbor) {
                // Не можем найти путь
                break;
            }
            
            current = bestNeighbor;
        }
        
        return path;
    }

    getHexCorners(hex) {
        const center = this.hexToPixel(hex);
        const corners = [];
        // Угол поворота: -60 градусов
        const startAngle = -Math.PI / 3; // -60 градусов
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i + startAngle;
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
