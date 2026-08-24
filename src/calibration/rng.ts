/**
 * Générateur pseudo-aléatoire déterministe.
 *
 * Une calibration doit être reproductible à l'identique : sans cela, le
 * validateur indépendant ne peut ni rejouer l'exercice, ni distinguer un
 * résultat robuste d'un tirage favorable. `Math.random()` est donc proscrit
 * dans toute la chaîne de calibration.
 *
 * Algorithme : xoshiro128** — période 2^128−1, qualité statistique largement
 * suffisante ici, et surtout entièrement spécifié par sa graine.
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new Error("La graine doit être un entier : une calibration doit se rejouer à l'identique.");
    }
    // splitmix32 pour disperser une graine scalaire sur les quatre mots d'état.
    let z = seed >>> 0;
    const next = () => {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    // Un état entièrement nul est absorbant : on l'écarte.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Entier non signé sur 32 bits. */
  nextUint32(): number {
    const rot = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
    const result = Math.imul(rot(Math.imul(this.s1, 5) >>> 0, 7) >>> 0, 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rot(this.s3, 11);
    return result;
  }

  /** Uniforme dans [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniforme dans ]0, 1[ — utile là où 0 rendrait un logarithme infini. */
  nextOpen(): number {
    return (this.nextUint32() + 0.5) / 4294967296;
  }

  /** Uniforme dans [min, max[. */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier dans [0, n[. */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Normale centrée réduite (Box-Muller, forme polaire non rejetée). */
  normal(): number {
    const u1 = this.nextOpen();
    const u2 = this.nextOpen();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Tirage de Bernoulli. */
  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Tire un élément selon des poids positifs. */
  pick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length !== weights.length || items.length === 0) {
      throw new Error("pick : items et weights doivent avoir la même longueur non nulle.");
    }
    const total = weights.reduce((a, b) => a + b, 0);
    let u = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      u -= weights[i];
      if (u < 0) return items[i];
    }
    return items[items.length - 1];
  }
}
