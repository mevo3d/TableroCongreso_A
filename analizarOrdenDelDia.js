const fs = require('fs');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const path = require('path');

// CONFIGURACIÓN CENTRALIZADA
const CONFIG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'tu-api-key-aqui',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'tu-bot-token-aqui',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'tu-chat-id-aqui',
  ARCHIVO_ULTIMO_PATH: 'C:/Users/BALERION/proyectos-automatizacion/mananera-playwright/Media/ultimo_archivo.txt',
  MAX_TEXTO_PDF: 20000, // Aumentado para capturar todo el orden del día
  MAX_TOKENS_RESPUESTA: 3000, // Aumentado para respuestas más detalladas
  TIMEOUT_REQUEST: 60000,
  REINTENTOS_MAXIMO: 3
};

// UTILIDADES MEJORADAS CON ZONA HORARIA CDMX
function obtenerFechaCDMX() {
  return new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

const Logger = {
  info: (mensaje) => console.log(`ℹ️  ${obtenerFechaCDMX()} - ${mensaje}`),
  success: (mensaje) => console.log(`✅ ${obtenerFechaCDMX()} - ${mensaje}`),
  error: (mensaje, error = null) => {
    console.error(`❌ ${obtenerFechaCDMX()} - ${mensaje}`);
    if (error) {
      console.error('Detalles:', error.response?.data || error.message || error);
    }
  },
  warning: (mensaje) => console.warn(`⚠️  ${obtenerFechaCDMX()} - ${mensaje}`)
};

// FUNCIÓN ESPECÍFICA PARA EXTRAER INICIATIVAS Y DICTÁMENES
function extraerIniciativasYDictamenes(textoPDF) {
  const resultado = {
    iniciativas: [],
    dictamenesPrimeraLectura: [],
    dictamenesSegundaLectura: [],
    totalIniciativas: 0,
    totalDictamenes: 0
  };

  try {
    const lineas = textoPDF.split('\n');
    let seccionActual = '';
    let iniciativaActual = '';
    let numeroIniciativa = 0;
    
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      
      // Detectar secciones principales
      if (linea.match(/^[A-Z]\)/) || linea.includes('Iniciativas.') || linea === 'G) Iniciativas.') {
        if (linea.includes('Iniciativas')) {
          seccionActual = 'INICIATIVAS';
          continue;
        }
      }
      
      if (linea.includes('Dictámenes de Primera Lectura')) {
        seccionActual = 'DICTAMENES_PRIMERA';
        continue;
      }
      
      if (linea.includes('Dictámenes de Segunda Lectura')) {
        seccionActual = 'DICTAMENES_SEGUNDA';
        continue;
      }
      
      // Procesar contenido según la sección
      if (seccionActual === 'INICIATIVAS') {
        // Detectar inicio de una nueva iniciativa (numerada)
        const matchIniciativa = linea.match(/^(\d+)\.\s+Iniciativa/);
        if (matchIniciativa) {
          // Si había una iniciativa previa, guardarla
          if (iniciativaActual) {
            resultado.iniciativas.push({
              numero: numeroIniciativa,
              descripcion: iniciativaActual.trim()
            });
          }
          numeroIniciativa = parseInt(matchIniciativa[1]);
          iniciativaActual = linea;
        } else if (numeroIniciativa > 0 && linea && !linea.match(/^[A-Z]\)/)) {
          // Continuar agregando líneas a la iniciativa actual
          iniciativaActual += ' ' + linea;
        }
      }
      
      if (seccionActual === 'DICTAMENES_PRIMERA') {
        const matchDictamen = linea.match(/^(\d+)\.\s+Dictamen/);
        if (matchDictamen) {
          let dictamenCompleto = linea;
          // Capturar las siguientes líneas hasta encontrar otro número o sección
          let j = i + 1;
          while (j < lineas.length && !lineas[j].match(/^\d+\./) && !lineas[j].match(/^[A-Z]\)/)) {
            if (lineas[j].trim()) {
              dictamenCompleto += ' ' + lineas[j].trim();
            }
            j++;
          }
          resultado.dictamenesPrimeraLectura.push({
            numero: parseInt(matchDictamen[1]),
            descripcion: dictamenCompleto.trim()
          });
        }
      }
      
      if (seccionActual === 'DICTAMENES_SEGUNDA') {
        const matchDictamen = linea.match(/^(\d+)\.\s+Dictamen/);
        if (matchDictamen) {
          let dictamenCompleto = linea;
          // Capturar las siguientes líneas hasta encontrar otro número o sección
          let j = i + 1;
          while (j < lineas.length && !lineas[j].match(/^\d+\./) && !lineas[j].match(/^[A-Z]\)/)) {
            if (lineas[j].trim()) {
              dictamenCompleto += ' ' + lineas[j].trim();
            }
            j++;
          }
          resultado.dictamenesSegundaLectura.push({
            numero: parseInt(matchDictamen[1]),
            descripcion: dictamenCompleto.trim()
          });
        }
      }
    }
    
    // Guardar la última iniciativa si existe
    if (iniciativaActual && seccionActual === 'INICIATIVAS') {
      resultado.iniciativas.push({
        numero: numeroIniciativa,
        descripcion: iniciativaActual.trim()
      });
    }
    
    // Calcular totales
    resultado.totalIniciativas = resultado.iniciativas.length;
    resultado.totalDictamenes = resultado.dictamenesPrimeraLectura.length + resultado.dictamenesSegundaLectura.length;
    
    Logger.success(`Extracción completada: ${resultado.totalIniciativas} iniciativas y ${resultado.totalDictamenes} dictámenes encontrados`);
    
  } catch (error) {
    Logger.error('Error extrayendo iniciativas y dictámenes', error);
  }
  
  return resultado;
}

// FUNCIÓN PARA GENERAR PROMPT ESPECÍFICO PARA ORDEN DEL DÍA
function generarPromptOrdenDelDia(iniciativasExtraidas) {
  const fechaActual = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
🏛️ *Eres un asistente legislativo especializado* en análisis del orden del día del Congreso del Estado de Morelos.

Tu tarea es crear un resumen COMPLETO y DETALLADO del orden del día, organizando TODAS las iniciativas y dictámenes de manera clara y estructurada.

📋 *Formato requerido del resumen:*

*🏛️ ORDEN DEL DÍA - CONGRESO DE MORELOS*
📅 Fecha: ${fechaActual}
📍 Sesión Ordinaria de Pleno

*📊 RESUMEN EJECUTIVO*
✅ Total de iniciativas: ${iniciativasExtraidas.totalIniciativas}
✅ Dictámenes primera lectura: ${iniciativasExtraidas.dictamenesPrimeraLectura.length}
✅ Dictámenes segunda lectura: ${iniciativasExtraidas.dictamenesSegundaLectura.length}
✅ Total de asuntos a tratar: ${iniciativasExtraidas.totalIniciativas + iniciativasExtraidas.totalDictamenes}

*🎯 INICIATIVAS PRESENTADAS* (${iniciativasExtraidas.totalIniciativas})

${iniciativasExtraidas.iniciativas.map((ini, idx) => `
*${idx + 1}. ${obtenerTituloIniciativa(ini.descripcion)}*
📝 *Descripción:* ${obtenerDescripcionIniciativa(ini.descripcion)}
👤 *Presentada por:* ${obtenerPresentador(ini.descripcion)}
🏛️ *Partido:* ${obtenerPartido(ini.descripcion)}
🎯 *Impacto:* ${determinarImpacto(ini.descripcion)}
`).join('\n')}

*📑 DICTÁMENES PRIMERA LECTURA* (${iniciativasExtraidas.dictamenesPrimeraLectura.length})

${iniciativasExtraidas.dictamenesPrimeraLectura.slice(0, 10).map((dict, idx) => `
*${idx + 1}. ${obtenerComision(dict.descripcion)}*
📋 ${obtenerTemaDict(dict.descripcion)}
`).join('\n')}

*📑 DICTÁMENES SEGUNDA LECTURA* (${iniciativasExtraidas.dictamenesSegundaLectura.length})

${iniciativasExtraidas.dictamenesSegundaLectura.slice(0, 10).map((dict, idx) => `
*${idx + 1}. ${obtenerComision(dict.descripcion)}*
📋 ${obtenerTemaDict(dict.descripcion)}
`).join('\n')}

*🔍 ANÁLISIS Y TEMAS CLAVE:*
🔹 Reformas constitucionales propuestas
🔹 Modificaciones a leyes estatales
🔹 Asuntos de seguridad y justicia
🔹 Temas de desarrollo municipal
🔹 Iniciativas de bienestar social

*⚡ INICIATIVAS PRIORITARIAS:*
[Identificar las 3-5 iniciativas más importantes por su impacto]

*📌 NOTAS IMPORTANTES:*
- Las iniciativas están listas para que el presidente inicie la sesión
- Todos los dictámenes han pasado por comisiones
- Se requiere quórum legal para votaciones

⚠️ *INSTRUCCIONES CRÍTICAS:*
- INCLUIR TODAS las iniciativas sin excepción
- Extraer y mostrar TODOS los presentadores (diputados)
- Identificar TODOS los partidos políticos mencionados
- NO omitir ningún dictamen importante
- Usar formato claro y estructurado para WhatsApp/Telegram
- Resaltar temas controversiales o de alto impacto
`;
}

// Funciones auxiliares para extraer información específica
function obtenerTituloIniciativa(descripcion) {
  const match = descripcion.match(/Iniciativa con proyecto de decreto por el que se (.+?)(?:;|presentada)/);
  return match ? match[1].trim() : descripcion.substring(0, 100);
}

function obtenerDescripcionIniciativa(descripcion) {
  return descripcion.replace(/^\d+\.\s+/, '').substring(0, 200) + '...';
}

function obtenerPresentador(descripcion) {
  const match = descripcion.match(/presentada por (?:el |la )?(.+?)(?:\(|$)/);
  return match ? match[1].trim() : 'No especificado';
}

function obtenerPartido(descripcion) {
  const match = descripcion.match(/\(([A-Z]+)\)/);
  return match ? match[1] : 'No especificado';
}

function determinarImpacto(descripcion) {
  if (descripcion.toLowerCase().includes('constitución')) return '⚡ Alto - Reforma Constitucional';
  if (descripcion.toLowerCase().includes('penal')) return '⚖️ Alto - Materia Penal';
  if (descripcion.toLowerCase().includes('salud')) return '🏥 Medio - Salud Pública';
  if (descripcion.toLowerCase().includes('municipal')) return '🏛️ Medio - Desarrollo Municipal';
  return '📋 Regular';
}

function obtenerComision(descripcion) {
  const match = descripcion.match(/Dictamen\s+emanado\s+de\s+la\s+Comisión\s+de\s+(.+?),/);
  return match ? `Comisión de ${match[1]}` : 'Comisión';
}

function obtenerTemaDict(descripcion) {
  const match = descripcion.match(/por el que se (.+?)$/);
  return match ? match[1].substring(0, 150) + '...' : descripcion.substring(0, 150) + '...';
}

// FUNCIÓN PARA COMUNICARSE CON OPENAI (ADAPTADA PARA ORDEN DEL DÍA)
async function analizarOrdenConOpenAI(textoExtraido, iniciativasExtraidas, intento = 1) {
  try {
    Logger.info(`🤖 Enviando a OpenAI para análisis del orden del día (intento ${intento}/${CONFIG.REINTENTOS_MAXIMO})`);
    
    const prompt = generarPromptOrdenDelDia(iniciativasExtraidas);
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente legislativo experto en analizar órdenes del día del Congreso. Tu tarea es crear resúmenes completos y detallados de TODAS las iniciativas y dictámenes.',
          },
          {
            role: 'user',
            content: prompt,
          },
          {
            role: 'user',
            content: `Este es el contenido completo del orden del día extraído del PDF. DEBES incluir TODAS las iniciativas y dictámenes:\n\n${JSON.stringify(iniciativasExtraidas, null, 2)}`,
          }
        ],
        temperature: 0.3, // Menor temperatura para mayor precisión
        max_tokens: CONFIG.MAX_TOKENS_RESPUESTA,
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: CONFIG.TIMEOUT_REQUEST
      }
    );

    const resumen = response.data.choices[0]?.message?.content;
    
    if (!resumen) {
      throw new Error('OpenAI no devolvió un resumen válido');
    }

    Logger.success('🎯 Resumen del orden del día generado exitosamente');
    return resumen;

  } catch (error) {
    Logger.error(`Error en OpenAI (intento ${intento})`, error);
    
    if (intento < CONFIG.REINTENTOS_MAXIMO) {
      Logger.info(`🔄 Reintentando en 5 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return analizarOrdenConOpenAI(textoExtraido, iniciativasExtraidas, intento + 1);
    }
    
    throw error;
  }
}

// FUNCIÓN PARA ENVIAR POR TELEGRAM
async function enviarPorTelegram(resumen, intento = 1) {
  try {
    Logger.info(`📱 Enviando a Telegram (intento ${intento}/${CONFIG.REINTENTOS_MAXIMO})`);
    
    // Para mensajes largos, dividir en partes si es necesario
    const MAX_LENGTH = 4000;
    const mensajes = [];
    
    if (resumen.length > MAX_LENGTH) {
      let tempResumen = resumen;
      while (tempResumen.length > 0) {
        let corte = Math.min(MAX_LENGTH, tempResumen.length);
        // Buscar un salto de línea cerca del corte para no cortar a mitad de palabra
        const ultimoSalto = tempResumen.lastIndexOf('\n', corte);
        if (ultimoSalto > corte - 500) {
          corte = ultimoSalto;
        }
        mensajes.push(tempResumen.substring(0, corte));
        tempResumen = tempResumen.substring(corte);
      }
    } else {
      mensajes.push(resumen);
    }
    
    // Enviar cada parte
    for (const mensaje of mensajes) {
      const response = await axios.post(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          text: mensaje,
          parse_mode: 'Markdown'
        },
        {
          timeout: CONFIG.TIMEOUT_REQUEST
        }
      );

      if (!response.data.ok) {
        throw new Error(`Error de Telegram API: ${JSON.stringify(response.data)}`);
      }
      
      // Pequeña pausa entre mensajes para evitar límites de rate
      if (mensajes.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    Logger.success('📨 Orden del día enviado por Telegram a @MonitorMor_bot');

  } catch (error) {
    Logger.error(`Error en Telegram (intento ${intento})`, error);
    
    if (intento < CONFIG.REINTENTOS_MAXIMO) {
      Logger.info(`🔄 Reintentando en 3 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return enviarPorTelegram(resumen, intento + 1);
    }
    
    throw error;
  }
}

// FUNCIÓN PARA EXTRAER TEXTO DEL PDF
async function extraerTextoPDF(rutaPDF) {
  try {
    Logger.info(`📄 Extrayendo texto de: ${path.basename(rutaPDF)}`);
    
    const dataBuffer = fs.readFileSync(rutaPDF);
    const pdfData = await pdfParse(dataBuffer);
    
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error('El PDF no contiene texto extraíble');
    }
    
    Logger.success(`Texto extraído: ${pdfData.text.length} caracteres`);
    return pdfData.text;
    
  } catch (error) {
    Logger.error('Error extrayendo texto del PDF', error);
    throw error;
  }
}

// FUNCIÓN PRINCIPAL
async function ejecutarAnalisisOrdenDelDia() {
  const tiempoInicio = Date.now();
  
  try {
    Logger.info('🚀 Iniciando análisis del Orden del Día del Congreso de Morelos...');
    
    // Validar configuración
    if (!CONFIG.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY.length < 20) {
      throw new Error('API Key de OpenAI inválida');
    }
    
    // Obtener ruta del PDF
    let rutaPDF;
    if (fs.existsSync(CONFIG.ARCHIVO_ULTIMO_PATH)) {
      rutaPDF = fs.readFileSync(CONFIG.ARCHIVO_ULTIMO_PATH, 'utf-8').trim();
    } else {
      // Buscar el PDF más reciente del orden del día
      const downloadsDir = 'C:\\Users\\BALERION\\Downloads';
      const files = fs.readdirSync(downloadsDir);
      const ordenDelDia = files
        .filter(f => f.includes('ORDEN') && f.endsWith('.pdf'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(downloadsDir, a));
          const statB = fs.statSync(path.join(downloadsDir, b));
          return statB.mtime - statA.mtime;
        });
      
      if (ordenDelDia.length > 0) {
        rutaPDF = path.join(downloadsDir, ordenDelDia[0]);
        Logger.info(`📁 Usando PDF más reciente: ${ordenDelDia[0]}`);
      } else {
        throw new Error('No se encontró ningún PDF del orden del día');
      }
    }
    
    // Extraer texto del PDF
    const textoExtraido = await extraerTextoPDF(rutaPDF);
    
    // Extraer iniciativas y dictámenes
    const iniciativasExtraidas = extraerIniciativasYDictamenes(textoExtraido);
    
    // Mostrar resumen de extracción
    console.log('\n📊 RESUMEN DE EXTRACCIÓN:');
    console.log('='.repeat(50));
    console.log(`✅ Iniciativas encontradas: ${iniciativasExtraidas.totalIniciativas}`);
    console.log(`✅ Dictámenes primera lectura: ${iniciativasExtraidas.dictamenesPrimeraLectura.length}`);
    console.log(`✅ Dictámenes segunda lectura: ${iniciativasExtraidas.dictamenesSegundaLectura.length}`);
    console.log(`✅ Total de asuntos: ${iniciativasExtraidas.totalIniciativas + iniciativasExtraidas.totalDictamenes}`);
    console.log('='.repeat(50));
    
    // Si no se encontraron iniciativas, mostrar advertencia pero continuar
    if (iniciativasExtraidas.totalIniciativas === 0) {
      Logger.warning('⚠️ No se encontraron iniciativas. Verificar formato del PDF.');
    }
    
    // Analizar con OpenAI
    const resumen = await analizarOrdenConOpenAI(textoExtraido, iniciativasExtraidas);
    
    // Mostrar resumen
    console.log('\n📋 RESUMEN GENERADO:');
    console.log('='.repeat(50));
    console.log(resumen);
    console.log('='.repeat(50));
    
    // Enviar por Telegram
    await enviarPorTelegram(resumen);
    
    // Guardar resumen en archivo
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    const archivoResumen = `orden_dia_resumen_${fechaArchivo}.txt`;
    fs.writeFileSync(archivoResumen, resumen);
    Logger.success(`📄 Resumen guardado en: ${archivoResumen}`);
    
    const tiempoTotal = Date.now() - tiempoInicio;
    Logger.success(`🎉 Proceso completado en ${tiempoTotal}ms`);
    
    // Retornar estadísticas
    return {
      exito: true,
      iniciativas: iniciativasExtraidas.totalIniciativas,
      dictamenes: iniciativasExtraidas.totalDictamenes,
      tiempoEjecucion: tiempoTotal,
      archivoResumen
    };
    
  } catch (error) {
    const tiempoTotal = Date.now() - tiempoInicio;
    Logger.error(`💥 Error en el proceso (${tiempoTotal}ms)`, error);
    
    // Enviar notificación de error por Telegram
    try {
      await enviarPorTelegram(`❌ Error en análisis del Orden del Día:\n${error.message}`);
    } catch (telegramError) {
      Logger.error('No se pudo enviar notificación de error por Telegram', telegramError);
    }
    
    return {
      exito: false,
      error: error.message,
      tiempoEjecucion: tiempoTotal
    };
  }
}

// MANEJO DE SEÑALES DEL SISTEMA
process.on('SIGINT', () => {
  Logger.warning('🛑 Proceso interrumpido por el usuario');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  Logger.error('💥 Error no capturado', error);
  process.exit(1);
});

// EJECUCIÓN
if (require.main === module) {
  ejecutarAnalisisOrdenDelDia().then(resultado => {
    if (resultado.exito) {
      console.log('\n✅ ANÁLISIS COMPLETADO EXITOSAMENTE');
      console.log(`📊 ${resultado.iniciativas} iniciativas procesadas`);
      console.log(`📑 ${resultado.dictamenes} dictámenes procesados`);
    } else {
      console.log('\n❌ ERROR EN EL ANÁLISIS');
      console.log(`Detalles: ${resultado.error}`);
      process.exit(1);
    }
  });
}

// EXPORTAR FUNCIONES PARA POSIBLE REUTILIZACIÓN
module.exports = {
  ejecutarAnalisisOrdenDelDia,
  extraerTextoPDF,
  extraerIniciativasYDictamenes,
  analizarOrdenConOpenAI,
  enviarPorTelegram,
  CONFIG
};