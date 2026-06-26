// coach.js v2 — Entrenador IA de FORJA que LEE tu progreso real
// Lee tus datos desde un Gist, detecta tu ritmo, y genera un mensaje adaptado.

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

function nowMadrid() {
  const d = new Date();
  return new Date(d.getTime() + 2 * 3600 * 1000);
}
function operationDay() {
  const now = nowMadrid();
  const total = Math.round((OP_END - OP_START) / 86400000);
  return { d: Math.floor((now - OP_START) / 86400000) + 1, total };
}
const DAYS = ['Torso A (pecho/hombro/triceps)', 'Pierna A (cuadriceps/gluteo)',
  'Espalda + Biceps (la V)', 'Torso B (hombro lateral)', 'Pierna B + Core'];
function todayWorkout() {
  const wd = nowMadrid().getDay();
  if (wd === 6) return 'Sabado: cardio suave 40 min, sin gym';
  if (wd === 0) return 'Domingo: descanso total';
  return DAYS[wd - 1];
}
function slot() {
  const h = nowMadrid().getHours();
  if (h >= 7 && h < 11) return 'manana';
  if (h >= 11 && h < 12) return 'pre_gym';
  if (h >= 14 && h < 17) return 'comida';
  if (h >= 19 && h < 20) return 'pre_cardio';
  return 'generico';
}
const SLOT_BRIEF = {
  manana: 'Es por la manana. Saluda con energia y recuerdale el entreno de hoy.',
  pre_gym: 'Faltan minutos para entrenar (12:00). Mensaje de presion motivadora, que se prepare.',
  comida: 'Media tarde. Recuerdale su proteina (objetivo 200g) y el deficit del festival.',
  pre_cardio: 'Casi las 20:00, toca caminar/cardio suave. Animale aunque este cansado, sin culpa si descansa.',
  generico: 'Mensaje breve de animo y recordatorio del objetivo.'
};

function dayKey(date) {
  const d = new Date(date);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function leerProgreso() {
  if (!GIST_ID || !GH_TOKEN) return null;
  try {
    const res = await fetch('https://api.github.com/gists/' + GIST_ID, {
      headers: { 'Authorization': 'token ' + GH_TOKEN, 'Accept': 'application/vnd.github+json' }
    });
    const gist = await res.json();
    return JSON.parse(gist.files['forja-data.json'].content);
  } catch (e) {
    console.error('No se pudo leer el gist:', e.message);
    return null;
  }
}
function analizarRitmo(data) {
  if (!data || !data.me) return 'Sin datos de progreso todavia.';
  const m = data.me;
  const hoy = dayKey(nowMadrid());
  const ayer = dayKey(new Date(nowMadrid().getTime() - 86400000));
  const sesiones = m.sessions || [];
  const ultimaSesion = sesiones.length ? sesiones[sesiones.length - 1] : null;
  const entrenoHoy = ultimaSesion && dayKey(ultimaSesion.date) === hoy;
  const entrenoAyer = sesiones.some(s => dayKey(s.date) === ayer);
  const diasDesdeUltimo = ultimaSesion ? Math.floor((nowMadrid() - new Date(ultimaSesion.date)) / 86400000) : 999;
  const foodHoy = (m.food && m.food[hoy]) || [];
  const kcalHoy = foodHoy.reduce((a, x) => a + (x.kcal || 0), 0);
  const protHoy = foodHoy.reduce((a, x) => a + (x.prot || 0), 0);
  const bw = m.bw || [];
  const pesoTxt = bw.length >= 2
    ? 'Peso: de ' + bw[0].kg + 'kg a ' + bw[bw.length - 1].kg + 'kg (' + (bw[bw.length - 1].kg - bw[0].kg).toFixed(1) + 'kg)'
    : (bw.length ? 'Peso actual ' + bw[bw.length - 1].kg + 'kg' : 'sin registros de peso');
  return 'RITMO REAL DE MARC:\n'
    + '- Sesiones totales: ' + sesiones.length + '.\n'
    + '- Entreno hoy: ' + (entrenoHoy ? 'SI' : 'NO') + '. Ayer: ' + (entrenoAyer ? 'si' : 'no') + '.\n'
    + '- Dias desde ultimo entreno: ' + (diasDesdeUltimo === 999 ? 'aun ninguno' : diasDesdeUltimo) + '.\n'
    + '- Hoy lleva ' + kcalHoy + ' kcal y ' + protHoy + 'g proteina (objetivo 2300/200g).\n'
    + '- ' + pesoTxt + '.';
}

async function generarMensaje() {
  const op = operationDay();
  const diasFestival = Math.ceil((FESTIVAL - nowMadrid()) / 86400000);
  const data = await leerProgreso();
  const ritmo = analizarRitmo(data);
  const contexto = 'Eres el entrenador personal de Marc. Estilo: MOTIVADOR PERO FIRME, equilibrado. Cercano, le hablas de tu, le metes presion sana cuando flojea pero sin machacarle, y le reconoces los logros cuando cumple. Ves sus datos reales.\n\n'
    + 'SITUACION HOY:\n'
    + '- Dia ' + op.d + '/' + op.total + ' de su Operacion Definicion. Faltan ' + diasFestival + ' dias para el festival Medusa.\n'
    + '- Entreno de hoy: ' + todayWorkout() + '.\n'
    + '- Deficit 2300 kcal, 200g proteina. Vuelve de lesion de hombro (tecnica y cero dolor primero).\n'
    + '- Momento del dia: ' + SLOT_BRIEF[slot()] + '\n\n'
    + ritmo + '\n\n'
    + 'INSTRUCCIONES:\n'
    + '- Usa los datos reales para adaptar el mensaje. Si entreno, reconocelo. Si lleva dias sin entrenar, presion firme pero motivadora. Si va corto de proteina, recuerdaselo concreto. Si el peso baja, felicitale.\n'
    + '- UN mensaje de notificacion movil, maximo 2 frases, espanol, directo. Maximo 1 emoji. Sin comillas. Que suene a entrenador que conoce su progreso real.';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 150, messages: [{ role: 'user', content: contexto }] })
  });
  const out = await res.json();
  if (!out.content) { console.error('Respuesta API:', JSON.stringify(out)); return 'Dia ' + op.d + '! Hoy toca ' + todayWorkout() + '. A por ello.'; }
  return out.content.map(b => b.text || '').join('').trim();
}
async function main() {
  try {
    const body = await generarMensaje();
    const op = operationDay();
    await webpush.sendNotification(SUBSCRIPTION, JSON.stringify({ title: 'FORJA · Dia ' + op.d + '/' + op.total, body }));
    console.log('Enviado:', body);
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
}
main();
