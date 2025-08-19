/**
 * Jest Setup File
 * Runs before each test file
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-12345';
process.env.DB_PATH = './tests/data/test_votacion.db';

// Global test utilities
global.testUtils = {
  // Common test timeouts
  timeouts: {
    short: 5000,
    medium: 15000,
    long: 30000
  },
  
  // Test data factories
  users: {
    diputado: {
      username: 'test.diputado',
      password: '123456',
      role: 'diputado',
      nombre_completo: 'Test Diputado',
      activo: 1
    },
    operador: {
      username: 'test.operador',
      password: '123456',
      role: 'operador',
      nombre_completo: 'Test Operador',
      activo: 1
    },
    secretario: {
      username: 'test.secretario',
      password: '123456',
      role: 'secretario',
      nombre_completo: 'Test Secretario',
      activo: 1
    },
    superadmin: {
      username: 'test.superadmin',
      password: '123456',
      role: 'superadmin',
      nombre_completo: 'Test SuperAdmin',
      activo: 1
    }
  },
  
  // Test session data
  session: {
    nombre: 'Sesión de Prueba',
    codigo_sesion: 'TEST-001',
    tipo_sesion: 'ordinaria',
    fecha_programada: new Date().toISOString()
  },
  
  // Test initiative data
  initiative: {
    numero: 1,
    titulo: 'Iniciativa de Prueba',
    descripcion: 'Descripción de prueba para testing',
    tipo_mayoria: 'simple',
    presentador: 'Test Presentador',
    partido_presentador: 'MORENA'
  }
};

// Console override for cleaner test output
const originalConsole = global.console;
if (process.env.NODE_ENV === 'test' && !process.env.DEBUG_TESTS) {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: originalConsole.error
  };
}

// Increase Jest timeout for database operations
jest.setTimeout(30000);

// Mock timers setup
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});