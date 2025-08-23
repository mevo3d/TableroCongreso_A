const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfExtractor = require('../pdf/extractor');

// Configurar multer para manejo de archivos
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Almacenamiento temporal de sesiones pendientes de validación
const sesionesPendientes = new Map();

/**
 * Endpoint para cargar y previsualizar PDF
 * NO guarda en base de datos, solo extrae y muestra
 */
router.post('/preview-pdf', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    try {
        // Extraer iniciativas del PDF
        const resultado = await pdfExtractor.extraerIniciativasDefinitivo(req.file.buffer);
        
        let iniciativasArray = [];
        let estadisticas = {};
        
        if (Array.isArray(resultado)) {
            iniciativasArray = resultado;
        } else if (resultado && resultado.elementos) {
            iniciativasArray = resultado.elementos;
            estadisticas = resultado.estadisticas || {};
        }
        
        // Asignar números consecutivos del sistema
        const iniciativasConNumeros = iniciativasArray.map((init, index) => ({
            numero_sistema: index + 1,
            numero_orden_dia: init.numero || index + 1,
            titulo: init.titulo || `Iniciativa ${index + 1}`,
            descripcion: init.descripcion || '',
            presentador: init.presentador || '',
            partido: init.partido || '',
            tipo_mayoria: init.tipo_mayoria || 'simple',
            requiere_votacion: init.requiere_votacion || false,
            tipo_votacion: init.tipo_votacion || '',
            editable: true // Marca que se puede editar
        }));
        
        // Generar ID temporal para esta sesión
        const sessionId = 'preview_' + Date.now();
        
        // Guardar en memoria temporal
        sesionesPendientes.set(sessionId, {
            iniciativas: iniciativasConNumeros,
            estadisticas: estadisticas,
            fechaCarga: new Date(),
            nombreArchivo: req.file.originalname
        });
        
        // Limpiar sesiones antiguas (más de 1 hora)
        limpiarSesionesAntiguas();
        
        res.json({
            success: true,
            sessionId: sessionId,
            iniciativas: iniciativasConNumeros,
            estadisticas: estadisticas,
            mensaje: 'Vista previa generada. Revise y valide antes de guardar.'
        });
        
    } catch (error) {
        console.error('Error procesando PDF:', error);
        res.status(500).json({ error: 'Error procesando el PDF: ' + error.message });
    }
});

/**
 * Endpoint para actualizar una iniciativa en la vista previa
 */
router.put('/preview-pdf/:sessionId/iniciativa/:numero', (req, res) => {
    const { sessionId, numero } = req.params;
    const sesionPendiente = sesionesPendientes.get(sessionId);
    
    if (!sesionPendiente) {
        return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    
    const iniciativaIndex = sesionPendiente.iniciativas.findIndex(
        i => i.numero_sistema === parseInt(numero)
    );
    
    if (iniciativaIndex === -1) {
        return res.status(404).json({ error: 'Iniciativa no encontrada' });
    }
    
    // Actualizar campos permitidos
    const camposPermitidos = [
        'numero_orden_dia', 'titulo', 'descripcion', 
        'presentador', 'partido', 'tipo_mayoria'
    ];
    
    camposPermitidos.forEach(campo => {
        if (req.body[campo] !== undefined) {
            sesionPendiente.iniciativas[iniciativaIndex][campo] = req.body[campo];
        }
    });
    
    res.json({
        success: true,
        iniciativa: sesionPendiente.iniciativas[iniciativaIndex]
    });
});

/**
 * Endpoint para validar y guardar definitivamente en BD
 */
router.post('/validar-sesion/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { tipoCarga, fechaProgramada, iniciativasSeleccionadas } = req.body;
    const db = req.db;
    
    const sesionPendiente = sesionesPendientes.get(sessionId);
    
    if (!sesionPendiente) {
        return res.status(404).json({ error: 'Sesión no encontrada o expirada' });
    }
    
    // Usar las iniciativas seleccionadas si se proporcionan, de lo contrario usar todas
    const iniciativasAGuardar = iniciativasSeleccionadas && iniciativasSeleccionadas.length > 0 
        ? iniciativasSeleccionadas 
        : sesionPendiente.iniciativas;
    
    try {
        // Preparar datos de la sesión
        const fecha = new Date().toISOString();
        const fechaStr = new Date().toISOString().split('T')[0];
        const horaStr = new Date().toTimeString().split(' ')[0].substring(0,5);
        const codigoSesion = `SES-${fechaStr}-${horaStr.replace(':', '')}`;
        
        let nombreSesion = `Sesión ${fechaStr}`;
        let estadoSesion = 'preparada';
        let ejecutarInmediato = 0;
        let fechaSesionProgramada = null;
        let activa = 0;
        
        // Configurar según tipo de carga
        if (tipoCarga === 'inmediata') {
            ejecutarInmediato = 1;
            activa = 1;
            estadoSesion = 'preparada';
            nombreSesion = `Sesión Ordinaria - ${new Date().toLocaleDateString('es-MX')}`;
        } else if (tipoCarga === 'programada' && fechaProgramada) {
            fechaSesionProgramada = fechaProgramada;
            estadoSesion = 'programada';
            nombreSesion = `Sesión Programada - ${new Date(fechaProgramada).toLocaleDateString('es-MX')}`;
        } else if (tipoCarga === 'indefinida') {
            estadoSesion = 'indefinida';
            nombreSesion = `Sesión Pendiente - ${fechaStr}`;
        }
        
        // Crear sesión en BD
        db.run(
            `INSERT INTO sesiones (
                codigo_sesion, nombre, tipo_sesion, activa, estado, 
                fecha, fecha_programada, ejecutar_inmediato
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [codigoSesion, nombreSesion, 'ordinaria', activa, estadoSesion, 
             fecha, fechaSesionProgramada, ejecutarInmediato],
            function(err) {
                if (err) {
                    console.error('Error creando sesión:', err);
                    return res.status(500).json({ error: 'Error creando sesión' });
                }
                
                const sesionId = this.lastID;
                
                // Si es inmediata, desactivar otras sesiones
                if (tipoCarga === 'inmediata') {
                    db.run('UPDATE sesiones SET activa = 0 WHERE id != ?', [sesionId]);
                }
                
                // Insertar iniciativas validadas (solo las seleccionadas)
                let insertadas = 0;
                let errores = 0;
                const iniciativas = iniciativasAGuardar;  // Usar las iniciativas filtradas
                
                // Re-numerar las iniciativas seleccionadas para mantener orden consecutivo
                iniciativas.forEach((iniciativa, index) => {
                    iniciativa.numero_sistema = index + 1;  // Renumerar consecutivamente
                    db.run(
                        `INSERT INTO iniciativas (
                            sesion_id, numero, numero_orden_dia, titulo, descripcion, 
                            presentador, partido_presentador, tipo_mayoria
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            sesionId, 
                            iniciativa.numero_sistema,
                            iniciativa.numero_orden_dia,
                            iniciativa.titulo,
                            iniciativa.descripcion,
                            iniciativa.presentador,
                            iniciativa.partido,
                            iniciativa.tipo_mayoria
                        ],
                        (err) => {
                            if (err) {
                                console.error(`Error insertando iniciativa:`, err);
                                errores++;
                            } else {
                                insertadas++;
                            }
                            
                            if (index === iniciativas.length - 1) {
                                // Limpiar sesión temporal
                                sesionesPendientes.delete(sessionId);
                                
                                // Emitir evento y responder
                                setTimeout(() => {
                                    req.io.emit('sesion-creada', { 
                                        sesionId,
                                        tipo: tipoCarga,
                                        estado: estadoSesion
                                    });
                                    
                                    res.json({ 
                                        success: true,
                                        message: 'Sesión validada y guardada correctamente',
                                        sesion_id: sesionId,
                                        iniciativas_guardadas: insertadas,
                                        errores: errores,
                                        tipo_carga: tipoCarga,
                                        estado: estadoSesion
                                    });
                                }, 100);
                            }
                        }
                    );
                });
            }
        );
    } catch (error) {
        console.error('Error validando sesión:', error);
        res.status(500).json({ error: 'Error al validar sesión' });
    }
});

/**
 * Endpoint para cancelar una sesión pendiente
 */
router.delete('/preview-pdf/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (sesionesPendientes.has(sessionId)) {
        sesionesPendientes.delete(sessionId);
        res.json({ success: true, message: 'Vista previa cancelada' });
    } else {
        res.status(404).json({ error: 'Sesión no encontrada' });
    }
});

/**
 * Limpiar sesiones antiguas de memoria
 */
function limpiarSesionesAntiguas() {
    const ahora = new Date();
    const unaHora = 60 * 60 * 1000;
    
    for (const [id, sesion] of sesionesPendientes.entries()) {
        if (ahora - sesion.fechaCarga > unaHora) {
            sesionesPendientes.delete(id);
        }
    }
}

module.exports = router;