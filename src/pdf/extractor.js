const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

class PDFExtractor {
    constructor() {
        this.patrones = {
            iniciativa: /(?:iniciativa|proyecto|dictamen|proposición|propuesta|punto de acuerdo)/i,
            numero: /(?:número|núm|no\.?)\s*[:.]?\s*(\d+)/i,
            titulo: /(?:asunto|título|denominación|objeto|materia|iniciativa con proyecto de)[\s:]+(.+?)(?:\n|$)/i,
            tipoMayoria: /(?:mayoría|mayoria)\s*(?:simple|absoluta|calificada|cualificada)/i
        };
    }

    async extraerIniciativas(buffer, tipo = 'pdf') {
        try {
            let texto = '';
            
            if (tipo === 'pdf') {
                const data = await pdfParse(buffer);
                texto = data.text;
            } else if (tipo === 'docx') {
                texto = await this.extraerTextoWord(buffer);
            } else {
                throw new Error('Tipo de archivo no soportado');
            }
            
            // Dividir el texto en secciones
            const secciones = this.dividirEnSecciones(texto);
            const iniciativas = [];
            
            secciones.forEach((seccion, index) => {
                if (this.esIniciativa(seccion)) {
                    const iniciativa = this.parsearIniciativa(seccion, index + 1);
                    if (iniciativa) {
                        iniciativas.push(iniciativa);
                    }
                }
            });
            
            return iniciativas;
        } catch (error) {
            console.error('Error extrayendo documento:', error);
            throw error;
        }
    }
    
    async extraerTextoWord(buffer) {
        try {
            const result = await mammoth.extractRawText({ buffer: buffer });
            return result.value;
        } catch (error) {
            console.error('Error extrayendo texto de Word:', error);
            throw error;
        }
    }

    dividirEnSecciones(texto) {
        // Buscar patrones más específicos de iniciativas
        const patronesIniciativa = [
            /(?:\n|^)(?:[IVX]+\.|[0-9]+\.)\s+(?![a-z]\))/,  // Números romanos o arábigos (sin incisos con letras)
            /(?:\n|^)(?:INICIATIVA|PROYECTO|DICTAMEN|PROPOSICIÓN)/i,
            /(?:\n|^)(?:PUNTO DE ACUERDO)/i,
            /(?:\n|^)(?:ASUNTO:)/i
        ];
        
        // Intentar dividir con cada patrón
        let secciones = [texto];
        for (const patron of patronesIniciativa) {
            if (patron.test(texto)) {
                secciones = texto.split(patron);
                break;
            }
        }
        
        // Filtrar secciones vacías y las que parecen ser incisos (empiezan con letra y paréntesis)
        return secciones.filter(s => {
            const trimmed = s.trim();
            if (trimmed.length === 0) return false;
            
            // Ignorar si empieza con un inciso (ej: "a)", "b)", etc.)
            if (/^[a-z]\)/.test(trimmed)) return false;
            
            return true;
        });
    }

    esIniciativa(texto) {
        return this.patrones.iniciativa.test(texto);
    }

    parsearIniciativa(texto, numeroDefault) {
        const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let titulo = '';
        let descripcion = '';
        let numero = numeroDefault;
        let tipoMayoria = 'simple';
        let presentador = null;
        let partido = null;
        
        // Buscar número
        const matchNumero = texto.match(this.patrones.numero);
        if (matchNumero) {
            numero = parseInt(matchNumero[1]);
        }
        
        // Buscar tipo de mayoría
        const matchMayoria = texto.match(this.patrones.tipoMayoria);
        if (matchMayoria) {
            const mayoriaTexto = matchMayoria[0].toLowerCase();
            if (mayoriaTexto.includes('absoluta')) {
                tipoMayoria = 'absoluta';
            } else if (mayoriaTexto.includes('calificada') || mayoriaTexto.includes('cualificada')) {
                tipoMayoria = 'calificada';
            }
        }
        
        // Buscar presentador y partido
        // Patrones comunes: "presentada por [Nombre] ([PARTIDO])" o "presentada por la/el diputada/o [Nombre] ([PARTIDO])"
        const patronesPresentador = [
            /presentada?\s+por\s+(?:la\s+|el\s+)?(?:diputada?\s+)?([^(]+)\s*\(([^)]+)\)/i,
            /presenta(?:da)?\s*:\s*(?:diputada?\s+)?([^(]+)\s*\(([^)]+)\)/i,
            /(?:diputada?\s+)?([^(]+)\s*\(([^)]+)\)\s*presenta/i
        ];
        
        for (const patron of patronesPresentador) {
            const match = texto.match(patron);
            if (match) {
                presentador = match[1].trim().replace(/\s+/g, ' ');
                partido = match[2].trim().toUpperCase();
                break;
            }
        }
        
        // Si no se encontró con paréntesis, buscar solo el nombre después de "presentada por"
        if (!presentador) {
            const matchSoloPresentador = texto.match(/presentada?\s+por\s+(?:la\s+|el\s+)?(?:diputada?\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i);
            if (matchSoloPresentador) {
                presentador = matchSoloPresentador[1].trim();
            }
        }
        
        // Buscar título - mejorado para capturar títulos largos
        const matchTitulo = texto.match(this.patrones.titulo);
        if (matchTitulo) {
            titulo = matchTitulo[1].trim();
            // Si el título es muy corto, buscar más contexto
            if (titulo.length < 50) {
                const indiceTitulo = texto.indexOf(titulo);
                const siguienteLinea = texto.substring(indiceTitulo + titulo.length).split('\n')[0];
                if (siguienteLinea && siguienteLinea.length > 0) {
                    titulo += ' ' + siguienteLinea.trim();
                }
            }
        } else {
            // Buscar patrones alternativos de título
            if (texto.toLowerCase().includes('iniciativa con proyecto de')) {
                const match = texto.match(/iniciativa con proyecto de(.+?)(?:\n|$)/i);
                if (match) {
                    titulo = 'Iniciativa con proyecto de' + match[1];
                }
            } else {
                // Tomar las primeras líneas significativas como título
                titulo = lineas.slice(0, 3).join(' ');
            }
        }
        
        // El resto es descripción - capturar todo el contenido relevante
        const indiceInicioDescripcion = Math.min(3, lineas.length);
        descripcion = lineas.slice(indiceInicioDescripcion).join(' ');
        
        // Limpiar título y descripción
        titulo = titulo.replace(/\s+/g, ' ').trim();
        descripcion = descripcion.replace(/\s+/g, ' ').trim();
        
        return {
            numero,
            titulo: titulo || `Iniciativa ${numero}`,
            descripcion: descripcion || 'Sin descripción',
            tipo_mayoria: tipoMayoria,
            presentador,
            partido
        };
    }
}

module.exports = new PDFExtractor();