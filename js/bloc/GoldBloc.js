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
     */
    generateGold(amountPerSide, pilesPerSide) {
        this.state.goldPiles = [];
        this.goldIdCounter = 0;

        // Разделяем поле пополам
        const halfHeight = Math.floor(this.hexGrid.height / 2);
        
        // Нижняя половина (игрок 1)
        for (let i = 0; i < pilesPerSide; i++) {
            const x = Math.floor(Math.random() * this.hexGrid.width);
            const y = Math.floor(Math.random() * halfHeight) + halfHeight; // Нижняя половина
            const hex = this.hexGrid.arrayToHex(x, y);
            
            // Проверяем валидность
            if (this.hexGrid.isValidHex(hex)) {
                this.state.goldPiles.push({
                    id: this.goldIdCounter++,
                    x,
                    y,
                    amount: amountPerSide,
                    collected: false
                });
            }
        }

        // Верхняя половина (игрок 2)
        for (let i = 0; i < pilesPerSide; i++) {
            const x = Math.floor(Math.random() * this.hexGrid.width);
            const y = Math.floor(Math.random() * halfHeight); // Верхняя половина
            const hex = this.hexGrid.arrayToHex(x, y);
            
            // Проверяем валидность
            if (this.hexGrid.isValidHex(hex)) {
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

    getState() {
        return { ...this.state };
    }

    reset() {
        this.state.goldPiles = [];
        this.goldIdCounter = 0;
        this.emit();
    }
}

