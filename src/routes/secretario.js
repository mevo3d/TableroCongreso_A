const express = require('express');
const { authenticateToken, authorize } = require('../auth/middleware');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const router = express.Router();

// Configurar multer para archivos PDF
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB máximo
});

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('secretario', 'superadmin'));

// Estado de sesión para secretario
router.get('/estado-sesion', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT * FROM sesiones 
        WHERE activa = 1
    `, (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({ 
                sesion_activa: false,
                puede_iniciar: true 
            });
        }
        
        // Obtener estadísticas de la sesión
        db.get(`
            SELECT 
                COUNT(*) as total_iniciativas,
                COUNT(CASE WHEN cerrada = 1 THEN 1 END) as votadas,
                COUNT(CASE WHEN resultado = 'aprobada' THEN 1 END) as aprobadas,
                COUNT(CASE WHEN resultado = 'rechazada' THEN 1 END) as rechazadas
            FROM iniciativas 
            WHERE sesion_id = ?
        `, [sesion.id], (err, stats) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo estadísticas' });
            }
            
            res.json({
                sesion_activa: true,
                sesion: {
                    id: sesion.id,
                    nombre: sesion.nombre,
                    fecha_inicio: sesion.fecha
                },
                estadisticas: stats,
                puede_clausurar: true
            });
        });
    });
});

// Dashboard del secretario
router.get('/dashboard', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({
                sesion_actual: null,
                total_iniciativas: 0,
                iniciativas_votadas: 0,
                total_diputados: 20
            });
        }
        
        db.get(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN cerrada = 1 THEN 1 END) as votadas
            FROM iniciativas 
            WHERE sesion_id = ?
        `, [sesion.id], (err, stats) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo estadísticas' });
            }
            
            res.json({
                sesion_actual: sesion.nombre,
                total_iniciativas: stats.total,
                iniciativas_votadas: stats.votadas,
                total_diputados: 20
            });
        });
    });
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

// Obtener iniciativas
router.get('/iniciativas', (req, res) => {
    const db = req.db;
    
    db.get('SELECT id FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({ iniciativas: [] });
        }
        
        db.all(`
            SELECT * FROM iniciativas 
            WHERE sesion_id = ? 
            ORDER BY numero
        `, [sesion.id], (err, iniciativas) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo iniciativas' });
            }
            
            res.json({ iniciativas });
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

// Actualizar iniciativa
router.put('/actualizar-iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const { descripcion, tipo_mayoria } = req.body;
    const db = req.db;
    
    db.run(`
        UPDATE iniciativas 
        SET descripcion = ?, tipo_mayoria = ?
        WHERE id = ? AND cerrada = 0
    `, [descripcion, tipo_mayoria, id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando iniciativa' });
        }
        
        if (this.changes === 0) {
            return res.status(400).json({ error: 'No se puede editar una iniciativa cerrada' });
        }
        
        req.io.emit('iniciativa-actualizada', { id });
        res.json({ message: 'Iniciativa actualizada' });
    });
});

// Activar iniciativa (secretario también puede hacerlo)
router.post('/activar-iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
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
            COUNT(CASE WHEN v.voto = 'abstencion' THEN 1 END) as votos_abstencion,
            COUNT(v.id) as total_votos
        FROM iniciativas i
        LEFT JOIN votos v ON v.iniciativa_id = i.id
        WHERE i.id = ?
        GROUP BY i.id
    `, [id], (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error al procesar votación' });
        }
        
        // Determinar resultado
        const totalDiputados = 20;
        let resultado = 'rechazada';
        
        if (iniciativa.tipo_mayoria === 'simple') {
            if (iniciativa.votos_favor > iniciativa.votos_contra) resultado = 'aprobada';
        } else if (iniciativa.tipo_mayoria === 'absoluta') {
            if (iniciativa.votos_favor > totalDiputados / 2) resultado = 'aprobada';
        } else if (iniciativa.tipo_mayoria === 'calificada') {
            if (iniciativa.votos_favor >= Math.ceil(totalDiputados * 2 / 3)) resultado = 'aprobada';
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
                return res.status(500).json({ error: 'Error al cerrar votación' });
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
        
        // Reabrir la votación (sin verificar resultado para mayor flexibilidad)
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

// Resumen de votación
router.get('/resumen-votacion', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT i.* FROM iniciativas i
        WHERE i.activa = 1
        LIMIT 1
    `, (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa activa' });
        }
        
        if (!iniciativa) {
            return res.json({ iniciativa: null, conteo: null });
        }
        
        db.get(`
            SELECT 
                COUNT(CASE WHEN voto = 'favor' THEN 1 END) as favor,
                COUNT(CASE WHEN voto = 'contra' THEN 1 END) as contra,
                COUNT(CASE WHEN voto = 'abstencion' THEN 1 END) as abstencion,
                COUNT(*) as total
            FROM votos
            WHERE iniciativa_id = ?
        `, [iniciativa.id], (err, conteo) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo conteo' });
            }
            
            res.json({ iniciativa, conteo });
        });
    });
});

// Obtener estadísticas completas
router.get('/estadisticas-completas', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({ 
                total_iniciativas: 0,
                iniciativas_votadas: 0,
                aprobadas: 0,
                rechazadas: 0,
                presentes: 0,
                participacion_promedio: 0,
                quorum: false,
                detalle_iniciativas: []
            });
        }
        
        // Obtener estadísticas generales
        db.all(`
            SELECT 
                i.*,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'favor') as votos_favor,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'contra') as votos_contra,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'abstencion') as abstenciones
            FROM iniciativas i
            WHERE i.sesion_id = ?
            ORDER BY i.numero
        `, [sesion.id], (err, iniciativas) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo iniciativas' });
            }
            
            // Obtener asistencia
            db.get(`
                SELECT COUNT(*) as presentes 
                FROM asistencias a
                JOIN pase_lista pl ON a.pase_lista_id = pl.id
                WHERE pl.sesion_id = ? AND a.asistencia = 'presente'
            `, [sesion.id], (err, asistencia) => {
                const presentes = asistencia ? asistencia.presentes : 0;
                const totalDiputados = 20; // O obtener de la BD
                
                const stats = {
                    total_iniciativas: iniciativas.length,
                    iniciativas_votadas: iniciativas.filter(i => i.cerrada).length,
                    aprobadas: iniciativas.filter(i => i.resultado === 'aprobada').length,
                    rechazadas: iniciativas.filter(i => i.resultado === 'rechazada').length,
                    presentes: presentes,
                    participacion_promedio: iniciativas.length > 0 ? 
                        Math.round(iniciativas.reduce((acc, i) => acc + (i.votos_favor + i.votos_contra + i.abstenciones), 0) / iniciativas.length) : 0,
                    quorum: presentes >= Math.ceil(totalDiputados / 2) + 1,
                    detalle_iniciativas: iniciativas
                };
                
                res.json(stats);
            });
        });
    });
});

// Exportar reporte CSV
router.get('/exportar-reporte', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.status(400).json({ error: 'No hay sesión activa' });
        }
        
        db.all(`
            SELECT 
                i.numero,
                i.titulo,
                i.descripcion,
                i.tipo_mayoria,
                i.resultado,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'favor') as votos_favor,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'contra') as votos_contra,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'abstencion') as abstenciones
            FROM iniciativas i
            WHERE i.sesion_id = ?
            ORDER BY i.numero
        `, [sesion.id], (err, iniciativas) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo datos' });
            }
            
            // Crear CSV
            let csv = 'Número,Título,Descripción,Tipo Mayoría,A Favor,En Contra,Abstenciones,Resultado\n';
            
            iniciativas.forEach(i => {
                csv += `"${i.numero}","${i.titulo}","${i.descripcion || ''}","${i.tipo_mayoria}",`;
                csv += `${i.votos_favor},${i.votos_contra},${i.abstenciones},"${i.resultado || 'Pendiente'}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=reporte_sesion_${sesion.id}.csv`);
            res.send('\ufeff' + csv); // BOM para UTF-8
        });
    });
});

// Pausar votación
router.post('/pausar-votacion', (req, res) => {
    const db = req.db;
    const io = req.io;
    
    db.get('SELECT * FROM iniciativas WHERE activa = 1', (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        if (!iniciativa) {
            return res.status(404).json({ error: 'No hay votación activa' });
        }
        
        // Marcar como pausada (usando un campo temporal o estado)
        db.run('UPDATE iniciativas SET activa = 0 WHERE id = ?', [iniciativa.id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error pausando votación' });
            }
            
            io.emit('votacion-pausada', { iniciativa_id: iniciativa.id });
            res.json({ message: 'Votación pausada' });
        });
    });
});

// Autorizar/Desautorizar Vicepresidente
let vicepresidenteAutorizado = false; // Estado global de autorización

router.post('/autorizar-vicepresidente', (req, res) => {
    const { autorizado } = req.body;
    const io = req.io;
    
    // Solo el secretario legislativo puede autorizar
    if (req.user.role !== 'secretario') {
        return res.status(403).json({ error: 'No tienes permisos para autorizar' });
    }
    
    vicepresidenteAutorizado = autorizado;
    
    // Notificar a todos los usuarios, especialmente al vicepresidente
    io.emit('autorizacion-vicepresidente-cambiada', {
        autorizado: vicepresidenteAutorizado,
        autorizado_por: req.user.nombre
    });
    
    res.json({ 
        success: true, 
        autorizado: vicepresidenteAutorizado,
        mensaje: autorizado ? 'Vicepresidente autorizado' : 'Autorización revocada'
    });
});

// Obtener estado de autorización
router.get('/estado-autorizacion-vice', (req, res) => {
    res.json({ autorizado: vicepresidenteAutorizado });
});

// Endpoint público para verificar autorización (usado por vicepresidente)
router.get('/vicepresidente-autorizado', (req, res) => {
    res.json({ autorizado: vicepresidenteAutorizado });
});

// Reanudar votación
router.post('/reanudar-votacion', (req, res) => {
    const db = req.db;
    const io = req.io;
    
    // Buscar la última iniciativa pausada (no cerrada)
    db.get('SELECT * FROM iniciativas WHERE activa = 0 AND cerrada = 0 ORDER BY id DESC LIMIT 1', (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        if (!iniciativa) {
            return res.status(404).json({ error: 'No hay votación pausada' });
        }
        
        // Reactivar
        db.run('UPDATE iniciativas SET activa = 1 WHERE id = ?', [iniciativa.id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error reanudando votación' });
            }
            
            io.emit('iniciativa-activa', iniciativa);
            res.json({ message: 'Votación reanudada' });
        });
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

// Obtener historial de sesiones con asistencia
router.get('/historial-sesiones-con-asistencia', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT s.id, s.nombre, s.fecha_inicio, s.fecha_clausura,
               COUNT(DISTINCT pl.id) as tiene_pase_lista
        FROM sesiones s
        LEFT JOIN pase_lista pl ON pl.sesion_id = s.id
        WHERE s.fecha_clausura IS NOT NULL OR s.activa = 1
        GROUP BY s.id
        ORDER BY s.fecha_inicio DESC
        LIMIT 20
    `, (err, sesiones) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesiones' });
        }
        res.json(sesiones);
    });
});

// Obtener asistencia de una sesión específica
router.get('/asistencia-sesion/:sesionId', (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    // Obtener información de la sesión y pase de lista
    db.get(`
        SELECT s.*, pl.id as pase_lista_id, pl.confirmado, pl.total_presentes, pl.total_ausentes
        FROM sesiones s
        LEFT JOIN pase_lista pl ON pl.sesion_id = s.id
        WHERE s.id = ?
        ORDER BY pl.fecha DESC
        LIMIT 1
    `, [sesionId], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion || !sesion.pase_lista_id) {
            return res.status(404).json({ error: 'No hay pase de lista para esta sesión' });
        }
        
        // Obtener detalles de asistencias
        db.all(`
            SELECT 
                a.diputado_id,
                a.asistencia,
                a.hora,
                u.nombre_completo,
                u.partido,
                u.cargo_mesa_directiva
            FROM asistencias a
            JOIN usuarios u ON u.id = a.diputado_id
            WHERE a.pase_lista_id = ?
            ORDER BY u.nombre_completo
        `, [sesion.pase_lista_id], (err, asistencias) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo asistencias' });
            }
            
            // Si no hay asistencias registradas, obtener todos los diputados
            if (asistencias.length === 0) {
                db.all(`
                    SELECT 
                        u.id as diputado_id,
                        'sin_marcar' as asistencia,
                        NULL as hora,
                        u.nombre_completo,
                        u.partido,
                        u.cargo_mesa_directiva
                    FROM usuarios u
                    WHERE u.role = 'diputado'
                    ORDER BY u.nombre_completo
                `, (err, diputados) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error obteniendo diputados' });
                    }
                    
                    res.json({
                        sesion,
                        pase_lista_id: sesion.pase_lista_id,
                        asistencias: diputados,
                        resumen: {
                            presentes: 0,
                            ausentes: 0,
                            sin_marcar: diputados.length,
                            total: diputados.length
                        }
                    });
                });
            } else {
                // Calcular resumen
                const presentes = asistencias.filter(a => a.asistencia === 'presente').length;
                const ausentes = asistencias.filter(a => a.asistencia === 'ausente').length;
                
                res.json({
                    sesion,
                    pase_lista_id: sesion.pase_lista_id,
                    asistencias,
                    resumen: {
                        presentes,
                        ausentes,
                        sin_marcar: 20 - presentes - ausentes,
                        total: 20
                    }
                });
            }
        });
    });
});

// Modificar asistencias (solo secretario con permisos completos)
router.post('/modificar-asistencias', (req, res) => {
    const { modificaciones, razon, modificado_por } = req.body;
    const db = req.db;
    const io = req.io;
    
    if (!modificaciones || modificaciones.length === 0) {
        return res.status(400).json({ error: 'No hay modificaciones para guardar' });
    }
    
    if (!razon) {
        return res.status(400).json({ error: 'Debe indicar la razón de la modificación' });
    }
    
    // Iniciar transacción
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        let errores = [];
        let modificados = 0;
        
        // Procesar cada modificación
        const procesarModificaciones = () => {
            const promises = modificaciones.map(mod => {
                return new Promise((resolve, reject) => {
                    // Actualizar o insertar asistencia
                    db.run(`
                        INSERT OR REPLACE INTO asistencias (pase_lista_id, diputado_id, asistencia, hora)
                        VALUES (?, ?, ?, datetime('now'))
                    `, [mod.pase_lista_id, mod.diputado_id, mod.asistencia], (err) => {
                        if (err) {
                            errores.push(`Error modificando asistencia de diputado ${mod.diputado_id}`);
                            reject(err);
                        } else {
                            modificados++;
                            resolve();
                        }
                    });
                });
            });
            
            Promise.all(promises)
                .then(() => {
                    // Registrar en log de auditoría
                    db.run(`
                        INSERT INTO auditoria_asistencia (
                            pase_lista_id, 
                            modificado_por, 
                            razon, 
                            cantidad_modificaciones,
                            fecha
                        ) VALUES (?, ?, ?, ?, datetime('now'))
                    `, [modificaciones[0].pase_lista_id, modificado_por, razon, modificados], (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error registrando auditoría' });
                        }
                        
                        // Actualizar contadores del pase de lista
                        const paseListaId = modificaciones[0].pase_lista_id;
                        db.get(`
                            SELECT 
                                COUNT(CASE WHEN asistencia = 'presente' THEN 1 END) as presentes,
                                COUNT(CASE WHEN asistencia = 'ausente' THEN 1 END) as ausentes
                            FROM asistencias
                            WHERE pase_lista_id = ?
                        `, [paseListaId], (err, conteo) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Error actualizando contadores' });
                            }
                            
                            db.run(`
                                UPDATE pase_lista 
                                SET total_presentes = ?, total_ausentes = ?
                                WHERE id = ?
                            `, [conteo.presentes, conteo.ausentes, paseListaId], (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Error actualizando pase de lista' });
                                }
                                
                                db.run('COMMIT');
                                
                                // Emitir actualización
                                io.emit('asistencia-modificada', {
                                    pase_lista_id: paseListaId,
                                    modificados,
                                    razon,
                                    modificado_por
                                });
                                
                                res.json({
                                    success: true,
                                    modificados,
                                    mensaje: `Se modificaron ${modificados} registros de asistencia`
                                });
                            });
                        });
                    });
                })
                .catch(() => {
                    db.run('ROLLBACK');
                    res.status(500).json({ 
                        error: 'Error al procesar modificaciones',
                        detalles: errores
                    });
                });
        };
        
        procesarModificaciones();
    });
});

// Exportar asistencia a Excel
router.get('/exportar-asistencia/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    // Por ahora devolver un CSV simple
    db.get(`
        SELECT s.*, pl.id as pase_lista_id
        FROM sesiones s
        LEFT JOIN pase_lista pl ON pl.sesion_id = s.id
        WHERE s.id = ?
    `, [sesionId], (err, sesion) => {
        if (err || !sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        
        db.all(`
            SELECT 
                u.nombre_completo,
                u.partido,
                u.cargo_mesa_directiva,
                COALESCE(a.asistencia, 'sin_marcar') as asistencia,
                a.hora
            FROM usuarios u
            LEFT JOIN asistencias a ON a.diputado_id = u.id AND a.pase_lista_id = ?
            WHERE u.role = 'diputado'
            ORDER BY u.nombre_completo
        `, [sesion.pase_lista_id], (err, asistencias) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo asistencias' });
            }
            
            // Crear CSV
            let csv = 'Nombre,Partido,Cargo,Asistencia,Hora\n';
            asistencias.forEach(a => {
                csv += `"${a.nombre_completo}","${a.partido || ''}","${a.cargo_mesa_directiva || ''}","${a.asistencia}","${a.hora || ''}"\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="asistencia_sesion_${sesionId}.csv"`);
            res.send(csv);
        });
    });
});

// Obtener diputados que no han votado
router.get('/diputados-sin-voto', (req, res) => {
    const db = req.db;
    
    // Obtener iniciativa activa
    db.get('SELECT * FROM iniciativas WHERE activa = 1', (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        if (!iniciativa) {
            return res.json({ iniciativa: null, diputados: [] });
        }
        
        // Obtener diputados que no han votado
        db.all(`
            SELECT u.id, u.nombre_completo, u.partido, u.cargo_mesa_directiva
            FROM usuarios u
            WHERE u.role = 'diputado' 
            AND u.activo = 1
            AND u.id NOT IN (
                SELECT usuario_id FROM votos WHERE iniciativa_id = ?
            )
            ORDER BY 
                CASE 
                    WHEN u.nombre_completo LIKE '%Abarca Peña%' THEN 1
                    WHEN u.nombre_completo LIKE '%Domínguez Mandujano%' THEN 2
                    WHEN u.nombre_completo LIKE '%Espinoza López%' THEN 3
                    WHEN u.nombre_completo LIKE '%Gordillo Vega%' THEN 4
                    WHEN u.nombre_completo LIKE '%Livera Chavarría%' THEN 5
                    WHEN u.nombre_completo LIKE '%Martínez Gómez%' THEN 6
                    WHEN u.nombre_completo LIKE '%Martínez Terrazas%' THEN 7
                    WHEN u.nombre_completo LIKE '%Maya Rendón%' THEN 8
                    WHEN u.nombre_completo LIKE '%Montes de Oca%' THEN 9
                    WHEN u.nombre_completo LIKE '%Pedrero González%' THEN 10
                    WHEN u.nombre_completo LIKE '%Pimentel Mejía%' THEN 11
                    WHEN u.nombre_completo LIKE '%Quevedo Maldonado%' THEN 12
                    WHEN u.nombre_completo LIKE '%Reyes Reyes%' THEN 13
                    WHEN u.nombre_completo LIKE '%Rodríguez López%' THEN 14
                    WHEN u.nombre_completo LIKE '%Rodríguez Ruiz%' THEN 15
                    WHEN u.nombre_completo LIKE '%Ruíz Rodríguez%' THEN 16
                    WHEN u.nombre_completo LIKE '%Sánchez Ortega%' THEN 17
                    WHEN u.nombre_completo LIKE '%Sánchez Zavala%' THEN 18
                    WHEN u.nombre_completo LIKE '%Solano López%' THEN 19
                    WHEN u.nombre_completo LIKE '%Sotelo Martínez%' THEN 20
                    ELSE 99
                END
        `, [iniciativa.id], (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo diputados' });
            }
            
            res.json({
                iniciativa: {
                    id: iniciativa.id,
                    titulo: iniciativa.titulo,
                    numero: iniciativa.numero
                },
                diputados_sin_voto: diputados,
                total_sin_voto: diputados.length
            });
        });
    });
});

// Enviar recordatorio a diputado
router.post('/enviar-recordatorio', (req, res) => {
    const { diputado_id, iniciativa_id } = req.body;
    const db = req.db;
    const io = req.io;
    
    // Verificar que el usuario tenga permisos (secretario o presidente)
    if (req.user.role !== 'secretario' && req.user.cargo_mesa_directiva !== 'presidente') {
        return res.status(403).json({ error: 'No tienes permisos para enviar recordatorios' });
    }
    
    // Obtener información del diputado y la iniciativa
    db.get(`
        SELECT u.nombre_completo, u.id, i.titulo, i.numero
        FROM usuarios u, iniciativas i
        WHERE u.id = ? AND i.id = ?
    `, [diputado_id, iniciativa_id], (err, data) => {
        if (err || !data) {
            return res.status(404).json({ error: 'Diputado o iniciativa no encontrados' });
        }
        
        // Emitir recordatorio específico al diputado
        io.emit(`recordatorio-voto-${diputado_id}`, {
            tipo: 'recordatorio_voto',
            iniciativa_id: iniciativa_id,
            iniciativa_titulo: data.titulo,
            iniciativa_numero: data.numero,
            mensaje: `Por favor emite tu voto para la iniciativa #${data.numero}: ${data.titulo}`,
            enviado_por: req.user.nombre_completo,
            cargo_enviador: req.user.role === 'secretario' ? 'Secretario Legislativo' : 'Presidente de Mesa Directiva',
            timestamp: new Date().toISOString()
        });
        
        // También emitir evento general para logging
        io.emit('recordatorio-enviado', {
            diputado: data.nombre_completo,
            iniciativa: data.titulo,
            enviado_por: req.user.nombre_completo
        });
        
        res.json({
            success: true,
            mensaje: `Recordatorio enviado a ${data.nombre_completo}`,
            diputado: data.nombre_completo,
            iniciativa: data.titulo
        });
    });
});

// Enviar recordatorio a todos los diputados sin voto
router.post('/enviar-recordatorio-todos', (req, res) => {
    const { iniciativa_id } = req.body;
    const db = req.db;
    const io = req.io;
    
    // Verificar permisos
    if (req.user.role !== 'secretario' && req.user.cargo_mesa_directiva !== 'presidente') {
        return res.status(403).json({ error: 'No tienes permisos para enviar recordatorios' });
    }
    
    // Obtener iniciativa
    db.get('SELECT * FROM iniciativas WHERE id = ?', [iniciativa_id], (err, iniciativa) => {
        if (err || !iniciativa) {
            return res.status(404).json({ error: 'Iniciativa no encontrada' });
        }
        
        // Obtener diputados sin voto
        db.all(`
            SELECT u.id, u.nombre_completo
            FROM usuarios u
            WHERE u.role = 'diputado' 
            AND u.activo = 1
            AND u.id NOT IN (
                SELECT usuario_id FROM votos WHERE iniciativa_id = ?
            )
        `, [iniciativa_id], (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo diputados' });
            }
            
            // Enviar recordatorio a cada diputado
            diputados.forEach(diputado => {
                io.emit(`recordatorio-voto-${diputado.id}`, {
                    tipo: 'recordatorio_voto',
                    iniciativa_id: iniciativa.id,
                    iniciativa_titulo: iniciativa.titulo,
                    iniciativa_numero: iniciativa.numero,
                    mensaje: `Por favor emite tu voto para la iniciativa #${iniciativa.numero}: ${iniciativa.titulo}`,
                    enviado_por: req.user.nombre_completo,
                    cargo_enviador: req.user.role === 'secretario' ? 'Secretario Legislativo' : 'Presidente de Mesa Directiva',
                    timestamp: new Date().toISOString()
                });
            });
            
            // Emitir evento general
            io.emit('recordatorios-masivos-enviados', {
                cantidad: diputados.length,
                iniciativa: iniciativa.titulo,
                enviado_por: req.user.nombre_completo
            });
            
            res.json({
                success: true,
                mensaje: `Recordatorios enviados a ${diputados.length} diputados`,
                diputados_notificados: diputados.length
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
            (SELECT COUNT(*) FROM iniciativas WHERE sesion_id = s.id AND resultado = 'rechazada') as iniciativas_rechazadas,
            (SELECT COUNT(*) FROM pase_lista WHERE sesion_id = s.id AND confirmado = 1) as pases_lista_confirmados
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
        query += ` AND (s.nombre LIKE ? OR s.codigo_sesion LIKE ? OR s.notas LIKE ?)`;
        params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
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
            countQuery += ` AND (nombre LIKE ? OR codigo_sesion LIKE ? OR notas LIKE ?)`;
            countParams.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
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

// Obtener diputados sin voto
router.get('/diputados-sin-voto', (req, res) => {
    const db = req.db;
    
    // Primero obtener la iniciativa activa
    db.get(`
        SELECT i.id 
        FROM iniciativas i
        JOIN sesiones s ON i.sesion_id = s.id
        WHERE i.activa = 1 AND s.activa = 1
    `, (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa activa' });
        }
        
        if (!iniciativa) {
            return res.json({ diputados: [] });
        }
        
        // Obtener diputados que no han votado
        db.all(`
            SELECT u.id, u.nombre_completo, u.partido, u.cargo_mesa_directiva
            FROM usuarios u
            WHERE u.role = 'diputado' 
            AND u.activo = 1
            AND u.id NOT IN (
                SELECT usuario_id 
                FROM votos 
                WHERE iniciativa_id = ?
            )
            ORDER BY 
                CASE 
                    WHEN u.nombre_completo LIKE '%Abarca Peña%' THEN 1
                    WHEN u.nombre_completo LIKE '%Domínguez Mandujano%' THEN 2
                    WHEN u.nombre_completo LIKE '%Silva Meneses%' THEN 3
                    WHEN u.nombre_completo LIKE '%Betancourt García%' THEN 4
                    WHEN u.nombre_completo LIKE '%Castro Hernández%' THEN 5
                    WHEN u.nombre_completo LIKE '%Díaz López%' THEN 6
                    WHEN u.nombre_completo LIKE '%Espinoza Martínez%' THEN 7
                    WHEN u.nombre_completo LIKE '%Flores Rodríguez%' THEN 8
                    WHEN u.nombre_completo LIKE '%González Sánchez%' THEN 9
                    WHEN u.nombre_completo LIKE '%Hernández Torres%' THEN 10
                    WHEN u.nombre_completo LIKE '%Jiménez Vargas%' THEN 11
                    WHEN u.nombre_completo LIKE '%López Aguilar%' THEN 12
                    WHEN u.nombre_completo LIKE '%Martínez Cruz%' THEN 13
                    WHEN u.nombre_completo LIKE '%Morales Delgado%' THEN 14
                    WHEN u.nombre_completo LIKE '%Pérez Fernández%' THEN 15
                    WHEN u.nombre_completo LIKE '%Ramírez Gómez%' THEN 16
                    WHEN u.nombre_completo LIKE '%Rodríguez Herrera%' THEN 17
                    WHEN u.nombre_completo LIKE '%Ruiz Moreno%' THEN 18
                    WHEN u.nombre_completo LIKE '%Sánchez Ortiz%' THEN 19
                    WHEN u.nombre_completo LIKE '%Torres Villanueva%' THEN 20
                    ELSE 999
                END
        `, [iniciativa.id], (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo diputados' });
            }
            
            res.json({ diputados: diputados || [] });
        });
    });
});

// Enviar recordatorio individual
router.post('/enviar-recordatorio/:diputadoId', (req, res) => {
    const { diputadoId } = req.params;
    const db = req.db;
    const io = req.io;
    
    // Obtener información del diputado
    db.get('SELECT nombre_completo FROM usuarios WHERE id = ?', [diputadoId], (err, diputado) => {
        if (err || !diputado) {
            return res.status(404).json({ error: 'Diputado no encontrado' });
        }
        
        // Emitir notificación por socket al diputado específico
        if (io) {
            io.emit(`recordatorio-voto-${diputadoId}`, {
                mensaje: 'Por favor emita su voto en la iniciativa actual',
                tipo: 'recordatorio'
            });
        }
        
        res.json({ 
            success: true, 
            mensaje: `Recordatorio enviado a ${diputado.nombre_completo}` 
        });
    });
});

// Enviar recordatorio a todos los que no han votado
router.post('/enviar-recordatorio-todos', (req, res) => {
    const db = req.db;
    const io = req.io;
    
    // Primero obtener la iniciativa activa
    db.get(`
        SELECT i.id, i.titulo 
        FROM iniciativas i
        JOIN sesiones s ON i.sesion_id = s.id
        WHERE i.activa = 1 AND s.activa = 1
    `, (err, iniciativa) => {
        if (err || !iniciativa) {
            return res.status(400).json({ error: 'No hay iniciativa activa' });
        }
        
        // Obtener todos los diputados que no han votado
        db.all(`
            SELECT u.id 
            FROM usuarios u
            WHERE u.role = 'diputado' 
            AND u.activo = 1
            AND u.id NOT IN (
                SELECT usuario_id 
                FROM votos 
                WHERE iniciativa_id = ?
            )
        `, [iniciativa.id], (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo diputados' });
            }
            
            // Enviar notificación a cada diputado
            if (io && diputados) {
                diputados.forEach(dip => {
                    io.emit(`recordatorio-voto-${dip.id}`, {
                        mensaje: `Por favor emita su voto en: ${iniciativa.titulo}`,
                        tipo: 'recordatorio'
                    });
                });
            }
            
            res.json({ 
                success: true, 
                mensaje: `Recordatorio enviado a ${diputados ? diputados.length : 0} diputados` 
            });
        });
    });
});

// Obtener lista de diputados para gestión
router.get('/lista-diputados-gestion', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT 
            id, 
            nombre_completo, 
            partido,
            COALESCE(habilitado_voto, 1) as habilitado_voto,
            COALESCE(en_pleno, 1) as en_pleno
        FROM usuarios 
        WHERE role = 'diputado' AND activo = 1
        ORDER BY 
            CASE 
                WHEN nombre_completo LIKE '%Abarca Peña%' THEN 1
                WHEN nombre_completo LIKE '%Domínguez Mandujano%' THEN 2
                WHEN nombre_completo LIKE '%Silva Meneses%' THEN 3
                WHEN nombre_completo LIKE '%Betancourt García%' THEN 4
                WHEN nombre_completo LIKE '%Castro Hernández%' THEN 5
                WHEN nombre_completo LIKE '%Díaz López%' THEN 6
                WHEN nombre_completo LIKE '%Espinoza Martínez%' THEN 7
                WHEN nombre_completo LIKE '%Flores Rodríguez%' THEN 8
                WHEN nombre_completo LIKE '%González Sánchez%' THEN 9
                WHEN nombre_completo LIKE '%Hernández Torres%' THEN 10
                WHEN nombre_completo LIKE '%Jiménez Vargas%' THEN 11
                WHEN nombre_completo LIKE '%López Aguilar%' THEN 12
                WHEN nombre_completo LIKE '%Martínez Cruz%' THEN 13
                WHEN nombre_completo LIKE '%Morales Delgado%' THEN 14
                WHEN nombre_completo LIKE '%Pérez Fernández%' THEN 15
                WHEN nombre_completo LIKE '%Ramírez Gómez%' THEN 16
                WHEN nombre_completo LIKE '%Rodríguez Herrera%' THEN 17
                WHEN nombre_completo LIKE '%Ruiz Moreno%' THEN 18
                WHEN nombre_completo LIKE '%Sánchez Ortiz%' THEN 19
                WHEN nombre_completo LIKE '%Torres Villanueva%' THEN 20
                ELSE 999
            END
    `, (err, diputados) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo diputados' });
        }
        
        res.json({ diputados: diputados || [] });
    });
});

// Toggle habilitación de voto
router.post('/toggle-habilitacion/:diputadoId', (req, res) => {
    const { diputadoId } = req.params;
    const { habilitar } = req.body;
    const db = req.db;
    const io = req.io;
    
    db.run(`
        UPDATE usuarios 
        SET habilitado_voto = ? 
        WHERE id = ? AND role = 'diputado'
    `, [habilitar ? 1 : 0, diputadoId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando habilitación' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Diputado no encontrado' });
        }
        
        // Notificar al diputado del cambio
        if (io) {
            io.emit(`estado-habilitacion-${diputadoId}`, {
                habilitado: habilitar,
                mensaje: habilitar ? 
                    'Ha sido habilitado para votar' : 
                    'Ha sido deshabilitado temporalmente para votar'
            });
        }
        
        res.json({ 
            success: true, 
            mensaje: `Diputado ${habilitar ? 'habilitado' : 'deshabilitado'} correctamente` 
        });
    });
});

// Toggle presencia en pleno
router.post('/toggle-pleno/:diputadoId', (req, res) => {
    const { diputadoId } = req.params;
    const { presente } = req.body;
    const db = req.db;
    
    db.run(`
        UPDATE usuarios 
        SET en_pleno = ? 
        WHERE id = ? AND role = 'diputado'
    `, [presente ? 1 : 0, diputadoId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando presencia' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Diputado no encontrado' });
        }
        
        res.json({ 
            success: true, 
            mensaje: `Diputado marcado como ${presente ? 'presente' : 'ausente'}` 
        });
    });
});

// Procesar PDF con iniciativas extraordinarias
router.post('/procesar-pdf-extraordinarias', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo PDF' });
    }
    
    try {
        // Parsear el PDF
        const pdfData = await pdfParse(req.file.buffer);
        const texto = pdfData.text;
        
        // Extraer iniciativas del texto
        const iniciativas = [];
        const lineas = texto.split('\n').filter(linea => linea.trim());
        
        let iniciativaActual = null;
        let numeroActual = 1;
        
        for (let linea of lineas) {
            // Buscar patrones de iniciativas (ajustar según formato del PDF)
            if (linea.match(/^\d+[\.\-\)]/)) {
                // Si ya había una iniciativa en proceso, guardarla
                if (iniciativaActual) {
                    iniciativas.push(iniciativaActual);
                }
                
                // Iniciar nueva iniciativa
                iniciativaActual = {
                    numero: numeroActual++,
                    descripcion: linea.replace(/^\d+[\.\-\)]/, '').trim(),
                    tipo_mayoria: 'simple',
                    tipo_iniciativa: 'extraordinaria'
                };
            } else if (iniciativaActual && linea.trim()) {
                // Continuar agregando a la descripción actual
                iniciativaActual.descripcion += ' ' + linea.trim();
            }
        }
        
        // Agregar la última iniciativa si existe
        if (iniciativaActual) {
            iniciativas.push(iniciativaActual);
        }
        
        res.json({
            success: true,
            iniciativas: iniciativas,
            mensaje: `${iniciativas.length} iniciativas extraordinarias extraídas del PDF`
        });
        
    } catch (error) {
        console.error('Error procesando PDF:', error);
        res.status(500).json({ error: 'Error al procesar el PDF' });
    }
});

// Guardar iniciativas extraordinarias
router.post('/guardar-extraordinarias', async (req, res) => {
    const { iniciativas } = req.body;
    const db = req.db;
    const io = req.io;
    
    if (!iniciativas || iniciativas.length === 0) {
        return res.status(400).json({ error: 'No hay iniciativas para guardar' });
    }
    
    // Verificar que hay sesión activa
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err || !sesion) {
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
                init.descripcion || '',
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
                return res.status(500).json({ error: 'Error al guardar iniciativas' });
            }
            
            // Notificar a todos los clientes
            io.emit('iniciativas-extraordinarias-agregadas', {
                sesion_id: sesion.id,
                cantidad: guardadas,
                agregadas_por: req.user.nombre_completo || 'Secretario'
            });
            
            res.json({
                success: true,
                guardadas: guardadas,
                errores: errores,
                mensaje: `Se guardaron ${guardadas} iniciativas extraordinarias`
            });
        });
    });
});

// Endpoint para agregar una nueva iniciativa con recorrido automático
router.post('/agregar-iniciativa', (req, res) => {
    const db = req.db;
    const io = req.io;
    const { 
        numero, 
        descripcion, 
        presentador, 
        partido_presentador, 
        tipo_mayoria, 
        tipo_iniciativa,
        recorrer_numeros 
    } = req.body;
    
    // Validación de campos requeridos
    if (!numero || !descripcion || !tipo_mayoria) {
        return res.status(400).json({ 
            error: 'Faltan campos requeridos: numero, descripcion y tipo_mayoria son obligatorios' 
        });
    }
    
    // Obtener sesión activa
    db.get('SELECT id FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión activa' });
        }
        
        if (!sesion) {
            return res.status(400).json({ error: 'No hay sesión activa' });
        }
        
        const sesion_id = sesion.id;
        let updatesRealizados = 0; // Variable para contar actualizaciones
        
        // Si se debe recorrer números
        if (recorrer_numeros) {
            // Primero, obtener todas las iniciativas de la sesión ordenadas por número
            db.all(`
                SELECT id, numero 
                FROM iniciativas 
                WHERE sesion_id = ? 
                ORDER BY numero DESC
            `, [sesion_id], (err, iniciativas) => {
                if (err) {
                    return res.status(500).json({ error: 'Error al obtener iniciativas' });
                }
                
                // Recorrer las iniciativas que tienen número >= al nuevo número
                const updates = [];
                for (const init of iniciativas) {
                    if (init.numero >= numero) {
                        updates.push({
                            id: init.id,
                            nuevo_numero: init.numero + 1
                        });
                    }
                }
                
                updatesRealizados = updates.length; // Guardar cantidad de actualizaciones
                
                // Ejecutar actualizaciones en orden inverso para evitar conflictos
                let updatePromises = updates.map(update => {
                    return new Promise((resolve, reject) => {
                        db.run(`
                            UPDATE iniciativas 
                            SET numero = ? 
                            WHERE id = ?
                        `, [update.nuevo_numero, update.id], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                });
                
                // Ejecutar todas las actualizaciones
                Promise.all(updatePromises)
                    .then(() => {
                        // Ahora insertar la nueva iniciativa
                        insertarIniciativa();
                    })
                    .catch(err => {
                        console.error('Error recorriendo números:', err);
                        res.status(500).json({ error: 'Error al recorrer números de iniciativas' });
                    });
            });
        } else {
            // Insertar directamente sin recorrer
            insertarIniciativa();
        }
        
        function insertarIniciativa() {
            db.run(`
                INSERT INTO iniciativas (
                    numero, 
                    titulo,
                    descripcion, 
                    presentador, 
                    partido_presentador, 
                    tipo_mayoria, 
                    tipo_iniciativa,
                    sesion_id, 
                    activa, 
                    cerrada
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            `, [
                numero, 
                descripcion || 'Iniciativa sin título',  // titulo usa la descripción
                descripcion, 
                presentador || 'No especificado', 
                partido_presentador || '', 
                tipo_mayoria || 'simple', 
                tipo_iniciativa || 'normal',
                sesion_id
            ], function(err) {
                if (err) {
                    console.error('Error insertando iniciativa:', err);
                    return res.status(500).json({ error: 'Error al guardar la iniciativa' });
                }
                
                const nuevaIniciativaId = this.lastID;
                
                // Obtener la iniciativa recién creada
                db.get(`
                    SELECT * FROM iniciativas 
                    WHERE id = ?
                `, [nuevaIniciativaId], (err, iniciativa) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error al obtener iniciativa creada' });
                    }
                    
                    // Emitir evento de nueva iniciativa
                    io.emit('nueva-iniciativa', iniciativa);
                    
                    // Si es extraordinaria, emitir evento especial
                    if (tipo_iniciativa === 'extraordinaria') {
                        io.emit('iniciativa-extraordinaria-agregada', {
                            iniciativa: iniciativa,
                            mensaje: `Se agregó iniciativa extraordinaria #${numero}`
                        });
                    }
                    
                    res.json({
                        success: true,
                        mensaje: `Iniciativa #${numero} agregada correctamente`,
                        iniciativa: iniciativa,
                        recorridos: updatesRealizados
                    });
                });
            });
        }
    });
});

module.exports = router;