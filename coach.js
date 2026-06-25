// coach.js — Entrenador IA de FORJA
// Se ejecuta desde GitHub Actions a horas programadas.
// 1) Decide el tipo de mensaje según la hora y el día
// 2) Llama a la API de Claude para generar un mensaje personalizado
// 3) Lo envía como notificación push al móvil de Marc

const webpush = require('web-push');

// ---- CONFIG (vienen de los "secrets" de GitHub) ----
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBSCRIPTION = JSON.parse(process.env.PUSH_SUBSCRIPTION); // {endpoint, keys:{...}}

webpush.setVapidDetails('mailto:marc@forja.app', VAPID_PUBLIC, VAPID_PRIVATE);

// ---- DATOS DEL PLAN (fechas y fases de la operación) ----
const OP_START = new Date('2026-06-26T00:00');
const OP_END = new Date('2026-08-11T00:00');
const FESTIVAL = new Date('2026-08-10T00:00');

function nowMadrid() {
  // GitHub corre en UTC; convertimos a hora de España (CEST = UTC+2 en verano)
  const d = new Date();
  return new Date(d.getTime() + 2 * 3600 * 1000);
}

function operationDay() {
  const now = nowMadrid();
  const total = Math.round((OP_END - OP_START) / 86400000);
  const d = Math.floor((now - OP_START) / 86400000) + 1;
  return { d, total };
}

// Qué entreno toca hoy (Lun-Vie), finde = cardio/descanso
const DAYS = ['Torso A (pecho/hombro/tríceps)', 'Pierna A (cuádriceps/glúteo)',
  'Espalda + Bíceps (la V)', 'Torso B (hombro lateral)', 'Pierna B + Core'];
function todayWorkout() {
  const wd = nowMadrid().getDay(); // 0=dom
  if (wd === 6) return 'Sábado: cardio suave 40 min, sin gym';
  if (wd === 0) return 'Domingo: descanso total';
  return DAYS[wd - 1];
}

// El "momento" del día decide el tono del mensaje
function slot() {
  const h = nowMadrid().getHours();
  if (h >= 7 && h < 11) return 'manana';      // buenos días
  if (h >= 11 && h < 12) return 'pre_gym';    // en breve toca entrenar
  if (h >= 14 && h < 17) return 'comida';     // recordatorio proteína
  if (h >= 19 && h < 20) return 'pre_cardio'; // a caminar
  return 'generico';
}

const SLOT_BRIEF = {
  manana: 'Es por la mañana. Saluda con energía y recuérdale el entreno de hoy y que cuide la dieta.',
  pre_gym: 'Faltan minutos para que entrene a las 12:00. Mensaje de presión motivadora, que se prepare y vaya a darlo todo.',
  comida: 'Media tarde. Recuérdale revisar su proteína (objetivo 200g) y que va en déficit por el festival.',
  pre_cardio: 'Son casi las 20:00, toca la sesión de caminar/cardio suave. Anímale a moverse aunque esté cansado, pero sin culpa si hoy descansa.',
  generico: 'Mensaje breve de ánimo y recordatorio de su objetivo.'
};

async function generarMensaje() {
  const op = operationDay();
  const diasFestival = Math.ceil((FESTIVAL - nowMadrid()) / 86400000);
  const contexto = `Eres el entrenador personal de Marc, directo, motivador y con un punto exigente pero cercano. Le hablas de tú.
Datos de hoy:
- Día ${op.d} de ${op.total} de su "Operación Definición" para el festival Medusa.
- Faltan ${diasFestival} días para el festival.
- Entreno de hoy: ${todayWorkout()}.
- Está en déficit (2300 kcal, 200g proteína) para perder grasa manteniendo músculo.
- Vuelve de una lesión de hombro: técnica y cero dolor por encima de todo.
- Contexto del momento: ${SLOT_BRIEF[slot()]}

Escribe UN mensaje de notificación móvil, máximo 2 frases, en español, directo y motivador. Sin emojis excesivos (máximo 1). No uses comillas. Que suene a entrenador real que le conoce.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{ role: 'user', content: contexto }]
    })
  });
  const data = await res.json();
  if (!data.content) {
    console.error('Respuesta API:', JSON.stringify(data));
    return '¡Día ' + op.d + '! Hoy toca ' + todayWorkout() + '. A por ello.';
  }
  return data.content.map(b => b.text || '').join('').trim();
}

async function main() {
  try {
    const body = await generarMensaje();
    const op = operationDay();
    await webpush.sendNotification(
      SUBSCRIPTION,
      JSON.stringify({ title: `FORJA · Día ${op.d}/${op.total}`, body })
    );
    console.log('✅ Enviado:', body);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
