export class PlayerBloc {
    constructor(gameBloc) {
        this.gameBloc = gameBloc;
        this.state = {
            selectedTowerType: null,
            selectedSoldierType: null,
            selectedCell: null
        };
        this.listeners = [];
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

    selectTowerType(type) {
        console.log('PlayerBloc.selectTowerType вызван с типом:', type);
        this.state.selectedTowerType = type;
        this.state.selectedSoldierType = null;
        console.log('Состояние PlayerBloc после выбора:', { ...this.state });
        this.emit();
    }

    selectSoldierType(type) {
        this.state.selectedSoldierType = type;
        this.state.selectedTowerType = null;
        this.emit();
    }

    selectCell(hex) {
        this.state.selectedCell = hex;
        this.emit();
    }

    clearSelection() {
        this.state.selectedTowerType = null;
        this.state.selectedSoldierType = null;
        this.state.selectedCell = null;
        this.emit();
    }

    getState() {
        return { ...this.state };
    }
}
