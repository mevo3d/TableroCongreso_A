const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { authenticateToken } = require('../auth/middleware');

// Middleware de autenticación
router.use(authenticateToken);

// Obtener todos los diputados para pase de lista
router.get('/diputados', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT 
            u.id,
            u.nombre_completo,
            u.partido,
            u.cargo_mesa_directiva,
            u.foto_url
        FROM usuarios u
        WHERE u.role = 'diputado'
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
    `, (err, diputados) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo diputados' });
        }
        res.json(diputados);
    });
});

// Obtener pase de lista actual
router.get('/actual', (req, res) => {
    const db = req.db;
    
    // Buscar pase de lista de la sesión activa
    db.get(`
        SELECT pl.* 
        FROM pase_lista pl
        JOIN sesiones s ON pl.sesion_id = s.id
        WHERE s.activa = 1
        ORDER BY pl.fecha DESC
        LIMIT 1
    `, (err, paseLista) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo pase de lista' });
        }
        
        if (!paseLista) {
            return res.json({ pase_lista: null, asistencias: {} });
        }
        
        // Obtener detalles de asistencias
        db.all(`
            SELECT diputado_id, asistencia
            FROM asistencias
            WHERE pase_lista_id = ?
        `, [paseLista.id], (err, asistencias) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo asistencias' });
            }
            
            // Convertir a objeto para fácil acceso
            const asistenciasObj = {};
            asistencias.forEach(a => {
                asistenciasObj[a.diputado_id] = a.asistencia;
            });
            
            // Verificar si hay sesión activa
            db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
                res.json({
                    pase_lista: paseLista,
                    asistencias: asistenciasObj,
                    sesion_activa: !!sesion
                });
            });
        });
    });
});

// Marcar asistencia
router.post('/marcar', (req, res) => {
    const { diputado_id, asistencia } = req.body;
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    console.log('Marcar asistencia - Usuario:', req.user);
    console.log('Marcar asistencia - Body:', req.body);
    
    // Obtener información completa del usuario
    db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, userData) => {
        if (err) {
            console.error('Error obteniendo usuario:', err);
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        console.log('Datos del usuario:', userData);
        
        // Verificar que sea secretario1, secretario2 o secretario legislativo
        const esSecretarioMesa = userData.cargo_mesa_directiva === 'secretario1' || 
                                  userData.cargo_mesa_directiva === 'secretario2';
        const esSecretarioLegislativo = userData.role === 'secretario';
        
        if (!esSecretarioMesa && !esSecretarioLegislativo) {
            return res.status(403).json({ error: 'No tienes permisos para marcar asistencia' });
        }
        
        // Buscar o crear pase de lista
        db.get(`
            SELECT pl.* 
            FROM pase_lista pl
            JOIN sesiones s ON pl.sesion_id = s.id
            WHERE s.activa = 1
            ORDER BY pl.fecha DESC
            LIMIT 1
        `, (err, paseLista) => {
            if (err) {
                return res.status(500).json({ error: 'Error procesando asistencia' });
            }
            
            if (!paseLista) {
                // Crear nuevo pase de lista
                db.get('SELECT id FROM sesiones WHERE activa = 1', (err, sesion) => {
                    if (err || !sesion) {
                        return res.status(400).json({ 
                            error: 'Sesión no activa', 
                            message: 'Esperando a ser activada por el Presidente de la Mesa Directiva' 
                        });
                    }
                    
                    db.run(`
                        INSERT INTO pase_lista (sesion_id, fecha, realizado_por, finalizado)
                        VALUES (?, datetime('now'), ?, 0)
                    `, [sesion.id, userId], function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Error creando pase de lista' });
                        }
                        
                        const paseListaId = this.lastID;
                        guardarAsistencia(paseListaId);
                    });
                });
            } else {
                guardarAsistencia(paseLista.id);
            }
        });
    
        function guardarAsistencia(paseListaId) {
            // Insertar o actualizar asistencia
            db.run(`
                INSERT OR REPLACE INTO asistencias (pase_lista_id, diputado_id, asistencia, hora)
                VALUES (?, ?, ?, datetime('now'))
            `, [paseListaId, diputado_id, asistencia], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error guardando asistencia' });
                }
                
                // Emitir evento
                io.emit('asistencia-marcada', {
                    diputado_id,
                    asistencia
                });
                
                res.json({ message: 'Asistencia marcada correctamente' });
            });
        }
    });
});

// Confirmar pase de lista (pero mantener editable)
router.post('/confirmar', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Obtener información completa del usuario
    db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, userData) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        // Verificar que sea secretario1, secretario2 o secretario legislativo
        const esSecretarioMesa = userData.cargo_mesa_directiva === 'secretario1' || 
                                  userData.cargo_mesa_directiva === 'secretario2';
        const esSecretarioLegislativo = userData.role === 'secretario';
        
        if (!esSecretarioMesa && !esSecretarioLegislativo) {
            return res.status(403).json({ error: 'No tienes permisos para finalizar el pase de lista' });
        }
        
        db.get(`
            SELECT pl.* 
            FROM pase_lista pl
            JOIN sesiones s ON pl.sesion_id = s.id
            WHERE s.activa = 1
            ORDER BY pl.fecha DESC
            LIMIT 1
        `, (err, paseLista) => {
            if (err) {
                return res.status(500).json({ error: 'Error procesando solicitud' });
            }
            
            if (!paseLista) {
                return res.status(404).json({ error: 'No hay pase de lista activo' });
            }
            
            // Contar asistencias
            db.get(`
                SELECT 
                    COUNT(CASE WHEN asistencia = 'presente' THEN 1 END) as presentes,
                    COUNT(CASE WHEN asistencia = 'ausente' THEN 1 END) as ausentes,
                    COUNT(*) as total
                FROM asistencias
                WHERE pase_lista_id = ?
            `, [paseLista.id], (err, conteo) => {
                if (err) {
                    return res.status(500).json({ error: 'Error contando asistencias' });
                }
                
                // Actualizar pase de lista como confirmado (NO finalizado)
                db.run(`
                    UPDATE pase_lista 
                    SET confirmado = 1,
                        total_presentes = ?,
                        total_ausentes = ?,
                        hora_confirmacion = datetime('now')
                    WHERE id = ?
                `, [conteo.presentes, conteo.ausentes, paseLista.id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error confirmando pase de lista' });
                    }
                    
                    // Emitir eventos
                    io.emit('pase-lista-confirmado', {
                        presentes: conteo.presentes,
                        ausentes: conteo.ausentes,
                        total: conteo.total
                    });
                    
                    // Mostrar automáticamente en pantalla
                    io.emit('mostrar-pase-lista', {
                        visible: true,
                        pase_lista_id: paseLista.id
                    });
                    
                    res.json({
                        message: 'Pase de lista confirmado y visible en pantalla',
                        presentes: conteo.presentes,
                        ausentes: conteo.ausentes,
                        total: conteo.total
                    });
                });
            });
        });
    });
});

// Mostrar/Ocultar en pantalla
router.post('/mostrar-pantalla', (req, res) => {
    const db = req.db;
    const io = req.io;
    const { visible = true } = req.body;
    
    db.get(`
        SELECT pl.* 
        FROM pase_lista pl
        JOIN sesiones s ON pl.sesion_id = s.id
        WHERE s.activa = 1
        ORDER BY pl.fecha DESC
        LIMIT 1
    `, (err, paseLista) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo pase de lista' });
        }
        
        if (!paseLista) {
            return res.status(404).json({ error: 'No hay pase de lista activo' });
        }
        
        io.emit('mostrar-pase-lista', {
            visible: visible,
            pase_lista_id: paseLista.id
        });
        
        res.json({ 
            success: true,
            mensaje: visible ? 'Pase de lista visible en pantalla' : 'Pase de lista oculto'
        });
    });
});

// Mantener ruta de finalizar por compatibilidad
router.post('/finalizar', (req, res) => {
    // Redirigir a confirmar
    req.url = '/confirmar';
    return router.handle(req, res);
});

// Rectificar pase de lista (ya no es necesario porque siempre es editable)
router.post('/rectificar', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Verificar permisos
    db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, userData) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        // Solo secretario1, secretario2 o secretario legislativo pueden rectificar
        const esSecretarioMesa = userData.cargo_mesa_directiva === 'secretario1' || 
                                  userData.cargo_mesa_directiva === 'secretario2';
        const esSecretarioLegislativo = userData.role === 'secretario';
        
        if (!esSecretarioMesa && !esSecretarioLegislativo) {
            return res.status(403).json({ error: 'No tienes permisos para rectificar el pase de lista' });
        }
        
        // Verificar que haya sesión activa
        db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error verificando sesión' });
            }
            
            if (!sesion) {
                return res.status(400).json({ error: 'No hay sesión activa. No se puede rectificar.' });
            }
            
            // Buscar el pase de lista finalizado de la sesión actual
            db.get(`
                SELECT * FROM pase_lista 
                WHERE sesion_id = ? AND finalizado = 1
                ORDER BY fecha DESC
                LIMIT 1
            `, [sesion.id], (err, paseLista) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo pase de lista' });
                }
                
                if (!paseLista) {
                    return res.status(404).json({ error: 'No hay pase de lista finalizado para rectificar' });
                }
                
                // Reabrir el pase de lista
                db.run(
                    'UPDATE pase_lista SET finalizado = 0 WHERE id = ?',
                    [paseLista.id],
                    (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error rectificando pase de lista' });
                        }
                        
                        // Notificar a todos
                        res.json({ 
                            success: true,
                            mensaje: 'El pase de lista siempre es editable durante la sesión'
                        });
                    }
                );
            });
        });
    });
});

// Activar pase de lista
router.post('/activar', (req, res) => {
    const db = req.db;
    const io = req.io;
    
    // Verificar si hay una sesión activa
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión' });
        }
        
        if (!sesion) {
            return res.status(400).json({ error: 'No hay sesión activa' });
        }
        
        // Verificar si ya hay un pase de lista activo
        db.get(
            'SELECT * FROM pase_lista WHERE sesion_id = ? AND finalizado = 0',
            [sesion.id],
            (err, paseActivo) => {
                if (err) {
                    return res.status(500).json({ error: 'Error verificando pase de lista' });
                }
                
                if (paseActivo) {
                    // Ya hay un pase activo, solo activar la pantalla
                    io.emit('pase-lista-activado', {
                        activo: true,
                        sesion_id: sesion.id,
                        pase_id: paseActivo.id
                    });
                    
                    return res.json({
                        success: true,
                        message: 'Pase de lista ya activo',
                        sesion_id: sesion.id,
                        pase_id: paseActivo.id
                    });
                } else {
                    // Crear nuevo pase de lista
                    db.run(
                        `INSERT INTO pase_lista (sesion_id, fecha, realizado_por, visible_pantalla) 
                         VALUES (?, CURRENT_TIMESTAMP, ?, 1)`,
                        [sesion.id, req.user.id],
                        function(err) {
                            if (err) {
                                console.error('Error creando pase de lista:', err);
                                return res.status(500).json({ error: 'Error creando pase de lista' });
                            }
                            
                            const paseId = this.lastID;
                            
                            // Emitir evento para activar pantalla
                            io.emit('pase-lista-activado', {
                                activo: true,
                                sesion_id: sesion.id,
                                pase_id: paseId
                            });
                            
                            res.json({
                                success: true,
                                message: 'Pase de lista activado',
                                sesion_id: sesion.id,
                                pase_id: paseId
                            });
                        }
                    );
                }
            }
        );
    });
});

// Obtener estado para pantalla pública
router.get('/pantalla', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT pl.* 
        FROM pase_lista pl
        JOIN sesiones s ON pl.sesion_id = s.id
        WHERE s.activa = 1
        ORDER BY pl.fecha DESC
        LIMIT 1
    `, (err, paseLista) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo pase de lista' });
        }
        
        if (!paseLista) {
            return res.json({ activo: false });
        }
        
        // Obtener lista completa con asistencias
        db.all(`
            SELECT 
                u.id,
                u.nombre_completo,
                u.partido,
                u.foto_url,
                COALESCE(a.asistencia, 'sin_marcar') as asistencia
            FROM usuarios u
            LEFT JOIN asistencias a ON a.diputado_id = u.id AND a.pase_lista_id = ?
            WHERE u.role = 'diputado'
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
        `, [paseLista.id], (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo asistencias' });
            }
            
            res.json({
                activo: true,
                finalizado: paseLista.finalizado,
                presentes: paseLista.total_presentes || 0,
                ausentes: paseLista.total_ausentes || 0,
                diputados
            });
        });
    });
});

// Obtener sesión actual
router.get('/sesion-actual', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT * FROM sesiones 
        WHERE activa = 1
    `, (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        res.json({ sesion });
    });
});

// Obtener configuración del sistema (logos)
router.get('/configuracion', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT * FROM configuracion_sistema 
        WHERE id = 1
    `, (err, config) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo configuración' });
        }
        
        res.json(config || {});
    });
});

// Guardar pase de lista completo
router.post('/guardar', (req, res) => {
    const db = req.db;
    const io = req.io;
    const { sesion_id, asistencia, realizado_por } = req.body;
    const userId = req.user.id;
    
    // Verificar permisos
    const user = req.user;
    const puedeHacerPaseLista = 
        user.cargo_mesa_directiva === 'Presidente de la Mesa Directiva' ||
        user.cargo_mesa_directiva === 'Secretario de la Mesa Directiva' ||
        user.nombre_completo === 'Alberto Sánchez Ortega' ||
        user.nombre_completo === 'Guillermina Maya' ||
        user.role === 'secretario' ||
        user.role === 'operador';
    
    if (!puedeHacerPaseLista) {
        return res.status(403).json({ error: 'No tienes permisos para realizar pase de lista' });
    }
    
    if (!sesion_id) {
        return res.status(400).json({ error: 'No hay sesión activa' });
    }
    
    // Contar presentes y ausentes
    const presentes = Object.values(asistencia).filter(e => e === 'presente').length;
    const ausentes = Object.values(asistencia).filter(e => e === 'ausente').length;
    
    // Verificar quórum (por defecto 11 para mayoría simple)
    db.get(`
        SELECT quorum_minimo FROM sesiones 
        WHERE id = ?
    `, [sesion_id], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando sesión' });
        }
        
        const quorumMinimo = sesion?.quorum_minimo || 11;
        const hayQuorum = presentes >= quorumMinimo;
        
        // Crear registro de pase de lista
        db.run(`
            INSERT INTO pase_lista (
                sesion_id,
                fecha,
                realizado_por,
                total_presentes,
                total_ausentes,
                finalizado,
                confirmado,
                hora_finalizacion,
                hora_confirmacion,
                visible_pantalla
            ) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
        `, [sesion_id, userId, presentes, ausentes], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error guardando pase de lista' });
            }
            
            const paseListaId = this.lastID;
            
            // Guardar detalle de asistencia por diputado
            const detalles = Object.entries(asistencia).map(([diputadoId, estado]) => {
                return new Promise((resolve, reject) => {
                    db.run(`
                        INSERT INTO asistencia_diputados (
                            pase_lista_id,
                            diputado_id,
                            presente,
                            hora_registro
                        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    `, [paseListaId, diputadoId, estado === 'presente' ? 1 : 0], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
            
            Promise.all(detalles)
                .then(() => {
                    // Emitir evento por socket
                    io.emit('pase-lista-actualizado', {
                        presentes,
                        ausentes,
                        hay_quorum: hayQuorum,
                        realizado_por: user.nombre_completo
                    });
                    
                    res.json({
                        success: true,
                        pase_lista_id: paseListaId,
                        presentes,
                        ausentes,
                        hay_quorum: hayQuorum,
                        mensaje: hayQuorum ? 
                            `Pase de lista confirmado. Hay quórum (${presentes}/${quorumMinimo})` :
                            `Pase de lista confirmado. NO hay quórum (${presentes}/${quorumMinimo})`
                    });
                })
                .catch(err => {
                    console.error('Error guardando detalles:', err);
                    res.status(500).json({ error: 'Error guardando detalles de asistencia' });
                });
        });
    });
});

module.exports = router;