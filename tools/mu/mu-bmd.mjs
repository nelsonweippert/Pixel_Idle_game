/**
 * mu-bmd.mjs — parser de BMD do MU (Webzen) → modelo pronto pra three.js.
 * Port fiel do muonline-bmd-viewer/src/bmd-loader.ts (parse + extractGeometry +
 * bmdAngleToQuaternion + bind-pose action0/frame0) e do lea256.ts (decrypt v15).
 * Puro Node/ESM, sem three — devolve arrays que a página do harness monta.
 */

// ── LEA-256 ECB decrypt (v15) — port de crypto/lea256.ts ─────────────────────────
const KEY_DELTA = new Uint32Array([0xc3efe9db, 0x44626b02, 0x79e27c8a, 0x78df30ec, 0x715ea49e, 0xc785da0a, 0xe04ef22a, 0xe5c40957]);
const rol = (x, n) => ((x << (n & 31)) | (x >>> (32 - (n & 31)))) >>> 0;
const ror = (x, n) => ((x >>> (n & 31)) | (x << (32 - (n & 31)))) >>> 0;
function leaSchedule(keyWords) {
  const rk = new Uint32Array(192), T = new Uint32Array(keyWords);
  for (let i = 0; i < 32; i++) {
    const d = KEY_DELTA[i & 7], s = (i * 6) & 7;
    T[(s + 0) & 7] = rol((T[(s + 0) & 7] + rol(d, i)) >>> 0, 1);
    T[(s + 1) & 7] = rol((T[(s + 1) & 7] + rol(d, i + 1)) >>> 0, 3);
    T[(s + 2) & 7] = rol((T[(s + 2) & 7] + rol(d, i + 2)) >>> 0, 6);
    T[(s + 3) & 7] = rol((T[(s + 3) & 7] + rol(d, i + 3)) >>> 0, 11);
    T[(s + 4) & 7] = rol((T[(s + 4) & 7] + rol(d, i + 4)) >>> 0, 13);
    T[(s + 5) & 7] = rol((T[(s + 5) & 7] + rol(d, i + 5)) >>> 0, 17);
    rk.set([T[(s + 0) & 7], T[(s + 1) & 7], T[(s + 2) & 7], T[(s + 3) & 7], T[(s + 4) & 7], T[(s + 5) & 7]], i * 6);
  }
  return rk;
}
const LEA_KEY = new Uint8Array([0xcc, 0x50, 0x45, 0x13, 0xc2, 0xa6, 0x57, 0x4e, 0xd6, 0x9a, 0x45, 0x89, 0xbf, 0x2f, 0xbc, 0xd9, 0x39, 0xb3, 0xb3, 0xbd, 0x50, 0xbd, 0xcc, 0xb6, 0x85, 0x46, 0xd1, 0xd6, 0x16, 0x54, 0xe0, 0x87]);
function decryptLea(enc) {
  const keyWords = new Uint32Array(8);
  for (let i = 0; i < 8; i++) keyWords[i] = (LEA_KEY[i * 4 + 3] << 24) | (LEA_KEY[i * 4 + 2] << 16) | (LEA_KEY[i * 4 + 1] << 8) | LEA_KEY[i * 4];
  const RK = leaSchedule(keyWords), out = Uint8Array.from(enc), dv = new DataView(out.buffer);
  const s = new Uint32Array(4), t = new Uint32Array(4);
  for (let off = 0; off < out.length; off += 16) {
    for (let i = 0; i < 4; i++) s[i] = dv.getUint32(off + i * 4, true);
    for (let r = 0; r < 32; r++) {
      const rk = RK.subarray((31 - r) * 6, (32 - r) * 6);
      t[0] = s[3];
      t[1] = (ror(s[0], 9) - (t[0] ^ rk[0]) ^ rk[1]) >>> 0;
      t[2] = (rol(s[1], 5) - (t[1] ^ rk[2]) ^ rk[3]) >>> 0;
      t[3] = (rol(s[2], 3) - (t[2] ^ rk[4]) ^ rk[5]) >>> 0;
      s.set(t);
    }
    for (let i = 0; i < 4; i++) dv.setUint32(off + i * 4, s[i], true);
  }
  return out;
}
// ── FileCryptor (v12) ──────────────────────────────────────────────────────────
const MAP_XOR_KEY = new Uint8Array([0xD1, 0x73, 0x52, 0xF6, 0xD2, 0x9A, 0xCB, 0x27, 0x3E, 0xAF, 0x59, 0x31, 0x37, 0xB3, 0xE7, 0xA2]);
function decryptFileCryptor(src) {
  const dst = new Uint8Array(src.length); let k = 0x5E;
  for (let i = 0; i < src.length; i++) { dst[i] = ((src[i] ^ MAP_XOR_KEY[i & 15]) - k) & 0xFF; k = (src[i] + 0x3D) & 0xFF; }
  return dst;
}

// ── Euler (radianos) → quaternion, convenção MU (port bmdAngleToQuaternion) ───────
function angleToQuat(x, y, z) {
  const hx = x * 0.5, hy = y * 0.5, hz = z * 0.5;
  const sx = Math.sin(hx), cx = Math.cos(hx), sy = Math.sin(hy), cy = Math.cos(hy), sz = Math.sin(hz), cz = Math.cos(hz);
  const qw = cx * cy * cz + sx * sy * sz, qx = sx * cy * cz - cx * sy * sz, qy = cx * sy * cz + sx * cy * sz, qz = cx * cy * sz - sx * sy * cz;
  const n = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / n, qy / n, qz / n, qw / n];
}

// ── parse BMD → estrutura crua ───────────────────────────────────────────────────
export function parseBmd(buffer) {
  const buf = new Uint8Array(buffer);
  if (String.fromCharCode(buf[0], buf[1], buf[2]) !== 'BMD') throw new Error('BMD magic inválido');
  const version = buf[3];
  let work = buf, base = 4;
  const dv0 = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (version === 12 || version === 15) {
    const size = dv0.getInt32(4, true);
    const enc = buf.subarray(8, 8 + size);
    const dec = version === 12 ? decryptFileCryptor(enc) : decryptLea(enc);
    work = dec; base = 0;
  } else {
    work = buf.subarray(4); base = 0;
  }
  const dv = new DataView(work.buffer, work.byteOffset, work.byteLength);
  let off = base;
  const s16 = () => { const v = dv.getInt16(off, true); off += 2; return v; };
  const u16 = () => { const v = dv.getUint16(off, true); off += 2; return v; };
  const f32 = () => { const v = dv.getFloat32(off, true); off += 4; return v; };
  const str = (len) => { let e = off; while (e < off + len && work[e] !== 0) e++; const t = new TextDecoder('latin1').decode(work.subarray(off, e)); off += len; return t; };

  const name = str(32);
  const meshCount = u16(), boneCount = u16(), actionCount = u16();
  const meshes = [];
  for (let m = 0; m < meshCount; m++) {
    const nv = s16(), nn = s16(), nt = s16(), ntri = s16(); s16(); // textureIndex ignorado
    const vertices = [];
    for (let i = 0; i < nv; i++) { const node = dv.getInt16(off, true); off += 4; vertices.push({ node, x: f32(), y: f32(), z: f32() }); }
    const normals = [];
    for (let i = 0; i < nn; i++) { off += 4; normals.push({ x: f32(), y: f32(), z: f32() }); off += 4; }
    const tex = [];
    for (let i = 0; i < nt; i++) tex.push({ u: f32(), v: f32() });
    const tris = [];
    for (let i = 0; i < ntri; i++) {
      const start = off, poly = work[start];
      const vi = [0, 1, 2, 3].map((j) => dv.getInt16(start + 2 + j * 2, true));
      const ti = [0, 1, 2, 3].map((j) => dv.getInt16(start + 18 + j * 2, true));
      const ni = [0, 1, 2, 3].map((j) => dv.getInt16(start + 10 + j * 2, true));
      tris.push({ poly, vi, ni, ti }); off += 64;
    }
    const texturePath = str(32);
    meshes.push({ vertices, normals, tex, tris, texturePath });
  }
  // actions
  const actions = [];
  for (let a = 0; a < actionCount; a++) {
    const numKeys = s16(); const lock = work[off] > 0; off += 1;
    if (lock) off += numKeys * 12;
    actions.push({ numKeys, lock });
  }
  // bones (com keyframes por action)
  const bones = [];
  for (let b = 0; b < boneCount; b++) {
    const dummy = work[off] > 0; off += 1;
    if (dummy) { bones.push({ dummy: true, name: `d${b}`, parent: -1, act: [] }); continue; }
    const bname = str(32), parent = s16(), act = [];
    for (let a = 0; a < actionCount; a++) {
      const keys = actions[a].numKeys;
      const pos = [], quat = [];
      for (let k = 0; k < keys; k++) pos.push([f32(), f32(), f32()]);
      for (let k = 0; k < keys; k++) { const e = [f32(), f32(), f32()]; quat.push(angleToQuat(e[0], e[1], e[2])); }
      act.push({ pos, quat });
    }
    bones.push({ dummy: false, name: bname, parent, act });
  }
  return { version, name, meshes, actions, bones, boneCount, actionCount };
}

// ── modelo pronto pro harness three.js: geometria expandida + esqueleto ──────────
export function buildRenderModel(bmd) {
  // extractGeometry: expande triângulos → arrays não-indexados + skinIndex=node
  const rootCount = bmd.bones.filter((b) => b.parent < 0 || b.parent >= bmd.boneCount).length;
  const armature = rootCount > 1;               // esqueleto com raiz sintética (offset +1)
  const boneOff = armature ? 1 : 0;
  const meshes = bmd.meshes.map((mesh) => {
    const positions = [], normals = [], uvs = [], skinIndex = [];
    const push = (vi, ni, ti) => {
      const v = mesh.vertices[vi], n = mesh.normals[ni], t = mesh.tex[ti];
      if (!v || !n || !t) return;
      positions.push(v.x, v.y, v.z); normals.push(n.x, n.y, n.z); uvs.push(t.u, t.v);
      skinIndex.push(v.node + boneOff);
    };
    for (const tr of mesh.tris) {
      push(tr.vi[0], tr.ni[0], tr.ti[0]); push(tr.vi[2], tr.ni[2], tr.ti[2]); push(tr.vi[1], tr.ni[1], tr.ti[1]);
      if (tr.poly === 4) { push(tr.vi[0], tr.ni[0], tr.ti[0]); push(tr.vi[2], tr.ni[2], tr.ti[2]); push(tr.vi[3], tr.ni[3], tr.ti[3]); }
    }
    return { texturePath: mesh.texturePath, positions, normals, uvs, skinIndex };
  });
  // ossos: bind pose = action0/frame0 (pos + quat)
  const bones = bmd.bones.map((b) => ({
    name: b.name, parent: b.parent, dummy: b.dummy,
    bindPos: b.dummy ? [0, 0, 0] : (b.act[0]?.pos[0] ?? [0, 0, 0]),
    bindQuat: b.dummy ? [0, 0, 0, 1] : (b.act[0]?.quat[0] ?? [0, 0, 0, 1]),
  }));
  // trilhas de animação por action (pra fase animada): [action][boneIdx]{pos[],quat[]}
  const anims = bmd.actions.map((a, ai) => ({
    numKeys: a.numKeys,
    tracks: bmd.bones.map((b) => b.dummy ? null : { pos: b.act[ai].pos, quat: b.act[ai].quat }),
  }));
  return { name: bmd.name, armature, meshes, bones, anims };
}

// ── PLAYER MULTIPARTE: combina um BMD de animação (player_s6: só ossos+actions) ────
// com N BMDs de PEÇA (Armor/Helm/Pant/Glove/Boot: só meshes bind-pose). Todos
// compartilham o MESMO esqueleto — os índices de bone das peças (0..57) alinham com
// os ossos do player_s6 (0..59), convenção fixa do MU. Bind pose e animação vêm do
// player_s6; a geometria vem das peças.
export function buildPlayerModel(animBmd, partBmds) {
  const rootCount = animBmd.bones.filter((b) => b.parent < 0 || b.parent >= animBmd.boneCount).length;
  const armature = rootCount > 1;
  const boneOff = armature ? 1 : 0;
  const meshes = [];
  for (const part of partBmds) {
    for (const mesh of part.meshes) {
      const positions = [], normals = [], uvs = [], skinIndex = [];
      const push = (vi, ni, ti) => {
        const v = mesh.vertices[vi], n = mesh.normals[ni], t = mesh.tex[ti];
        if (!v || !n || !t) return;
        positions.push(v.x, v.y, v.z); normals.push(n.x, n.y, n.z); uvs.push(t.u, t.v);
        skinIndex.push(v.node + boneOff);
      };
      for (const tr of mesh.tris) {
        push(tr.vi[0], tr.ni[0], tr.ti[0]); push(tr.vi[2], tr.ni[2], tr.ti[2]); push(tr.vi[1], tr.ni[1], tr.ti[1]);
        if (tr.poly === 4) { push(tr.vi[0], tr.ni[0], tr.ti[0]); push(tr.vi[2], tr.ni[2], tr.ti[2]); push(tr.vi[3], tr.ni[3], tr.ti[3]); }
      }
      meshes.push({ texturePath: mesh.texturePath, positions, normals, uvs, skinIndex });
    }
  }
  const bones = animBmd.bones.map((b) => ({
    name: b.name, parent: b.parent, dummy: b.dummy,
    bindPos: b.dummy ? [0, 0, 0] : (b.act[0]?.pos[0] ?? [0, 0, 0]),
    bindQuat: b.dummy ? [0, 0, 0, 1] : (b.act[0]?.quat[0] ?? [0, 0, 0, 1]),
  }));
  const anims = animBmd.actions.map((a, ai) => ({
    numKeys: a.numKeys,
    tracks: animBmd.bones.map((b) => b.dummy ? null : { pos: b.act[ai].pos, quat: b.act[ai].quat }),
  }));
  return { name: "player", armature, meshes, bones, anims };
}
