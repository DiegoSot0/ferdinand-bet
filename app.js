let participantes = [];
let participantesBase = [];
let partidos = [];
let partidosTodos = [];
let jornadaSeleccionada = "3";

async function leerCSV(url) {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(url + sep + "v=" + Date.now());
  if (!res.ok) throw new Error("No se pudo leer CSV");
  const texto = await res.text();
  return csvToObjects(texto);
}

function csvToObjects(csv) {
  const filas = csv.trim().split(/\r?\n/).map(row => row.split(","));
  const headers = filas.shift().map(h => h.trim());

  return filas.map(fila => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (fila[i] ?? "").trim());
    return obj;
  });
}

async function recargarJSON() {
  await cargarSheets(true);
}

async function cargarLive() {
  await cargarSheets(true);
}

async function cargarSheets(manual = false) {
  const btn = document.getElementById("btnActualizar");

  if (manual && btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...`;
  }

  try {
    const cfg = window.FERDINAND_CONFIG;

    const resultados = await leerCSV(cfg.resultadosCsv);
    const participantesSheet = await leerCSV(cfg.participantesCsv);
    const apuestasSheet = await leerCSV(cfg.apuestasCsv);

    partidosTodos = resultados.map(r => ({
      jornada: r.Jornada || "1",
      id: Number(r.id),
      fecha: r.Fecha,
      hora: r.Hora,
      equipo1: r.Equipo1,
      equipo2: r.Equipo2,
      real1: r.Real1 === "" ? null : Number(r.Real1),
      real2: r.Real2 === "" ? null : Number(r.Real2),
      estado: r.Estado || "Pendiente"
    }));

    participantesBase = participantesSheet.map(p => {
      const filaApuesta = apuestasSheet.find(a => a.Participante === p.Nombre);

      return {
        id: normalizarId(p.Nombre),
        nombre: p.Nombre,
        apuestasTodas: partidosTodos.map(partido => {
          const valL = filaApuesta?.[`P${partido.id}_L`];
          const valV = filaApuesta?.[`P${partido.id}_V`];

          return {
            partidoId: partido.id,
            goles1: valL === "" || valL === undefined ? null : Number(valL),
            goles2: valV === "" || valV === undefined ? null : Number(valV)
          };
        })
      };
    });

    renderSelectorJornadas();
    aplicarFiltroJornada();

    document.getElementById("kpiFuente").textContent = "SHEETS";
    document.getElementById("estadoLive").innerHTML = `Datos cargados desde <b>Google Sheets</b>.`;

    renderPartidos();
    renderParticipantes();
    renderLiveInfo();
    renderLastUpdate();
    verificarGanadores();

    if (manual && btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i>Actualizado`;
      setTimeout(() => {
        btn.innerHTML = `<i class="bi bi-arrow-clockwise me-1"></i>Actualizar Sheets`;
      }, 1500);
    }

  } catch (error) {
    console.error(error);

    if (manual && btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-exclamation-circle me-2"></i>Error`;
      setTimeout(() => {
        btn.innerHTML = `<i class="bi bi-arrow-clockwise me-1"></i>Actualizar Sheets`;
      }, 2000);
    }

    alert("No se pudo leer Google Sheets. Revisa que las hojas estén publicadas como CSV.");
  }
}

function renderSelectorJornadas() {
  const select = document.getElementById("selectJornada");
  if (!select) return;

  const jornadas = [...new Set(partidosTodos.map(p => p.jornada))]
    .sort((a, b) => Number(a) - Number(b));

  select.innerHTML = `
    <option value="general">General acumulado</option>
    ${jornadas.map(j => `<option value="${j}">Fecha ${j}</option>`).join("")}
  `;

  if (jornadaSeleccionada !== "general" && !jornadas.includes(jornadaSeleccionada)) {
    jornadaSeleccionada = jornadas.includes("2") ? "2" : "general";
  }

  select.value = jornadaSeleccionada;
}

function aplicarFiltroJornada() {
  partidos = jornadaSeleccionada === "general"
    ? [...partidosTodos]
    : partidosTodos.filter(p => p.jornada === jornadaSeleccionada);

  participantes = participantesBase
    .map(p => ({
      id: p.id,
      nombre: p.nombre,
      apuestas: partidos.map(partido => {
        const apuesta = p.apuestasTodas.find(a => a.partidoId === partido.id);

        return calcularApuesta({
          partidoId: partido.id,
          goles1: apuesta?.goles1 ?? null,
          goles2: apuesta?.goles2 ?? null
        });
      })
    }))
    .filter(p => {
      if (jornadaSeleccionada === "general") return true;
      return p.apuestas.some(a => a.goles1 !== null && a.goles2 !== null);
    });
}

function cambiarJornada() {
  jornadaSeleccionada = document.getElementById("selectJornada").value;
  aplicarFiltroJornada();
  renderPartidos();
  renderParticipantes();
  renderLiveInfo();
  renderLastUpdate();
  verificarGanadores();
}

function obtenerRankingActual() {
  return participantes
    .map(p => ({ ...p, resumen: resumenPersona(p) }))
    .sort((a, b) => b.resumen.puntos - a.resumen.puntos);
}

function generarHTMLReporteParticipantes() {
  const ranking = obtenerRankingActual();

  const titulo = jornadaSeleccionada === "general"
    ? "Ranking General"
    : `Ranking Fecha ${jornadaSeleccionada}`;

  return `
    <div id="reporteExportable">
      ${ranking.map((p, index) => `
        <div class="reporte-persona">
          <div class="reporte-header">
            <h1>${titulo}</h1>
            <p>Ferdinand Bet - Polla Mundialista</p>
          </div>

          <h2>#${index + 1} ${p.nombre} - ${p.resumen.puntos} pts</h2>

          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Partido</th>
                <th>Apuesta</th>
                <th>Real</th>
                <th>Estado</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              ${p.apuestas.map((a, i) => {
                const partido = partidos.find(x => x.id === a.partidoId);

                const apuesta = a.goles1 === null || a.goles2 === null
                  ? "Sin apuesta"
                  : `${a.goles1} - ${a.goles2}`;

                const real = partido.real1 === null || partido.real2 === null
                  ? "Pendiente"
                  : `${partido.real1} - ${partido.real2}`;

                return `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${partido.equipo1} vs ${partido.equipo2}</td>
                    <td>${apuesta}</td>
                    <td>${real}</td>
                    <td>${a.estado}</td>
                    <td>${a.puntos}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}
    </div>
  `;
}

async function descargarPDFParticipantes() {
  const contenedor = document.createElement("div");
  contenedor.innerHTML = generarHTMLReporteParticipantes();

  contenedor.style.position = "fixed";
  contenedor.style.left = "-9999px";
  contenedor.style.top = "0";

  document.body.appendChild(contenedor);

  const reporte = contenedor.querySelector("#reporteExportable");
  const bloques = reporte.querySelectorAll(".reporte-persona");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = 210;
  const margin = 10;
  const imgWidth = pageWidth - margin * 2;

  for (let i = 0; i < bloques.length; i++) {
    if (i > 0) pdf.addPage();

    const canvas = await html2canvas(bloques[i], {
      scale: 2,
      backgroundColor: "#ffffff"
    });

    const imgData = canvas.toDataURL("image/png");
    const imgHeight = canvas.height * imgWidth / canvas.width;

    pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
  }

  const nombre = jornadaSeleccionada === "general"
    ? "ranking-general.pdf"
    : `ranking-fecha-${jornadaSeleccionada}.pdf`;

  pdf.save(nombre);
  contenedor.remove();
}

async function descargarImagenParticipantes() {
  const contenedor = document.createElement("div");
  contenedor.innerHTML = generarHTMLReporteParticipantes();

  contenedor.style.position = "fixed";
  contenedor.style.left = "-9999px";
  contenedor.style.top = "0";

  document.body.appendChild(contenedor);

  const reporte = contenedor.querySelector("#reporteExportable");

  const canvas = await html2canvas(reporte, {
    scale: 2,
    backgroundColor: "#ffffff"
  });

  const link = document.createElement("a");
  link.download = jornadaSeleccionada === "general"
    ? "ranking-general.png"
    : `ranking-fecha-${jornadaSeleccionada}.png`;

  link.href = canvas.toDataURL("image/png");
  link.click();

  contenedor.remove();
}

function renderLiveInfo() {
  const live = partidos.find(p => (p.estado || "").toLowerCase().includes("vivo"));
  const contenedor = document.getElementById("liveMatchInfo");

  if (!live) {
    contenedor.innerHTML = `<span class="badge bg-secondary">Sin partido en vivo</span>`;
    return;
  }

  contenedor.innerHTML = `
    <span class="badge bg-danger live-global-badge">● EN VIVO</span>
    <strong>${live.equipo1}</strong>
    <span>${live.real1 ?? 0} - ${live.real2 ?? 0}</span>
    <strong>${live.equipo2}</strong>
  `;
}

function renderLastUpdate() {
  const fecha = new Date().toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  document.getElementById("lastUpdateInfo").innerHTML =
    `Actualizado desde Google Sheets: <b>${fecha}</b>`;
}

function normalizarId(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function torneoFinalizado() {
  return partidos.length > 0 && partidos.every(p =>
    (p.estado || "").toLowerCase().includes("final")
  );
}

function verificarGanadores() {
  if (!torneoFinalizado()) return;

  const ranking = obtenerRankingActual();
  const maxPuntos = ranking[0]?.resumen.puntos ?? 0;
  const ganadores = ranking.filter(p => p.resumen.puntos === maxPuntos);

  document.getElementById("winnerContent").innerHTML = `
    <div class="winner-box">
      <div class="winner-trophy">🏆</div>
      <h1>${ganadores.length > 1 ? "¡Tenemos empate!" : "¡Tenemos Ganador!"}</h1>

      <div class="winner-list">
        ${ganadores.map(g => `<div class="winner-name">👑 ${g.nombre}</div>`).join("")}
      </div>

      <div class="winner-points">${maxPuntos} pts</div>

      <p>
        ${ganadores.length > 1
          ? "Según las reglas, el premio será compartido entre los ganadores."
          : "Felicitaciones por ganar la Polla Mundialista."}
      </p>

      <button class="btn-ver" onclick="cerrarModal('modalGanadores')">
        Ver ranking
      </button>
    </div>
  `;

  abrirModal("modalGanadores");
}

function calcularApuesta(apuesta) {
  const partido = partidos.find(p => p.id === apuesta.partidoId);

  if (apuesta.goles1 === null || apuesta.goles2 === null) {
    return { ...apuesta, puntos: 0, estado: "Sin apuesta" };
  }

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

  return { partidos: persona.apuestas.length, puntos, exactos, parciales, resultados, fallados };
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
          <span>Fecha ${p.jornada} · ${p.fecha}</span>
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

function renderHeadRanking() {
  const head = document.getElementById("tablaHeadRanking");
  if (!head) return;

  head.innerHTML = `
    <th>Pos.</th>
    <th>Participante</th>
    <th>Puntos</th>
    ${partidos.map((p, index) => `<th>P${index + 1}</th>`).join("")}
    <th>Detalle</th>
  `;
}

function renderParticipantes() {
  renderHeadRanking();

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
        : a.estado === "Sin apuesta" ? "pendiente"
        : "fallado";

      const apuestaTexto =
        a.goles1 === null || a.goles2 === null
          ? "Sin apuesta"
          : `${a.goles1} - ${a.goles2}`;

      return `
        <td class="td-partido">
          <span class="mini-point ${clase} ${esVivo ? "mini-live" : ""}">
            ${a.estado === "Pendiente" || a.estado === "Sin apuesta" ? "-" : a.puntos}
          </span>
          <small class="apuesta-mini">${apuestaTexto}</small>
        </td>
      `;
    }).join("");

    return `
      <tr>
        <td class="pos">#${index + 1}</td>
        <td><b>${p.nombre}</b></td>
        <td class="puntos">${p.resumen.puntos}</td>
        ${puntosPorPartido}
        <td>
          <button class="btn-ver" onclick="verDetalle('${p.id}')">Ver</button>
        </td>
      </tr>
    `;
  }).join("");

  pintarKpis(ordenados);
}

function pintarKpis(lista) {
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
      : a.estado === "Sin apuesta" ? "pendiente"
      : "fallado";

    const apuesta = a.goles1 === null || a.goles2 === null
      ? "Sin apuesta"
      : `${a.goles1} - ${a.goles2}`;

    const real = p.real1 === null || p.real2 === null
      ? "Pendiente"
      : `${p.real1} - ${p.real2}`;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${p.fecha}</td>
        <td>${p.hora}</td>
        <td><b>${p.equipo1}</b> vs <b>${p.equipo2}</b></td>
        <td>${apuesta}</td>
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