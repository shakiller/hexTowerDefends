export class PlayerBloc {
    constructor(gameBloc) {
        this.gameBloc = gameBloc;
        this.state = {
            selectedTowerType: null,
            selectedSoldierType: null,
            selectedObstacleType: null, // 'stone' или 'tree'
            selectedCell: null,
            testNeighborsMode: false, // Режим тестирования соседей
            testSelectedHex: null // Выбранный hex для тестирования
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

    selectObstacleType(type) {
        this.state.selectedObstacleType = type;
        this.state.selectedTowerType = null;
        this.state.selectedSoldierType = null;
        this.emit();
    }

    clearSelection() {
        this.state.selectedTowerType = null;
        this.state.selectedSoldierType = null;
        this.state.selectedObstacleType = null;
        this.state.selectedCell = null;
        this.emit();
    }

    toggleTestNeighborsMode() {
        this.state.testNeighborsMode = !this.state.testNeighborsMode;
        if (!this.state.testNeighborsMode) {
            this.state.testSelectedHex = null;
        }
        this.emit();
    }

    setTestSelectedHex(hex) {
        this.state.testSelectedHex = hex;
        this.emit();
    }

    getState() {
        return { ...this.state };
    }
}
