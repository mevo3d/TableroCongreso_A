const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticateToken, authorize } = require('../auth/middleware');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configuración de multer para subir logos y fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const prefix = file.fieldname === 'foto' ? 'user' : 'logo';
        cb(null, `${prefix}-${Date.now()}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB - Aumentado para imágenes más grandes
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'));
        }
    }
});

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('superadmin'));

// Dashboard
router.get('/dashboard', (req, res) => {
    const db = req.db;
    
    const queries = {
        total_usuarios: 'SELECT COUNT(*) as count FROM usuarios',
        total_diputados: "SELECT COUNT(*) as count FROM usuarios WHERE role = 'diputado'",
        total_sesiones: 'SELECT COUNT(*) as count FROM sesiones',
        total_iniciativas: 'SELECT COUNT(*) as count FROM iniciativas',
        total_votos: 'SELECT COUNT(*) as count FROM votos',
        sesion_activa: 'SELECT id FROM sesiones WHERE activa = 1'
    };
    
    const results = {};
    let completed = 0;
    const totalQueries = Object.keys(queries).length;
    
    Object.entries(queries).forEach(([key, query]) => {
        db.get(query, (err, row) => {
            if (!err && row) {
                results[key] = row.count !== undefined ? row.count : (row.id ? true : false);
            } else {
                results[key] = 0;
            }
            
            completed++;
            if (completed === totalQueries) {
                res.json(results);
            }
        });
    });
});

// GESTIÓN DE PARTIDOS POLÍTICOS

// Listar todos los partidos
router.get('/partidos', (req, res) => {
    const db = req.db;
    
    db.all(`SELECT * FROM partidos ORDER BY nombre`, (err, partidos) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo partidos' });
        }
        res.json(partidos);
    });
});

// Actualizar partido (logo y color)
router.put('/partido/:id', upload.single('logo'), (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const { color_primario } = req.body;
    
    let updateQuery = 'UPDATE partidos SET ';
    const params = [];
    
    if (color_primario) {
        updateQuery += 'color_primario = ?';
        params.push(color_primario);
    }
    
    if (req.file) {
        if (params.length > 0) updateQuery += ', ';
        updateQuery += 'logo_url = ?';
        params.push(`/uploads/${req.file.filename}`);
    }
    
    if (params.length === 0) {
        return res.status(400).json({ error: 'No hay datos para actualizar' });
    }
    
    updateQuery += ' WHERE id = ?';
    params.push(id);
    
    db.run(updateQuery, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando partido' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json({ message: 'Partido actualizado correctamente' });
    });
});

// GESTIÓN DE USUARIOS

// Obtener usuarios
router.get('/usuarios', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT id, username, role, nombre_completo, cargo_mesa_directiva, 
               cargo_coordinador, partido, comision, cargo_legislativo, 
               foto_url, activo 
        FROM usuarios 
        ORDER BY role, id
    `, (err, usuarios) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo usuarios' });
        }
        
        res.json({ usuarios });
    });
});

// Obtener sesiones
router.get('/sesiones', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT 
            s.*,
            COUNT(DISTINCT i.id) as total_iniciativas,
            COUNT(DISTINCT CASE WHEN i.cerrada = 1 THEN i.id END) as iniciativas_votadas
        FROM sesiones s
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        GROUP BY s.id
        ORDER BY s.id DESC
    `, (err, sesiones) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesiones' });
        }
        
        res.json({ sesiones });
    });
});

// Cerrar sesión activa
router.post('/cerrar-sesion', (req, res) => {
    const db = req.db;
    
    db.run('UPDATE sesiones SET activa = 0', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error cerrando sesión' });
        }
        
        req.io.emit('sesion-cerrada');
        res.json({ message: 'Sesión cerrada' });
    });
});

// Toggle usuario activo/inactivo
router.put('/usuario/:id/toggle', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    db.run(`
        UPDATE usuarios 
        SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END 
        WHERE id = ?
    `, [id], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando usuario' });
        }
        
        res.json({ message: 'Usuario actualizado' });
    });
});

// Obtener detalle de votación
router.get('/votacion/:iniciativaId', (req, res) => {
    const { iniciativaId } = req.params;
    const db = req.db;
    
    db.get(
        'SELECT * FROM iniciativas WHERE id = ?',
        [iniciativaId],
        (err, iniciativa) => {
            if (err || !iniciativa) {
                return res.status(404).json({ error: 'Iniciativa no encontrada' });
            }
            
            db.all(`
                SELECT 
                    u.nombre_completo,
                    v.voto,
                    v.fecha_voto
                FROM usuarios u
                LEFT JOIN votos v ON u.id = v.usuario_id AND v.iniciativa_id = ?
                WHERE u.role = 'diputado'
                ORDER BY u.id
            `, [iniciativaId], (err, votos) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo votos' });
                }
                
                res.json({ iniciativa, votos });
            });
        }
    );
});

// Crear nuevo usuario
router.post('/usuarios', upload.single('foto'), async (req, res) => {
    const { username, password, role, nombre_completo, cargo_mesa_directiva, 
            cargo_coordinador, partido, comision, cargo_legislativo } = req.body;
    const db = req.db;
    
    if (!username || !password || !role || !nombre_completo) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const foto_url = req.file ? '/uploads/' + req.file.filename : '';
    
    db.run(
        `INSERT INTO usuarios (username, password, role, nombre_completo, cargo_mesa_directiva, 
                              cargo_coordinador, partido, comision, cargo_legislativo, foto_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, role, nombre_completo, cargo_mesa_directiva || '', 
         cargo_coordinador || '', partido || '', comision || '', cargo_legislativo || '', foto_url],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'El usuario ya existe' });
                }
                return res.status(500).json({ error: 'Error creando usuario' });
            }
            
            res.json({ id: this.lastID, message: 'Usuario creado exitosamente' });
        }
    );
});

// Actualizar usuario
router.put('/usuarios/:id', upload.single('foto'), async (req, res) => {
    const { id } = req.params;
    const { nombre_completo, cargo_mesa_directiva, cargo_coordinador, 
            partido, comision, cargo_legislativo, password } = req.body;
    const db = req.db;
    
    let query = 'UPDATE usuarios SET nombre_completo = ?, cargo_mesa_directiva = ?, ' +
                'cargo_coordinador = ?, partido = ?, comision = ?, cargo_legislativo = ?';
    let params = [nombre_completo, cargo_mesa_directiva || '', cargo_coordinador || '', 
                  partido || '', comision || '', cargo_legislativo || ''];
    
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ', password = ?';
        params.push(hashedPassword);
    }
    
    if (req.file) {
        query += ', foto_url = ?';
        params.push('/uploads/' + req.file.filename);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando usuario' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json({ message: 'Usuario actualizado' });
    });
});

// Eliminar usuario
router.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    // No permitir eliminar superadmin
    db.get('SELECT role FROM usuarios WHERE id = ?', [id], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        if (user.role === 'superadmin') {
            return res.status(403).json({ error: 'No se puede eliminar el superadmin' });
        }
        
        db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error eliminando usuario' });
            }
            
            res.json({ message: 'Usuario eliminado' });
        });
    });
});

// Obtener configuración del sistema
router.get('/configuracion', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM configuracion_sistema WHERE id = 1', (err, config) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo configuración' });
        }
        
        res.json(config || {});
    });
});

// Actualizar configuración del sistema
router.put('/configuracion', upload.fields([
    { name: 'logo_congreso', maxCount: 1 },
    { name: 'logo_secundario', maxCount: 1 }
]), (req, res) => {
    const db = req.db;
    const { nombre_congreso } = req.body;
    
    let query = 'UPDATE configuracion_sistema SET nombre_congreso = ?';
    let params = [nombre_congreso];
    
    if (req.files['logo_congreso']) {
        query += ', logo_congreso = ?';
        params.push('/uploads/' + req.files['logo_congreso'][0].filename);
    }
    
    if (req.files['logo_secundario']) {
        query += ', logo_secundario = ?';
        params.push('/uploads/' + req.files['logo_secundario'][0].filename);
    }
    
    query += ' WHERE id = 1';
    
    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando configuración' });
        }
        
        res.json({ message: 'Configuración actualizada' });
    });
});

module.exports = router;