let participantes = [];
let partidos = [];

async function leerJSON(url) {
  try {
    const res = await fetch(url + "?v=" + Date.now());
    if (!res.ok) throw new Error("No se encontró " + url);
    return await res.json();
  } catch (error) {
    console.error(error);
    alert("No se pudo leer " + url + ". Revisa que esté en la misma carpeta que index.html");
    return { partidos: [], participantes: [] };
  }
}

async function recargarJSON() {
  const data = await leerJSON("data.json");

  partidos = data.partidos || [];

  participantes = (data.participantes || []).map(p => ({
    ...p,
    apuestas: (p.apuestas || []).map(ap => calcularApuesta(ap))
  }));

  document.getElementById("kpiFuente").textContent = "JSON";
  document.getElementById("estadoLive").innerHTML = `Datos cargados desde <b>data.json</b>.`;

  renderPartidos();
  renderParticipantes();
}

async function cargarLive() {
  const live = await leerJSON("live-results.json");

  if (!live.partidos) {
    alert("live-results.json no tiene partidos");
    return;
  }

  live.partidos.forEach(liveMatch => {
    const partido = partidos.find(p => p.id === liveMatch.id);

    if (partido) {
      partido.real1 = liveMatch.real1;
      partido.real2 = liveMatch.real2;
      partido.estado = liveMatch.estado || partido.estado;
      partido.minuto = liveMatch.minuto || "";
    }
  });

  participantes = participantes.map(p => ({
    ...p,
    apuestas: p.apuestas.map(ap => calcularApuesta(ap))
  }));

  document.getElementById("kpiFuente").textContent = "LIVE";
  document.getElementById("estadoLive").innerHTML = `Resultados actualizados desde <b>live-results.json</b>.`;

  renderPartidos();
  renderParticipantes();
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
    let marcador = "";

    if (p.real1 === null || p.real2 === null) {
      marcador = `
        <div class="score-pending">
          <span>VS</span>
        </div>
      `;
    } else {
      marcador = `
        <div class="score-result">
          <span>${p.real1}</span>
          <span class="dash">-</span>
          <span>${p.real2}</span>
        </div>
      `;
    }
    function getStatusClass(estado) {
      const value = (estado || "").toLowerCase();

      if (value.includes("vivo")) return "status-live";
      if (value.includes("final")) return "status-final";

      return "status-pending";
    }

    function getStatusText(estado) {
      const value = (estado || "").toLowerCase();

      if (value.includes("vivo")) {
        return `EN VIVO ${minuto || ""}`;
      }

      if (value.includes("final")) {
        return "FINAL";
      }

      return "PRÓXIMO";
    }
    const estado = p.estado || (p.real1 === null ? "Pendiente" : "Finalizado");
    const minuto = p.minuto ? ` · ${p.minuto}` : "";

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
          <div class="status ${getStatusClass(estado)}">${getStatusText(estado, minuto)}</div>
        </div>
      </article>
    `;
  }).join("");
}

function renderParticipantes() {
  const buscar = document.getElementById("buscar").value.toLowerCase();

  const ordenados = participantes
    .filter(p => p.nombre.toLowerCase().includes(buscar))
    .map(p => ({ ...p, resumen: resumenPersona(p) }))
    .sort((a, b) => b.resumen.puntos - a.resumen.puntos);

  const tbody = document.getElementById("tablaParticipantes");

  tbody.innerHTML = ordenados.map((p, index) => `
    <tr>
      <td class="pos">#${index + 1}</td>
      <td><b>${p.nombre}</b></td>
      <td>${p.resumen.partidos}</td>
      <td>${p.resumen.exactos}</td>
      <td>${p.resumen.parciales}</td>
      <td>${p.resumen.resultados}</td>
      <td>${p.resumen.fallados}</td>
      <td class="puntos">${p.resumen.puntos}</td>
      <td><button onclick="verDetalle('${p.id}')">Ver</button></td>
    </tr>
  `).join("");

  pintarKpis(ordenados);
}

function pintarKpis(lista) {
  const totalPuntos = lista.reduce((s, p) => s + p.resumen.puntos, 0);

  document.getElementById("kpiParticipantes").textContent = lista.length;
  document.getElementById("kpiPuntos").textContent = totalPuntos;
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

recargarJSON();
