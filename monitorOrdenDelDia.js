const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

// Importar funciones del analizador existente
const { 
  extraerTextoPDF, 
  extraerIniciativasYDictamenes,
  analizarOrdenConOpenAI,
  enviarPorTelegram,
  CONFIG 
} = require('./analizarOrdenDelDia.js');

// CONFIGURACIÓN DE MONITOREO
const CONFIG_MONITOR = {
  URL_CONGRESO: 'http://congresomorelos.gob.mx/orden-del-dia', // URL a monitorear
  INTERVALO_MONITOREO: 30 * 60 * 1000, // 30 minutos
  DIRECTORIO_HISTORICO: path.join(__dirname, 'historico_orden_dia'),
  ARCHIVO_ESTADO: path.join(__dirname, 'estado_orden_dia.json'),
  ARCHIVO_LOG: path.join(__dirname, 'monitor_orden_dia.log'),
  TELEGRAM_NOTIFICAR_CAMBIOS: true,
  GIT_AUTO_COMMIT: true
};

// Logger mejorado con archivo de log
const Logger = {
  _escribirLog: function(mensaje) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${mensaje}\n`;
    fs.appendFileSync(CONFIG_MONITOR.ARCHIVO_LOG, logEntry);
  },
  
  info: function(mensaje) {
    console.log(`ℹ️  ${new Date().toISOString()} - ${mensaje}`);
    this._escribirLog(`[INFO] ${mensaje}`);
  },
  
  success: function(mensaje) {
    console.log(`✅ ${new Date().toISOString()} - ${mensaje}`);
    this._escribirLog(`[SUCCESS] ${mensaje}`);
  },
  
  error: function(mensaje, error = null) {
    console.error(`❌ ${new Date().toISOString()} - ${mensaje}`);
    this._escribirLog(`[ERROR] ${mensaje}${error ? ': ' + error.message : ''}`);
    if (error && error.stack) {
      this._escribirLog(`[ERROR STACK] ${error.stack}`);
    }
  },
  
  warning: function(mensaje) {
    console.warn(`⚠️  ${new Date().toISOString()} - ${mensaje}`);
    this._escribirLog(`[WARNING] ${mensaje}`);
  },
  
  change: function(mensaje) {
    console.log(`🔄 ${new Date().toISOString()} - ${mensaje}`);
    this._escribirLog(`[CHANGE] ${mensaje}`);
  }
};

// Función para crear directorios si no existen
function asegurarDirectorios() {
  if (!fs.existsSync(CONFIG_MONITOR.DIRECTORIO_HISTORICO)) {
    fs.mkdirSync(CONFIG_MONITOR.DIRECTORIO_HISTORICO, { recursive: true });
    Logger.info(`Directorio histórico creado: ${CONFIG_MONITOR.DIRECTORIO_HISTORICO}`);
  }
}

// Función para cargar el estado anterior
function cargarEstadoAnterior() {
  try {
    if (fs.existsSync(CONFIG_MONITOR.ARCHIVO_ESTADO)) {
      const estado = JSON.parse(fs.readFileSync(CONFIG_MONITOR.ARCHIVO_ESTADO, 'utf-8'));
      Logger.info('Estado anterior cargado');
      return estado;
    }
  } catch (error) {
    Logger.error('Error cargando estado anterior', error);
  }
  return null;
}

// Función para guardar el estado actual
function guardarEstado(estado) {
  try {
    fs.writeFileSync(CONFIG_MONITOR.ARCHIVO_ESTADO, JSON.stringify(estado, null, 2));
    Logger.success('Estado guardado');
  } catch (error) {
    Logger.error('Error guardando estado', error);
  }
}

// Función para calcular hash de contenido
function calcularHash(contenido) {
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

// Función para comparar iniciativas
function compararIniciativas(anteriores, nuevas) {
  const cambios = {
    nuevasIniciativas: [],
    iniciativasEliminadas: [],
    iniciativasModificadas: [],
    nuevosDictamenes: [],
    totalCambios: 0
  };
  
  // Crear mapas para comparación rápida
  const mapAnterior = new Map();
  const mapNuevo = new Map();
  
  // Mapear iniciativas anteriores
  if (anteriores && anteriores.iniciativas) {
    anteriores.iniciativas.forEach(ini => {
      mapAnterior.set(ini.numero, ini.descripcion);
    });
  }
  
  // Mapear iniciativas nuevas
  if (nuevas && nuevas.iniciativas) {
    nuevas.iniciativas.forEach(ini => {
      mapNuevo.set(ini.numero, ini.descripcion);
    });
  }
  
  // Detectar nuevas y modificadas
  mapNuevo.forEach((descripcion, numero) => {
    if (!mapAnterior.has(numero)) {
      cambios.nuevasIniciativas.push({ numero, descripcion });
    } else if (mapAnterior.get(numero) !== descripcion) {
      cambios.iniciativasModificadas.push({
        numero,
        descripcionAnterior: mapAnterior.get(numero),
        descripcionNueva: descripcion
      });
    }
  });
  
  // Detectar eliminadas
  mapAnterior.forEach((descripcion, numero) => {
    if (!mapNuevo.has(numero)) {
      cambios.iniciativasEliminadas.push({ numero, descripcion });
    }
  });
  
  // Comparar dictámenes
  const dictamenesAnteriores = (anteriores?.dictamenesPrimeraLectura?.length || 0) + 
                               (anteriores?.dictamenesSegundaLectura?.length || 0);
  const dictamenesNuevos = (nuevas?.dictamenesPrimeraLectura?.length || 0) + 
                           (nuevas?.dictamenesSegundaLectura?.length || 0);
  
  if (dictamenesNuevos > dictamenesAnteriores) {
    cambios.nuevosDictamenes.push({
      cantidad: dictamenesNuevos - dictamenesAnteriores,
      totalActual: dictamenesNuevos
    });
  }
  
  cambios.totalCambios = cambios.nuevasIniciativas.length + 
                         cambios.iniciativasEliminadas.length + 
                         cambios.iniciativasModificadas.length +
                         cambios.nuevosDictamenes.length;
  
  return cambios;
}

// Función para generar reporte de cambios
function generarReporteCambios(cambios, estadoActual) {
  let reporte = `🔄 *CAMBIOS DETECTADOS EN ORDEN DEL DÍA*\n`;
  reporte += `📅 Fecha: ${new Date().toLocaleString('es-MX')}\n\n`;
  
  if (cambios.totalCambios === 0) {
    reporte += `✅ Sin cambios detectados\n`;
    return reporte;
  }
  
  reporte += `📊 *RESUMEN DE CAMBIOS:*\n`;
  reporte += `• Total de cambios: ${cambios.totalCambios}\n\n`;
  
  if (cambios.nuevasIniciativas.length > 0) {
    reporte += `🆕 *NUEVAS INICIATIVAS (${cambios.nuevasIniciativas.length}):*\n`;
    cambios.nuevasIniciativas.forEach(ini => {
      reporte += `  ${ini.numero}. ${ini.descripcion.substring(0, 100)}...\n`;
    });
    reporte += `\n`;
  }
  
  if (cambios.iniciativasModificadas.length > 0) {
    reporte += `✏️ *INICIATIVAS MODIFICADAS (${cambios.iniciativasModificadas.length}):*\n`;
    cambios.iniciativasModificadas.forEach(ini => {
      reporte += `  ${ini.numero}. Cambios detectados en descripción\n`;
    });
    reporte += `\n`;
  }
  
  if (cambios.iniciativasEliminadas.length > 0) {
    reporte += `🗑️ *INICIATIVAS ELIMINADAS (${cambios.iniciativasEliminadas.length}):*\n`;
    cambios.iniciativasEliminadas.forEach(ini => {
      reporte += `  ${ini.numero}. ${ini.descripcion.substring(0, 100)}...\n`;
    });
    reporte += `\n`;
  }
  
  if (cambios.nuevosDictamenes.length > 0) {
    reporte += `📑 *NUEVOS DICTÁMENES:*\n`;
    cambios.nuevosDictamenes.forEach(dict => {
      reporte += `  • ${dict.cantidad} nuevo(s) dictamen(es)\n`;
      reporte += `  • Total actual: ${dict.totalActual}\n`;
    });
    reporte += `\n`;
  }
  
  reporte += `\n📌 *ESTADO ACTUAL:*\n`;
  reporte += `• Total iniciativas: ${estadoActual.totalIniciativas}\n`;
  reporte += `• Total dictámenes: ${estadoActual.totalDictamenes}\n`;
  
  return reporte;
}

// Función para ejecutar comandos Git
async function ejecutarGit(comando, descripcion) {
  try {
    const { stdout, stderr } = await execPromise(comando, { cwd: __dirname });
    if (stdout) Logger.info(`Git: ${stdout.trim()}`);
    if (stderr && !stderr.includes('warning')) Logger.warning(`Git warning: ${stderr.trim()}`);
    return true;
  } catch (error) {
    Logger.error(`Error ejecutando git ${descripcion}`, error);
    return false;
  }
}

// Función para hacer commit de cambios
async function commitCambios(mensaje, archivos = []) {
  try {
    if (!CONFIG_MONITOR.GIT_AUTO_COMMIT) {
      Logger.info('Auto-commit deshabilitado');
      return false;
    }
    
    Logger.info('Preparando commit de cambios...');
    
    // Verificar si estamos en un repositorio git
    const gitCheck = await ejecutarGit('git status', 'verificación de estado');
    if (!gitCheck) {
      Logger.warning('No se detectó repositorio Git');
      return false;
    }
    
    // Agregar archivos específicos o todos los cambios
    if (archivos.length > 0) {
      for (const archivo of archivos) {
        await ejecutarGit(`git add "${archivo}"`, `agregando ${archivo}`);
      }
    } else {
      await ejecutarGit('git add -A', 'agregando todos los cambios');
    }
    
    // Hacer commit
    const fechaCommit = new Date().toISOString().replace(/[:.]/g, '-');
    const mensajeCommit = `[Monitor] ${mensaje} - ${fechaCommit}`;
    
    const commitResult = await ejecutarGit(
      `git commit -m "${mensajeCommit}"`,
      'creando commit'
    );
    
    if (commitResult) {
      Logger.success(`Commit realizado: ${mensajeCommit}`);
      return true;
    }
    
  } catch (error) {
    Logger.error('Error en proceso de commit', error);
  }
  
  return false;
}

// Función para descargar PDF del orden del día
async function descargarOrdenDelDia() {
  try {
    Logger.info('Descargando orden del día...');
    
    // Aquí deberías implementar la lógica para descargar el PDF
    // Por ahora, buscaremos el más reciente en Downloads
    const downloadsDir = 'C:\\Users\\BALERION\\Downloads';
    const files = fs.readdirSync(downloadsDir);
    const ordenDelDia = files
      .filter(f => f.toLowerCase().includes('orden') && f.endsWith('.pdf'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(downloadsDir, a));
        const statB = fs.statSync(path.join(downloadsDir, b));
        return statB.mtime - statA.mtime;
      });
    
    if (ordenDelDia.length > 0) {
      const rutaPDF = path.join(downloadsDir, ordenDelDia[0]);
      Logger.success(`PDF encontrado: ${ordenDelDia[0]}`);
      return rutaPDF;
    }
    
    throw new Error('No se encontró PDF del orden del día');
    
  } catch (error) {
    Logger.error('Error descargando orden del día', error);
    throw error;
  }
}

// Función principal de monitoreo
async function monitorearOrdenDelDia() {
  try {
    Logger.info('🔍 Iniciando ciclo de monitoreo...');
    
    // Cargar estado anterior
    const estadoAnterior = cargarEstadoAnterior();
    
    // Descargar/obtener PDF actual
    const rutaPDF = await descargarOrdenDelDia();
    
    // Extraer texto del PDF
    const textoExtraido = await extraerTextoPDF(rutaPDF);
    const hashActual = calcularHash(textoExtraido);
    
    // Verificar si hay cambios en el hash
    if (estadoAnterior && estadoAnterior.hash === hashActual) {
      Logger.info('Sin cambios detectados en el orden del día');
      return {
        hayCambios: false,
        mensaje: 'Sin cambios'
      };
    }
    
    Logger.change('¡Cambios detectados en el orden del día!');
    
    // Extraer iniciativas y dictámenes
    const iniciativasActuales = extraerIniciativasYDictamenes(textoExtraido);
    
    // Comparar con estado anterior
    let cambios = null;
    if (estadoAnterior && estadoAnterior.iniciativas) {
      cambios = compararIniciativas(estadoAnterior.iniciativas, iniciativasActuales);
    }
    
    // Crear estado actual
    const estadoActual = {
      fecha: new Date().toISOString(),
      hash: hashActual,
      iniciativas: iniciativasActuales,
      totalIniciativas: iniciativasActuales.totalIniciativas,
      totalDictamenes: iniciativasActuales.dictamenesPrimeraLectura.length + 
                       iniciativasActuales.dictamenesSegundaLectura.length,
      rutaPDF: rutaPDF
    };
    
    // Guardar copia histórica
    const fechaArchivo = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const archivoHistorico = path.join(
      CONFIG_MONITOR.DIRECTORIO_HISTORICO,
      `orden_dia_${fechaArchivo}.json`
    );
    fs.writeFileSync(archivoHistorico, JSON.stringify(estadoActual, null, 2));
    Logger.success(`Histórico guardado: ${path.basename(archivoHistorico)}`);
    
    // Guardar estado actual
    guardarEstado(estadoActual);
    
    // Generar y enviar reporte de cambios
    if (cambios && cambios.totalCambios > 0) {
      const reporteCambios = generarReporteCambios(cambios, estadoActual);
      console.log('\n' + reporteCambios);
      
      // Guardar reporte
      const archivoReporte = path.join(
        CONFIG_MONITOR.DIRECTORIO_HISTORICO,
        `reporte_cambios_${fechaArchivo}.txt`
      );
      fs.writeFileSync(archivoReporte, reporteCambios);
      
      // Enviar notificación por Telegram
      if (CONFIG_MONITOR.TELEGRAM_NOTIFICAR_CAMBIOS) {
        await enviarPorTelegram(reporteCambios);
      }
      
      // Hacer commit de los cambios
      await commitCambios(
        `Cambios detectados: ${cambios.totalCambios} modificaciones`,
        [CONFIG_MONITOR.ARCHIVO_ESTADO, archivoHistorico, archivoReporte]
      );
      
      // Si hay muchos cambios, también analizar con OpenAI
      if (cambios.totalCambios > 3) {
        Logger.info('Generando análisis completo con OpenAI...');
        const resumenAI = await analizarOrdenConOpenAI(textoExtraido, iniciativasActuales);
        await enviarPorTelegram(resumenAI);
      }
    } else if (!estadoAnterior) {
      Logger.info('Primera ejecución - estableciendo estado inicial');
      
      // Hacer commit inicial
      await commitCambios(
        'Estado inicial del orden del día',
        [CONFIG_MONITOR.ARCHIVO_ESTADO, archivoHistorico]
      );
    }
    
    return {
      hayCambios: true,
      cambios: cambios,
      estadoActual: estadoActual
    };
    
  } catch (error) {
    Logger.error('Error en ciclo de monitoreo', error);
    
    // Notificar error por Telegram
    try {
      await enviarPorTelegram(
        `❌ Error en monitoreo del orden del día:\n${error.message}`
      );
    } catch (e) {
      Logger.error('No se pudo enviar notificación de error', e);
    }
    
    return {
      hayCambios: false,
      error: error.message
    };
  }
}

// Función para iniciar el monitoreo continuo
async function iniciarMonitoreoContinuo() {
  Logger.info('🚀 INICIANDO MONITOR DEL ORDEN DEL DÍA');
  Logger.info(`📊 Intervalo de monitoreo: ${CONFIG_MONITOR.INTERVALO_MONITOREO / 1000 / 60} minutos`);
  Logger.info(`📁 Directorio histórico: ${CONFIG_MONITOR.DIRECTORIO_HISTORICO}`);
  Logger.info(`🔔 Notificaciones Telegram: ${CONFIG_MONITOR.TELEGRAM_NOTIFICAR_CAMBIOS ? 'Activadas' : 'Desactivadas'}`);
  Logger.info(`🗂️ Auto-commit Git: ${CONFIG_MONITOR.GIT_AUTO_COMMIT ? 'Activado' : 'Desactivado'}`);
  
  // Asegurar que existan los directorios necesarios
  asegurarDirectorios();
  
  // Ejecutar primera verificación
  await monitorearOrdenDelDia();
  
  // Configurar monitoreo periódico
  const intervalo = setInterval(async () => {
    await monitorearOrdenDelDia();
  }, CONFIG_MONITOR.INTERVALO_MONITOREO);
  
  // Manejo de señales para cierre limpio
  const cerrarMonitor = () => {
    Logger.warning('🛑 Deteniendo monitor...');
    clearInterval(intervalo);
    process.exit(0);
  };
  
  process.on('SIGINT', cerrarMonitor);
  process.on('SIGTERM', cerrarMonitor);
  
  // Mantener el proceso vivo
  process.stdin.resume();
}

// Función para ejecutar una sola vez
async function ejecutarUnaVez() {
  Logger.info('🔍 Ejecutando verificación única...');
  
  // Asegurar que existan los directorios necesarios
  asegurarDirectorios();
  
  const resultado = await monitorearOrdenDelDia();
  
  if (resultado.hayCambios) {
    Logger.success('✅ Verificación completada - Se detectaron cambios');
  } else {
    Logger.info('✅ Verificación completada - Sin cambios');
  }
  
  return resultado;
}

// Manejo de argumentos de línea de comandos
const args = process.argv.slice(2);
const modoHelp = args.includes('--help') || args.includes('-h');
const modoContinuo = args.includes('--continuo') || args.includes('-c');
const modoAnalisis = args.includes('--analisis') || args.includes('-a');

if (modoHelp) {
  console.log(`
🔍 MONITOR DEL ORDEN DEL DÍA - CONGRESO DE MORELOS
================================================

USO:
  node monitorOrdenDelDia.js [opciones]

OPCIONES:
  --continuo, -c    Ejecutar monitoreo continuo
  --analisis, -a    Ejecutar análisis completo con OpenAI
  --help, -h        Mostrar esta ayuda

SIN OPCIONES:
  Ejecuta una verificación única y termina

EJEMPLOS:
  node monitorOrdenDelDia.js           # Verificación única
  node monitorOrdenDelDia.js -c        # Monitoreo continuo
  node monitorOrdenDelDia.js -a        # Análisis completo

CONFIGURACIÓN:
  Intervalo: ${CONFIG_MONITOR.INTERVALO_MONITOREO / 1000 / 60} minutos
  Telegram: ${CONFIG_MONITOR.TELEGRAM_NOTIFICAR_CAMBIOS ? 'Activado' : 'Desactivado'}
  Git: ${CONFIG_MONITOR.GIT_AUTO_COMMIT ? 'Activado' : 'Desactivado'}
  `);
  process.exit(0);
}

// Ejecución según el modo
if (require.main === module) {
  if (modoContinuo) {
    iniciarMonitoreoContinuo();
  } else if (modoAnalisis) {
    // Ejecutar análisis completo
    const { ejecutarAnalisisOrdenDelDia } = require('./analizarOrdenDelDia.js');
    ejecutarAnalisisOrdenDelDia().then(resultado => {
      if (resultado.exito) {
        Logger.success('Análisis completado exitosamente');
      } else {
        Logger.error('Error en análisis', { message: resultado.error });
        process.exit(1);
      }
    });
  } else {
    ejecutarUnaVez().then(() => {
      process.exit(0);
    });
  }
}

// Exportar funciones para uso en otros módulos
module.exports = {
  monitorearOrdenDelDia,
  ejecutarUnaVez,
  iniciarMonitoreoContinuo,
  compararIniciativas,
  generarReporteCambios
};