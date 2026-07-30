import { describe, it, expect } from "vitest";
import { PartyManager } from "../src/services/party";
import { SocialManager } from "../src/services/social";
import { CityManager } from "../src/runtime/city";
import { skillLevelFor } from "../src/services/progression";

describe("Fase C — PartyManager", () => {
  it("convida e aceita até o cap 4; 5º recusa", () => {
    let t = 0;
    const pm = new PartyManager(() => t);
    // leader = a1; convida a2..a4
    for (const to of ["a2", "a3", "a4"]) {
      pm.invite("a1", to);
      pm.accept(to, pm.getByAccount("a1")!.id);
    }
    expect(pm.getByAccount("a1")!.memberAccountIds).toHaveLength(4);
    expect(() => pm.invite("a1", "a5")).toThrow("PARTY_FULL");
  });

  it("convite expira após o TTL", () => {
    let t = 0;
    const pm = new PartyManager(() => t);
    pm.invite("a1", "a2");
    const pid = pm.getByAccount("a1")!.id;
    t += 200_000; // > 120s
    expect(() => pm.accept("a2", pid)).toThrow("INVITE_EXPIRED");
  });

  it("só o líder convida/kicka; transfere liderança", () => {
    let t = 0;
    const pm = new PartyManager(() => t);
    pm.invite("a1", "a2");
    pm.accept("a2", pm.getByAccount("a1")!.id);
    expect(() => pm.invite("a2", "a3")).toThrow("NOT_LEADER");
    pm.transferLead("a1", "a2");
    expect(pm.getByAccount("a2")!.leaderAccountId).toBe("a2");
  });

  it("dissolve com <2 membros ao sair", () => {
    let t = 0;
    const pm = new PartyManager(() => t);
    pm.invite("a1", "a2");
    pm.accept("a2", pm.getByAccount("a1")!.id);
    pm.leave("a2");
    expect(pm.getByAccount("a1")).toBeUndefined(); // sobrou 1 → dissolveu
  });
});

describe("Fase C — SocialManager", () => {
  it("pedido → aceite vira amizade recíproca; sem duplicata", () => {
    const s = new SocialManager();
    s.sendRequest("a1", "a2");
    expect(s.pendingFor("a2")).toEqual(["a1"]);
    s.accept("a2", "a1");
    expect(s.areFriends("a1", "a2")).toBe(true);
    expect(s.areFriends("a2", "a1")).toBe(true);
    expect(() => s.sendRequest("a1", "a2")).toThrow("ALREADY_FRIENDS");
  });

  it("não deixa pedir a si mesmo nem duplicar pedido", () => {
    const s = new SocialManager();
    expect(() => s.sendRequest("a1", "a1")).toThrow("BAD_COMMAND");
    s.sendRequest("a1", "a2");
    expect(() => s.sendRequest("a1", "a2")).toThrow("ALREADY_REQUESTED");
  });
});

describe("Fase C — CityManager", () => {
  it("capacidade nunca bloqueia entrar: cria instância nova", () => {
    const city = new CityManager(2);
    const a = city.join("c1");
    city.join("c2");
    const c = city.join("c3"); // instância 1 cheia → nova
    expect(city.instanceCount()).toBe(2);
    expect(a.id).not.toBe(c.id);
  });

  it("roster reflete os membros; switch pra instância cheia recusa", () => {
    const city = new CityManager(1);
    city.join("c1"); // inst 1
    const two = city.join("c2"); // inst 2 (1 cheia)
    expect(city.roster(city.instanceOf("c1")!)).toEqual(["c1"]);
    expect(() => city.switchInstance("c2", city.instanceOf("c1")!)).toThrow("CITY_INSTANCE_FULL");
    expect(two.members.has("c2")).toBe(true);
  });
});

describe("Fase C — progressão (skill com uso)", () => {
  it("curva de nível de skill é monotônica", () => {
    expect(skillLevelFor(0)).toBe(0);
    expect(skillLevelFor(100)).toBe(10);
    expect(skillLevelFor(400)).toBeGreaterThan(skillLevelFor(100));
  });
});
