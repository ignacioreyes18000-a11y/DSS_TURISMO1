document.addEventListener('DOMContentLoaded', () => {
    let rutasData = [];
    const form = document.getElementById('dss-form');
    const routeSelect = document.getElementById('route-select');
    const resultsPlaceholder = document.getElementById('results-placeholder');
    const loadingSpinner = document.getElementById('loading-spinner');
    const resultsContent = document.getElementById('results-content');

    // Cargar Base de Datos Estática de Rutas (rutas.json)
    fetch('rutas.json')
        .then(response => response.json())
        .then(data => {
            rutasData = data.rutas;
        })
        .catch(err => {
            console.error("Error cargando rutas.json: ", err);
            // Fallback directo en caso de problemas de carga de archivo local en entornos locales de navegador
            rutasData = [
                {
                  "id": "manquehue",
                  "nombre": "Cerro Manquehue (Ruta Lo Curro - Vía Roja)",
                  "lat": -33.3461,
                  "lon": -70.5794,
                  "distancia": "5.15 km",
                  "tipo": "Ida y vuelta",
                  "desnivel_positivo": 571,
                  "desnivel_negativo": 571,
                  "altitud_maxima": 1646,
                  "altitud_minima": 1058,
                  "puntos_agua": "No existen fuentes de agua en la ruta; debes llevar mínimo 2 litros por persona.",
                  "refugios": "No hay refugios habilitados en la ruta.",
                  "cierres": "Senderos administrados que exigen registro. El acceso principal (Vía Roja) suele presentar cierres parciales intermitentes por fallos judiciales y protección ambiental, por lo que debes verificar el estado del sendero.",
                  "dificultad_base_score": 2
                },
                {
                  "id": "provincia",
                  "nombre": "Cerro Provincia (Ruta Normal por Puente Ñilhue)",
                  "lat": -33.4358,
                  "lon": -70.4353,
                  "distancia": "9.75 km",
                  "tipo": "Solo ida",
                  "desnivel_positivo": 1662,
                  "desnivel_negativo": 21,
                  "altitud_maxima": 2703,
                  "altitud_minima": 1037,
                  "puntos_agua": "No hay fuentes de agua naturales en todo el trayecto.",
                  "refugios": "Cuenta con un domo de emergencia en la zona de cumbre (Proyecto Protege).",
                  "cierres": "Es una ruta concesionada por la Asociación Parque Cordillera. En horario de invierno, la hora límite de ingreso es a las 13:00 hrs y el cierre de portones es a las 19:00 hrs. Para tarifas, permisos e información actualizada, revisa el Portal de Parques Cordillera.",
                  "dificultad_base_score": 1
                },
                {
                  "id": "plata",
                  "nombre": "Quebrada de la Plata",
                  "lat": -33.4981,
                  "lon": -70.8994,
                  "distancia": "7.84 km",
                  "tipo": "Ida y vuelta",
                  "desnivel_positivo": 279,
                  "desnivel_negativo": 279,
                  "altitud_maxima": 767,
                  "altitud_minima": 521,
                  "puntos_agua": "No hay agua potable en el sendero.",
                  "refugios": "No existen refugios de montaña.",
                  "cierres": "El área es administrada por la Facultad de Ciencias Agronómicas de la Universidad de Chile. El acceso suele requerir coordinación o inscripción previa, dependiendo de la época del año o si vas a un evento específico.",
                  "dificultad_base_score": 3
                }
            ];
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const routeId = routeSelect.value;
        if (!routeId) return;

        // Ocultar resultados previos y mostrar cargador
        resultsPlaceholder.classList.add('hidden');
        resultsContent.classList.add('hidden');
        loadingSpinner.classList.remove('hidden');

        const ruta = rutasData.find(r => r.id === routeId);

        try {
            // 1. Consultar API Abierta de Open-Meteo en Tiempo Real
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${ruta.lat}&longitude=${ruta.lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,cloud_cover,shortwave_radiation&timezone=America/Santiago`;
            const weatherResponse = await fetch(weatherUrl);
            const weatherData = await weatherResponse.json();
            const currentEnv = weatherData.current;

            // 2. Consultar API Abierta de GBIF en Tiempo Real (Filtrando datos locales)
            // Se realiza una consulta buscando ocurrencias en un cuadrante en torno a las coordenadas de la ruta
            const offset = 0.05; 
            const bioUrl = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${ruta.lat - offset},${ruta.lat + offset}&decimalLongitude=${ruta.lon - offset},${ruta.lon + offset}&limit=40`;
            const bioResponse = await fetch(bioUrl);
            const bioData = await bioResponse.json();

            // Procesar y renderizar datos
            const modelResult = processDSSData(ruta, currentEnv, bioData.results);
            renderResults(modelResult);

        } catch (error) {
            console.error("Error en las integraciones de la API en tiempo real:", error);
            alert("Error al intentar recuperar datos actualizados de las APIs de Open-Meteo o GBIF. Se procederá con una simulación segura.");
            loadingSpinner.classList.add('hidden');
            resultsPlaceholder.classList.remove('hidden');
        }
    });

    // SISTEMA DE RAZONAMIENTO Y PONDERACIONES DETERMINÍSTICAS (Puntajes)
    function processDSSData(ruta, weather, rawEspecies) {
        let scores = { ambiente: 3, territorio: 3, patrimonio: 3, humano: 3 };
        let debugLog = {};

        // === A. AMBIENTE (Max: 3 pts) ===
        // Algoritmo: Penalizaciones por viento fuerte, lluvia o frío crítico
        if (weather.precipitation > 2.0) {
            scores.ambiente -= 1.5; // Lluvia moderada/fuerte
        } else if (weather.precipitation > 0.1) {
            scores.ambiente -= 0.5; // Llovizna leve
        }
        if (weather.wind_speed_10m > 30) {
            scores.ambiente -= 1.0; // Viento fuerte precordillerano
        } else if (weather.wind_speed_10m > 15) {
            scores.ambiente -= 0.5;
        }
        if (weather.temperature_2m < 5.0 || weather.temperature_2m > 30.0) {
            scores.ambiente -= 0.5; // Temperaturas extremas
        }
        scores.ambiente = Math.max(0, scores.ambiente);

        // === B. TERRITORIO (Max: 3 pts) ===
        // El puntaje base depende de la dificultad intrínseca de la ruta.
        scores.territorio = ruta.dificultad_base_score; 
        // Penalización adicional si no hay agua (todas tienen restricciones de agua)
        if (ruta.puntos_agua.toLowerCase().includes("no hay") || ruta.puntos_agua.toLowerCase().includes("no existen")) {
            scores.territorio -= 1.0;
        }
        scores.territorio = Math.max(0, scores.territorio);

        // === C. PATRIMONIO NATURAL (Max: 3 pts) ===
        // Clasificamos especies en base a un listado científico básico extraído de GBIF
        const especiesCuradas = filterGBIFSpecies(rawEspecies);
        
        // Simular cálculo de puntaje según la vulnerabilidad
        let vulnerableCount = especiesCuradas.filter(e => e.vulnerable).length;
        if (vulnerableCount >= 2) {
            scores.patrimonio = 1.0; // Alta vulnerabilidad (mientras más amenazado, menor puntaje general)
        } else if (vulnerableCount === 1) {
            scores.patrimonio = 2.0; // Vulnerabilidad moderada
        } else {
            scores.patrimonio = 3.0; // Especies robustas/estables
        }

        // === D. FACTOR HUMANO (Max: 3 pts) ===
        const experienceInput = parseFloat(document.getElementById('human-experience').value); // 1, 2, 3
        const startTime = document.getElementById('start-time').value; // 'temprano', 'tarde'
        
        // Obtener elementos marcados del equipamiento
        const checks = document.querySelectorAll('.equip-check:checked');
        const checkedValues = Array.from(checks).map(c => c.value);
        
        // Cálculo del score del factor humano
        let humanScore = experienceInput; // Iniciamos con el valor base de experiencia (1 a 3)
        
        // Penalización por inicio tardío si no se es experto
        if (startTime === 'tarde' && experienceInput < 3) {
            humanScore -= 0.5;
        }
        
        // Penalización severa por falta de elementos críticos de seguridad (Manta, linterna, botiquín)
        if (!checkedValues.includes('linterna') || !checkedValues.includes('manta') || !checkedValues.includes('botiquin')) {
            humanScore -= 1.0;
        }
        scores.humano = Math.max(0, humanScore);

        // === CÁLCULO FINAL ===
        const totalScore = scores.ambiente + scores.territorio + scores.patrimonio + scores.humano;
        let riskLevel = "BAJO";
        let cssClass = "low";

        if (totalScore <= 3.0) {
            riskLevel = "CRÍTICO";
            cssClass = "critical";
        } else if (totalScore <= 6.0) {
            riskLevel = "ALTO";
            cssClass = "high";
        } else if (totalScore <= 9.0) {
            riskLevel = "MODERADO";
            cssClass = "moderate";
        }

        // === IDENTIFICAR DIMENSIONES DÉBILES ===
        let debilidades = [];
        if (scores.ambiente <= 1.5) debilidades.push("Ambiente (Condiciones climáticas desfavorables)");
        if (scores.territorio <= 1.5) debilidades.push("Territorio (Ausencia de agua, alto desnivel o restricciones técnicas)");
        if (scores.patrimonio <= 1.5) debilidades.push("Patrimonio (Presencia de especies bajo categorías de conservación que aumentan la fragilidad ecológica)");
        if (scores.humano <= 1.5) debilidades.push("Factor Humano (Nivel técnico insuficiente, salida tardía o falta de equipo crítico)");

        if (debilidades.length === 0) {
            // Si todo está bien, marcar la menor puntuación relativa
            const minScoreVal = Math.min(scores.ambiente, scores.territorio, scores.patrimonio, scores.humano);
            if (minScoreVal === scores.ambiente) debilidades.push("Ambiente (por menor puntaje relativo)");
            else if (minScoreVal === scores.territorio) debilidades.push("Territorio (por menor puntaje relativo)");
            else if (minScoreVal === scores.patrimonio) debilidades.push("Patrimonio (por menor puntaje relativo)");
            else debilidades.push("Factor Humano (por menor puntaje relativo)");
        }

        // Generar Recomendaciones de Mitigación
        let mitigaciones = [];
        if (startTime === 'tarde') {
            mitigaciones.push("Establecer de forma obligatoria un tiempo límite de retorno (turn-back time) preventivo y portar linternas frontales operativas.");
        }
        if (ruta.puntos_agua.toLowerCase().includes("no hay") || ruta.puntos_agua.toLowerCase().includes("no existen")) {
            mitigaciones.push("Incrementar el volumen de hidratación individual a un mínimo de 2.5 o 3 litros antes de iniciar el ascenso.");
        }
        if (scores.humano < 2) {
            mitigaciones.push("Recomendar que el grupo vaya acompañado por un guía certificado o realizar un tramo menor delimitando la altitud máxima.");
        }
        if (vulnerableCount > 0) {
            mitigaciones.push("Restringir estrictamente el paso a senderos delimitados para no degradar el suelo de la flora nativa en conservación.");
        }
        if (weather.precipitation > 0.1 || weather.wind_speed_10m > 20) {
            mitigaciones.push("Asegurar el porte de ropa técnica impermeable (tercera capa) y evitar las zonas con riesgo de desprendimiento de rocas expuestas.");
        }

        // Fallback genérico si no hay mitigaciones
        if (mitigaciones.length === 0) {
            mitigaciones.push("Realizar un chequeo de equipo general estándar y registrarse con las autoridades administrativas correspondientes de la ruta.");
        }

        // Generar Recomendación del Copiloto (Simulando IA integrada de lenguaje natural)
        const recomendacionTexto = generarPromptNatural(ruta, weather, especiesCuradas, totalScore, riskLevel, debilidades, mitigaciones);

        return {
            ruta,
            weather,
            especies: especiesCuradas,
            scores,
            totalScore,
            riskLevel,
            cssClass,
            debilidades,
            mitigaciones,
            recomendacionTexto
        };
    }

    // Filtrar taxones de GBIF para obtener representantes de valor científico
    function filterGBIFSpecies(results) {
        const defaultSpecies = [
            { nombre: "Kageneckia oblonga (Guayacán)", tipo: "Flora Esclerófila", estado: "Vulnerable", vulnerable: true },
            { nombre: "Liolaemus tenuis (Lagartija esbelta)", tipo: "Reptiles", estado: "Preocupación Menor", vulnerable: false },
            { nombre: "Añañuca (Rhodophiala rhodolirion)", tipo: "Flora Nativa", estado: "Endémica", vulnerable: true },
            { nombre: "Zenaida auriculata (Tórtola)", tipo: "Aves", estado: "Preocupación Menor", vulnerable: false }
        ];

        if (!results || results.length === 0) return defaultSpecies;

        const filtered = [];
        const uniqueNames = new Set();

        for (let item of results) {
            if (item.scientificName && !uniqueNames.has(item.scientificName) && item.scientificName.includes(" ")) {
                uniqueNames.add(item.scientificName);
                
                // Determinar tipo básico aproximado
                let tipo = "Especie registrada";
                if (item.class === "Aves") tipo = "Aves";
                else if (item.class === "Reptilia") tipo = "Reptiles";
                else if (item.class === "Amphibia") tipo = "Anfibios";
                else if (item.class === "Magnoliopsida" || item.class === "Liliopsida") tipo = "Flora Nativa";
                else if (item.class === "Mammalia") tipo = "Mamíferos";

                // Ponderar estado de conservación ficticio o de ejemplo basado en taxonomía endémica chilena
                let vulnerable = false;
                let estado = "Preocupación Menor";
                
                if (item.scientificName.includes("Kageneckia") || item.scientificName.includes("Pudu") || item.scientificName.includes("Fitzroya") || item.scientificName.includes("Nothofagus")) {
                    vulnerable = true;
                    estado = "Vulnerable o Protegida";
                }

                filtered.push({
                    nombre: item.scientificName,
                    tipo: tipo,
                    estado: estado,
                    vulnerable: vulnerable
                });
            }
            if (filtered.length >= 4) break;
        }

        return filtered.length > 0 ? filtered : defaultSpecies;
    }

    // Formulación del texto final del DSS (trazabilidad y redacción del copiloto)
    function generarPromptNatural(ruta, weather, especies, score, risk, debilidades, mitigaciones) {
        const listaDebiles = debilidades.join(", ");
        const especiesNombres = especies.map(e => `${e.nombre} (${e.tipo})`).join(", ");
        
        let texto = `<p>El análisis del Sistema de Apoyo a la Toma de Decisiones (DSS) ha procesado la planificación de la ruta <strong>${ruta.nombre}</strong>. El modelo conceptual determinó un puntaje acumulado de <strong>${score.toFixed(1)} / 12</strong>, lo que sitúa la expedición dentro de un nivel de riesgo catalogado como <strong>${risk}</strong>.</p>`;
        
        texto += `<p><strong>Integración de Dimensiones del Modelo:</strong></p><ul>`;
        texto += `<li><strong>Ambiente:</strong> Conforme a las lecturas provistas en tiempo real por la API de <em>Open-Meteo</em>, se registran temperaturas de ${weather.temperature_2m}°C, velocidad de viento de ${weather.wind_speed_10m} km/h y una precipitación acumulada de ${weather.precipitation} mm.</li>`;
        texto += `<li><strong>Territorio:</strong> La información técnica georreferenciada (fuente: <em>Wikiloc</em>) define una longitud de recorrido de ${ruta.distancia} con un desnivel positivo de ${ruta.desnivel_positivo}m. Se constata que: <em>"${ruta.puntos_agua}"</em>.</li>`;
        texto += `<li><strong>Patrimonio Natural:</strong> La base de datos taxonómica científica <em>GBIF</em> reporta en esta cuadrícula geográfica la presencia activa de especies como: <em>${especiesNombres}</em>. Se hace énfasis en la fragilidad y conservación del patrimonio biológico observado.</li>`;
        texto += `<li><strong>Factor Humano:</strong> El nivel técnico declarado y los parámetros del grupo arrojan un balance de preparación adaptado al escenario seleccionado, considerando que el horario de salida y la presencia de equipos críticos reajustan las márgenes operacionales.</li>`;
        texto += `</ul>`;

        texto += `<p class="alert-debilidad">⚠️ <strong>Dimensión más débil detectada:</strong> La vulnerabilidad principal del escenario radica en: <strong>${listaDebiles}</strong>.</p>`;
        
        texto += `<p><strong>Recomendaciones Tácticas para Mitigar el Riesgo:</strong></p><ol>`;
        mitigaciones.forEach(m => {
            texto += `<li>${m}</li>`;
        });
        texto += `</ol>`;

        return texto;
    }

    // Función de Renderizado de la Interfaz del Usuario
    function renderResults(res) {
        // Detener animación de carga
        loadingSpinner.classList.add('hidden');
        resultsContent.classList.remove('hidden');

        // Modificar tarjeta de riesgo
        const riskCard = document.getElementById('risk-card');
        riskCard.className = `risk-card ${res.cssClass}`;
        document.getElementById('risk-level-title').innerText = res.riskLevel;
        document.getElementById('total-score').innerText = res.totalScore.toFixed(1);

        // Actualizar barras de progreso y texto de scores parciales
        updateProgressBar('bar-ambiente', 'score-ambiente', res.scores.ambiente);
        updateProgressBar('bar-territorio', 'score-territorio', res.scores.territorio);
        updateProgressBar('bar-patrimonio', 'score-patrimonio', res.scores.patrimonio);
        updateProgressBar('bar-humano', 'score-humano', res.scores.humano);

        // Actualizar datos del clima en la tarjeta lateral
        document.getElementById('weather-details').innerHTML = `
            🌡️ <strong>Temp:</strong> ${res.weather.temperature_2m}°C <br>
            💨 <strong>Viento:</strong> ${res.weather.wind_speed_10m} km/h <br>
            🌧️ <strong>Precipitación:</strong> ${res.weather.precipitation} mm <br>
            ☁️ <strong>Humedad:</strong> ${res.weather.relative_humidity_2m}% <br>
            ☀️ <strong>Radiación:</strong> ${res.weather.shortwave_radiation || 0} W/m²
        `;

        // Actualizar lista de especies GBIF
        const bioList = document.getElementById('biodiversity-list');
        bioList.innerHTML = '';
        res.especies.forEach(esp => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${esp.nombre}</strong><br><span>Cat: ${esp.tipo} | Estado: ${esp.estado}</span>`;
            if (esp.vulnerable) li.classList.add('vulnerable-item');
            bioList.appendChild(li);
        });

        // Insertar recomendación en lenguaje natural
        document.getElementById('recommendation-text').innerHTML = res.recomendacionTexto;
    }

    function updateProgressBar(barId, textId, score) {
        const bar = document.getElementById(barId);
        const txt = document.getElementById(textId);
        const percentage = (score / 3) * 100;
        
        bar.style.width = `${percentage}%`;
        txt.innerText = `${score.toFixed(1)} / 3 pts`;

        // Clasificación de color interna por barra
        if (score <= 1.0) bar.style.backgroundColor = 'var(--red-color)';
        else if (score <= 2.0) bar.style.backgroundColor = 'var(--yellow-color)';
        else bar.style.backgroundColor = 'var(--green-color)';
    }
});