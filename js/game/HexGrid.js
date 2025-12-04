export class HexGrid {
    constructor(width = 15, height = 45) {
        this.width = width;
        this.height = height;
        this.hexSize = 15; // Базовый размер, будет масштабироваться
        this.hexHeight = this.hexSize * 2;
        this.hexWidth = Math.sqrt(3) * this.hexSize;
        
        // Хранилище для отладочной информации о последнем поиске пути
        this.lastPathfindingDebug = {
            startHex: null,
            targetHex: null,
            iterations: 0,
            finalOpenSetSize: 0,
            neighbors: [],
            error: null,
            distance: null,
            iterationsDetails: []
        };
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
        // Обратная формула: q = col, r = row - floor(col / 2)
        const q = col;
        const r = row - Math.floor(col / 2);
        return this.hexRound({q, r, s: -q - r});
    }

    hexToPixel(hex) {
        // Используем offset координаты (odd-r)
        // Стандартная формула: row = r + floor(q / 2)
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
        // Стандартный алгоритм округления кубических координат
        // Округляем каждую координату
        let q = Math.round(hex.q);
        let r = Math.round(hex.r);
        let s = Math.round(hex.s);

        // Вычисляем ошибки округления
        const qDiff = Math.abs(q - hex.q);
        const rDiff = Math.abs(r - hex.r);
        const sDiff = Math.abs(s - hex.s);

        // Исправляем координату с наибольшей ошибкой, используя условие q + r + s = 0
        if (qDiff > rDiff && qDiff > sDiff) {
            q = -r - s;
        } else if (rDiff > sDiff) {
            r = -q - s;
        } else {
            s = -q - r;
        }

        return { q, r, s };
    }

    hexToArray(hex) {
        // Стандартное преобразование из кубических координат в odd-r offset координаты
        // Формула: col = q, row = r + floor(q / 2)
        const col = hex.q;
        const row = hex.r + Math.floor(hex.q / 2);
        return { x: col, y: row };
    }

    arrayToHex(x, y) {
        // Стандартное преобразование из odd-r offset координат в кубические координаты
        // Формула: q = col, r = row - floor(col / 2), s = -q - r
        const q = x;
        const r = y - Math.floor(x / 2);
        const s = -q - r;
        // Возвращаем нормализованные координаты (q + r + s = 0)
        return { q, r, s };
    }

    isValidHex(hex) {
        const arr = this.hexToArray(hex);
        return arr.x >= 0 && arr.x < this.width && arr.y >= 0 && arr.y < this.height;
    }

    getHexNeighbors(hex) {
        // Возвращает соседей гексагона (6 направлений) используя кубические координаты
        // Для pointy-top гексагонов: верхний, верхний правый, нижний правый, нижний, нижний левый, верхний левый
        const normalizedHex = this.hexRound(hex);
        
        // Получаем array координаты для определения чётности столбца
        const arrPos = this.hexToArray(normalizedHex);
        const isEvenColumn = arrPos.x % 2 === 0;
        
        // Направления соседей для pointy-top гексагонов в кубических координатах
        // ВАЖНО: для odd-r offset координат направления различаются для чётных и нечётных столбцов
        // Для нечётных столбцов (1, 3, 5, 7, 9...)
        // Для чётных столбцов (2, 4, 6, 8, 10...)
        let directions;
        if (isEvenColumn) {
            // Направления для чётных столбцов (на основе скриншота с (8,4))
            // Для чётных столбцов диагональные соседи находятся на том же уровне или ниже
            directions = [
                { q: 0, r: -1, s: 1 },   // Верхний (север) → (8,3)
                { q: 1, r: 0, s: -1 },   // Верхний правый (северо-восток) → (9,4) - на том же уровне
                { q: 1, r: 1, s: -2 },   // Нижний правый (юго-восток) → (9,5) - ниже
                { q: 0, r: 1, s: -1 },   // Нижний (юг) → (8,5)
                { q: -1, r: 2, s: -1 },   // Нижний левый (юго-запад) → (7,5) - ниже
                { q: -1, r: 1, s: 0 }   // Верхний левый (северо-запад) → (7,4) - на том же уровне
            ];
        } else {
            // Направления для нечётных столбцов (на основе скриншота с (7,3))
            directions = [
                { q: 0, r: -1, s: 1 },   // Верхний (север) → (7,2)
                { q: 1, r: -2, s: 1 },   // Верхний правый (северо-восток) → (8,2)
                { q: 1, r: -1, s: 0 },   // Нижний правый (юго-восток) → (8,3)
                { q: 0, r: 1, s: -1 },   // Нижний (юг) → (7,4)
                { q: -1, r: 0, s: 1 },   // Нижний левый (юго-запад) → (6,3)
                { q: -1, r: -1, s: 2 }   // Верхний левый (северо-запад) → (6,2)
            ];
        }
        
        const neighbors = [];
        for (const dir of directions) {
            // Вычисляем соседа: если оба hex имеют q+r+s=0, то результат тоже будет иметь q+r+s=0
            const neighbor = {
                q: normalizedHex.q + dir.q,
                r: normalizedHex.r + dir.r,
                s: normalizedHex.s + dir.s
            };
            // Проверяем валидность через array координаты
            // НЕ вызываем hexRound, так как neighbor уже имеет правильные целочисленные координаты
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
    
    /**
     * Находит все гексы в радиусе range от центрального гекса, используя логику соседей
     * Радиус 1 = соседи, радиус 2 = соседи соседей и т.д.
     */
    getHexesInRange(centerHex, range) {
        const normalizedCenter = this.hexRound(centerHex);
        const visited = new Set();
        const result = [];
        
        // BFS для поиска всех гексов в радиусе
        const queue = [{ hex: normalizedCenter, distance: 0 }];
        visited.add(this.hexKey(normalizedCenter));
        
        while (queue.length > 0) {
            const { hex, distance } = queue.shift();
            
            if (distance <= range) {
                result.push(hex);
            }
            
            // Если достигли максимального расстояния, не добавляем соседей
            if (distance >= range) {
                continue;
            }
            
            // Добавляем соседей
            const neighbors = this.getHexNeighbors(hex);
            for (const neighbor of neighbors) {
                const key = this.hexKey(neighbor);
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ hex: neighbor, distance: distance + 1 });
                }
            }
        }
        
        return result;
    }
    
    /**
     * Проверяет, находится ли целевой гекс в радиусе от центрального, используя логику соседей
     */
    isInRange(centerHex, targetHex, range) {
        const hexesInRange = this.getHexesInRange(centerHex, range);
        const normalizedTarget = this.hexRound(targetHex);
        const targetKey = this.hexKey(normalizedTarget);
        
        return hexesInRange.some(hex => this.hexKey(hex) === targetKey);
    }

    isBlocked(hex, obstacleBloc, towerBloc, allowGates = false, allowObstacles = false) {
        // Проверяем, заблокирована ли ячейка препятствием или башней
        // Нормализуем hex координаты перед преобразованием
        const normalizedHex = this.hexRound(hex);
        const arrPos = this.hexToArray(normalizedHex);
        
        // Проверяем границы
        if (arrPos.x < 0 || arrPos.x >= this.width || arrPos.y < 0 || arrPos.y >= this.height) {
            return true; // Вне границ = заблокирован
        }
        
        // Проверяем покрашенную часть базы
        const centerX = Math.floor(this.width / 2);
        
        // База игрока 2 (вверху) - вся верхняя строка (y === 0)
        const isOnPlayer2Base = arrPos.y === 0;
        // База игрока 1 (внизу) состоит из двух строк:
        // 1. Предпоследняя строка (y === height - 2) с чётными индексами x (x % 2 === 0)
        // 2. Последняя строка (y === height - 1) с нечётными индексами x (x % 2 === 1)
        // Чётные столбцы (считая с 1): x=2,4,6,8,10,12,14 → индексы 1,3,5,7,9,11,13 (нечётные)
        const isOnPlayer1BaseRow1 = arrPos.y === this.height - 2 && arrPos.x % 2 === 0; // Предпоследняя строка, чётные x
        const isOnPlayer1BaseRow2 = arrPos.y === this.height - 1 && arrPos.x % 2 === 1; // Последняя строка, нечётные x
        const isOnPlayer1Base = isOnPlayer1BaseRow1 || isOnPlayer1BaseRow2;
        
        // Проверяем, является ли это воротами (доступны для рабочих)
        // Ворота игрока 2: центральная ячейка на верхней строке (вся строка покрашена)
        const isGatePlayer2 = arrPos.x === centerX && arrPos.y === 0;
        // Ворота игрока 1: центральная ячейка на предпоследней строке (height - 2) с чётным индексом x
        // или на последней строке (height - 1) с нечётным индексом x, если centerX нечётный
        const isGatePlayer1Row1 = arrPos.x === centerX && arrPos.y === this.height - 2 && centerX % 2 === 0;
        const isGatePlayer1Row2 = arrPos.x === centerX && arrPos.y === this.height - 1 && centerX % 2 === 1;
        const isGatePlayer1 = isGatePlayer1Row1 || isGatePlayer1Row2;
        const isGate = isGatePlayer2 || isGatePlayer1;
        
        // Если это покрашенная зона базы
        if (isOnPlayer1Base || isOnPlayer2Base) {
            // Для солдат (allowGates = false) - вся покрашенная зона блокируется
            // Для рабочих (allowGates = true) - только ворота доступны, остальная покрашенная зона блокируется
            if (!allowGates) {
                // Солдаты не могут проходить через покрашенную зону базы
                return true;
            } else {
                // Рабочие могут проходить только через ворота
                if (!isGate) {
                    // Это покрашенная зона, но не ворота - блокируем
                    return true;
                }
                // Это ворота - разрешаем проход для рабочих (продолжаем проверку препятствий)
            }
        }
        
        // Проверяем препятствия (камни и деревья)
        if (obstacleBloc) {
            const obstacle = obstacleBloc.getObstacleAt(arrPos.x, arrPos.y);
            if (obstacle) return true; // Препятствие блокирует путь
        }
        
        // Проверяем башни - используем array координаты для поиска
        if (towerBloc) {
            // TowerBloc.getTowerAt может ожидать hex, но мы проверим оба варианта
            const tower = towerBloc.getTowerAt(normalizedHex);
            if (!tower) {
                // Попробуем найти башню по array координатам
                const towerState = towerBloc.getState();
                const towerAtPos = towerState.towers.find(t => t.x === arrPos.x && t.y === arrPos.y);
                if (towerAtPos) return true;
            } else {
                return true; // Башня блокирует путь
            }
        }
        
        return false;
    }

    hexKey(hex) {
        // Уникальный ключ для гексагона (для использования в Map/Set)
        return `${hex.q},${hex.r},${hex.s}`;
    }

    findPath(startHex, targetHex, obstacleBloc = null, towerBloc = null, allowGates = false, allowObstacles = false) {
        // Очищаем предыдущую отладочную информацию
        this.lastPathfindingDebug = {
            startHex: null,
            targetHex: null,
            iterations: 0,
            finalOpenSetSize: 0,
            neighbors: [],
            error: null,
            startArr: null,
            targetArr: null,
            distance: null,
            iterationsDetails: [],
            pathFound: false
        };
        
        // Всегда используем A* алгоритм для правильного обхода препятствий
        // Нормализуем координаты
        startHex = this.hexRound(startHex);
        targetHex = this.hexRound(targetHex);
        
        const startArr = this.hexToArray(startHex);
        const targetArr = this.hexToArray(targetHex);
        
        this.lastPathfindingDebug.startHex = startHex;
        this.lastPathfindingDebug.targetHex = targetHex;
        this.lastPathfindingDebug.startArr = startArr;
        this.lastPathfindingDebug.targetArr = targetArr;
        
        // Проверка границ
        if (!this.isValidHex(startHex) || !this.isValidHex(targetHex)) {
            this.lastPathfindingDebug.error = `Старт или цель вне границ: старт arr(${startArr.x},${startArr.y}), цель arr(${targetArr.x},${targetArr.y}), границы: width=${this.width}, height=${this.height}`;
            return [];
        }
        
        // Если старт и цель совпадают
        if (startHex.q === targetHex.q && startHex.r === targetHex.r && startHex.s === targetHex.s) {
            return [startHex];
        }
        
        // Используем A* алгоритм
        return this.findPathAStar(startHex, targetHex, obstacleBloc, towerBloc, allowGates, allowObstacles);
    }
    
    findPathAStar(startHex, targetHex, obstacleBloc = null, towerBloc = null, allowGates = false, allowObstacles = false) {
        // Полный алгоритм A* для сложных случаев
        // ВАЖНО: алгоритм использует getHexNeighbors(), который правильно определяет соседей
        // для чётных и нечётных столбцов в odd-r offset координатах
        const openSet = new Set();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = this.hexKey(startHex);
        const targetKey = this.hexKey(targetHex);

        // Разрешаем старт даже если он заблокирован (солдат может стоять на препятствии)
        openSet.add(startKey);
        gScore.set(startKey, 0);
        const hStart = this.hexDistance(startHex, targetHex);
        fScore.set(startKey, hStart);

        const maxIterations = 2000; // Увеличиваем для большого поля с препятствиями
        let iterations = 0;

        while (openSet.size > 0 && iterations < maxIterations) {
            iterations++;
            
            let currentKey = null;
            let minF = Infinity;
            for (const key of openSet) {
                const f = fScore.get(key);
                // КРИТИЧЕСКИ ВАЖНО: используем !== undefined вместо ||, так как f может быть 0
                const fValue = f !== undefined ? f : Infinity;
                if (fValue < minF) {
                    minF = fValue;
                    currentKey = key;
                }
            }
            
            if (!currentKey) {
                // Детальная диагностика проблемы
                const openSetKeys = Array.from(openSet);
                const fScoresDebug = openSetKeys.map(key => {
                    const f = fScore.get(key);
                    const g = gScore.get(key);
                    return `${key}: f=${f !== undefined ? f.toFixed(2) : 'undefined'}, g=${g !== undefined ? g.toFixed(2) : 'undefined'}`;
                }).join(', ');
                
                this.lastPathfindingDebug.error = `Не найден currentKey после ${iterations} итераций. OpenSet size: ${openSet.size}. Узлы: [${fScoresDebug}]`;
                break;
            }
            
            if (currentKey === targetKey) {
                const path = [];
                let traceKey = currentKey;
                
                while (traceKey) {
                    const [q, r, s] = traceKey.split(',').map(Number);
                    path.unshift({ q, r, s });
                    
                    if (!cameFrom.has(traceKey)) break;
                    traceKey = cameFrom.get(traceKey);
                }
                
                this.lastPathfindingDebug.pathFound = true;
                this.lastPathfindingDebug.pathLength = path.length;
                this.lastPathfindingDebug.error = null;
                return path;
            }
            
            openSet.delete(currentKey);
            closedSet.add(currentKey);
            
            const [q, r, s] = currentKey.split(',').map(Number);
            const current = { q, r, s };
            
            const neighbors = this.getHexNeighbors(current);
            
            if (iterations === 1) {
                const currentArr = this.hexToArray(current);
                this.lastPathfindingDebug.neighbors = neighbors.map(n => {
                    const nArr = this.hexToArray(n);
                    return {
                        hex: `${n.q},${n.r},${n.s}`,
                        arr: `(${nArr.x},${nArr.y})`,
                        blocked: this.isBlocked(n, obstacleBloc, towerBloc, allowGates, allowObstacles)
                    };
                });
            }
            
            let unblockedNeighbors = 0;
            let addedToOpenSet = 0;
            const addedNodes = [];
            
            // Сохраняем информацию об итерации ДО обработки соседей
            let iterationDetail = null;
            if (iterations <= 10) {
                const [cq, cr, cs] = currentKey.split(',').map(Number);
                const currentArr = this.hexToArray({ q: cq, r: cr, s: cs });
                const currentDist = this.hexDistance({ q: cq, r: cr, s: cs }, targetHex);
                const currentF = fScore.get(currentKey);
                const currentG = gScore.get(currentKey);
                
                iterationDetail = {
                    iteration: iterations,
                    currentKey,
                    currentArr: `(${currentArr.x},${currentArr.y})`,
                    distanceToTarget: currentDist,
                    fScore: currentF !== undefined ? currentF.toFixed(2) : 'undefined',
                    gScore: currentG !== undefined ? currentG.toFixed(2) : 'undefined',
                    openSetSize: openSet.size,
                    closedSetSize: closedSet.size,
                    addedNodes: [],
                    unblockedNeighbors: 0,
                    addedToOpenSet: 0
                };
                this.lastPathfindingDebug.iterationsDetails.push(iterationDetail);
            }
            
            for (const neighbor of neighbors) {
                const neighborKey = this.hexKey(neighbor);
                
                if (closedSet.has(neighborKey)) continue;
                
                // Пропускаем заблокированные ячейки (но разрешаем цель даже если она заблокирована)
                if (neighborKey !== targetKey && this.isBlocked(neighbor, obstacleBloc, towerBloc, allowGates, allowObstacles)) {
                    continue;
                }
                
                unblockedNeighbors++;
                
                // КРИТИЧЕСКИ ВАЖНО: получаем gScore для текущего узла и соседа
                const currentGScoreValue = gScore.get(currentKey);
                const tentativeGScore = (currentGScoreValue !== undefined ? currentGScoreValue : 0) + 1;
                const neighborGScoreValue = gScore.get(neighborKey);
                
                // Если новый путь лучше или узел ещё не обработан
                if (neighborGScoreValue === undefined || tentativeGScore < neighborGScoreValue) {
                    cameFrom.set(neighborKey, currentKey);
                    gScore.set(neighborKey, tentativeGScore);
                    const h = this.hexDistance(neighbor, targetHex);
                    const newFScore = tentativeGScore + h;
                    fScore.set(neighborKey, newFScore);
                    
                    // ОТЛАДКА: проверяем, что значения установлены правильно
                    if (iterations === 1 && addedNodes.length < 3) {
                        const nArr = this.hexToArray(neighbor);
                        console.log(`[DEBUG] Добавляем соседа: ${neighborKey} = arr(${nArr.x},${nArr.y}), g=${tentativeGScore}, h=${h.toFixed(2)}, f=${newFScore.toFixed(2)}`);
                    }
                    
                    // Если узел ещё не в openSet, добавляем его
                    if (!openSet.has(neighborKey)) {
                        openSet.add(neighborKey);
                        addedToOpenSet++;
                        
                        if (iterationDetail) {
                            const nArr = this.hexToArray(neighbor);
                            addedNodes.push(`arr(${nArr.x},${nArr.y}) f=${newFScore.toFixed(1)}`);
                        }
                    }
                }
            }
            
            // Обновляем информацию об итерации после обработки соседей
            if (iterationDetail) {
                iterationDetail.addedNodes = addedNodes;
                iterationDetail.unblockedNeighbors = unblockedNeighbors;
                iterationDetail.addedToOpenSet = addedToOpenSet;
            }
            
            if (iterations === 1 && unblockedNeighbors === 0) {
                this.lastPathfindingDebug.error = `Нет свободных соседей для старта! Все ${neighbors.length} соседей заблокированы.`;
            }
            
            // Если на текущей итерации не добавлено ни одного узла в openSet и openSet стал пустым
            if (openSet.size === 0 && iterations > 1) {
                this.lastPathfindingDebug.error = `OpenSet стал пустым после ${iterations} итераций. Добавлено узлов на последней итерации: ${addedToOpenSet}, свободных соседей: ${unblockedNeighbors}`;
                break;
            }
        }
        
        this.lastPathfindingDebug.iterations = iterations;
        this.lastPathfindingDebug.finalOpenSetSize = openSet.size;
        this.lastPathfindingDebug.pathFound = false;
        
        if (!this.lastPathfindingDebug.error) {
            if (iterations >= maxIterations) {
                this.lastPathfindingDebug.error = `Достигнут лимит итераций (${maxIterations}). OpenSet size: ${openSet.size}`;
            } else {
                this.lastPathfindingDebug.error = `Путь не найден после ${iterations} итераций. OpenSet size: ${openSet.size}`;
            }
        }
        
        return [];
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
