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
            // Это нормальная ситуация - контейнер может быть скрыт при инициализации
            // Используем размеры окна как запасной вариант (без предупреждения)
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
        
        // Сетка рисуется до height - 2 (предпоследняя строка), чтобы база была на НОВОЙ строке height - 1
        for (let x = 0; x < this.hexGrid.width; x++) {
            for (let y = 0; y < this.hexGrid.height - 1; y++) { // Сетка до y = 50 (height - 2)
                const hex = this.hexGrid.arrayToHex(x, y);
                
                // Подсветка чётных ячеек (x=0,2,4,6,8,10,12,14) на предпоследнем ряду (y=50)
                let fillColor = '#1a3a5a';
                let strokeColor = '#2a4a6a';
                if (y === this.hexGrid.height - 2 && x % 2 === 0) {
                    fillColor = 'rgba(74, 144, 226, 0.3)'; // Светлая синяя заливка
                    strokeColor = '#4a90e2'; // Синяя граница
                }
                
                this.hexGrid.drawHex(
                    this.ctx,
                    hex,
                    fillColor,
                    strokeColor
                );
            }
        }
        
        this.ctx.restore();
    }

    drawTowers(towers, testTowersMode = false) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        const currentTime = performance.now();
        
        towers.forEach(tower => {
            const hex = this.hexGrid.arrayToHex(tower.x, tower.y);
            const pixelPos = this.hexGrid.hexToPixel(hex);
            
            // Размер башни зависит от типа
            const isStrong = tower.type === 'strong';
            const baseSize = this.hexGrid.hexSize * 0.6;
            const size = isStrong ? baseSize * 1.3 : baseSize; // Большая башня больше
            
            // Визуализация радиуса в тестовом режиме (используя логику соседей)
            if (testTowersMode || tower.testAngle !== undefined) {
                // Получаем все гексы в радиусе на основе логики соседей
                const hexesInRange = this.hexGrid.getHexesInRange(hex, tower.range);
                
                // Рисуем каждый гекс в радиусе
                hexesInRange.forEach(rangeHex => {
                    if (this.hexGrid.hexKey(rangeHex) === this.hexGrid.hexKey(hex)) {
                        return; // Пропускаем центральный гекс
                    }
                    const rangePixel = this.hexGrid.hexToPixel(rangeHex);
                    const alpha = testTowersMode ? 0.3 : 0.15;
                    this.hexGrid.drawHex(this.ctx, rangeHex, `rgba(255, 255, 0, ${alpha})`, `rgba(255, 255, 0, ${alpha * 2})`);
                });
            }
            
            // Рисуем прямоугольник-башню
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
            
            // Визуализация выстрела (если был недавний выстрел)
            if (tower.lastShotTarget && (currentTime - tower.lastShotTarget.time) < 300) {
                const targetHex = this.hexGrid.arrayToHex(tower.lastShotTarget.x, tower.lastShotTarget.y);
                const targetPixel = this.hexGrid.hexToPixel(targetHex);
                
                // Для большой башни - анимация зоны поражения
                if (tower.lastShotTarget.isAreaAttack) {
                    const timeSinceShot = currentTime - tower.lastShotTarget.time;
                    const animationProgress = Math.min(timeSinceShot / 300, 1.0); // 0.0 - 1.0 за 300мс
                    
                    // Рисуем линию выстрела
                    this.ctx.strokeStyle = '#ff6600';
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.moveTo(pixelPos.x, pixelPos.y);
                    this.ctx.lineTo(targetPixel.x, targetPixel.y);
                    this.ctx.stroke();
                    
                    // Анимация взрыва (расширяющийся круг)
                    const maxRadius = this.hexGrid.hexSize * 1.5;
                    const currentRadius = maxRadius * animationProgress;
                    const alpha = 1.0 - animationProgress; // Затухание
                    
                    // Внешний круг взрыва
                    this.ctx.strokeStyle = `rgba(255, 100, 0, ${alpha * 0.8})`;
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.arc(targetPixel.x, targetPixel.y, currentRadius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Внутренний круг взрыва
                    this.ctx.fillStyle = `rgba(255, 200, 0, ${alpha * 0.4})`;
                    this.ctx.beginPath();
                    this.ctx.arc(targetPixel.x, targetPixel.y, currentRadius * 0.7, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Подсветка целевой ячейки
                    const fillAlpha = alpha * 0.3;
                    const strokeAlpha = alpha * 0.6;
                    this.hexGrid.drawHex(this.ctx, targetHex, `rgba(255, 100, 0, ${fillAlpha})`, `rgba(255, 100, 0, ${strokeAlpha})`);
                } else {
                    // Маленькая башня - обычная линия выстрела
                    this.ctx.strokeStyle = '#ffff00';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(pixelPos.x, pixelPos.y);
                    this.ctx.lineTo(targetPixel.x, targetPixel.y);
                    this.ctx.stroke();
                }
                
                // Рисуем вспышку на башне
                this.ctx.fillStyle = tower.type === 'strong' ? 'rgba(255, 100, 0, 0.5)' : 'rgba(255, 255, 0, 0.5)';
                this.ctx.fillRect(
                    pixelPos.x - size / 2,
                    pixelPos.y - size / 2,
                    size,
                    size
                );
            }
            
            // Отображение здоровья башни
            if (tower.health < tower.maxHealth) {
                const hpPercent = tower.health / tower.maxHealth;
                const barWidth = size;
                const barHeight = 4;
                const barY = pixelPos.y - size / 2 - 8;
                
                // Фон полоски здоровья
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(
                    pixelPos.x - barWidth / 2,
                    barY,
                    barWidth,
                    barHeight
                );
                
                // Полоска здоровья
                this.ctx.fillStyle = hpPercent > 0.5 ? '#4a90e2' : '#e24a4a';
                this.ctx.fillRect(
                    pixelPos.x - barWidth / 2,
                    barY,
                    barWidth * hpPercent,
                    barHeight
                );
            }
        });
        
        this.ctx.restore();
    }

    drawGold(goldPiles) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        goldPiles.forEach(pile => {
            if (pile.collected) return;
            
            const hex = this.hexGrid.arrayToHex(pile.x, pile.y);
            const pixelPos = this.hexGrid.hexToPixel(hex);
            
            // Рисуем золото как жёлтый круг
            const size = this.hexGrid.hexSize * 0.3;
            this.ctx.fillStyle = '#ffd700';
            this.ctx.strokeStyle = '#ffaa00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(pixelPos.x, pixelPos.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Показываем количество золота
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.strokeText(pile.amount, pixelPos.x, pixelPos.y);
            this.ctx.fillText(pile.amount, pixelPos.x, pixelPos.y);
        });
        
        this.ctx.restore();
    }

    drawWorkers(workers) {
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Используем те же множители что и в hexToPixel
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        workers.forEach(worker => {
            // Движение от центра одной ячейки к центру другой (аналогично солдатам)
            const currentHexIndex = Math.floor(worker.currentHexIndex);
            let pixelPos;
            
            if (!worker.path || currentHexIndex >= worker.path.length - 1) {
                // Достигли цели или путь не найден, рисуем на текущей позиции
                const hex = this.hexGrid.arrayToHex(worker.x, worker.y);
                pixelPos = this.hexGrid.hexToPixel(hex);
            } else {
                const currentHex = worker.path[currentHexIndex];
                const nextHex = worker.path[currentHexIndex + 1];
                const currentPixel = this.hexGrid.hexToPixel(currentHex);
                const nextPixel = this.hexGrid.hexToPixel(nextHex);
                
                // Интерполяция между центрами ячеек
                pixelPos = {
                    x: currentPixel.x + (nextPixel.x - currentPixel.x) * worker.moveProgress,
                    y: currentPixel.y + (nextPixel.y - currentPixel.y) * worker.moveProgress
                };
            }
            
            this.drawWorkerAt(pixelPos, worker);
        });
        
        this.ctx.restore();
    }

    drawWorkerAt(pixelPos, worker) {
        this.ctx.save();
        this.ctx.translate(pixelPos.x, pixelPos.y);
        this.ctx.rotate(worker.direction || 0);

        const size = this.hexGrid.hexSize * 0.35;
        const color = worker.playerId === 1 ? '#90e24a' : '#e24a4a'; // Зелёный/красный
        
        // Разные цвета для разных типов рабочих
        if (worker.type === 'builder') {
            this.ctx.fillStyle = worker.playerId === 1 ? '#4a90e2' : '#e24a4a'; // Синий/красный для строителей
        } else {
            this.ctx.fillStyle = color; // Зелёный/красный для сборщиков
        }

        // Рисуем квадрат для рабочего
        this.ctx.fillRect(-size / 2, -size / 2, size, size);
        
        // Если несёт золото - показываем индикатор
        if (worker.carryingGold && worker.goldAmount > 0) {
            this.ctx.fillStyle = '#ffd700';
            this.ctx.beginPath();
            this.ctx.arc(size / 2, -size / 2, size * 0.2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // HP bar
        const hpPercent = worker.health / worker.maxHealth;
        this.ctx.fillStyle = hpPercent > 0.5 ? '#4a90e2' : '#e24a4a';
        this.ctx.fillRect(-size / 2, -size / 2 - 5, size * hpPercent, 3);

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
            // Движение от центра одной ячейки к центру другой
            const currentHexIndex = Math.floor(soldier.currentHexIndex);
            if (!soldier.path || currentHexIndex >= soldier.path.length - 1) {
                // Достигли цели или путь не найден, рисуем на текущей позиции
                const hex = this.hexGrid.arrayToHex(soldier.x, soldier.y);
                const pixelPos = this.hexGrid.hexToPixel(hex);
                this.drawSoldierAt(pixelPos, soldier);
                return;
            }
            
            const currentHex = soldier.path[currentHexIndex];
            const nextHex = soldier.path[currentHexIndex + 1];
            const currentPixel = this.hexGrid.hexToPixel(currentHex);
            const nextPixel = this.hexGrid.hexToPixel(nextHex);
            
            // Интерполяция между центрами ячеек на основе moveProgress
            const progress = soldier.moveProgress || 0;
            const pixelPos = {
                x: currentPixel.x + (nextPixel.x - currentPixel.x) * progress,
                y: currentPixel.y + (nextPixel.y - currentPixel.y) * progress
            };
            
            // Рисуем солдата с поворотом
            this.drawSoldierAt(pixelPos, soldier);
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
        
        // База игрока 1 (внизу) - НОВАЯ строка (height - 1), только чётные ячейки
        // Если считать с 1: x=1,2,3... → чётные это x=2,4,6,8,10,12,14 (индексы 1,3,5... - нечётные индексы!)
        const player1BaseY = this.hexGrid.height - 1; // Новая строка (y = 51 при height = 52)
        for (let x = 0; x < this.hexGrid.width; x++) {
            // Только чётные столбцы (считая с 1): x=2,4,6,8,10,12,14 (индексы 1,3,5,7,9,11,13)
            if (x % 2 === 1) { // Нечётный индекс = чётный столбец (считая с 1)
                const hex = this.hexGrid.arrayToHex(x, player1BaseY);
                // Более яркий цвет для лучшей видимости - это новый ряд ниже сетки
                this.hexGrid.drawHex(this.ctx, hex, 'rgba(74, 144, 226, 0.9)', '#4a90e2');
            }
        }
        
        // База игрока 2 (вверху) - верхняя строка по всей ширине
        const player2BaseY = 0; // Верхняя строка
        for (let x = 0; x < this.hexGrid.width; x++) {
            const hex = this.hexGrid.arrayToHex(x, player2BaseY);
            // Более яркая заливка для лучшей видимости
            this.hexGrid.drawHex(this.ctx, hex, 'rgba(226, 74, 74, 0.7)', '#e24a4a');
        }
        
        this.ctx.restore();
    }

    drawGates() {
        this.ctx.save();
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        // Ворота игрока 1 (внизу по центру) - ближайшая чётная позиция к центру (считая с 1)
        // Ворота игрока 1 (внизу по центру) - центр (индекс 7 → столбец 8, чётный с 1)
        const centerX = Math.floor(this.hexGrid.width / 2); // Центр индекс 7 → столбец 8 (чётный с 1)
        const gateX = centerX; // Индекс 7 → столбец 8 (чётный с 1) - это и есть центр
        const player1GateY = this.hexGrid.height - 1; // Новая строка базы
        const hex1 = this.hexGrid.arrayToHex(gateX, player1GateY);
        
        // Рисуем арку ворот игрока 1 (желтая рамка)
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
        this.ctx.lineWidth = 4;
        this.hexGrid.drawHex(this.ctx, hex1, 'rgba(255, 255, 0, 0.2)', '#ffff00');
        
        // Ворота игрока 2 (вверху по центру) - x=центр, y=верх
        const player2GateY = 0; // Верхняя строка
        const hex2 = this.hexGrid.arrayToHex(centerX, player2GateY);
        
        // Рисуем арку ворот игрока 2 (желтая рамка)
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
        this.ctx.lineWidth = 4;
        this.hexGrid.drawHex(this.ctx, hex2, 'rgba(255, 255, 0, 0.2)', '#ffff00');
        
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

    drawHoverCell(hex) {
        if (!hex || !this.hexGrid.isValidHex(hex)) return;
        
        this.ctx.save();
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        // Подсветка ячейки под курсором
        this.hexGrid.drawHex(this.ctx, hex, 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.4)');
        
        this.ctx.restore();
    }

    drawSoldierAt(pixelPos, soldier) {
        this.ctx.save();
        
        // Если солдат бьёт дерево, добавляем анимацию удара (движение вперёд-назад)
        let offsetX = 0;
        let offsetY = 0;
        if (soldier.destroyingTree && soldier.treeHitProgress !== undefined) {
            // Анимация удара: идём вперёд с ускорением и откатываемся назад
            const hitPhase = soldier.treeHitProgress;
            const attackDistance = this.hexGrid.hexSize * 0.3; // Расстояние атаки
            
            if (hitPhase < 0.5) {
                // Идём вперёд с ускорением (0.0 -> 0.5)
                const t = hitPhase * 2; // 0.0 -> 1.0
                const easedT = t * t; // Квадратичное ускорение
                const distance = attackDistance * easedT;
                offsetX = Math.cos(soldier.treeDirection || 0) * distance;
                offsetY = Math.sin(soldier.treeDirection || 0) * distance;
            } else {
                // Откатываемся назад (0.5 -> 1.0)
                const t = (hitPhase - 0.5) * 2; // 0.0 -> 1.0
                const easedT = 1 - (1 - t) * (1 - t); // Квадратичное замедление
                const distance = attackDistance * (1 - easedT);
                offsetX = Math.cos(soldier.treeDirection || 0) * distance;
                offsetY = Math.sin(soldier.treeDirection || 0) * distance;
            }
        }
        
        // Перемещаемся в позицию солдата с учётом анимации удара
        this.ctx.translate(pixelPos.x + offsetX, pixelPos.y + offsetY);
        
        // Поворачиваем в сторону движения (или к цели разрушения)
        const rotation = soldier.destroyingTree ? soldier.treeDirection : (soldier.direction || 0);
        if (rotation !== undefined) {
            this.ctx.rotate(rotation);
        }
        
        // Размер и цвет зависят от типа солдата
        const isStrong = soldier.type === 'strong';
        const baseSize = this.hexGrid.hexSize * 0.4;
        const size = isStrong ? baseSize * 1.5 : baseSize; // Сильный солдат больше
        
        // Цвета: базовый - зелёный/оранжевый, сильный - тёмно-синий/тёмно-красный
        let fillColor;
        if (isStrong) {
            fillColor = soldier.playerId === 1 ? '#2a4a7a' : '#7a2a4a'; // Тёмные цвета для сильного
        } else {
            fillColor = soldier.playerId === 1 ? '#90e24a' : '#e2904a'; // Яркие цвета для базового
        }
        this.ctx.fillStyle = fillColor;
        
        // Рисуем треугольник (стрелка) вместо прямоугольника
        this.ctx.beginPath();
        this.ctx.moveTo(size / 2, 0); // Остриё стрелки впереди
        this.ctx.lineTo(-size / 2, -size / 2); // Левый задний угол
        this.ctx.lineTo(-size / 3, 0); // Центр задней части
        this.ctx.lineTo(-size / 2, size / 2); // Правый задний угол
        this.ctx.closePath();
        this.ctx.fill();
        
        // HP бар (рисуем до поворота, чтобы он всегда был горизонтальным)
        this.ctx.restore();
        this.ctx.save();
        this.ctx.translate(pixelPos.x, pixelPos.y);
        const hpPercent = soldier.health / soldier.maxHealth;
        this.ctx.fillStyle = hpPercent > 0.5 ? '#4a90e2' : '#e24a4a';
        this.ctx.fillRect(
            -size / 2,
            -size / 2 - 5,
            size * hpPercent,
            3
        );
        
        // Визуализация атаки солдата по башне
        if (soldier.attackTarget) {
            const currentTime = performance.now();
            const timeSinceAttack = currentTime - soldier.attackTarget.time;
            if (timeSinceAttack < 200) {
                const targetHex = this.hexGrid.arrayToHex(soldier.attackTarget.x, soldier.attackTarget.y);
                const targetPixel = this.hexGrid.hexToPixel(targetHex);
                
                // Рисуем линию атаки
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                const dx = targetPixel.x - pixelPos.x;
                const dy = targetPixel.y - pixelPos.y;
                this.ctx.lineTo(dx, dy);
                this.ctx.stroke();
                
                // Вспышка на цели
                const alpha = 1.0 - (timeSinceAttack / 200);
                this.ctx.fillStyle = `rgba(0, 255, 0, ${alpha * 0.5})`;
                this.ctx.beginPath();
                this.ctx.arc(dx, dy, this.hexGrid.hexSize * 0.3, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        this.ctx.restore();
    }

    drawTestNeighbors(selectedHex) {
        if (!selectedHex) return;
        
        this.ctx.save();
        
        // Применяем виртуальный скролл
        this.ctx.translate(-this.scrollX, -this.scrollY);
        
        // Применяем тот же offset что и для сетки
        const horizontalMultiplier = 0.87;
        const totalWidth = this.hexGrid.width * this.hexGrid.hexWidth * horizontalMultiplier;
        const offsetX = Math.max(0, (this.fieldWidth - totalWidth) / 2);
        const offsetY = this.hexGrid.hexSize;
        this.ctx.translate(offsetX, offsetY);
        
        // Нормализуем выбранный hex
        const normalizedHex = this.hexGrid.hexRound(selectedHex);
        
        // Проверяем валидность
        if (!this.hexGrid.isValidHex(normalizedHex)) {
            this.ctx.restore();
            return;
        }
        
        // Получаем array координаты для отображения
        const arrPos = this.hexGrid.hexToArray(normalizedHex);
        
        // Подсветка выбранной ячейки (красным) - более яркая
        this.hexGrid.drawHex(this.ctx, normalizedHex, 'rgba(255, 0, 0, 0.5)', 'rgba(255, 0, 0, 1.0)');
        
        // Отображаем координаты на выбранной ячейке
        const pixelPos = this.hexGrid.hexToPixel(normalizedHex);
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = 'bold 10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const coordText = `${arrPos.x},${arrPos.y}`;
        this.ctx.strokeText(coordText, pixelPos.x, pixelPos.y);
        this.ctx.fillText(coordText, pixelPos.x, pixelPos.y);
        
        // Получаем соседей
        const neighbors = this.hexGrid.getHexNeighbors(normalizedHex);
        
        // Подсветка соседей (зелёным) - более яркая
        neighbors.forEach((neighbor, index) => {
            this.hexGrid.drawHex(this.ctx, neighbor, 'rgba(0, 255, 0, 0.5)', 'rgba(0, 255, 0, 1.0)');
            
            // Отображаем координаты на соседях
            const neighborArr = this.hexGrid.hexToArray(neighbor);
            const neighborPixelPos = this.hexGrid.hexToPixel(neighbor);
            const neighborCoordText = `${neighborArr.x},${neighborArr.y}`;
            this.ctx.strokeText(neighborCoordText, neighborPixelPos.x, neighborPixelPos.y);
            this.ctx.fillText(neighborCoordText, neighborPixelPos.x, neighborPixelPos.y);
        });
        
        this.ctx.restore();
    }

    render(gameState, towerState, soldierState, playerState, mousePosition = null, obstacleState = null, goldState = null, workerState = null) {
        this.clear();
        this.drawGrid();
        this.drawBases();
        this.drawGates();
        
        // Рисуем препятствия перед башнями и солдатами
        if (obstacleState && obstacleState.obstacles) {
            this.drawObstacles(obstacleState.obstacles);
        }
        
        // Подсветка доступных ячеек для размещения (только для башен, солдаты создаются сразу)
        if (playerState.selectedTowerType) {
            this.drawPlacementPreview(gameState, playerState, towerState, obstacleState);
        }
        
        this.drawTowers(towerState.towers, playerState.testTowersMode);
        
        // Рисуем золото перед рабочими и солдатами
        if (goldState && goldState.goldPiles) {
            this.drawGold(goldState.goldPiles);
        }
        
        // Рисуем рабочих перед солдатами
        if (workerState && workerState.workers) {
            this.drawWorkers(workerState.workers);
        }
        
        this.drawSoldiers(soldierState.soldiers);
        
        if (playerState.selectedCell) {
            this.drawSelection(playerState.selectedCell, 'yellow');
        }
        
        // Подсветка ячейки под курсором мыши
        if (mousePosition && mousePosition.hex) {
            this.drawHoverCell(mousePosition.hex);
        }
        
        // Тестовый режим: подсветка соседей
        if (playerState.testNeighborsMode && playerState.testSelectedHex) {
            this.drawTestNeighbors(playerState.testSelectedHex);
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
                // Не подсвечиваем предпоследний ряд (y = height - 2) в режиме установки башен
                // Сетка до height - 2, затем пропускаем предпоследний ряд, затем последний ряд (база)
                for (let y = 0; y < this.hexGrid.height - 2; y++) {
                    const hex = this.hexGrid.arrayToHex(x, y);
                    const existingTower = towerState.towers.find(t => t.x === x && t.y === y);
                    
                    // Не ставим башни на базе игрока 2 (верхняя строка y === 0)
                    if (y === 0) continue;
                    
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
        
        // Солдаты теперь создаются сразу при нажатии на кнопку, подсветка не нужна
        
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
