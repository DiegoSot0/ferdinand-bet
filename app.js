let participantes = [];
let partidos = [];

async function leerCSV(url) {
  const res = await fetch(url + "&v=" + Date.now());
  const texto = await res.text();
  return csvToObjects(texto);
}

function csvToObjects(csv) {
  const filas = csv.trim().split(/\r?\n/).map(row => row.split(","));
  const headers = filas.shift().map(h => h.trim());

  return filas.map(fila => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (fila[i] ?? "").trim();
    });
    return obj;
  });
}

async function recargarJSON() {
  await cargarSheets();
}

async function cargarLive() {
  await cargarSheets();
}

async function cargarSheets() {
  try {
    const cfg = window.FERDINAND_CONFIG;

    const resultados = await leerCSV(cfg.resultadosCsv);
    const participantesSheet = await leerCSV(cfg.participantesCsv);
    const apuestasSheet = await leerCSV(cfg.apuestasCsv);

    partidos = resultados.map(r => ({
      id: Number(r.id),
      fecha: r.Fecha,
      hora: r.Hora,
      equipo1: r.Equipo1,
      equipo2: r.Equipo2,
      real1: r.Real1 === "" ? null : Number(r.Real1),
      real2: r.Real2 === "" ? null : Number(r.Real2),
      estado: r.Estado || "Pendiente"
    }));

    participantes = participantesSheet.map(p => {
      const filaApuesta = apuestasSheet.find(a => a.Participante === p.Nombre);

      return {
        id: normalizarId(p.Nombre),
        nombre: p.Nombre,
        apuestas: partidos.map(partido => {
          const l = Number(filaApuesta?.[`P${partido.id}_L`] ?? 0);
          const v = Number(filaApuesta?.[`P${partido.id}_V`] ?? 0);

          return calcularApuesta({
            partidoId: partido.id,
            goles1: l,
            goles2: v
          });
        })
      };
    });

    document.getElementById("kpiFuente").textContent = "SHEETS";
    document.getElementById("estadoLive").innerHTML = `Datos cargados desde <b>Google Sheets</b>.`;

    renderPartidos();
    renderParticipantes();
    renderLiveInfo();
    renderLastUpdate();
  } catch (error) {
    console.error(error);
    alert("No se pudo leer Google Sheets. Revisa que las hojas estén publicadas como CSV.");
  }
}
function renderLiveInfo() {
  const live = partidos.find(p =>
    (p.estado || "").toLowerCase().includes("vivo")
  );

  const contenedor = document.getElementById("liveMatchInfo");

  if (!live) {
    contenedor.innerHTML = `<span class="badge bg-secondary">Sin partido en vivo</span>`;
    return;
  }

  contenedor.innerHTML = `
    <span class="badge bg-danger live-global-badge">
      ● EN VIVO
    </span>
    <strong>${live.equipo1}</strong>
    <span>${live.real1 ?? 0} - ${live.real2 ?? 0}</span>
    <strong>${live.equipo2}</strong>
  `;
}

function renderLastUpdate() {
  const ahora = new Date();

  const fecha = ahora.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  document.getElementById("lastUpdateInfo").innerHTML = `
    Actualizado desde Google Sheets: <b>${fecha}</b>
  `;
}
function normalizarId(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function calcularApuesta(apuesta) {
  const partido = partidos.find(p => p.id === apuesta.partidoId);

  if (!partido || partido.real1 === null || partido.real2 === null) {
    return { ...apuesta, puntos: 0, estado: "Pendiente" };
  }

  const pred1 = Number(apuesta.goles1);
  const pred2 = Number(apuesta.goles2);
  const real1 = Number(partido.real1);
  const real2 = Number(partido.real2);

  const exacto = pred1 === real1 && pred2 === real2;
  const resultadoPred = signo(pred1 - pred2);
  const resultadoReal = signo(real1 - real2);
  const aciertaResultado = resultadoPred === resultadoReal;
  const aciertaGolEquipo1 = pred1 === real1;
  const aciertaGolEquipo2 = pred2 === real2;

  let puntos = 0;
  let estado = "Fallado";

  if (exacto) {
    puntos = 4;
    estado = "Marcador exacto";
  } else if (aciertaResultado && (aciertaGolEquipo1 || aciertaGolEquipo2)) {
    puntos = 3;
    estado = "Ganador + gol";
  } else if (aciertaResultado) {
    puntos = 2;
    estado = "Resultado";
  }

  return { ...apuesta, puntos, estado };
}

function signo(num) {
  if (num > 0) return 1;
  if (num < 0) return -1;
  return 0;
}

function resumenPersona(persona) {
  const puntos = persona.apuestas.reduce((s, a) => s + a.puntos, 0);
  const exactos = persona.apuestas.filter(a => a.estado === "Marcador exacto").length;
  const parciales = persona.apuestas.filter(a => a.estado === "Ganador + gol").length;
  const resultados = persona.apuestas.filter(a => a.estado === "Resultado").length;
  const fallados = persona.apuestas.filter(a => a.estado === "Fallado").length;

  return {
    partidos: persona.apuestas.length,
    puntos,
    exactos,
    parciales,
    resultados,
    fallados
  };
}

function renderPartidos() {
  const contenedor = document.getElementById("partidosGrid");

  contenedor.innerHTML = partidos.map(p => {
    const marcador = p.real1 === null || p.real2 === null
      ? `<div class="score-pending"><span>VS</span></div>`
      : `<div class="score-result"><span>${p.real1}</span><span class="dash">-</span><span>${p.real2}</span></div>`;

    const estado = p.estado || "Pendiente";

    return `
      <article class="match-card">
        <div class="match-head">
          <span>${p.fecha}</span>
          <span>${p.hora}</span>
        </div>

        <div class="match-body">
          <div class="score-line">
            <span class="team">${p.equipo1}</span>
            ${marcador}
            <span class="team">${p.equipo2}</span>
          </div>

          <div class="status ${getStatusClass(estado)}">${getStatusText(estado)}</div>
        </div>
      </article>
    `;
  }).join("");
}

function getStatusClass(estado) {
  const value = (estado || "").toLowerCase();

  if (value.includes("vivo")) return "status-live";
  if (value.includes("final")) return "status-final";

  return "status-pending";
}

function getStatusText(estado) {
  const value = (estado || "").toLowerCase();

  if (value.includes("vivo")) return "EN VIVO";
  if (value.includes("final")) return "FINAL";

  return "PRÓXIMO";
}

function renderParticipantes() {
  const buscar = document.getElementById("buscar").value.toLowerCase();

  const ordenados = participantes
    .filter(p => p.nombre.toLowerCase().includes(buscar))
    .map(p => ({ ...p, resumen: resumenPersona(p) }))
    .sort((a, b) => b.resumen.puntos - a.resumen.puntos);

  const tbody = document.getElementById("tablaParticipantes");

  tbody.innerHTML = ordenados.map((p, index) => {
    const puntosPorPartido = p.apuestas.map(a => {
      const partido = partidos.find(x => x.id === a.partidoId);
      const esVivo = (partido?.estado || "").toLowerCase().includes("vivo");

      const clase = a.estado === "Marcador exacto" ? "exacto"
        : a.estado === "Ganador + gol" ? "parcial"
          : a.estado === "Resultado" ? "resultado"
            : a.estado === "Pendiente" ? "pendiente"
              : "fallado";

     return `
      <td class="td-partido">
        <span class="mini-point ${clase} ${esVivo ? "mini-live" : ""}">
          ${a.estado === "Pendiente" ? "-" : a.puntos}
        </span>
        <small class="apuesta-mini">${a.goles1} - ${a.goles2}</small>
      </td>
    `;
    }).join("");

    return `
      <tr>
        <td data-label="Pos." class="pos">#${index + 1}</td>

        <td data-label="Participante">
          <b>${p.nombre}</b>
        </td>

        <td data-label="Puntos" class="puntos">${p.resumen.puntos}</td>

        ${puntosPorPartido}

        <td data-label="Detalle">
          <button class="btn-ver" onclick="verDetalle('${p.id}')">Ver</button>
        </td>
      </tr>
    `;
  }).join("");

  pintarKpis(ordenados);
}

function pintarKpis(lista) {
  const totalPuntos = lista.reduce((s, p) => s + p.resumen.puntos, 0);

  document.getElementById("kpiParticipantes").textContent = lista.length;
  document.getElementById("kpiPuntajeMaximo").textContent =
    lista.length ? `${lista[0].resumen.puntos} pts` : "-";
  document.getElementById("kpiLider").textContent = lista[0]?.nombre ?? "-";
}

function verDetalle(id) {
  const persona = participantes.find(p => p.id === id);
  const resumen = resumenPersona(persona);

  document.getElementById("modalTitulo").textContent = `Apuestas de ${persona.nombre}`;

  document.getElementById("detalleResumen").innerHTML = `
    <div><span>Puntos</span><strong>${resumen.puntos}</strong></div>
    <div><span>Exactos</span><strong>${resumen.exactos}</strong></div>
    <div><span>Ganador + gol</span><strong>${resumen.parciales}</strong></div>
    <div><span>Resultado</span><strong>${resumen.resultados}</strong></div>
    <div><span>Fallados</span><strong>${resumen.fallados}</strong></div>
  `;

  document.getElementById("tablaApuestas").innerHTML = persona.apuestas.map((a, index) => {
    const p = partidos.find(x => x.id === a.partidoId);

    const clase = a.estado === "Marcador exacto" ? "exacto"
      : a.estado === "Ganador + gol" ? "parcial"
        : a.estado === "Resultado" ? "resultado"
          : a.estado === "Pendiente" ? "pendiente"
            : "fallado";

    const real = p.real1 === null || p.real2 === null
      ? "Pendiente"
      : `${p.real1} - ${p.real2}`;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${p.fecha}</td>
        <td>${p.hora}</td>
        <td><b>${p.equipo1}</b> vs <b>${p.equipo2}</b></td>
        <td>${a.goles1} - ${a.goles2}</td>
        <td>${real}</td>
        <td><span class="chip ${clase}">${a.estado}</span></td>
        <td class="puntos">${a.puntos}</td>
      </tr>
    `;
  }).join("");

  abrirModal("modalDetalle");
}

function abrirModal(id) {
  document.getElementById(id).classList.add("show");
}

function cerrarModal(id) {
  document.getElementById(id).classList.remove("show");
}

cargarSheets();