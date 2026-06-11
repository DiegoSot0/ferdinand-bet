# Ferdinand Bet - Proyecto completo

Página estática para GitHub Pages.

## Archivos

- index.html: estructura principal.
- style.css: diseño.
- app.js: lógica de ranking, modal y puntaje.
- data.json: partidos, participantes y apuestas.
- live-results.json: resultados para botón "Actualizar live".
- assets/logo-ferdinand-bet.png: logo.

## Cómo subir a GitHub Pages

1. Crea un repositorio.
2. Sube todos los archivos.
3. Entra a Settings > Pages.
4. Source: Deploy from branch.
5. Branch: main / root.
6. Guarda.

## Cómo actualizar resultados

Edita `data.json`:

```json
"real1": 2,
"real2": 0,
"estado": "Finalizado"
```

Si aún no se jugó:

```json
"real1": null,
"real2": null,
"estado": "Pendiente"
```

## Cómo agregar participantes

En `data.json`, copia un bloque dentro de `participantes` y cambia:
- id
- nombre
- goles1 / goles2 por cada partido

## Puntaje

- 4 puntos: marcador exacto.
- 3 puntos: acierta resultado y goles de uno de los equipos.
- 2 puntos: acierta solo resultado.
- 0 puntos: fallado.
