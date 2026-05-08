export interface EditAction {
  type: string;
  timestamp: number;
  forward: () => void;
  backward: () => void;
}

export class UndoManager {
  private undoStack: EditAction[] = [];
  private redoStack: EditAction[] = [];
  private maxDepth = 50;

  pushAction(action: EditAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;
    action.backward();
    this.redoStack.push(action);
    return true;
  }

  redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;
    action.forward();
    this.undoStack.push(action);
    return true;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  clear(): void { this.undoStack = []; this.redoStack = []; }
}
