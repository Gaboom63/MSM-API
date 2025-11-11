// msm.d.ts

/** 
 * Represents a Monster in My Singing Monsters
 */
interface Monster {
  name: string;
  description: string;
  image: string;
  cost: string;
  islands: string[];

  /** Returns a "liked" message */
  like(): string;

  /** Returns info about cost and islands */
  info(): string;

  /** Returns statistics object */
  statistics(): {
    name: string;
    islands: number;
    cost: string;
    description: string;
  };
}

/**
 * The global MSM API
 */
interface MSMType {
  /** Get a monster by name */
  getMonster(name: string): Promise<Monster>;

  /** Alias for getMonster */
  monster(name: string): Promise<Monster>;
}

/** Global variable exposed by msm.js */
declare const MSM: MSMType;

export = MSM;
