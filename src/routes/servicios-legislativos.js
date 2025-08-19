const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticateToken, authorize } = require('../auth/middleware');
const pdfExtractor = require('../pdf/extractor');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('servicios_legislativos', 'superadmin'));

// Obtener estadísticas
router.get('/estadisticas', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            COUNT(CASE WHEN estado = 'borrador' THEN 1 END) as borradores,
            COUNT(CASE WHEN estado = 'enviada' THEN 1 END) as enviadas,
            COUNT(CASE WHEN estado = 'procesada' THEN 1 END) as procesadas,
            (SELECT COUNT(*) FROM iniciativas_precargadas WHERE sesion_precargada_id IN 
                (SELECT id FROM sesiones_precargadas WHERE cargada_por = ?)) as totalIniciativas
        FROM sesiones_precargadas
        WHERE cargada_por = ?
    `, [userId, userId], (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo estadísticas' });
        }
        res.json(stats || {
            borradores: 0,
            enviadas: 0,
            procesadas: 0,
            totalIniciativas: 0
        });
    });
});

// Obtener sesiones del usuario
router.get('/mis-sesiones', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    db.all(`
        SELECT 
            sp.*,
            COUNT(ip.id) as num_iniciativas
        FROM sesiones_precargadas sp
        LEFT JOIN iniciativas_precargadas ip ON sp.id = ip.sesion_precargada_id
        WHERE sp.cargada_por = ?
        GROUP BY sp.id
        ORDER BY sp.fecha_carga DESC
    `, [userId], (err, sesiones) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesiones' });
        }
        res.json(sesiones || []);
    });
});

// Obtener detalles de una sesión
router.get('/sesion/:id', (req, res) => {
    const db = req.db;
    const sesionId = req.params.id;
    const userId = req.user.id;
    
    db.get(`
        SELECT * FROM sesiones_precargadas 
        WHERE id = ? AND cargada_por = ?
    `, [sesionId, userId], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        
        // Obtener iniciativas
        db.all(`
            SELECT * FROM iniciativas_precargadas 
            WHERE sesion_precargada_id = ?
            ORDER BY numero
        `, [sesionId], (err, iniciativas) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo iniciativas' });
            }
            
            sesion.iniciativas = iniciativas || [];
            res.json(sesion);
        });
    });
});

// Crear sesión manual
router.post('/crear-sesion', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    const { nombre, fecha_propuesta, descripcion, estado, iniciativas } = req.body;
    
    if (!nombre || !iniciativas || iniciativas.length === 0) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Generar código de sesión
    const fecha = new Date();
    const codigo = `SL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    
    db.run(`
        INSERT INTO sesiones_precargadas (
            codigo_sesion, nombre_sesion, descripcion, fecha_propuesta, 
            estado, cargada_por, fecha_carga
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [codigo, nombre, descripcion, fecha_propuesta, estado || 'borrador', userId, new Date().toISOString()],
    function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error creando sesión' });
        }
        
        const sesionId = this.lastID;
        
        // Insertar iniciativas
        const stmt = db.prepare(`
            INSERT INTO iniciativas_precargadas (
                sesion_precargada_id, numero, titulo, descripcion,
                presentador, partido_presentador, tipo_mayoria,
                tipo_iniciativa, comision, turno, observaciones
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let errores = 0;
        iniciativas.forEach(init => {
            stmt.run(
                sesionId,
                init.numero,
                init.titulo,
                init.descripcion || '',
                init.presentador || '',
                init.partido || '',
                init.tipo_mayoria || 'simple',
                init.tipo_iniciativa || 'ordinaria',
                init.comision || '',
                init.turno || '',
                init.observaciones || '',
                (err) => {
                    if (err) errores++;
                }
            );
        });
        
        stmt.finalize((err) => {
            if (err || errores > 0) {
                return res.status(500).json({ error: 'Error guardando iniciativas' });
            }
            
            res.json({
                success: true,
                sesion_id: sesionId,
                codigo: codigo,
                mensaje: `Sesión creada con ${iniciativas.length} iniciativas`
            });
        });
    });
});

// Cargar desde Excel
router.post('/cargar-excel', upload.single('archivo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo' });
    }
    
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        
        // Leer datos de sesión
        let datosSesion = {};
        if (workbook.Sheets['DATOS_SESION']) {
            const sesionData = XLSX.utils.sheet_to_json(workbook.Sheets['DATOS_SESION']);
            sesionData.forEach(row => {
                if (row.CAMPO && row.VALOR) {
                    datosSesion[row.CAMPO] = row.VALOR;
                }
            });
        }
        
        // Leer iniciativas
        const iniciativas = [];
        if (workbook.Sheets['INICIATIVAS']) {
            const iniciativasData = XLSX.utils.sheet_to_json(workbook.Sheets['INICIATIVAS']);
            iniciativasData.forEach(row => {
                if (row.NUMERO && !String(row.TITULO).includes('EJEMPLO:')) {
                    iniciativas.push({
                        numero: row.NUMERO,
                        titulo: row.TITULO,
                        descripcion: row.DESCRIPCION || '',
                        presentador: row.PRESENTADOR || '',
                        partido: row.PARTIDO || '',
                        tipo_mayoria: row.TIPO_MAYORIA || 'simple',
                        tipo_iniciativa: row.TIPO_INICIATIVA || 'ordinaria',
                        comision: row.COMISION || '',
                        turno: row.TURNO || '',
                        observaciones: row.OBSERVACIONES || ''
                    });
                }
            });
        }
        
        if (iniciativas.length === 0) {
            return res.status(400).json({ error: 'No se encontraron iniciativas en el archivo' });
        }
        
        // Crear sesión con los datos del Excel
        const db = req.db;
        const userId = req.user.id;
        const fecha = new Date();
        const codigo = `SL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
        
        const nombreSesion = datosSesion.NOMBRE_SESION || `Sesión ${new Date().toLocaleDateString('es-MX')}`;
        const fechaPropuesta = datosSesion.FECHA_PROPUESTA || null;
        const descripcion = datosSesion.DESCRIPCION || '';
        
        db.run(`
            INSERT INTO sesiones_precargadas (
                codigo_sesion, nombre_sesion, descripcion, fecha_propuesta,
                estado, cargada_por, fecha_carga, archivo_origen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [codigo, nombreSesion, descripcion, fechaPropuesta, 'borrador', userId, new Date().toISOString(), req.file.originalname],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error creando sesión' });
            }
            
            const sesionId = this.lastID;
            
            // Insertar iniciativas
            const stmt = db.prepare(`
                INSERT INTO iniciativas_precargadas (
                    sesion_precargada_id, numero, titulo, descripcion,
                    presentador, partido_presentador, tipo_mayoria,
                    tipo_iniciativa, comision, turno, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            iniciativas.forEach(init => {
                stmt.run(
                    sesionId,
                    init.numero,
                    init.titulo,
                    init.descripcion,
                    init.presentador,
                    init.partido,
                    init.tipo_mayoria,
                    init.tipo_iniciativa,
                    init.comision,
                    init.turno,
                    init.observaciones
                );
            });
            
            stmt.finalize((err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error guardando iniciativas' });
                }
                
                res.json({
                    success: true,
                    sesion: nombreSesion,
                    iniciativas: iniciativas.length,
                    mensaje: 'Archivo Excel procesado correctamente'
                });
            });
        });
        
    } catch (error) {
        console.error('Error procesando Excel:', error);
        res.status(500).json({ error: 'Error al procesar el archivo Excel' });
    }
});

// Cargar desde PDF
router.post('/cargar-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo PDF' });
    }
    
    try {
        // Extraer iniciativas del PDF
        const iniciativas = await pdfExtractor.extraerIniciativas(req.file.buffer, 'pdf');
        
        if (iniciativas.length === 0) {
            return res.status(400).json({ error: 'No se encontraron iniciativas en el PDF' });
        }
        
        const db = req.db;
        const userId = req.user.id;
        const fecha = new Date();
        const codigo = `SL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
        
        const nombreSesion = `Sesión PDF ${new Date().toLocaleDateString('es-MX')}`;
        
        db.run(`
            INSERT INTO sesiones_precargadas (
                codigo_sesion, nombre_sesion, descripcion,
                estado, cargada_por, fecha_carga, archivo_origen
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [codigo, nombreSesion, 'Sesión cargada desde PDF', 'borrador', userId, new Date().toISOString(), req.file.originalname],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error creando sesión' });
            }
            
            const sesionId = this.lastID;
            
            // Insertar iniciativas
            const stmt = db.prepare(`
                INSERT INTO iniciativas_precargadas (
                    sesion_precargada_id, numero, titulo, descripcion,
                    tipo_mayoria, tipo_iniciativa
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            iniciativas.forEach(init => {
                stmt.run(
                    sesionId,
                    init.numero,
                    init.titulo,
                    init.descripcion || '',
                    init.tipo_mayoria || 'simple',
                    'ordinaria'
                );
            });
            
            stmt.finalize((err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error guardando iniciativas' });
                }
                
                res.json({
                    success: true,
                    sesion_id: sesionId,
                    iniciativas: iniciativas.length,
                    mensaje: 'PDF procesado. Revise y complete la información faltante'
                });
            });
        });
        
    } catch (error) {
        console.error('Error procesando PDF:', error);
        res.status(500).json({ error: 'Error al procesar el archivo PDF' });
    }
});

// Enviar sesión al operador
router.post('/enviar-sesion/:id', (req, res) => {
    const db = req.db;
    const sesionId = req.params.id;
    const userId = req.user.id;
    
    db.run(`
        UPDATE sesiones_precargadas 
        SET estado = 'disponible',
            fecha_envio = ?
        WHERE id = ? AND cargada_por = ? AND estado = 'borrador'
    `, [new Date().toISOString(), sesionId, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error enviando sesión' });
        }
        
        if (this.changes === 0) {
            return res.status(400).json({ error: 'No se puede enviar esta sesión' });
        }
        
        // Notificar al operador (si hay socket disponible)
        const io = req.io;
        if (io) {
            io.emit('nueva-sesion-precargada', {
                sesion_id: sesionId,
                mensaje: 'Nueva sesión disponible de Servicios Legislativos'
            });
        }
        
        res.json({ success: true, mensaje: 'Sesión enviada al operador' });
    });
});

// Eliminar sesión (solo borradores)
router.delete('/eliminar-sesion/:id', (req, res) => {
    const db = req.db;
    const sesionId = req.params.id;
    const userId = req.user.id;
    
    // Primero eliminar iniciativas
    db.run(`
        DELETE FROM iniciativas_precargadas 
        WHERE sesion_precargada_id IN (
            SELECT id FROM sesiones_precargadas 
            WHERE id = ? AND cargada_por = ? AND estado = 'borrador'
        )
    `, [sesionId, userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error eliminando iniciativas' });
        }
        
        // Luego eliminar sesión
        db.run(`
            DELETE FROM sesiones_precargadas 
            WHERE id = ? AND cargada_por = ? AND estado = 'borrador'
        `, [sesionId, userId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error eliminando sesión' });
            }
            
            if (this.changes === 0) {
                return res.status(400).json({ error: 'No se puede eliminar esta sesión' });
            }
            
            res.json({ success: true, mensaje: 'Sesión eliminada' });
        });
    });
});

module.exports = router;