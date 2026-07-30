/**
 * CityManager — cidade instanciada (fundação da visão city-mmo, AD-020). Efêmero em
 * memória. Capacidade NUNCA bloqueia entrar (cria instância nova); só o switch pra uma
 * instância cheia recusa (CITY_INSTANCE_FULL). Sem posição sincronizada — client
 * teatral (AD-003); a instância expõe só o ROSTER.
 */
export const CITY_CAP = 50;

export interface CityInstance {
  id: string;
  members: Set<string>; // charIds
}

export class CityManager {
  private instances: CityInstance[] = [];
  private ofChar = new Map<string, string>();
  private seq = 0;

  constructor(private cap = CITY_CAP) {}

  join(charId: string): CityInstance {
    this.leave(charId);
    let inst = this.instances.find((i) => i.members.size < this.cap);
    if (!inst) {
      inst = { id: `city_${++this.seq}`, members: new Set() };
      this.instances.push(inst);
    }
    inst.members.add(charId);
    this.ofChar.set(charId, inst.id);
    return inst;
  }

  leave(charId: string): void {
    const id = this.ofChar.get(charId);
    if (!id) return;
    this.instances.find((i) => i.id === id)?.members.delete(charId);
    this.ofChar.delete(charId);
  }

  switchInstance(charId: string, targetId: string): CityInstance {
    const target = this.instances.find((i) => i.id === targetId);
    if (!target) throw new Error("NO_INSTANCE");
    if (!target.members.has(charId) && target.members.size >= this.cap) {
      throw new Error("CITY_INSTANCE_FULL");
    }
    this.leave(charId);
    target.members.add(charId);
    this.ofChar.set(charId, target.id);
    return target;
  }

  roster(instanceId: string): string[] {
    return [...(this.instances.find((i) => i.id === instanceId)?.members ?? [])];
  }
  instanceOf(charId: string): string | undefined {
    return this.ofChar.get(charId);
  }
  instanceCount(): number {
    return this.instances.length;
  }
}
