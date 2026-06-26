// coach.js v4 — Entrenador IA de FORJA: inteligente, no intrusivo, sabe si ya entrenaste
const webpush = require('web-push');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBSCRIPTION = JSON.parse(process.env.PUSH_SUBSCRIPTION);
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;

webpush.setVapidDetails('mailto:marc@forja.app', VAPID_PUBLIC, VAPID_PRIVATE);

const OP_START = new Date('2026-06-26T00:00');
const OP_END = new Date('2026-08-11T00:00');
const FESTIVAL = new Date('2026-08-10T00:00');
const FULLBODY_DAY = '2026-06-26'; // dia especial de arranque

function nowMadrid() { return new Date(Date.now() + 2 * 3600 * 1000); }
function operationDay() {
  const now = nowMadrid();
  const total = Math.round((OP_END - OP_START) / 86400000);
  return { d: Math.floor((now - OP_START) / 86400000) + 1, total };
}
function dayKey(date) {
  const d = new Date(date);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const DAYS = ['Torso A (pecho/hombro/triceps)', 'Pierna A (cuadriceps/gluteo)',
  'Espalda + Biceps (la V)', 'Torso B (hombro lateral)', 'Pierna B + Core'];
function todayWorkout() {
  if (dayKey(nowMadrid()) === FULLBODY_DAY) return { txt: 'Full Body de arranque', isGym: true };
  const wd = nowMadrid().getDay();
  if (wd === 6) return { txt: 'Sabado: cardio suave, sin gym', isGym: false };
  if (wd === 0) return { txt: 'Domingo: descanso', isGym: false };
  return { txt: DAYS[wd - 1], isGym: true };
}

async function leerProgreso() {
  if (!GIST_ID || !GH_TOKEN) return null;
  try {
    const res = await fetch('https://api.github.com/gists/' + GIST_ID, {
      headers: { 'Authorization': 'token ' + GH_TOKEN, 'Accept': 'application/vnd.github+json' }
    });
    const gist = await res.json();
    return JSON.parse(gist.files['forja-data.json'].content);
  } catch (e) { console.error('gist:', e.message); return null; }
}

function decidir(data) {
  const now = nowMadrid();
  const h = now.getHours();
  const wd = now.getDay();
  const hoy = dayKey(now);
  const w = todayWorkout();
  const m = data && data.me ? data.me : null;
  const sesiones = m && m.sessions ? m.sessions : [];
  const entrenoHoy = sesiones.some(s => dayKey(s.date) === hoy);
  const ultima = sesiones.length ? sesiones[sesiones.length - 1] : null;
  const diasSin = ultima ? Math.floor((now - new Date(ultima.date)) / 86400000) : 999;
  const foodHoy = (m && m.food && m.food[hoy]) || [];
  const protHoy = foodHoy.reduce((a, x) => a + (x.prot || 0), 0);
  const kcalHoy = foodHoy.reduce((a, x) => a + (x.kcal || 0), 0);
  const updated = data && data.updated ? data.updated : 'desconocido';

  // contexto base que SIEMPRE refleja la realidad
  let estado = 'Dia ' + operationDay().d + '/' + operationDay().total + '. ';
  estado += 'YA ha entrenado hoy: ' + (entrenoHoy ? 'SI' : 'NO') + '. ';
  if (!entrenoHoy && w.isGym) estado += 'Entreno pendiente hoy: ' + w.txt + '. ';
  estado += 'Hoy lleva ' + kcalHoy + ' kcal y ' + protHoy + 'g proteina (objetivo 2300/200g). ';
  estado += 'Dias sin entrenar: ' + (diasSin === 999 ? 'ninguno' : diasSin) + '. ';
  estado += '(datos sincronizados: ' + updated + ')';

  // REGLA CLAVE: si ya entreno hoy, NUNCA hablar del entreno pendiente.
  // Solo hablar de recuperacion, proteina o descanso.
  if (entrenoHoy) {
    // proteina baja por la noche -> recordar
    if (h >= 19 && h < 22 && protHoy > 0 && protHoy < 130) {
      return { enviar: true, motivo: 'Ya ha entrenado hoy (NO menciones el entreno como pendiente). Va corto de proteina (' + protHoy + 'g de 200). Recuerdale cena proteica para recuperar.', estado };
    }
    // refuerzo ocasional por la noche
    if (h >= 20 && h < 22 && Math.random() < 0.4) {
      return { enviar: true, motivo: 'Ya ha entrenado hoy (NO menciones el entreno como pendiente). Felicitalo breve y autentico por la constancia. Recuerdale dormir bien para recuperar.', estado };
    }
    return { enviar: false, motivo: '', estado };
  }

  // A partir de aqui: NO ha entrenado hoy
  // toque de tarde si es dia de gym
  if (h >= 14 && h < 16 && w.isGym) {
    return { enviar: true, motivo: 'No ha entrenado aun y es media tarde. Hoy toca ' + w.txt + '. Dale un toque firme pero motivador, recuerdale que cuenta para el festival.', estado };
  }
  // presion si lleva dias sin entrenar (manana)
  if (h >= 10 && h < 12 && diasSin >= 2 && diasSin < 900) {
    return { enviar: true, motivo: 'Lleva ' + diasSin + ' dias sin entrenar. Hoy toca ' + w.txt + '. Presion firme pero motivadora para romper la racha.', estado };
  }
  // proteina baja por la noche aunque no haya entrenado
  if (h >= 19 && h < 22 && protHoy > 0 && protHoy < 130) {
    return { enviar: true, motivo: 'Va corto de proteina (' + protHoy + 'g de 200). Recuerdale cena proteica.', estado };
  }
  // inicio de semana
  if (wd === 1 && h >= 8 && h < 10) {
    return { enviar: true, motivo: 'Lunes por la manana, arranque de semana. Hoy toca ' + w.txt + '. Mensaje motivador para empezar con fuerza.', estado };
  }
  return { enviar: false, motivo: '', estado };
}

async function generarMensaje(motivo, estado) {
  const contexto = 'Eres el entrenador personal de Marc. Estilo MOTIVADOR PERO FIRME, cercano, le hablas de tu. Ves sus datos reales. Vuelve de lesion de hombro (tecnica y cero dolor). Operacion Definicion (deficit 2300 kcal, 200g proteina) para el festival Medusa.\n\n'
    + 'ESTADO REAL DE MARC AHORA: ' + estado + '\n\n'
    + 'MOTIVO Y ENFOQUE DE ESTE MENSAJE: ' + motivo + '\n\n'
    + 'REGLA IMPORTANTE: si ya ha entrenado hoy, jamas le digas lo que "toca" entrenar; eso ya esta hecho. Habla de lo que importa AHORA.\n'
    + 'Escribe UN mensaje de notificacion movil, maximo 2 frases, espanol, directo, maximo 1 emoji, sin comillas.';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 150, messages: [{ role: 'user', content: contexto }] })
  });
  const out = await res.json();
  if (!out.content) { console.error('API:', JSON.stringify(out)); return null; }
  return out.content.map(b => b.text || '').join('').trim();
}

async function main() {
  try {
    const data = await leerProgreso();
    if (!data) console.log('AVISO: no se pudieron leer datos del Gist. Revisar GIST_ID y GH_TOKEN.');
    const dec = decidir(data);
    console.log('Estado:', dec.estado);
    if (!dec.enviar) { console.log('Silencio (nada relevante que decir ahora).'); return; }
    const body = await generarMensaje(dec.motivo, dec.estado);
    if (!body) { console.log('No se genero mensaje.'); return; }
    const op = operationDay();
    await webpush.sendNotification(SUBSCRIPTION, JSON.stringify({ title: 'FORJA · Dia ' + op.d + '/' + op.total, body }));
    console.log('Enviado:', body);
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
}
main();
