export class GoldBloc {
    constructor(hexGrid) {
        this.hexGrid = hexGrid;
        this.state = {
            goldPiles: [] // {id, x, y, amount, collected}
        };
        this.listeners = [];
        this.goldIdCounter = 0;
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    emit() {
        this.listeners.forEach(listener => listener(this.state));
    }

    /**
     * Создаёт золото на поле - одинаковое количество на обеих половинах
     * Исключает покрашенную зону базы (верхняя строка и нижняя строка с нечётными индексами)
     */
    generateGold(amountPerSide, pilesPerSide) {
        this.state.goldPiles = [];
        this.goldIdCounter = 0;

        // Разделяем поле пополам, исключая границы и покрашенную зону базы
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        const centerX = Math.floor(this.hexGrid.width / 2);
        
        // Функция проверки, можно ли разместить золото на этой позиции
        const canPlaceGold = (x, y) => {
            // Проверяем границы
            if (y < 1 || y >= this.hexGrid.height - 1) {
                return false; // Не на границах
            }
            
            // Проверяем покрашенную зону базы игрока 2 (вся верхняя строка y === 0)
            if (y === 0) {
                return false;
            }
            
            // Проверяем покрашенную зону базы игрока 1
            // База игрока 1 состоит из двух строк:
            // 1. Предпоследняя строка (y === height - 2) с чётными индексами x (x % 2 === 0)
            // 2. Последняя строка (y === height - 1) с нечётными индексами x (x % 2 === 1)
            const isOnPlayer1BaseRow1 = y === this.hexGrid.height - 2 && x % 2 === 0; // Предпоследняя строка, чётные x
            const isOnPlayer1BaseRow2 = y === this.hexGrid.height - 1 && x % 2 === 1; // Последняя строка, нечётные x
            if (isOnPlayer1BaseRow1 || isOnPlayer1BaseRow2) {
                return false; // Покрашенная зона базы игрока 1
            }
            
            return true;
        };
        
        // Нижняя половина (игрок 1), но не на границах и не в покрашенной зоне
        for (let i = 0; i < pilesPerSide; i++) {
            let x, y, hex;
            let attempts = 0;
            do {
                x = Math.floor(Math.random() * this.hexGrid.width);
                // Нижняя половина, но не на границах
                // Диапазон: от halfHeight + 1 до height - 2
                const minY = Math.max(halfHeight + 1, 1);
                const maxY = Math.max(this.hexGrid.height - 2, minY);
                y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
                hex = this.hexGrid.arrayToHex(x, y);
                attempts++;
            } while ((!this.hexGrid.isValidHex(hex) || !canPlaceGold(x, y)) && attempts < 100);
            
            // Проверяем валидность и что можно разместить
            if (this.hexGrid.isValidHex(hex) && canPlaceGold(x, y)) {
                this.state.goldPiles.push({
                    id: this.goldIdCounter++,
                    x,
                    y,
                    amount: amountPerSide,
                    collected: false
                });
            }
        }

        // Верхняя половина (игрок 2), но не на границах и не в покрашенной зоне
        for (let i = 0; i < pilesPerSide; i++) {
            let x, y, hex;
            let attempts = 0;
            do {
                x = Math.floor(Math.random() * this.hexGrid.width);
                // Верхняя половина, но не на границах
                // Диапазон: от 1 до halfHeight - 1
                const minY = 1;
                const maxY = Math.max(halfHeight - 1, minY);
                y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
                hex = this.hexGrid.arrayToHex(x, y);
                attempts++;
            } while ((!this.hexGrid.isValidHex(hex) || !canPlaceGold(x, y)) && attempts < 100);
            
            // Проверяем валидность и что можно разместить
            if (this.hexGrid.isValidHex(hex) && canPlaceGold(x, y)) {
                this.state.goldPiles.push({
                    id: this.goldIdCounter++,
                    x,
                    y,
                    amount: amountPerSide,
                    collected: false
                });
            }
        }

        this.emit();
    }

    getGoldAt(x, y) {
        return this.state.goldPiles.find(pile => pile.x === x && pile.y === y && !pile.collected);
    }

    collectGold(goldId, amount) {
        const pile = this.state.goldPiles.find(p => p.id === goldId);
        if (!pile || pile.collected) return 0;

        const collected = Math.min(amount, pile.amount);
        pile.amount -= collected;

        if (pile.amount <= 0) {
            pile.collected = true;
        }

        this.emit();
        return collected;
    }

    /**
     * Удаляет золото с базы (если оно там есть по ошибке)
     */
    removeGoldFromBase(obstacleBloc, towerBloc) {
        const centerX = Math.floor(this.hexGrid.width / 2);
        let removed = false;
        
        this.state.goldPiles = this.state.goldPiles.filter(pile => {
            if (pile.collected) return true; // Уже собрано
            
            const pileHex = this.hexGrid.arrayToHex(pile.x, pile.y);
            // Проверяем, находится ли золото на базе (заблокировано для рабочих)
            const isBlocked = this.hexGrid.isBlocked(pileHex, obstacleBloc, towerBloc, false);
            
            if (isBlocked) {
                console.warn(`Удаляем золото с базы: (${pile.x}, ${pile.y}), количество: ${pile.amount}`);
                removed = true;
                return false; // Удаляем это золото
            }
            return true;
        });
        
        if (removed) {
            this.emit();
        }
        
        return removed;
    }

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state.goldPiles = [];
        this.goldIdCounter = 0;
        this.emit();
    }
}

