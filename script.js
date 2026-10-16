/* ==========================================================================
   Cumples & Recuerdos — script.js
   ES6+ · sin dependencias · módulos lógicos separados por secciones.

   CONVENCIÓN DE DATOS:
   El array `recuerdos` de cada amigo se ordena de más antiguo a más reciente.
   El ÚLTIMO elemento es el recuerdo más reciente y se usa como portada.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. Configuración y estado
   -------------------------------------------------------------------------- */
const DATA_URL = 'datos.json';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Imagen de respaldo (SVG inline) cuando una foto no existe o falla al cargar. */
const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#16264a"/><stop offset="1" stop-color="#0b1120"/>
       </linearGradient></defs>
       <rect width="400" height="500" fill="url(#g)"/>
       <g fill="none" stroke="#22d3ee" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".7">
         <rect x="140" y="215" width="120" height="86" rx="14"/>
         <circle cx="200" cy="258" r="24"/>
         <path d="M170 215l10-16h40l10 16"/>
       </g>
     </svg>`
  );

const state = {
  amigos: [],          // Datos cargados desde datos.json
  filtro: '',          // Texto del buscador
  modal: {
    amigo: null,       // Amigo abierto en el modal
    indice: 0,         // Recuerdo visible
    ultimoFoco: null,  // Elemento que tenía el foco antes de abrir
  },
};

/* Referencias al DOM (se resuelven una sola vez) */
const $ = (selector, root = document) => root.querySelector(selector);

const dom = {
  grid: $('#grid'),
  estado: $('#estado'),
  stats: $('#stats'),
  search: $('#search'),
  next: $('#next'),
  nextText: $('#next-text'),
  year: $('#year'),
  modal: $('#modal'),
  modalImg: $('#modal-img'),
  modalPrev: $('#modal-prev'),
  modalNext: $('#modal-next'),
  modalCounter: $('#modal-counter'),
  modalBirthday: $('#modal-birthday'),
  modalTitle: $('#modal-title'),
  modalMemory: $('#modal-memory'),
  modalLugar: $('#modal-lugar'),
  modalFecha: $('#modal-fecha'),
  modalDesc: $('#modal-desc'),
  modalDots: $('#modal-dots'),
};

/* --------------------------------------------------------------------------
   2. Utilidades
   -------------------------------------------------------------------------- */

/**
 * Crea un elemento DOM de forma segura (usa textContent, nunca innerHTML).
 * @param {string} tag
 * @param {Object} props  class, dataset, on*, y atributos normales
 * @param {...(Node|string|null)} children
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }

  for (const child of children) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

/** Normaliza texto para búsquedas (minúsculas y sin tildes). */
const normalizar = (texto) =>
  texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Convierte "DD/MM" en { dia, mes }. */
function parseCumple(cadena) {
  const [dia, mes] = String(cadena).split('/').map(Number);
  return { dia, mes };
}

/** Formatea { dia, mes } como "23 de octubre". */
const formatearCumple = ({ dia, mes }) => `${dia} de ${MESES[mes - 1] ?? '?'}`;

/**
 * Crea una fecha segura: el 29/02 en años no bisiestos pasa al 28/02.
 */
function fechaSegura(anio, mes, dia) {
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.getMonth() === mes - 1 ? fecha : new Date(anio, mes - 1, 28);
}

/** Días que faltan hasta el próximo cumpleaños (0 = hoy). */
function diasHastaCumple({ dia, mes }, hoy = new Date()) {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let proximo = fechaSegura(base.getFullYear(), mes, dia);
  if (proximo < base) proximo = fechaSegura(base.getFullYear() + 1, mes, dia);
  return Math.round((proximo - base) / 86_400_000);
}

/** Texto corto de cuenta atrás para la etiqueta de la tarjeta. */
function textoCuentaAtras(dias) {
  if (dias === 0) return '¡Hoy!';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
}

/** El recuerdo más reciente (último del array) se usa de portada. */
const recuerdoPortada = (amigo) => amigo.recuerdos[amigo.recuerdos.length - 1];

/** Asigna un src a una imagen con respaldo si falla la carga. */
function cargarImagen(img, src) {
  img.onerror = () => {
    img.onerror = null; // evita bucles si el fallback también fallase
    img.src = FALLBACK_IMG;
  };
  img.src = src || FALLBACK_IMG;
}

/* --------------------------------------------------------------------------
   3. Carga y preparación de datos
   -------------------------------------------------------------------------- */

/** Descarga datos.json y descarta entradas inválidas sin romper la web. */
async function cargarDatos() {
  const respuesta = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

  const datos = await respuesta.json();
  if (!Array.isArray(datos)) throw new Error('datos.json debe ser un array');

  return datos.filter(
    (a) => a?.id && a?.nombre && a?.fechaCumple &&
           Array.isArray(a.recuerdos) && a.recuerdos.length > 0
  );
}

/** Ordena por cumpleaños más cercano. */
function ordenarPorProximoCumple(amigos) {
  const hoy = new Date();
  return [...amigos].sort(
    (a, b) =>
      diasHastaCumple(parseCumple(a.fechaCumple), hoy) -
      diasHastaCumple(parseCumple(b.fechaCumple), hoy)
  );
}

/* --------------------------------------------------------------------------
   4. Renderizado de la rejilla
   -------------------------------------------------------------------------- */

/** Construye una tarjeta de amigo. */
function crearTarjeta(amigo, indice) {
  const portada = recuerdoPortada(amigo);
  const cumple = parseCumple(amigo.fechaCumple);
  const dias = diasHastaCumple(cumple);
  const total = amigo.recuerdos.length;

  const img = el('img', {
    class: 'card__img',
    alt: `Foto de ${amigo.nombre} en ${portada.lugar}`,
    loading: 'lazy',
    decoding: 'async',
  });
  cargarImagen(img, portada.foto);

  const boton = el(
    'button',
    {
      class: 'card',
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-label': `Abrir recuerdos de ${amigo.nombre}`,
      onclick: () => abrirModal(amigo.id),
    },
    el('span', { class: 'card__media' },
      img,
      el('span', { class: 'card__shade' }),
      el('span', { class: `chip chip--when${dias === 0 ? ' chip--today' : ''}` }, textoCuentaAtras(dias)),
      el('span', { class: 'chip chip--count' }, `${total} ${total === 1 ? 'recuerdo' : 'recuerdos'}`)
    ),
    el('span', { class: 'card__info' },
      el('span', { class: 'card__name' }, amigo.nombre),
      el('span', { class: 'card__date' }, `🎂 ${formatearCumple(cumple)}`),
      el('span', { class: 'card__place' }, `📍 ${portada.lugar} · ${portada.fechaFoto}`)
    )
  );

  // --i alimenta el retardo escalonado de la animación de entrada
  return el('li', { class: 'grid__item', style: `--i:${indice}` }, boton);
}

/** Devuelve los amigos que cumplen el filtro actual. */
function amigosFiltrados() {
  const consulta = normalizar(state.filtro.trim());
  if (!consulta) return state.amigos;
  return state.amigos.filter((a) => normalizar(a.nombre).includes(consulta));
}

/** Pinta la rejilla completa. */
function renderGrid() {
  const lista = amigosFiltrados();
  dom.grid.replaceChildren(...lista.map(crearTarjeta));

  const hayDatos = state.amigos.length > 0;
  dom.estado.hidden = lista.length > 0;
  if (!lista.length) {
    dom.estado.textContent = hayDatos
      ? 'No hay nadie que coincida con tu búsqueda.'
      : 'Aún no hay amigos en datos.json.';
  }

  const totalRecuerdos = state.amigos.reduce((n, a) => n + a.recuerdos.length, 0);
  dom.stats.textContent = hayDatos
    ? `${state.amigos.length} ${state.amigos.length === 1 ? 'amigo' : 'amigos'} · ${totalRecuerdos} ${totalRecuerdos === 1 ? 'recuerdo' : 'recuerdos'}`
    : '';
}

/** Muestra el aviso del próximo cumpleaños. */
function renderProximoCumple() {
  const proximo = state.amigos[0]; // ya ordenados por cercanía
  if (!proximo) return;

  const dias = diasHastaCumple(parseCumple(proximo.fechaCumple));
  const cuando = dias === 0 ? 'es hoy' : dias === 1 ? 'es mañana' : `es en ${dias} días`;

  dom.nextText.replaceChildren(
    'Próximo cumpleaños: ',
    el('strong', {}, proximo.nombre),
    ` — ${cuando} (${formatearCumple(parseCumple(proximo.fechaCumple))})`
  );
  dom.next.hidden = false;
}

/* --------------------------------------------------------------------------
   5. Modal de detalle
   -------------------------------------------------------------------------- */

/** Abre el modal para el amigo indicado, empezando por su recuerdo más reciente. */
function abrirModal(id) {
  const amigo = state.amigos.find((a) => a.id === id);
  if (!amigo) return;

  state.modal.amigo = amigo;
  state.modal.indice = amigo.recuerdos.length - 1;
  state.modal.ultimoFoco = document.activeElement;

  dom.modalTitle.textContent = amigo.nombre;
  dom.modalBirthday.textContent = `🎂 ${formatearCumple(parseCumple(amigo.fechaCumple))}`;

  const varios = amigo.recuerdos.length > 1;
  dom.modalPrev.hidden = !varios;
  dom.modalNext.hidden = !varios;

  renderPuntos();
  mostrarRecuerdo(state.modal.indice, { animar: false });

  dom.modal.classList.add('is-open');
  dom.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');

  // Foco al botón de cerrar para accesibilidad con teclado
  requestAnimationFrame(() => $('.modal__close', dom.modal).focus());
}

/** Cierra el modal y devuelve el foco al elemento que lo abrió. */
function cerrarModal() {
  if (!dom.modal.classList.contains('is-open')) return;

  dom.modal.classList.remove('is-open');
  dom.modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-locked');

  state.modal.ultimoFoco?.focus?.();
  state.modal.amigo = null;
}

/** Crea los puntos de navegación del modal. */
function renderPuntos() {
  const { amigo } = state.modal;
  const puntos = amigo.recuerdos.length > 1
    ? amigo.recuerdos.map((r, i) =>
        el('button', {
          class: 'dot',
          type: 'button',
          role: 'tab',
          'aria-label': `Recuerdo ${i + 1}: ${r.lugar}`,
          onclick: () => mostrarRecuerdo(i),
        })
      )
    : [];
  dom.modalDots.replaceChildren(...puntos);
}

/**
 * Muestra el recuerdo `indice` del amigo abierto.
 * Con `animar` hace un fundido cruzado entre fotos y textos.
 */
function mostrarRecuerdo(indice, { animar = true } = {}) {
  const { amigo } = state.modal;
  if (!amigo) return;

  const total = amigo.recuerdos.length;
  const i = (indice + total) % total; // navegación circular
  const recuerdo = amigo.recuerdos[i];
  state.modal.indice = i;

  const aplicar = () => {
    cargarImagen(dom.modalImg, recuerdo.foto);
    dom.modalImg.alt = `${amigo.nombre} en ${recuerdo.lugar}`;
    dom.modalLugar.textContent = recuerdo.lugar || '—';
    dom.modalFecha.textContent = recuerdo.fechaFoto || '—';
    dom.modalDesc.textContent = recuerdo.descripcion || '';
    dom.modalCounter.textContent = `${i + 1} / ${total}`;
    dom.modalCounter.hidden = total < 2;

    [...dom.modalDots.children].forEach((punto, n) =>
      punto.setAttribute('aria-selected', String(n === i))
    );

    dom.modalImg.classList.remove('is-swapping');
    dom.modalMemory.classList.remove('is-swapping');
  };

  if (!animar) return aplicar();

  dom.modalImg.classList.add('is-swapping');
  dom.modalMemory.classList.add('is-swapping');
  setTimeout(aplicar, 280); // coincide con la duración del fundido en CSS
}

const siguienteRecuerdo = () => mostrarRecuerdo(state.modal.indice + 1);
const anteriorRecuerdo = () => mostrarRecuerdo(state.modal.indice - 1);

/* --------------------------------------------------------------------------
   6. Eventos
   -------------------------------------------------------------------------- */

/** Mantiene el foco dentro del modal mientras está abierto. */
function atraparFoco(evento) {
  const focables = [...dom.modal.querySelectorAll('button:not([hidden])')];
  if (!focables.length) return;

  const primero = focables[0];
  const ultimo = focables[focables.length - 1];

  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
}

function registrarEventos() {
  // Buscador
  dom.search.addEventListener('input', (e) => {
    state.filtro = e.target.value;
    renderGrid();
  });

  // Cierre del modal (backdrop y botón con data-close)
  dom.modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) cerrarModal();
  });

  dom.modalPrev.addEventListener('click', anteriorRecuerdo);
  dom.modalNext.addEventListener('click', siguienteRecuerdo);

  // Teclado: Esc cierra, flechas navegan, Tab queda atrapado
  document.addEventListener('keydown', (e) => {
    if (!dom.modal.classList.contains('is-open')) return;
    if (e.key === 'Escape') cerrarModal();
    else if (e.key === 'ArrowRight') siguienteRecuerdo();
    else if (e.key === 'ArrowLeft') anteriorRecuerdo();
    else if (e.key === 'Tab') atraparFoco(e);
  });

  // Gesto de deslizar en móvil
  let inicioX = null;
  dom.modal.addEventListener('touchstart', (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
  dom.modal.addEventListener('touchend', (e) => {
    if (inicioX == null) return;
    const delta = e.changedTouches[0].clientX - inicioX;
    inicioX = null;
    if (Math.abs(delta) < 50) return;
    delta < 0 ? siguienteRecuerdo() : anteriorRecuerdo();
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   7. Arranque
   -------------------------------------------------------------------------- */
async function init() {
  dom.year.textContent = new Date().getFullYear();
  registrarEventos();

  try {
    const datos = await cargarDatos();
    state.amigos = ordenarPorProximoCumple(datos);
    renderProximoCumple();
    renderGrid();
  } catch (error) {
    console.error('No se pudo cargar datos.json:', error);
    dom.estado.hidden = false;
    dom.estado.textContent =
      'No se pudo cargar datos.json. Si abres index.html directamente desde el disco, ' +
      'usa un servidor local (por ejemplo: python -m http.server) o GitHub Pages.';
  }
}

init();
