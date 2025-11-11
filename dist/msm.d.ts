// msm.d.ts
interface Monster {
  name: string;
  description: string;
  image: string;
  cost: string;
  islands: string[];
  like(): string;
  info(): string;
  statistics(): {
    name: string;
    islands: number;
    cost: string;
    description: string;
  };
}

interface MSMType {
  getMonster(name: string): Promise<Monster>;
  monster(name: string): Promise<Monster>;
}

declare const MSM: MSMType;

export = MSM;
