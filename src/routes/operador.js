const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { authenticateToken, authorize } = require('../auth/middleware');
const pdfExtractor = require('../pdf/extractor');
const PDFDocument = require('pdfkit');

const router = express.Router();
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB - Aumentado para archivos más grandes
});

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('operador', 'superadmin'));

// Subir PDF/Word y crear sesión
router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    const db = req.db;
    const { tipoCarga, fechaProgramada, indefinida } = req.body;
    
    try {
        // Determinar tipo de archivo
        const filename = req.file.originalname.toLowerCase();
        let tipo = 'pdf';
        if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
            tipo = 'docx';
        }
        
        // Extraer iniciativas del archivo
        const resultado = await pdfExtractor.extraerIniciativas(req.file.buffer, tipo);
        
        console.log('Resultado del extractor:', typeof resultado, 'Es array:', Array.isArray(resultado));
        
        // El extractor ahora devuelve un objeto con elementos y estadísticas
        let iniciativasArray = [];
        
        // Manejar diferentes formatos de respuesta
        if (Array.isArray(resultado)) {
            // Es un array directo
            iniciativasArray = resultado;
        } else if (resultado && resultado.elementos) {
            // Es un objeto con elementos
            iniciativasArray = resultado.elementos;
            console.log(`Extracción exitosa: ${resultado.estadisticas?.total || iniciativasArray.length} elementos encontrados`);
            if (resultado.estadisticas) {
                console.log(`Requieren votación: ${resultado.estadisticas.requierenVotacion}`);
            }
        } else if (resultado && resultado.iniciativas) {
            // Compatibilidad con formato antiguo
            iniciativasArray = resultado.iniciativas;
        }
        
        console.log(`Total de iniciativas a procesar: ${iniciativasArray.length}`);
        
        if (!iniciativasArray || iniciativasArray.length === 0) {
            return res.status(400).json({ error: 'No se encontraron iniciativas en el archivo' });
        }
        
        // Preparar datos de la sesión
        const fecha = new Date().toISOString();
        const fechaStr = new Date().toISOString().split('T')[0];
        const timestamp = Date.now();
        const codigoSesion = `SES-${fechaStr}-${timestamp}`;
        
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
        } else if (tipoCarga === 'indefinida' || indefinida === 'true') {
            estadoSesion = 'indefinida';
            nombreSesion = `Sesión Pendiente - ${fechaStr}`;
        }
        
        // Crear nueva sesión
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
                
                // Guardar el PDF en el servidor
                const pdfFileName = `sesion_${sesionId}_${Date.now()}.pdf`;
                const pdfPath = path.join(__dirname, '..', '..', 'uploads', 'sesiones', pdfFileName);
                
                fs.writeFileSync(pdfPath, req.file.buffer);
                
                // Actualizar la sesión con la ruta del documento
                db.run('UPDATE sesiones SET archivo_pdf = ? WHERE id = ?', [pdfFileName, sesionId]);
                
                // Si es inmediata, desactivar otras sesiones
                if (tipoCarga === 'inmediata') {
                    db.run('UPDATE sesiones SET activa = 0 WHERE id != ?', [sesionId]);
                }
                
                // Insertar iniciativas
                let insertadas = 0;
                let errores = 0;
                
                console.log(`Insertando ${iniciativasArray.length} iniciativas en la sesión ${sesionId}`);
                
                if (iniciativasArray.length === 0) {
                    // Si no hay iniciativas, responder inmediatamente
                    req.io.emit('sesion-creada', { 
                        sesionId,
                        tipo: tipoCarga,
                        estado: estadoSesion
                    });
                    return res.json({ 
                        message: 'Sesión creada sin iniciativas',
                        sesion_id: sesionId,
                        iniciativas: 0,
                        tipo_carga: tipoCarga,
                        estado: estadoSesion
                    });
                }
                
                iniciativasArray.forEach((iniciativa, index) => {
                    // Debug: ver qué campos tiene cada iniciativa
                    if (index === 0) {
                        console.log('Primera iniciativa - campos disponibles:', Object.keys(iniciativa));
                        console.log('Valores:', iniciativa);
                    }
                    
                    // Asegurar que los campos existan - CORREGIDO: titulo es requerido
                    const numero = iniciativa.numero || (index + 1);
                    const titulo = iniciativa.titulo || iniciativa.descripcion || `Iniciativa ${numero}`;
                    const descripcion = iniciativa.descripcion || iniciativa.titulo || '';
                    const presentador = iniciativa.presentador || '';
                    const partido = iniciativa.partido || iniciativa.partido_presentador || '';
                    const tipoMayoria = iniciativa.tipo_mayoria || 'simple';
                    
                    // Verificar que el título no esté vacío
                    if (!titulo || titulo.trim() === '') {
                        console.error(`Iniciativa ${numero} sin título, usando valor por defecto`);
                    }
                    
                    db.run(
                        `INSERT INTO iniciativas (sesion_id, numero, titulo, descripcion, presentador, partido_presentador, tipo_mayoria) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [sesionId, numero, titulo, descripcion, presentador, partido, tipoMayoria],
                        (err) => {
                            if (err) {
                                console.error(`Error insertando iniciativa ${numero}:`, err);
                                errores++;
                            } else {
                                insertadas++;
                            }
                            
                            // Verificar si es la última iniciativa
                            if (index === iniciativasArray.length - 1) {
                                console.log(`Inserción completada: ${insertadas} exitosas, ${errores} errores`);
                                
                                // Esperar un momento para asegurar que todas las inserciones terminaron
                                setTimeout(() => {
                                    req.io.emit('sesion-creada', { 
                                        sesionId,
                                        tipo: tipoCarga,
                                        estado: estadoSesion
                                    });
                                    res.json({ 
                                        message: 'PDF procesado correctamente',
                                        sesion_id: sesionId,
                                        iniciativas: insertadas,
                                        errores: errores,
                                        tipo_carga: tipoCarga,
                                        estado: estadoSesion
                                    });
                                }, 500); // Esperar 500ms para asegurar todas las inserciones
                            }
                        }
                    );
                });
            }
        );
    } catch (error) {
        console.error('Error procesando PDF:', error);
        res.status(500).json({ error: 'Error procesando el PDF' });
    }
});

// Obtener sesión activa
// Obtener sesión actual con estadísticas
router.get('/sesion-actual', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT s.*, 
            (SELECT COUNT(*) FROM iniciativas WHERE sesion_id = s.id AND activa = 1) as votaciones_activas,
            (SELECT COUNT(*) FROM iniciativas WHERE sesion_id = s.id AND cerrada = 1) as votaciones_completadas,
            (SELECT COUNT(*) FROM sesiones WHERE estado = 'preparada') as documentos_pendientes
        FROM sesiones s
        WHERE s.activa = 1
    `, (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        res.json({
            sesion: sesion || null,
            votaciones_activas: sesion?.votaciones_activas || 0,
            votaciones_completadas: sesion?.votaciones_completadas || 0,
            documentos_pendientes: sesion?.documentos_pendientes || 0
        });
    });
});

router.get('/sesion-activa', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({ sesion: null, iniciativas: [] });
        }
        
        db.all(
            'SELECT * FROM iniciativas WHERE sesion_id = ? ORDER BY numero',
            [sesion.id],
            (err, iniciativas) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                }
                
                // Buscar el texto original del documento si existe
                // Primero verificar si la tabla existe
                db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='documentos_originales'",
                    (err, tableExists) => {
                        if (err || !tableExists) {
                            // Si la tabla no existe, devolver sin texto original
                            res.json({ 
                                sesion, 
                                iniciativas,
                                textoOriginal: null 
                            });
                        } else {
                            // Si la tabla existe, buscar el documento
                            db.get(
                                'SELECT texto_original FROM documentos_originales WHERE sesion_id = ?',
                                [sesion.id],
                                (err, documento) => {
                                    if (err) {
                                        console.log('Documento original no encontrado para sesión:', sesion.id);
                                    }
                                    
                                    res.json({ 
                                        sesion, 
                                        iniciativas,
                                        textoOriginal: documento?.texto_original || null 
                                    });
                                }
                            );
                        }
                    }
                );
            }
        );
    });
});

// Activar iniciativa
router.post('/activar-iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    // Primero verificar que la sesión esté iniciada
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión' });
        }
        
        if (!sesion) {
            return res.status(400).json({ error: 'No hay sesión activa' });
        }
        
        // Verificar que la sesión esté iniciada (no solo preparada)
        if (!sesion.fecha_inicio) {
            return res.status(400).json({ 
                error: 'La sesión debe ser iniciada por el Presidente antes de activar iniciativas',
                estado: 'preparada'
            });
        }
        
        // Verificar que se haya realizado el pase de lista
        db.get(`
            SELECT pl.id, pl.finalizado,
                   COUNT(a.id) as asistencias_registradas 
            FROM pase_lista pl
            LEFT JOIN asistencias a ON a.pase_lista_id = pl.id
            WHERE pl.sesion_id = ? AND pl.finalizado = 0
            GROUP BY pl.id
            ORDER BY pl.fecha DESC
            LIMIT 1
        `, [sesion.id], (err, paseListaActual) => {
            if (err) {
                console.error('Error verificando pase de lista:', err);
                return res.status(500).json({ error: 'Error verificando pase de lista' });
            }
            
            // Si no hay pase de lista o no tiene asistencias registradas
            if (!paseListaActual || paseListaActual.asistencias_registradas === 0) {
                return res.status(400).json({ 
                    error: 'Debe completarse el pase de lista antes de iniciar votaciones',
                    mensaje: 'Los Secretarios-Diputados deben realizar el pase de lista primero',
                    requiere_pase_lista: true
                });
            }
            
            // Desactivar otras iniciativas
            db.run('UPDATE iniciativas SET activa = 0', (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error desactivando iniciativas' });
                }
                
                // Activar la iniciativa seleccionada
                db.run('UPDATE iniciativas SET activa = 1 WHERE id = ?', [id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error activando iniciativa' });
                    }
                    
                    // Obtener la iniciativa para emitir evento
                    db.get('SELECT * FROM iniciativas WHERE id = ?', [id], (err, iniciativa) => {
                        if (!err && iniciativa) {
                            req.io.emit('iniciativa-activa', iniciativa);
                        }
                        res.json({ message: 'Iniciativa activada' });
                    });
                });
            });
        });
    });
});

// Cerrar votación
router.post('/cerrar-votacion/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    const io = req.io;
    
    // Contar votos
    db.get(`
        SELECT 
            i.*,
            COUNT(CASE WHEN v.voto = 'favor' THEN 1 END) as votos_favor,
            COUNT(CASE WHEN v.voto = 'contra' THEN 1 END) as votos_contra,
            COUNT(CASE WHEN v.voto = 'abstencion' THEN 1 END) as votos_abstencion
        FROM iniciativas i
        LEFT JOIN votos v ON i.id = v.iniciativa_id
        WHERE i.id = ?
        GROUP BY i.id
    `, [id], (err, iniciativa) => {
        if (err || !iniciativa) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        // Determinar resultado
        let resultado = 'rechazada';
        const totalVotos = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
        
        switch (iniciativa.tipo_mayoria) {
            case 'simple':
                if (iniciativa.votos_favor > iniciativa.votos_contra) resultado = 'aprobada';
                break;
            case 'absoluta':
                if (iniciativa.votos_favor > 10) resultado = 'aprobada'; // Más de la mitad de 20
                break;
            case 'calificada':
                if (iniciativa.votos_favor >= 14) resultado = 'aprobada'; // 2/3 de 20
                break;
            case 'unanime':
                if (iniciativa.votos_favor === 20) resultado = 'aprobada';
                break;
        }
        
        // Actualizar iniciativa
        db.run(`
            UPDATE iniciativas 
            SET activa = 0, cerrada = 1, resultado = ?,
                votos_favor = ?, votos_contra = ?, votos_abstencion = ?
            WHERE id = ?
        `, [resultado, iniciativa.votos_favor, iniciativa.votos_contra, 
            iniciativa.votos_abstencion, id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error actualizando iniciativa' });
            }
            
            // Emitir evento
            io.emit('votacion-cerrada', {
                iniciativa_id: id,
                resultado,
                votos: {
                    favor: iniciativa.votos_favor,
                    contra: iniciativa.votos_contra,
                    abstencion: iniciativa.votos_abstencion
                }
            });
            
            res.json({ 
                message: 'Votación cerrada',
                resultado,
                votos: {
                    favor: iniciativa.votos_favor,
                    contra: iniciativa.votos_contra,
                    abstencion: iniciativa.votos_abstencion
                }
            });
        });
    });
});

// Reabrir votación
router.post('/reabrir-votacion/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    const io = req.io;
    
    // Verificar que la iniciativa esté cerrada y sin resultado definitivo
    db.get(`
        SELECT * FROM iniciativas 
        WHERE id = ? AND cerrada = 1
    `, [id], (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error al consultar iniciativa' });
        }
        
        if (!iniciativa) {
            return res.status(404).json({ error: 'Iniciativa no encontrada o no está cerrada' });
        }
        
        if (iniciativa.resultado && iniciativa.resultado !== 'pendiente') {
            return res.status(400).json({ error: 'No se puede reabrir una votación con resultado definitivo' });
        }
        
        // Reabrir la votación
        db.run(`
            UPDATE iniciativas 
            SET activa = 1, cerrada = 0, resultado = NULL
            WHERE id = ?
        `, [id], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error al reabrir votación' });
            }
            
            // Desactivar otras iniciativas activas
            db.run(`
                UPDATE iniciativas 
                SET activa = 0 
                WHERE id != ? AND sesion_id = ?
            `, [id, iniciativa.sesion_id]);
            
            // Emitir evento
            io.emit('iniciativa-activa', iniciativa);
            
            res.json({ 
                message: 'Votación reabierta exitosamente',
                iniciativa
            });
        });
    });
});

// Obtener una iniciativa específica
router.get('/iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    db.get('SELECT * FROM iniciativas WHERE id = ?', [id], (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        if (!iniciativa) {
            return res.status(404).json({ error: 'Iniciativa no encontrada' });
        }
        
        res.json(iniciativa);
    });
});

// Editar iniciativa (sin tipo_mayoria para operador)
router.put('/iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const { numero, descripcion, presentador, partido_presentador } = req.body;
    const db = req.db;
    
    // Verificar que no esté activa o cerrada
    db.get('SELECT activa, cerrada FROM iniciativas WHERE id = ?', [id], (err, iniciativa) => {
        if (err || !iniciativa) {
            return res.status(404).json({ error: 'Iniciativa no encontrada' });
        }
        
        if (iniciativa.activa || iniciativa.cerrada) {
            return res.status(400).json({ error: 'No se puede editar una iniciativa activa o cerrada' });
        }
        
        // Actualizar iniciativa (operador no puede cambiar tipo_mayoria)
        db.run(
            'UPDATE iniciativas SET numero = ?, descripcion = ?, presentador = ?, partido_presentador = ? WHERE id = ?',
            [numero, descripcion, presentador, partido_presentador, id],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Error actualizando iniciativa' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Iniciativa no encontrada' });
                }
                
                req.io.emit('iniciativa-actualizada', { id });
                res.json({ message: 'Iniciativa actualizada correctamente' });
            }
        );
    });
});

// Obtener estadísticas de sesiones
router.get('/estadisticas-sesiones', (req, res) => {
    const db = req.db;
    
    // Obtener última sesión clausurada
    db.get(`
        SELECT * FROM sesiones 
        WHERE fecha_clausura IS NOT NULL 
        ORDER BY fecha_clausura DESC 
        LIMIT 1
    `, (err, ultimaSesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo última sesión' });
        }
        
        // Obtener próxima sesión programada
        db.get(`
            SELECT * FROM sesiones 
            WHERE fecha_programada > datetime('now') 
            AND estado = 'preparada'
            ORDER BY fecha_programada ASC 
            LIMIT 1
        `, (err, proximaSesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo próxima sesión' });
            }
            
            // Obtener documentos pendientes
            db.get(`
                SELECT COUNT(*) as count 
                FROM documentos_sesion 
                WHERE estado = 'pendiente'
            `, (err, docs) => {
                if (err) {
                    return res.status(500).json({ error: 'Error contando documentos' });
                }
                
                res.json({
                    ultimaSesion,
                    proximaSesion,
                    documentosPendientes: docs ? docs.count : 0
                });
            });
        });
    });
});

// Notificar a la mesa directiva que las iniciativas están listas
router.post('/notificar-mesa-directiva', (req, res) => {
    const db = req.db;
    const io = req.io;
    const operadorId = req.user.id;
    
    // Obtener sesión activa y sus iniciativas
    db.get(`
        SELECT s.*, COUNT(i.id) as total_iniciativas
        FROM sesiones s
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        WHERE s.activa = 1
        GROUP BY s.id
    `, (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion || sesion.total_iniciativas === 0) {
            return res.status(400).json({ error: 'No hay sesión activa con iniciativas' });
        }
        
        // Obtener información del operador
        db.get('SELECT nombre_completo FROM usuarios WHERE id = ?', [operadorId], (err, operador) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo operador' });
            }
            
            // Emitir notificación a presidente y secretarios
            io.emit('sesion-lista-para-iniciar', {
                sesion: sesion.nombre,
                totalIniciativas: sesion.total_iniciativas,
                operador: operador.nombre_completo,
                timestamp: new Date().toISOString()
            });
            
            // Registrar en historial
            db.run(`
                INSERT INTO historial_sesiones (sesion_id, fecha_evento, tipo_evento, descripcion, usuario_id)
                VALUES (?, datetime('now'), 'notificacion_mesa', ?, ?)
            `, [sesion.id, `Operador notificó que ${sesion.total_iniciativas} iniciativas están listas`, operadorId]);
            
            res.json({
                success: true,
                totalIniciativas: sesion.total_iniciativas,
                mensaje: 'Mesa directiva notificada exitosamente'
            });
        });
    });
});

// Obtener sesiones con documentos PDF
router.get('/sesiones-con-documentos', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT 
            s.id,
            s.codigo_sesion,
            s.nombre,
            s.fecha,
            s.fecha_clausura,
            s.estado,
            s.archivo_pdf,
            COUNT(i.id) as total_iniciativas,
            SUM(CASE WHEN i.resultado = 'aprobada' THEN 1 ELSE 0 END) as aprobadas,
            SUM(CASE WHEN i.resultado = 'rechazada' THEN 1 ELSE 0 END) as rechazadas
        FROM sesiones s
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        WHERE s.archivo_pdf IS NOT NULL
        GROUP BY s.id
        ORDER BY s.fecha DESC
        LIMIT 20
    `, (err, sesiones) => {
        if (err) {
            console.error('Error obteniendo sesiones con documentos:', err);
            return res.status(500).json({ error: 'Error obteniendo sesiones' });
        }
        
        res.json({ sesiones: sesiones || [] });
    });
});

// Obtener sesiones pendientes (indefinidas y programadas)
router.get('/sesiones-pendientes', (req, res) => {
    const db = req.db;
    
    // Combinar sesiones de la tabla 'sesiones' y 'sesiones_precargadas'
    // Usamos una subquery para poder hacer ORDER BY correctamente con UNION ALL
    db.all(`
        SELECT * FROM (
            SELECT 
                'sesion' as origen_tabla,
                s.id,
                s.codigo_sesion,
                s.nombre,
                s.descripcion,
                s.estado,
                s.fecha_programada,
                s.fecha,
                COUNT(i.id) as total_iniciativas,
                u.nombre_completo as creado_por_nombre,
                u.role as creado_por_role,
                CASE 
                    WHEN s.estado = 'pendiente' THEN 1
                    WHEN s.estado = 'preparada' THEN 2
                    WHEN s.estado = 'programada' THEN 3
                    WHEN s.estado = 'indefinida' THEN 4
                END as orden_estado
            FROM sesiones s
            LEFT JOIN iniciativas i ON s.id = i.sesion_id
            LEFT JOIN usuarios u ON s.iniciada_por = u.id
            WHERE s.estado IN ('indefinida', 'programada', 'preparada')
            AND s.activa = 0
            GROUP BY s.id
            
            UNION ALL
            
            SELECT 
                'sesion_precargada' as origen_tabla,
                sp.id,
                sp.codigo_sesion,
                sp.nombre_sesion as nombre,
                sp.descripcion,
                sp.estado,
                sp.fecha_propuesta as fecha_programada,
                sp.fecha_carga as fecha,
                COUNT(ip.id) as total_iniciativas,
                u.nombre_completo as creado_por_nombre,
                u.role as creado_por_role,
                CASE 
                    WHEN sp.estado = 'pendiente' THEN 1
                    WHEN sp.estado = 'preparada' THEN 2
                    WHEN sp.estado = 'programada' THEN 3
                    WHEN sp.estado = 'indefinida' THEN 4
                END as orden_estado
            FROM sesiones_precargadas sp
            LEFT JOIN iniciativas_precargadas ip ON sp.id = ip.sesion_precargada_id
            LEFT JOIN usuarios u ON sp.cargada_por = u.id
            WHERE sp.estado IN ('pendiente', 'indefinida', 'programada')
            GROUP BY sp.id
        ) AS combined_sessions
        ORDER BY orden_estado, fecha_programada ASC, fecha DESC
    `, (err, sesiones) => {
        if (err) {
            console.error('Error obteniendo sesiones pendientes:', err);
            return res.status(500).json({ error: 'Error obteniendo sesiones pendientes' });
        }
        
        res.json({ sesiones });
    });
});

// Activar sesión pendiente
router.post('/activar-sesion-pendiente/:id', (req, res) => {
    const { id } = req.params;
    const { origen_tabla } = req.body || { origen_tabla: 'sesion' };
    const db = req.db;
    const io = req.io;
    
    // Si la sesión es de tipo sesion_precargada, primero copiarla a sesiones
    if (origen_tabla === 'sesion_precargada') {
        // Obtener la sesión precargada
        db.get(`
            SELECT * FROM sesiones_precargadas 
            WHERE id = ? 
            AND estado IN ('pendiente', 'indefinida', 'programada')
        `, [id], (err, sesionPrecargada) => {
            if (err || !sesionPrecargada) {
                return res.status(404).json({ error: 'Sesión precargada no encontrada' });
            }
            
            // Desactivar otras sesiones activas
            db.run('UPDATE sesiones SET activa = 0 WHERE activa = 1', (err) => {
                if (err) {
                    console.error('Error desactivando sesiones:', err);
                    return res.status(500).json({ error: 'Error desactivando sesiones', detalle: err.message });
                }
                
                // Crear nueva sesión desde la precargada
                const codigo = sesionPrecargada.codigo_sesion || `SES-${Date.now()}`;
                const nombreSesion = sesionPrecargada.nombre_sesion || 'Sesión sin nombre';
                const descripcion = sesionPrecargada.descripcion || '';
                
                console.log('Creando nueva sesión:', {
                    codigo: codigo,
                    nombre: nombreSesion,
                    descripcion: descripcion,
                    usuario_id: req.user.id
                });
                
                db.run(`
                    INSERT INTO sesiones (
                        codigo_sesion, nombre, descripcion, estado, 
                        activa, ejecutar_inmediato, fecha, iniciada_por, tipo_sesion
                    ) VALUES (?, ?, ?, 'preparada', 1, 1, ?, ?, 'ordinaria')
                `, [codigo, nombreSesion, descripcion, 
                    new Date().toISOString(), req.user.id], function(err) {
                    if (err) {
                        console.error('Error creando sesión activa:', err);
                        return res.status(500).json({ 
                            error: 'Error creando sesión activa', 
                            detalle: err.message,
                            codigo: err.code
                        });
                    }
                    
                    const nuevaSesionId = this.lastID;
                    
                    // Copiar iniciativas
                    db.all(`
                        SELECT * FROM iniciativas_precargadas 
                        WHERE sesion_precargada_id = ?
                    `, [id], (err, iniciativas) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                        }
                        
                        if (iniciativas.length > 0) {
                            console.log(`Insertando ${iniciativas.length} iniciativas en sesión ${nuevaSesionId}`);
                            
                            const stmt = db.prepare(`
                                INSERT INTO iniciativas (
                                    sesion_id, numero, numero_orden_dia, titulo, descripcion, 
                                    presentador, partido_presentador, tipo_mayoria, categoria
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `);
                            
                            let erroresInsert = [];
                            iniciativas.forEach((init, index) => {
                                console.log(`Procesando iniciativa ${index + 1}/${iniciativas.length}:`, {
                                    numero: init.numero,
                                    titulo: init.titulo?.substring(0, 50),
                                    tiene_descripcion: !!init.descripcion,
                                    categoria: init.categoria
                                });
                                
                                stmt.run(
                                    nuevaSesionId, 
                                    init.numero, 
                                    init.numero_orden_dia || init.numero,  // usar numero_orden_dia si existe
                                    init.titulo || '', 
                                    init.descripcion || '',
                                    init.presentador || '', 
                                    init.partido_presentador || '', 
                                    init.tipo_mayoria || 'simple',
                                    init.categoria || 'otras'  // agregar categoría con valor por defecto
                                , (err) => {
                                    if (err) {
                                        console.error(`Error insertando iniciativa ${init.numero}:`, err);
                                        erroresInsert.push({numero: init.numero, error: err.message});
                                    }
                                });
                            });
                            
                            stmt.finalize((err) => {
                                if (err) {
                                    console.error('Error finalizando statement:', err);
                                    return res.status(500).json({ 
                                        error: 'Error insertando iniciativas',
                                        detalle: err.message
                                    });
                                }
                                
                                if (erroresInsert.length > 0) {
                                    console.error('Hubo errores insertando iniciativas:', erroresInsert);
                                }
                                
                                // Marcar la sesión precargada como procesada DESPUÉS de insertar iniciativas
                                db.run(`
                                    UPDATE sesiones_precargadas 
                                    SET estado = 'procesada' 
                                    WHERE id = ?
                                `, [id], (err) => {
                                    if (err) {
                                        console.error('Error marcando sesión como procesada:', err);
                                    }
                                    
                                    // Emitir evento
                                    if (io) {
                                        io.emit('sesion-activada', {
                                            sesion_id: nuevaSesionId,
                                            nombre: sesionPrecargada.nombre_sesion
                                        });
                                    }
                                    
                                    // Enviar respuesta exitosa
                                    res.json({ 
                                        success: true,
                                        message: 'Sesión activada correctamente',
                                        sesion_id: nuevaSesionId,
                                        iniciativas_procesadas: iniciativas.length
                                    });
                                });
                            });
                        } else {
                            // Si no hay iniciativas, proceder directamente
                            // Marcar la sesión precargada como procesada
                            db.run(`
                                UPDATE sesiones_precargadas 
                                SET estado = 'procesada' 
                                WHERE id = ?
                            `, [id], (err) => {
                                if (err) {
                                    console.error('Error marcando sesión como procesada:', err);
                                }
                                
                                // Emitir evento
                                if (io) {
                                    io.emit('sesion-activada', {
                                        sesion_id: nuevaSesionId,
                                        nombre: sesionPrecargada.nombre_sesion
                                    });
                                }
                                
                                // Enviar respuesta exitosa
                                res.json({ 
                                    success: true,
                                    message: 'Sesión activada correctamente (sin iniciativas)',
                                    sesion_id: nuevaSesionId
                                });
                            });
                        }
                    });
                });
            });
        });
        return;
    }
    
    // Si es una sesión normal, proceder como antes
    db.get(`
        SELECT * FROM sesiones 
        WHERE id = ? 
        AND estado IN ('indefinida', 'programada', 'preparada')
        AND activa = 0
    `, [id], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión' });
        }
        
        if (!sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada o ya activa' });
        }
        
        // Desactivar otras sesiones activas
        db.run('UPDATE sesiones SET activa = 0 WHERE activa = 1', (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error desactivando sesiones' });
            }
            
            // Activar la sesión seleccionada
            db.run(`
                UPDATE sesiones 
                SET activa = 1, 
                    estado = 'preparada',
                    ejecutar_inmediato = 1
                WHERE id = ?
            `, [id], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error activando sesión' });
                }
                
                // Emitir evento
                io.emit('sesion-activada', {
                    sesion_id: id,
                    nombre: sesion.nombre
                });
                
                res.json({ 
                    success: true,
                    message: 'Sesión activada correctamente',
                    sesion
                });
            });
        });
    });
});

// Obtener historial completo de sesiones
router.get('/historial-sesiones', (req, res) => {
    const db = req.db;
    const { limite = 50, offset = 0, estado, busqueda } = req.query;
    
    let query = `
        SELECT 
            s.*,
            u1.nombre_completo as iniciada_por_nombre,
            u2.nombre_completo as clausurada_por_nombre,
            (SELECT COUNT(*) FROM iniciativas WHERE sesion_id = s.id) as total_iniciativas,
            (SELECT COUNT(*) FROM iniciativas WHERE sesion_id = s.id AND resultado = 'aprobada') as iniciativas_aprobadas,
            (SELECT COUNT(*) FROM iniciativas WHERE sesion_id = s.id AND resultado = 'rechazada') as iniciativas_rechazadas
        FROM sesiones s
        LEFT JOIN usuarios u1 ON s.iniciada_por = u1.id
        LEFT JOIN usuarios u2 ON s.clausurada_por = u2.id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (estado) {
        query += ` AND s.estado = ?`;
        params.push(estado);
    }
    
    if (busqueda) {
        query += ` AND (s.nombre LIKE ? OR s.codigo_sesion LIKE ?)`;
        params.push(`%${busqueda}%`, `%${busqueda}%`);
    }
    
    query += ` ORDER BY s.fecha DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limite), parseInt(offset));
    
    db.all(query, params, (err, sesiones) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo historial' });
        }
        
        // Obtener el total de registros para paginación
        let countQuery = `SELECT COUNT(*) as total FROM sesiones WHERE 1=1`;
        const countParams = [];
        
        if (estado) {
            countQuery += ` AND estado = ?`;
            countParams.push(estado);
        }
        
        if (busqueda) {
            countQuery += ` AND (nombre LIKE ? OR codigo_sesion LIKE ?)`;
            countParams.push(`%${busqueda}%`, `%${busqueda}%`);
        }
        
        db.get(countQuery, countParams, (err, count) => {
            if (err) {
                return res.status(500).json({ error: 'Error contando registros' });
            }
            
            res.json({
                sesiones,
                total: count.total,
                limite: parseInt(limite),
                offset: parseInt(offset)
            });
        });
    });
})

// Eliminar iniciativa
router.delete('/iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    // Verificar que no esté activa (se permite eliminar cerradas)
    db.get('SELECT activa, cerrada FROM iniciativas WHERE id = ?', [id], (err, iniciativa) => {
        if (err || !iniciativa) {
            return res.status(404).json({ error: 'Iniciativa no encontrada' });
        }
        
        if (iniciativa.activa) {
            return res.status(400).json({ error: 'No se puede eliminar una iniciativa activa' });
        }
        
        // Eliminar votos asociados primero
        db.run('DELETE FROM votos WHERE iniciativa_id = ?', [id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error eliminando votos' });
            }
            
            // Eliminar iniciativa
            db.run('DELETE FROM iniciativas WHERE id = ?', [id], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Error eliminando iniciativa' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Iniciativa no encontrada' });
                }
                
                req.io.emit('iniciativa-actualizada', { id, deleted: true });
                res.json({ message: 'Iniciativa eliminada correctamente' });
            });
        });
    });
});

// Generar reporte PDF de sesión clausurada
router.get('/reporte-sesion/:id', (req, res) => {
    const sesionId = req.params.id;
    const db = req.db;
    
    // Obtener datos de la sesión
    db.get(
        'SELECT * FROM sesiones WHERE id = ?',
        [sesionId],
        (err, sesion) => {
            if (err || !sesion) {
                return res.status(404).json({ error: 'Sesión no encontrada' });
            }
            
            // Obtener todas las iniciativas de la sesión
            db.all(
                `SELECT i.*, 
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'favor') as votos_favor,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'contra') as votos_contra,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'abstencion') as votos_abstencion
                FROM iniciativas i
                WHERE i.sesion_id = ?
                ORDER BY i.numero`,
                [sesionId],
                (err, iniciativas) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                    }
                    
                    // Obtener estadísticas de asistencia si existe
                    db.get(
                        `SELECT pl.*, 
                            (SELECT COUNT(*) FROM asistencias WHERE pase_lista_id = pl.id AND asistencia = 'presente') as presentes,
                            (SELECT COUNT(*) FROM asistencias WHERE pase_lista_id = pl.id AND asistencia = 'ausente') as ausentes
                        FROM pase_lista pl
                        WHERE pl.sesion_id = ?
                        ORDER BY pl.fecha DESC
                        LIMIT 1`,
                        [sesionId],
                        (err, paseLista) => {
                            // Generar PDF
                            const doc = new PDFDocument({ margin: 50 });
                            
                            // Headers para descarga
                            res.setHeader('Content-Type', 'application/pdf');
                            res.setHeader('Content-Disposition', `attachment; filename="reporte_sesion_${sesionId}.pdf"`);
                            
                            // Pipe al response
                            doc.pipe(res);
                            
                            // Título principal
                            doc.fontSize(20).text('CONGRESO DEL ESTADO', { align: 'center' });
                            doc.fontSize(16).text('REPORTE DE SESIÓN LEGISLATIVA', { align: 'center' });
                            doc.moveDown();
                            
                            // Información de la sesión
                            doc.fontSize(12);
                            doc.text(`Sesión: ${sesion.nombre}`);
                            doc.text(`Fecha de inicio: ${new Date(sesion.fecha).toLocaleString('es-MX')}`);
                            if (sesion.fecha_clausura) {
                                doc.text(`Fecha de clausura: ${new Date(sesion.fecha_clausura).toLocaleString('es-MX')}`);
                            }
                            doc.moveDown();
                            
                            // Estadísticas generales
                            doc.fontSize(14).text('ESTADÍSTICAS GENERALES', { underline: true });
                            doc.fontSize(11);
                            doc.text(`Total de iniciativas: ${iniciativas.length}`);
                            doc.text(`Aprobadas: ${iniciativas.filter(i => i.resultado === 'aprobada').length}`);
                            doc.text(`Rechazadas: ${iniciativas.filter(i => i.resultado === 'rechazada').length}`);
                            doc.text(`Sin resolver: ${iniciativas.filter(i => !i.resultado).length}`);
                            doc.moveDown();
                            
                            // Asistencia si existe
                            if (paseLista) {
                                doc.fontSize(14).text('REGISTRO DE ASISTENCIA', { underline: true });
                                doc.fontSize(11);
                                doc.text(`Diputados presentes: ${paseLista.presentes}`);
                                doc.text(`Diputados ausentes: ${paseLista.ausentes}`);
                                doc.text(`Total: ${paseLista.presentes + paseLista.ausentes}`);
                                doc.moveDown();
                            }
                            
                            // Detalle de iniciativas
                            doc.addPage();
                            doc.fontSize(14).text('DETALLE DE INICIATIVAS', { underline: true });
                            doc.moveDown();
                            
                            iniciativas.forEach((iniciativa, index) => {
                                // Nueva página si es necesario
                                if (index > 0 && index % 3 === 0) {
                                    doc.addPage();
                                }
                                
                                doc.fontSize(12).text(`Iniciativa #${iniciativa.numero}`, { underline: true });
                                doc.fontSize(10);
                                doc.text(`Título: ${iniciativa.titulo}`);
                                if (iniciativa.descripcion) {
                                    doc.text(`Descripción: ${iniciativa.descripcion}`);
                                }
                                if (iniciativa.presentador) {
                                    doc.text(`Presentada por: ${iniciativa.presentador} ${iniciativa.partido_presentador ? `(${iniciativa.partido_presentador})` : ''}`);
                                }
                                doc.text(`Tipo de mayoría: ${iniciativa.tipo_mayoria || 'Simple'}`);
                                doc.text(`Estado: ${iniciativa.resultado ? iniciativa.resultado.toUpperCase() : 'SIN CERRAR'}`);
                                
                                // Votación
                                doc.text('Votación:', { underline: true });
                                doc.text(`  A favor: ${iniciativa.votos_favor || 0}`);
                                doc.text(`  En contra: ${iniciativa.votos_contra || 0}`);
                                doc.text(`  Abstención: ${iniciativa.votos_abstencion || 0}`);
                                doc.text(`  Total de votos: ${(iniciativa.votos_favor || 0) + (iniciativa.votos_contra || 0) + (iniciativa.votos_abstencion || 0)}`);
                                doc.moveDown();
                            });
                            
                            // Pie de página
                            doc.fontSize(8);
                            doc.text(`Reporte generado el ${new Date().toLocaleString('es-MX')}`, 50, doc.page.height - 50, {
                                align: 'center'
                            });
                            
                            // Finalizar PDF
                            doc.end();
                        }
                    );
                }
            );
        }
    );
});

// Procesar PDF con iniciativas extraordinarias
router.post('/procesar-pdf-extraordinarias', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo PDF' });
    }
    
    const { numero_inicio, numero_fin } = req.body;
    
    try {
        // Extraer iniciativas del PDF
        const iniciativas = await pdfExtractor.extraerIniciativas(req.file.buffer, 'pdf');
        
        if (iniciativas.length === 0) {
            return res.status(400).json({ error: 'No se encontraron iniciativas en el PDF' });
        }
        
        // Si se proporcionó rango de números, aplicarlo
        if (numero_inicio) {
            const inicio = parseInt(numero_inicio);
            const fin = numero_fin ? parseInt(numero_fin) : inicio + iniciativas.length - 1;
            
            iniciativas.forEach((init, index) => {
                init.numero = inicio + index;
                if (init.numero > fin) {
                    init.numero = fin; // No exceder el número final
                }
            });
        }
        
        // Marcar todas como extraordinarias
        iniciativas.forEach(init => {
            init.tipo_iniciativa = 'extraordinaria';
        });
        
        res.json({
            success: true,
            iniciativas: iniciativas,
            mensaje: `${iniciativas.length} iniciativas extraordinarias extraídas del PDF`
        });
        
    } catch (error) {
        console.error('Error procesando PDF de extraordinarias:', error);
        res.status(500).json({ error: 'Error al procesar el PDF' });
    }
});

// Obtener lista de diputados
router.get('/lista-diputados', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT id, nombre_completo, partido 
        FROM usuarios 
        WHERE role = 'diputado' 
        ORDER BY nombre_completo
    `, [], (err, diputados) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo diputados' });
        }
        res.json(diputados);
    });
});

// Obtener números disponibles para iniciativas extraordinarias
router.get('/numeros-disponibles', (req, res) => {
    const db = req.db;
    
    // Obtener sesión activa
    db.get('SELECT id FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            // Si no hay sesión activa, devolver números del 1 al 50
            const disponibles = [];
            for (let i = 1; i <= 50; i++) {
                disponibles.push(i);
            }
            return res.json({ disponibles });
        }
        
        // Obtener números ya usados
        db.all(`
            SELECT DISTINCT numero 
            FROM iniciativas 
            WHERE sesion_id = ?
            ORDER BY numero
        `, [sesion.id], (err, usados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo números usados' });
            }
            
            const numerosUsados = usados.map(u => u.numero);
            const disponibles = [];
            
            // Generar lista de números disponibles
            let maxNumero = Math.max(...numerosUsados, 0) + 10;
            for (let i = 1; i <= maxNumero; i++) {
                if (!numerosUsados.includes(i)) {
                    disponibles.push(i);
                }
            }
            
            // Agregar algunos números extras al final
            for (let i = maxNumero + 1; i <= maxNumero + 5; i++) {
                disponibles.push(i);
            }
            
            res.json({ disponibles });
        });
    });
});

// Procesar PDF de iniciativas extraordinarias
router.post('/procesar-pdf-extraordinarias', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo PDF' });
    }
    
    try {
        // Aquí normalmente procesarías el PDF
        // Por ahora devolvemos un ejemplo
        const iniciativas = [
            {
                numero: 'EXT-1',
                descripcion: 'Iniciativa extraordinaria de ejemplo',
                tipo_mayoria: 'simple'
            }
        ];
        
        res.json({ 
            success: true, 
            iniciativas,
            mensaje: 'PDF procesado correctamente'
        });
    } catch (error) {
        console.error('Error procesando PDF:', error);
        res.status(500).json({ error: 'Error al procesar el PDF' });
    }
});

// Guardar iniciativas extraordinarias
router.post('/guardar-extraordinarias', async (req, res) => {
    const db = req.db;
    const { iniciativas } = req.body;
    
    if (!iniciativas || iniciativas.length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron iniciativas' });
    }
    
    // Verificar si hay sesión activa
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión activa' });
        }
        
        if (!sesion) {
            return res.status(400).json({ error: 'No hay sesión activa. Las iniciativas extraordinarias deben agregarse a una sesión activa' });
        }
        
        let guardadas = 0;
        let errores = 0;
        
        // Insertar cada iniciativa extraordinaria
        const stmt = db.prepare(`
            INSERT INTO iniciativas (
                sesion_id, numero, titulo, descripcion, 
                presentador, partido_presentador, tipo_mayoria,
                tipo_iniciativa, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        iniciativas.forEach(init => {
            stmt.run(
                sesion.id,
                init.numero,
                init.titulo || `Iniciativa Extraordinaria ${init.numero}`,
                init.descripcion || init.titulo || '',
                init.presentador || '',
                init.partido_presentador || '',
                init.tipo_mayoria || 'simple',
                'extraordinaria',
                new Date().toISOString(),
                function(err) {
                    if (err) {
                        console.error('Error insertando iniciativa extraordinaria:', err);
                        errores++;
                    } else {
                        guardadas++;
                    }
                }
            );
        });
        
        stmt.finalize((err) => {
            if (err) {
                return res.status(500).json({ error: 'Error guardando iniciativas' });
            }
            
            // Emitir evento de actualización
            const io = req.io;
            if (io) {
                io.emit('iniciativas-extraordinarias-agregadas', {
                    sesion_id: sesion.id,
                    cantidad: guardadas
                });
            }
            
            res.json({
                success: true,
                guardadas: guardadas,
                errores: errores,
                mensaje: `Se guardaron ${guardadas} iniciativas extraordinarias`
            });
        });
    });
});

// Obtener sesiones precargadas disponibles
router.get('/sesiones-precargadas/disponibles', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT 
            sp.id,
            sp.nombre_sesion,
            sp.fecha_sesion,
            sp.descripcion,
            sp.created_at,
            u.nombre_completo as creado_por_nombre,
            (SELECT COUNT(*) FROM iniciativas_precargadas WHERE sesion_precargada_id = sp.id) as iniciativas_count
        FROM sesiones_precargadas sp
        LEFT JOIN usuarios u ON sp.creado_por = u.id
        WHERE sp.estado = 'disponible'
        ORDER BY sp.created_at DESC
    `, (err, sesiones) => {
        if (err) {
            console.error('Error obteniendo sesiones precargadas:', err);
            return res.status(500).json({ error: 'Error obteniendo sesiones precargadas' });
        }
        
        res.json({ sesiones: sesiones || [] });
    });
});

// Obtener iniciativas de una sesión precargada
router.get('/sesiones-precargadas/:id/iniciativas', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    db.all(`
        SELECT * FROM iniciativas_precargadas 
        WHERE sesion_precargada_id = ?
        ORDER BY numero
    `, [id], (err, iniciativas) => {
        if (err) {
            console.error('Error obteniendo iniciativas precargadas:', err);
            return res.status(500).json({ error: 'Error obteniendo iniciativas' });
        }
        
        res.json(iniciativas || []);
    });
});

// Cargar sesión precargada como sesión activa
router.post('/cargar-sesion-precargada/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    const io = req.io;
    
    // Primero obtener la sesión precargada
    db.get(`
        SELECT * FROM sesiones_precargadas 
        WHERE id = ? AND estado = 'disponible'
    `, [id], (err, sesionPrecargada) => {
        if (err || !sesionPrecargada) {
            return res.status(404).json({ error: 'Sesión precargada no encontrada' });
        }
        
        // Verificar si hay una sesión activa
        db.get(`
            SELECT id FROM sesiones 
            WHERE estado IN ('preparada', 'activa')
        `, (err, sesionActiva) => {
            if (err) {
                return res.status(500).json({ error: 'Error verificando sesión activa' });
            }
            
            // Si hay sesión activa, cancelarla
            const procederConCarga = () => {
                // Crear nueva sesión basada en la precargada
                const fecha = new Date().toISOString();
                const fechaStr = new Date().toISOString().split('T')[0];
                const timestamp = Date.now();
                const codigoSesion = `SES-${fechaStr}-${timestamp}`;
                
                db.run(`
                    INSERT INTO sesiones (
                        codigo_sesion, nombre, fecha, estado, 
                        ejecutar_inmediato, creado_por, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    codigoSesion,
                    sesionPrecargada.nombre_sesion,
                    sesionPrecargada.fecha_sesion,
                    'preparada',
                    1,
                    req.user.id,
                    fecha
                ], function(err) {
                    if (err) {
                        console.error('Error creando sesión:', err);
                        return res.status(500).json({ error: 'Error creando sesión' });
                    }
                    
                    const nuevaSesionId = this.lastID;
                    
                    // Obtener iniciativas precargadas
                    db.all(`
                        SELECT * FROM iniciativas_precargadas 
                        WHERE sesion_precargada_id = ?
                        ORDER BY numero
                    `, [id], (err, iniciativas) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                        }
                        
                        // Insertar iniciativas en la sesión activa
                        const stmt = db.prepare(`
                            INSERT INTO iniciativas (
                                sesion_id, numero, titulo, descripcion,
                                presentador, partido_presentador, tipo_mayoria,
                                tipo_iniciativa, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        let insertadas = 0;
                        iniciativas.forEach(init => {
                            stmt.run(
                                nuevaSesionId,
                                init.numero,
                                init.titulo || `Iniciativa ${init.numero}`,
                                init.descripcion || init.titulo,
                                init.presentador,
                                init.partido_presentador,
                                init.tipo_mayoria || 'simple',
                                init.tipo_iniciativa || 'ordinaria',
                                fecha,
                                function(err) {
                                    if (!err) insertadas++;
                                }
                            );
                        });
                        
                        stmt.finalize((err) => {
                            if (err) {
                                return res.status(500).json({ error: 'Error insertando iniciativas' });
                            }
                            
                            // Marcar sesión precargada como usada
                            db.run(`
                                UPDATE sesiones_precargadas 
                                SET estado = 'usada', 
                                    usado_por = ?, 
                                    fecha_uso = ?,
                                    sesion_id_generada = ?
                                WHERE id = ?
                            `, [req.user.id, fecha, nuevaSesionId, id], (err) => {
                                if (err) {
                                    console.error('Error actualizando sesión precargada:', err);
                                }
                            });
                            
                            // Emitir evento de nueva sesión
                            if (io) {
                                io.emit('sesion-creada', {
                                    sesion_id: nuevaSesionId,
                                    nombre: sesionPrecargada.nombre_sesion,
                                    iniciativas: insertadas
                                });
                            }
                            
                            res.json({
                                success: true,
                                sesion_id: nuevaSesionId,
                                iniciativas: insertadas,
                                mensaje: `Sesión cargada con ${insertadas} iniciativas`
                            });
                        });
                    });
                });
            };
            
            if (sesionActiva) {
                // Cancelar sesión activa primero
                db.run(`
                    UPDATE sesiones 
                    SET estado = 'cancelada' 
                    WHERE id = ?
                `, [sesionActiva.id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error cancelando sesión activa' });
                    }
                    procederConCarga();
                });
            } else {
                procederConCarga();
            }
        });
    });
});

// Editar iniciativa de sesión precargada (antes de cargarla)
router.put('/sesiones-precargadas/:sesionId/iniciativas/:initId', (req, res) => {
    const { sesionId, initId } = req.params;
    const { titulo, descripcion, presentador, partido_presentador, tipo_mayoria } = req.body;
    const db = req.db;
    
    // Verificar que la sesión precargada existe y está disponible
    db.get(`
        SELECT * FROM sesiones_precargadas 
        WHERE id = ? AND estado = 'disponible'
    `, [sesionId], (err, sesion) => {
        if (err || !sesion) {
            return res.status(404).json({ error: 'Sesión precargada no encontrada o no disponible' });
        }
        
        // Actualizar iniciativa
        db.run(`
            UPDATE iniciativas_precargadas
            SET titulo = ?,
                descripcion = ?,
                presentador = ?,
                partido_presentador = ?,
                tipo_mayoria = ?
            WHERE id = ? AND sesion_precargada_id = ?
        `, [
            titulo,
            descripcion,
            presentador,
            partido_presentador,
            tipo_mayoria,
            initId,
            sesionId
        ], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error actualizando iniciativa' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Iniciativa no encontrada' });
            }
            
            res.json({ 
                success: true, 
                mensaje: 'Iniciativa actualizada correctamente' 
            });
        });
    });
});

// Obtener iniciativas de una sesión pendiente
router.get('/sesion/:sesionId/iniciativas', (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    db.all(
        `SELECT id, numero, titulo, descripcion, tipo_mayoria, presentador, partido_presentador 
         FROM iniciativas 
         WHERE sesion_id = ? 
         ORDER BY numero`,
        [sesionId],
        (err, iniciativas) => {
            if (err) {
                console.error('Error al obtener iniciativas:', err);
                return res.status(500).json({ error: 'Error al obtener iniciativas' });
            }
            
            res.json({ iniciativas: iniciativas || [] });
        }
    );
});

// Obtener iniciativas de una sesión precargada
router.get('/sesion-precargada/:sesionId/iniciativas', (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    db.all(
        `SELECT id, numero, titulo, descripcion, tipo_mayoria, 
                presentador, partido_presentador 
         FROM iniciativas_precargadas 
         WHERE sesion_precargada_id = ? 
         ORDER BY numero`,
        [sesionId],
        (err, iniciativas) => {
            if (err) {
                console.error('Error al obtener iniciativas precargadas:', err);
                return res.status(500).json({ error: 'Error al obtener iniciativas' });
            }
            
            res.json({ iniciativas: iniciativas || [] });
        }
    );
});

// Actualizar iniciativas de una sesión precargada
router.put('/sesion-precargada/:sesionId/iniciativas', (req, res) => {
    const { sesionId } = req.params;
    const { iniciativas } = req.body;
    const db = req.db;
    
    if (!iniciativas || !Array.isArray(iniciativas)) {
        return res.status(400).json({ error: 'Datos de iniciativas inválidos' });
    }
    
    // Verificar que la sesión precargada existe y no está procesada
    db.get(
        'SELECT estado FROM sesiones_precargadas WHERE id = ?',
        [sesionId],
        (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error al verificar sesión' });
            }
            
            if (!sesion) {
                return res.status(404).json({ error: 'Sesión no encontrada' });
            }
            
            if (sesion.estado === 'procesada') {
                return res.status(400).json({ error: 'No se puede editar una sesión ya procesada' });
            }
            
            // Iniciar transacción
            db.serialize(() => {
                // Eliminar iniciativas existentes
                db.run(
                    'DELETE FROM iniciativas_precargadas WHERE sesion_precargada_id = ?',
                    [sesionId],
                    (err) => {
                        if (err) {
                            console.error('Error eliminando iniciativas:', err);
                            return res.status(500).json({ error: 'Error al actualizar iniciativas' });
                        }
                        
                        // Insertar nuevas iniciativas
                        if (iniciativas.length > 0) {
                            const stmt = db.prepare(`
                                INSERT INTO iniciativas_precargadas (
                                    sesion_precargada_id, numero, titulo, descripcion, 
                                    tipo_mayoria, presentador, partido_presentador
                                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                            `);
                            
                            let insertErrors = false;
                            iniciativas.forEach((iniciativa, index) => {
                                stmt.run(
                                    sesionId,
                                    iniciativa.numero || (index + 1),
                                    iniciativa.titulo || '',
                                    iniciativa.descripcion || '',
                                    iniciativa.tipo_mayoria || 'simple',
                                    iniciativa.presentador || '',
                                    iniciativa.partido_presentador || iniciativa.partido || '',
                                    (err) => {
                                        if (err) {
                                            console.error('Error insertando iniciativa:', err);
                                            insertErrors = true;
                                        }
                                    }
                                );
                            });
                            
                            stmt.finalize((err) => {
                                if (err || insertErrors) {
                                    return res.status(500).json({ error: 'Error al guardar iniciativas' });
                                }
                                
                                res.json({ 
                                    success: true, 
                                    message: 'Iniciativas actualizadas correctamente',
                                    count: iniciativas.length
                                });
                            });
                        } else {
                            res.json({ 
                                success: true, 
                                message: 'Iniciativas actualizadas correctamente',
                                count: 0
                            });
                        }
                    }
                );
            });
        }
    );
});

// Actualizar iniciativas de una sesión pendiente
router.put('/sesion/:sesionId/iniciativas', (req, res) => {
    const { sesionId } = req.params;
    const { iniciativas } = req.body;
    const db = req.db;
    
    if (!iniciativas || !Array.isArray(iniciativas)) {
        return res.status(400).json({ error: 'Datos de iniciativas inválidos' });
    }
    
    // Verificar que la sesión no esté activa
    db.get(
        'SELECT estado FROM sesiones WHERE id = ?',
        [sesionId],
        (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error al verificar sesión' });
            }
            
            if (!sesion) {
                return res.status(404).json({ error: 'Sesión no encontrada' });
            }
            
            if (sesion.estado === 'iniciada') {
                return res.status(400).json({ error: 'No se puede editar una sesión ya iniciada' });
            }
            
            // Iniciar transacción
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Eliminar iniciativas existentes
                db.run(
                    'DELETE FROM iniciativas WHERE sesion_id = ?',
                    [sesionId],
                    (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error al actualizar iniciativas' });
                        }
                        
                        // Insertar nuevas iniciativas
                        let errorOcurrido = false;
                        let procesadas = 0;
                        
                        if (iniciativas.length === 0) {
                            db.run('COMMIT');
                            return res.json({ 
                                message: 'Iniciativas actualizadas correctamente',
                                actualizadas: 0
                            });
                        }
                        
                        iniciativas.forEach((iniciativa, index) => {
                            db.run(
                                `INSERT INTO iniciativas (
                                    sesion_id, numero, titulo, descripcion, 
                                    tipo_mayoria, presentador, partido_presentador
                                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    sesionId,
                                    iniciativa.numero || (index + 1),
                                    iniciativa.titulo || `Iniciativa ${index + 1}`,
                                    iniciativa.descripcion || '',
                                    iniciativa.tipo_mayoria || 'simple',
                                    iniciativa.presentador || '',
                                    iniciativa.partido_presentador || ''
                                ],
                                (err) => {
                                    if (err && !errorOcurrido) {
                                        errorOcurrido = true;
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Error al insertar iniciativas' });
                                    }
                                    
                                    procesadas++;
                                    
                                    if (procesadas === iniciativas.length && !errorOcurrido) {
                                        db.run('COMMIT');
                                        res.json({ 
                                            message: 'Iniciativas actualizadas correctamente',
                                            actualizadas: procesadas
                                        });
                                    }
                                }
                            );
                        });
                    }
                );
            });
        }
    );
});

// Guardar sesión como respaldo
router.post('/guardar-sesion-respaldo', (req, res) => {
    const { sesion_id, nombre, descripcion } = req.body;
    const db = req.db;
    
    if (!sesion_id || !nombre) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Verificar que existe la sesión
    db.get('SELECT * FROM sesiones WHERE id = ?', [sesion_id], (err, sesion) => {
        if (err || !sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        
        // Crear una nueva sesión precargada
        db.run(
            `INSERT INTO sesiones_precargadas (nombre_sesion, descripcion, estado, creado_por) 
             VALUES (?, ?, 'disponible', ?)`,
            [nombre, descripcion || '', req.user.id],
            function(err) {
                if (err) {
                    console.error('Error creando sesión precargada:', err);
                    return res.status(500).json({ error: 'Error al guardar sesión' });
                }
                
                const sesionPrecargadaId = this.lastID;
                
                // Copiar todas las iniciativas
                db.all(
                    'SELECT * FROM iniciativas WHERE sesion_id = ? ORDER BY numero',
                    [sesion_id],
                    (err, iniciativas) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                        }
                        
                        let copiadas = 0;
                        const total = iniciativas.length;
                        
                        if (total === 0) {
                            return res.json({ 
                                success: true, 
                                message: 'Sesión guardada sin iniciativas',
                                sesion_precargada_id: sesionPrecargadaId
                            });
                        }
                        
                        iniciativas.forEach((init, index) => {
                            db.run(
                                `INSERT INTO iniciativas_precargadas 
                                (sesion_precargada_id, numero, numero_orden_dia, titulo, descripcion, 
                                 tipo_mayoria, presentador, partido_presentador) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    sesionPrecargadaId,
                                    init.numero,
                                    init.numero_orden_dia,
                                    init.titulo,
                                    init.descripcion,
                                    init.tipo_mayoria,
                                    init.presentador,
                                    init.partido_presentador
                                ],
                                (err) => {
                                    if (!err) copiadas++;
                                    
                                    if (index === total - 1) {
                                        res.json({ 
                                            success: true, 
                                            message: 'Sesión guardada correctamente',
                                            sesion_precargada_id: sesionPrecargadaId,
                                            iniciativas_copiadas: copiadas,
                                            total_iniciativas: total
                                        });
                                    }
                                }
                            );
                        });
                    }
                );
            }
        );
    });
});

// Limpiar todas las iniciativas de una sesión
router.delete('/limpiar-sesion/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    // Verificar que la sesión existe y está activa
    db.get('SELECT * FROM sesiones WHERE id = ? AND activa = 1', [id], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión' });
        }
        
        if (!sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada o no está activa' });
        }
        
        // Verificar que no hay votaciones activas (solo activas, no cerradas)
        db.get(
            'SELECT COUNT(*) as activas FROM iniciativas WHERE sesion_id = ? AND activa = 1',
            [id],
            (err, row) => {
                if (err) {
                    return res.status(500).json({ error: 'Error verificando votaciones' });
                }
                
                if (row.activas > 0) {
                    return res.status(400).json({ 
                        error: 'No se puede limpiar la sesión con votaciones activas' 
                    });
                }
                
                // Eliminar todas las iniciativas
                db.run('DELETE FROM iniciativas WHERE sesion_id = ?', [id], function(err) {
                    if (err) {
                        console.error('Error eliminando iniciativas:', err);
                        return res.status(500).json({ error: 'Error al limpiar sesión' });
                    }
                    
                    const eliminadas = this.changes;
                    
                    // Emitir evento de actualización
                    req.io.emit('sesion-limpiada', { 
                        sesion_id: id,
                        eliminadas: eliminadas
                    });
                    
                    res.json({ 
                        success: true, 
                        message: 'Sesión limpiada correctamente',
                        eliminadas: eliminadas
                    });
                });
            }
        );
    });
});

// Eliminar sesión (solo si no está activa)
router.delete('/sesion/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    // Primero buscar en sesiones normales
    db.get('SELECT * FROM sesiones WHERE id = ?', [id], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión' });
        }
        
        if (sesion) {
            // Sesión encontrada en tabla sesiones
            if (sesion.activa) {
                return res.status(400).json({ error: 'No se puede eliminar una sesión activa' });
            }
            
            // Eliminar iniciativas de la sesión
            db.run('DELETE FROM iniciativas WHERE sesion_id = ?', [id], (err) => {
                if (err) {
                    console.error('Error eliminando iniciativas:', err);
                    return res.status(500).json({ error: 'Error eliminando iniciativas' });
                }
                
                // Eliminar la sesión
                db.run('DELETE FROM sesiones WHERE id = ?', [id], (err) => {
                    if (err) {
                        console.error('Error eliminando sesión:', err);
                        return res.status(500).json({ error: 'Error eliminando sesión' });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: 'Sesión eliminada correctamente' 
                    });
                });
            });
        } else {
            // Si no está en sesiones, buscar en sesiones_temporales
            db.get('SELECT * FROM sesiones_temporales WHERE id = ?', [id], (err, sesionTemp) => {
                if (err) {
                    return res.status(500).json({ error: 'Error verificando sesión temporal' });
                }
                
                if (!sesionTemp) {
                    return res.status(404).json({ error: 'Sesión no encontrada' });
                }
                
                // Eliminar iniciativas de la sesión temporal
                db.run('DELETE FROM iniciativas_temporales WHERE sesion_temporal_id = ?', [id], (err) => {
                    if (err) {
                        console.error('Error eliminando iniciativas temporales:', err);
                        return res.status(500).json({ error: 'Error eliminando iniciativas temporales' });
                    }
                    
                    // Eliminar la sesión temporal
                    db.run('DELETE FROM sesiones_temporales WHERE id = ?', [id], (err) => {
                        if (err) {
                            console.error('Error eliminando sesión temporal:', err);
                            return res.status(500).json({ error: 'Error eliminando sesión temporal' });
                        }
                        
                        res.json({ 
                            success: true, 
                            message: 'Sesión temporal eliminada correctamente' 
                        });
                    });
                });
            });
        }
    });
});

// Obtener sesiones finalizadas para exportación
router.get('/sesiones-finalizadas', (req, res) => {
    const db = req.db;
    
    // Obtener las últimas 30 sesiones finalizadas (clausuradas)
    db.all(`
        SELECT 
            s.id,
            s.codigo_sesion,
            s.nombre,
            s.fecha,
            s.fecha_clausura,
            s.estado,
            COUNT(DISTINCT i.id) as total_iniciativas,
            COUNT(DISTINCT v.id) as total_votos
        FROM sesiones s
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        LEFT JOIN votos v ON i.id = v.iniciativa_id
        WHERE s.estado = 'clausurada' 
           OR s.fecha_clausura IS NOT NULL
        GROUP BY s.id
        ORDER BY s.fecha_clausura DESC, s.fecha DESC
        LIMIT 30
    `, (err, sesiones) => {
        if (err) {
            console.error('Error obteniendo sesiones finalizadas:', err);
            return res.status(500).json({ error: 'Error obteniendo sesiones finalizadas' });
        }
        
        res.json({ 
            success: true,
            sesiones: sesiones || []
        });
    });
});

// Endpoint para obtener partidos disponibles
router.get('/partidos', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT nombre, siglas, color_primario 
        FROM partidos 
        WHERE activo = 1 
        ORDER BY nombre ASC
    `, (err, partidos) => {
        if (err) {
            console.error('Error obteniendo partidos:', err);
            return res.status(500).json({ error: 'Error obteniendo partidos' });
        }
        
        res.json({ partidos });
    });
});

module.exports = router;