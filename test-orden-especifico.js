const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

// Función mejorada para extraer iniciativas y dictámenes
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
    let contenidoActual = [];
    let numeroActual = 0;
    
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      const siguienteLinea = i < lineas.length - 1 ? lineas[i + 1].trim() : '';
      
      // Detectar sección de Iniciativas
      if (linea === 'G) Iniciativas.' || linea.includes('G) Iniciativas')) {
        seccionActual = 'INICIATIVAS';
        console.log('📌 Sección de INICIATIVAS detectada');
        continue;
      }
      
      // Detectar sección de Dictámenes Primera Lectura
      if (linea === 'H) Dictámenes de Primera Lectura' || linea.includes('Dictámenes de Primera Lectura')) {
        seccionActual = 'DICTAMENES_PRIMERA';
        console.log('📌 Sección de DICTÁMENES PRIMERA LECTURA detectada');
        continue;
      }
      
      // Detectar sección de Dictámenes Segunda Lectura
      if (linea === 'I) Dictámenes de Segunda Lectura' || linea.includes('Dictámenes de Segunda Lectura')) {
        seccionActual = 'DICTAMENES_SEGUNDA';
        console.log('📌 Sección de DICTÁMENES SEGUNDA LECTURA detectada');
        continue;
      }
      
      // Detectar fin de sección
      if (linea.match(/^[A-Z]\)/) && !linea.includes('Iniciativas') && !linea.includes('Dictámenes')) {
        if (contenidoActual.length > 0 && numeroActual > 0) {
          guardarElemento(resultado, seccionActual, numeroActual, contenidoActual.join(' '));
          contenidoActual = [];
          numeroActual = 0;
        }
        seccionActual = '';
        continue;
      }
      
      // Procesar contenido según la sección activa
      if (seccionActual) {
        // Detectar elementos numerados
        const matchNumero = linea.match(/^(\d+)\.\s+(.+)/);
        
        if (matchNumero) {
          // Guardar elemento anterior si existe
          if (contenidoActual.length > 0 && numeroActual > 0) {
            guardarElemento(resultado, seccionActual, numeroActual, contenidoActual.join(' '));
          }
          
          // Iniciar nuevo elemento
          numeroActual = parseInt(matchNumero[1]);
          contenidoActual = [matchNumero[2]];
          
        } else if (numeroActual > 0 && linea && !linea.match(/^[A-Z]\)/)) {
          // Continuar agregando contenido al elemento actual
          contenidoActual.push(linea);
        }
      }
    }
    
    // Guardar último elemento si existe
    if (contenidoActual.length > 0 && numeroActual > 0) {
      guardarElemento(resultado, seccionActual, numeroActual, contenidoActual.join(' '));
    }
    
    // Calcular totales
    resultado.totalIniciativas = resultado.iniciativas.length;
    resultado.totalDictamenes = resultado.dictamenesPrimeraLectura.length + resultado.dictamenesSegundaLectura.length;
    
  } catch (error) {
    console.error('Error extrayendo iniciativas y dictámenes:', error);
  }
  
  return resultado;
}

function guardarElemento(resultado, seccion, numero, descripcion) {
  const elemento = {
    numero: numero,
    descripcion: descripcion.trim()
  };
  
  if (seccion === 'INICIATIVAS') {
    resultado.iniciativas.push(elemento);
    console.log(`✅ Iniciativa ${numero} agregada`);
  } else if (seccion === 'DICTAMENES_PRIMERA') {
    resultado.dictamenesPrimeraLectura.push(elemento);
    console.log(`✅ Dictamen Primera Lectura ${numero} agregado`);
  } else if (seccion === 'DICTAMENES_SEGUNDA') {
    resultado.dictamenesSegundaLectura.push(elemento);
    console.log(`✅ Dictamen Segunda Lectura ${numero} agregado`);
  }
}

// Buscar y procesar el PDF del orden del día
async function procesarOrdenDelDia() {
  const downloadsDir = 'C:\\Users\\BALERION\\Downloads';
  const files = fs.readdirSync(downloadsDir);
  
  // Buscar archivos con "ORDEN" en el nombre
  const ordenFiles = files.filter(f => 
    f.toUpperCase().includes('ORDEN') && 
    f.endsWith('.pdf') &&
    (f.includes('JUNIO') || f.includes('MAYO'))
  );
  
  console.log('📁 Archivos de orden del día encontrados:', ordenFiles);
  
  // Usar el archivo con el texto guardado anteriormente
  const textoGuardado = 'orden_dia_texto.txt';
  if (fs.existsSync(textoGuardado)) {
    console.log('📄 Usando texto previamente extraído...');
    const texto = fs.readFileSync(textoGuardado, 'utf-8');
    
    console.log('\n========== PROCESANDO ORDEN DEL DÍA ==========\n');
    
    const resultado = extraerIniciativasYDictamenes(texto);
    
    console.log('\n========== RESULTADOS DE EXTRACCIÓN ==========\n');
    console.log(`📊 Total de iniciativas: ${resultado.totalIniciativas}`);
    console.log(`📑 Dictámenes primera lectura: ${resultado.dictamenesPrimeraLectura.length}`);
    console.log(`📑 Dictámenes segunda lectura: ${resultado.dictamenesSegundaLectura.length}`);
    console.log(`✅ Total de asuntos: ${resultado.totalIniciativas + resultado.totalDictamenes}`);
    
    if (resultado.iniciativas.length > 0) {
      console.log('\n🎯 INICIATIVAS ENCONTRADAS:');
      resultado.iniciativas.forEach(ini => {
        console.log(`\n${ini.numero}. ${ini.descripcion.substring(0, 200)}...`);
      });
    }
    
    // Guardar resultado en JSON
    fs.writeFileSync('iniciativas_extraidas.json', JSON.stringify(resultado, null, 2));
    console.log('\n💾 Resultado guardado en iniciativas_extraidas.json');
    
    return resultado;
  } else {
    console.log('❌ No se encontró el archivo de texto extraído');
  }
}

// Ejecutar
procesarOrdenDelDia().catch(console.error);