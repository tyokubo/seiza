export type Id = string;

export type Point2D = {
  x: number;
  y: number;
};

export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type Star = {
  id: Id;
  position: Point2D;
  brightness: number;
};

export type Sky = {
  id: Id;
  periodKey: string;
  generatorVersion: number;
  stars: Star[];
};
