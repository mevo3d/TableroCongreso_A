/**
 * Test Database Setup
 * Creates and initializes a clean test database
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

const TEST_DB_PATH = './tests/data/test_votacion.db';

/**
 * Setup test database with schema and test data
 */
async function setupTestDatabase() {
  // Ensure test data directory exists
  await fs.ensureDir(path.dirname(TEST_DB_PATH));
  
  // Remove existing test database
  if (await fs.pathExists(TEST_DB_PATH)) {
    await fs.remove(TEST_DB_PATH);
  }
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.serialize(async () => {
        try {
          // Create all tables
          await createTables(db);
          
          // Insert test data
          await insertTestData(db);
          
          console.log('✅ Test database initialized successfully');
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          db.close();
        }
      });
    });
  });
}

/**
 * Create all database tables
 */
function createTables(db) {
  return new Promise((resolve, reject) => {
    const queries = [
      // Users table
      `CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('superadmin', 'operador', 'secretario', 'diputado', 'servicios_legislativos')),
        nombre_completo TEXT NOT NULL,
        cargo_mesa_directiva TEXT DEFAULT '',
        cargo_coordinador TEXT DEFAULT '',
        partido TEXT DEFAULT '',
        comision TEXT DEFAULT '',
        cargo_legislativo TEXT DEFAULT '',
        foto_url TEXT DEFAULT '',
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Sessions table
      `CREATE TABLE sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_sesion TEXT UNIQUE,
        nombre TEXT NOT NULL,
        tipo_sesion TEXT DEFAULT 'ordinaria',
        activa INTEGER DEFAULT 0,
        estado TEXT DEFAULT 'preparada',
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_clausura DATETIME,
        fecha_programada DATETIME,
        iniciada_por INTEGER,
        clausurada_por INTEGER,
        ejecutar_inmediato BOOLEAN DEFAULT 0,
        notas TEXT,
        FOREIGN KEY (iniciada_por) REFERENCES usuarios(id),
        FOREIGN KEY (clausurada_por) REFERENCES usuarios(id)
      )`,
      
      // Initiatives table
      `CREATE TABLE iniciativas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER NOT NULL,
        numero INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        tipo_mayoria TEXT DEFAULT 'simple',
        presentador TEXT,
        partido_presentador TEXT,
        activa INTEGER DEFAULT 0,
        cerrada INTEGER DEFAULT 0,
        resultado TEXT,
        votos_favor INTEGER DEFAULT 0,
        votos_contra INTEGER DEFAULT 0,
        votos_abstencion INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sesion_id) REFERENCES sesiones (id)
      )`,
      
      // Votes table
      `CREATE TABLE votos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iniciativa_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        voto TEXT NOT NULL CHECK(voto IN ('favor', 'contra', 'abstencion')),
        fecha_voto DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (iniciativa_id) REFERENCES iniciativas (id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
        UNIQUE(iniciativa_id, usuario_id)
      )`,
      
      // System configuration table
      `CREATE TABLE configuracion_sistema (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        logo_congreso TEXT DEFAULT '',
        logo_secundario TEXT DEFAULT '',
        nombre_congreso TEXT DEFAULT 'Congreso del Estado - Test',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Political parties table
      `CREATE TABLE partidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE NOT NULL,
        siglas TEXT UNIQUE NOT NULL,
        color_primario TEXT DEFAULT '#666666',
        logo_url TEXT DEFAULT '',
        activo INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Attendance list table
      `CREATE TABLE pase_lista (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        realizado_por INTEGER,
        finalizado BOOLEAN DEFAULT 0,
        confirmado BOOLEAN DEFAULT 0,
        total_presentes INTEGER DEFAULT 0,
        total_ausentes INTEGER DEFAULT 0,
        hora_finalizacion DATETIME,
        hora_confirmacion DATETIME,
        visible_pantalla BOOLEAN DEFAULT 0,
        FOREIGN KEY (sesion_id) REFERENCES sesiones(id),
        FOREIGN KEY (realizado_por) REFERENCES usuarios(id)
      )`,
      
      // Session history table
      `CREATE TABLE historial_sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER,
        fecha_evento DATETIME DEFAULT CURRENT_TIMESTAMP,
        tipo_evento TEXT,
        descripcion TEXT,
        usuario_id INTEGER,
        FOREIGN KEY (sesion_id) REFERENCES sesiones(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )`,
      
      // Attendances table
      `CREATE TABLE asistencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pase_lista_id INTEGER,
        diputado_id INTEGER,
        asistencia TEXT CHECK(asistencia IN ('presente', 'ausente')),
        hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pase_lista_id) REFERENCES pase_lista(id),
        FOREIGN KEY (diputado_id) REFERENCES usuarios(id),
        UNIQUE(pase_lista_id, diputado_id)
      )`
    ];
    
    let completed = 0;
    queries.forEach((query) => {
      db.run(query, (err) => {
        if (err) {
          reject(err);
          return;
        }
        completed++;
        if (completed === queries.length) {
          resolve();
        }
      });
    });
  });
}

/**
 * Insert test data
 */
async function insertTestData(db) {
  const defaultPassword = bcrypt.hashSync('123456', 10);
  
  return new Promise((resolve, reject) => {
    // System configuration
    db.run(`INSERT INTO configuracion_sistema (id, nombre_congreso) VALUES (1, 'Congreso del Estado - Test')`);
    
    // Political parties
    const parties = [
      { nombre: 'Morena', siglas: 'MORENA', color: '#8B1B1B' },
      { nombre: 'Partido Acción Nacional', siglas: 'PAN', color: '#1B4788' },
      { nombre: 'Movimiento Ciudadano', siglas: 'MC', color: '#FF6B00' },
      { nombre: 'Partido del Trabajo', siglas: 'PT', color: '#E31E24' }
    ];
    
    parties.forEach(party => {
      db.run(`INSERT INTO partidos (nombre, siglas, color_primario) VALUES (?, ?, ?)`,
        [party.nombre, party.siglas, party.color]);
    });
    
    // Test users
    const testUsers = [
      // System users
      { username: 'test.superadmin', role: 'superadmin', nombre: 'Test SuperAdmin' },
      { username: 'test.operador', role: 'operador', nombre: 'Test Operador' },
      { username: 'test.secretario', role: 'secretario', nombre: 'Test Secretario' },
      { username: 'test.servicios', role: 'servicios_legislativos', nombre: 'Test Servicios Legislativos' },
      
      // Test deputies
      { username: 'test.diputado1', role: 'diputado', nombre: 'Test Diputado 1', partido: 'MORENA', cargo_mesa: 'presidente' },
      { username: 'test.diputado2', role: 'diputado', nombre: 'Test Diputado 2', partido: 'PAN', cargo_mesa: 'vicepresidente' },
      { username: 'test.diputado3', role: 'diputado', nombre: 'Test Diputado 3', partido: 'MC', cargo_mesa: 'secretario1' },
      { username: 'test.diputado4', role: 'diputado', nombre: 'Test Diputado 4', partido: 'PT', cargo_mesa: 'secretario2' },
      { username: 'test.diputado5', role: 'diputado', nombre: 'Test Diputado 5', partido: 'MORENA' },
      { username: 'test.diputado6', role: 'diputado', nombre: 'Test Diputado 6', partido: 'PAN' }
    ];
    
    let userInserts = 0;
    testUsers.forEach(user => {
      db.run(`INSERT INTO usuarios (username, password, role, nombre_completo, partido, cargo_mesa_directiva, activo) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.username, defaultPassword, user.role, user.nombre, user.partido || '', user.cargo_mesa || '', 1],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          userInserts++;
          if (userInserts === testUsers.length) {
            // Insert test session and initiatives
            insertTestSessionData(db, resolve, reject);
          }
        });
    });
  });
}

/**
 * Insert test session and initiative data
 */
function insertTestSessionData(db, resolve, reject) {
  // Test session
  db.run(`INSERT INTO sesiones (codigo_sesion, nombre, tipo_sesion, estado, fecha_programada)
          VALUES ('TEST-001', 'Sesión de Prueba', 'ordinaria', 'preparada', ?)`,
    [new Date().toISOString()], function(err) {
      if (err) {
        reject(err);
        return;
      }
      
      const sessionId = this.lastID;
      
      // Test initiatives
      const initiatives = [
        {
          numero: 1,
          titulo: 'Iniciativa de Prueba 1',
          descripcion: 'Primera iniciativa para testing automatizado',
          tipo_mayoria: 'simple',
          presentador: 'Test Diputado 1',
          partido_presentador: 'MORENA'
        },
        {
          numero: 2,
          titulo: 'Iniciativa de Prueba 2',
          descripcion: 'Segunda iniciativa para testing de mayoría calificada',
          tipo_mayoria: 'calificada',
          presentador: 'Test Diputado 2',
          partido_presentador: 'PAN'
        }
      ];
      
      let initiativeInserts = 0;
      initiatives.forEach(init => {
        db.run(`INSERT INTO iniciativas (sesion_id, numero, titulo, descripcion, tipo_mayoria, presentador, partido_presentador)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, init.numero, init.titulo, init.descripcion, init.tipo_mayoria, init.presentador, init.partido_presentador],
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            initiativeInserts++;
            if (initiativeInserts === initiatives.length) {
              resolve();
            }
          });
      });
    });
}

/**
 * Get test database connection
 */
function getTestDatabase() {
  return new sqlite3.Database(TEST_DB_PATH);
}

/**
 * Clean test database (for use between tests)
 */
async function cleanTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = getTestDatabase();
    
    db.serialize(() => {
      // Clear dynamic data but keep users and configuration
      db.run('DELETE FROM votos', (err) => {
        if (err) reject(err);
      });
      
      db.run('DELETE FROM asistencias', (err) => {
        if (err) reject(err);
      });
      
      db.run('DELETE FROM pase_lista', (err) => {
        if (err) reject(err);
      });
      
      db.run('DELETE FROM historial_sesiones', (err) => {
        if (err) reject(err);
      });
      
      // Reset initiatives
      db.run('UPDATE iniciativas SET activa = 0, cerrada = 0, resultado = NULL, votos_favor = 0, votos_contra = 0, votos_abstencion = 0', (err) => {
        if (err) reject(err);
      });
      
      // Reset sessions
      db.run('UPDATE sesiones SET activa = 0, estado = "preparada", fecha_clausura = NULL', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    db.close();
  });
}

module.exports = {
  setupTestDatabase,
  getTestDatabase,
  cleanTestDatabase,
  TEST_DB_PATH
};