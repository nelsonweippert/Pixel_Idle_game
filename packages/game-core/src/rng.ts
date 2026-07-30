/**
 * PCG32 (XSH-RR 64/32) — RNG determinístico e SERIALIZÁVEL.
 *
 * O estado de 64 bits é guardado como quatro uint32 (sHi/sLo do state + iHi/iLo do
 * inc/stream) — tudo number, JSON-safe (o SessionState clona via JSON e persiste o
 * rng junto; bigint quebraria isso). A aritmética de 64 bits usa BigInt APENAS
 * dentro das funções, nunca no estado guardado.
 *
 * Todo draw é FUNCIONAL: devolve {value, state}, nada muta. Reidratar o estado e
 * continuar produz exatamente a mesma sequência — pré-requisito do offline fiel.
 */

export interface RngState {
  sHi: number;
  sLo: number;
  iHi: number;
  iLo: number;
}

const MASK64 = (1n << 64n) - 1n;
const MASK32 = 0xffffffffn;
const MUL = 6364136223846793005n;

const pack = (hi: number, lo: number): bigint =>
  (((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)) & MASK64);
const unpackHi = (v: bigint): number => Number((v >> 32n) & MASK32);
const unpackLo = (v: bigint): number => Number(v & MASK32);

/** um passo do gerador → uint32 de saída + novo estado */
export function nextU32(st: RngState): { value: number; state: RngState } {
  const oldstate = pack(st.sHi, st.sLo);
  const inc = pack(st.iHi, st.iLo);
  const newstate = (oldstate * MUL + inc) & MASK64;
  const xorshifted = Number((((oldstate >> 18n) ^ oldstate) >> 27n) & MASK32) >>> 0;
  const rot = Number(oldstate >> 59n) & 31;
  const value = ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  return {
    value,
    state: { sHi: unpackHi(newstate), sLo: unpackLo(newstate), iHi: st.iHi, iLo: st.iLo },
  };
}

/** semeadura padrão pcg32_srandom_r(initstate, initseq) */
export function createRng(seed: number | bigint, seq: number | bigint): RngState {
  const initstate = BigInt(seed) & MASK64;
  const initseq = BigInt(seq) & MASK64;
  const inc = ((initseq << 1n) | 1n) & MASK64;
  const iHi = unpackHi(inc);
  const iLo = unpackLo(inc);

  let st: RngState = { sHi: 0, sLo: 0, iHi, iLo };
  st = nextU32(st).state;
  const added = (pack(st.sHi, st.sLo) + initstate) & MASK64;
  st = { sHi: unpackHi(added), sLo: unpackLo(added), iHi, iLo };
  st = nextU32(st).state;
  return st;
}

/**
 * Cursor MUTÁVEL e transiente — açúcar pra threadar o RNG dentro de um passo de sim
 * sem escrever `{value, state}` a cada draw. Começa de um RngState imutável e, ao
 * fim do passo, `.state` é gravado de volta no SessionState. Nunca escapa vivo do
 * passo — a pureza do `advance` é preservada.
 */
export class RngCursor {
  state: RngState;
  constructor(state: RngState) {
    this.state = state;
  }
  private u32(): number {
    const r = nextU32(this.state);
    this.state = r.state;
    return r.value;
  }
  /** [0, 1) */
  float(): number {
    return this.u32() / 4294967296;
  }
  /** inteiro em [0, maxExclusive) */
  int(maxExclusive: number): number {
    return this.u32() % maxExclusive;
  }
  /** float em [min, max) */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }
  /** true com probabilidade p */
  chance(p: number): boolean {
    return this.float() < p;
  }
  /** varia n em ±spread (ex.: spread 0.15 → 85%..115%) */
  vary(n: number, spread = 0.15): number {
    return n * (1 - spread + this.float() * spread * 2);
  }
  /** elemento aleatório de um array não-vazio */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}
