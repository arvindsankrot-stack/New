import { v4 as uuid } from "uuid";

// Paper trading only: fake money, manually-entered prices, no market data feed,
// no exchange or brokerage connection of any kind. This exists so a published
// idea can be tracked and scored over time without any real funds ever moving.
export type PositionSide = "long" | "short";
export type PositionStatus = "open" | "closed";

export interface PaperPosition {
  id: string;
  taskId?: string;
  label: string;
  side: PositionSide;
  entryPrice: number;
  quantity: number;
  status: PositionStatus;
  exitPrice?: number;
  pnl?: number;
  openedAt: string;
  closedAt?: string;
}

class PaperPortfolio {
  private positions = new Map<string, PaperPosition>();

  open(label: string, side: PositionSide, entryPrice: number, quantity: number, taskId?: string): PaperPosition {
    const position: PaperPosition = {
      id: uuid(),
      taskId,
      label,
      side,
      entryPrice,
      quantity,
      status: "open",
      openedAt: new Date().toISOString(),
    };
    this.positions.set(position.id, position);
    return position;
  }

  close(id: string, exitPrice: number): PaperPosition | undefined {
    const position = this.positions.get(id);
    if (!position || position.status === "closed") return undefined;

    const direction = position.side === "long" ? 1 : -1;
    position.exitPrice = exitPrice;
    position.pnl = (exitPrice - position.entryPrice) * position.quantity * direction;
    position.status = "closed";
    position.closedAt = new Date().toISOString();
    return position;
  }

  list(): PaperPosition[] {
    return Array.from(this.positions.values()).sort((a, b) =>
      b.openedAt.localeCompare(a.openedAt),
    );
  }
}

export const paperPortfolio = new PaperPortfolio();
