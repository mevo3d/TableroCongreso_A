/**
 * BaseRepository Unit Tests
 * Tests the base repository abstraction layer
 */

const BaseRepository = require('../../../src/repositories/BaseRepository');
const { getTestDatabase, cleanTestDatabase } = require('../../setup/setupTestDatabase');

describe('BaseRepository', () => {
  let baseRepo;
  let db;

  beforeEach(async () => {
    db = getTestDatabase();
    baseRepo = new BaseRepository(db, 'usuarios'); // Use users table for testing
    await cleanTestDatabase();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('constructor', () => {
    it('should initialize with database and table name', () => {
      // Assert
      expect(baseRepo.db).toBe(db);
      expect(baseRepo.tableName).toBe('usuarios');
    });

    it('should require both database and table name', () => {
      // Act & Assert
      expect(() => new BaseRepository(null, 'table')).toThrow();
      expect(() => new BaseRepository(db, null)).toThrow();
      expect(() => new BaseRepository(db, '')).toThrow();
    });
  });

  describe('query method', () => {
    it('should execute SELECT queries and return results', async () => {
      // Act
      const result = await baseRepo.query('SELECT * FROM usuarios WHERE role = ?', ['superadmin'], 'all');

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('username');
      expect(result[0]).toHaveProperty('role');
    });

    it('should execute single row SELECT queries', async () => {
      // Act
      const result = await baseRepo.query('SELECT * FROM usuarios WHERE username = ?', ['test.superadmin'], 'get');

      // Assert
      expect(result).toBeDefined();
      expect(result.username).toBe('test.superadmin');
      expect(result.role).toBe('superadmin');
    });

    it('should execute INSERT queries', async () => {
      // Arrange
      const testUser = {
        username: 'test.new.user',
        password: 'hashed_password',
        role: 'diputado',
        nombre_completo: 'Test New User',
        activo: 1
      };

      // Act
      const result = await baseRepo.query(
        'INSERT INTO usuarios (username, password, role, nombre_completo, activo) VALUES (?, ?, ?, ?, ?)',
        [testUser.username, testUser.password, testUser.role, testUser.nombre_completo, testUser.activo],
        'run'
      );

      // Assert
      expect(result).toHaveProperty('lastID');
      expect(result.lastID).toBeGreaterThan(0);
      expect(result.changes).toBe(1);

      // Verify insertion
      const insertedUser = await baseRepo.query('SELECT * FROM usuarios WHERE id = ?', [result.lastID], 'get');
      expect(insertedUser.username).toBe(testUser.username);
    });

    it('should execute UPDATE queries', async () => {
      // Arrange - Get an existing user
      const existingUser = await baseRepo.query('SELECT * FROM usuarios WHERE username = ?', ['test.diputado1'], 'get');
      
      // Act
      const result = await baseRepo.query(
        'UPDATE usuarios SET nombre_completo = ? WHERE id = ?',
        ['Updated Name', existingUser.id],
        'run'
      );

      // Assert
      expect(result.changes).toBe(1);

      // Verify update
      const updatedUser = await baseRepo.query('SELECT * FROM usuarios WHERE id = ?', [existingUser.id], 'get');
      expect(updatedUser.nombre_completo).toBe('Updated Name');
    });

    it('should execute DELETE queries', async () => {
      // Arrange - Create a user to delete
      const insertResult = await baseRepo.query(
        'INSERT INTO usuarios (username, password, role, nombre_completo) VALUES (?, ?, ?, ?)',
        ['to.delete', 'password', 'diputado', 'To Delete'],
        'run'
      );

      // Act
      const deleteResult = await baseRepo.query(
        'DELETE FROM usuarios WHERE id = ?',
        [insertResult.lastID],
        'run'
      );

      // Assert
      expect(deleteResult.changes).toBe(1);

      // Verify deletion
      const deletedUser = await baseRepo.query('SELECT * FROM usuarios WHERE id = ?', [insertResult.lastID], 'get');
      expect(deletedUser).toBeUndefined();
    });

    it('should handle query errors gracefully', async () => {
      // Act & Assert
      await expect(baseRepo.query('INVALID SQL SYNTAX', [], 'get'))
        .rejects.toThrow();
    });

    it('should handle different query types correctly', async () => {
      // Test 'all' type
      const allResult = await baseRepo.query('SELECT * FROM usuarios LIMIT 2', [], 'all');
      expect(Array.isArray(allResult)).toBe(true);

      // Test 'get' type
      const getResult = await baseRepo.query('SELECT * FROM usuarios LIMIT 1', [], 'get');
      expect(typeof getResult).toBe('object');
      expect(Array.isArray(getResult)).toBe(false);

      // Test 'run' type
      const runResult = await baseRepo.query('UPDATE usuarios SET activo = activo WHERE id = 1', [], 'run');
      expect(runResult).toHaveProperty('changes');
    });
  });

  describe('findById', () => {
    it('should find record by ID', async () => {
      // Arrange - Get the first user
      const firstUser = await baseRepo.query('SELECT * FROM usuarios LIMIT 1', [], 'get');

      // Act
      const result = await baseRepo.findById(firstUser.id);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(firstUser.id);
      expect(result.username).toBe(firstUser.username);
    });

    it('should return undefined for non-existent ID', async () => {
      // Act
      const result = await baseRepo.findById(99999);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle invalid ID types', async () => {
      // Act & Assert
      await expect(baseRepo.findById(null)).rejects.toThrow();
      await expect(baseRepo.findById('invalid')).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all records', async () => {
      // Act
      const result = await baseRepo.findAll();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(record => {
        expect(record).toHaveProperty('id');
      });
    });

    it('should apply WHERE conditions', async () => {
      // Act
      const result = await baseRepo.findAll('WHERE role = ?', ['diputado']);

      // Assert
      expect(Array.isArray(result)).toBe(true);
      result.forEach(record => {
        expect(record.role).toBe('diputado');
      });
    });

    it('should apply LIMIT', async () => {
      // Act
      const result = await baseRepo.findAll('LIMIT 2');

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should handle complex conditions', async () => {
      // Act
      const result = await baseRepo.findAll(
        'WHERE role = ? AND activo = ? ORDER BY nombre_completo LIMIT 3',
        ['diputado', 1]
      );

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(3);
      result.forEach(record => {
        expect(record.role).toBe('diputado');
        expect(record.activo).toBe(1);
      });
    });
  });

  describe('create', () => {
    it('should create new record with data object', async () => {
      // Arrange
      const newUserData = {
        username: 'test.created.user',
        password: 'hashed_password',
        role: 'diputado',
        nombre_completo: 'Test Created User',
        partido: 'TEST',
        activo: 1
      };

      // Act
      const result = await baseRepo.create(newUserData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.username).toBe(newUserData.username);
      expect(result.role).toBe(newUserData.role);
    });

    it('should handle required fields validation', async () => {
      // Arrange - Missing required fields
      const invalidData = {
        username: 'test.invalid'
        // Missing password, role, nombre_completo
      };

      // Act & Assert
      await expect(baseRepo.create(invalidData)).rejects.toThrow();
    });

    it('should handle unique constraint violations', async () => {
      // Arrange - Create a user first
      const userData = {
        username: 'test.unique',
        password: 'password',
        role: 'diputado',
        nombre_completo: 'Test Unique'
      };
      
      await baseRepo.create(userData);

      // Act & Assert - Try to create duplicate username
      await expect(baseRepo.create(userData)).rejects.toThrow();
    });
  });

  describe('update', () => {
    let testUserId;

    beforeEach(async () => {
      // Create a test user for updating
      const testUser = await baseRepo.create({
        username: 'test.for.update',
        password: 'password',
        role: 'diputado',
        nombre_completo: 'Test For Update'
      });
      testUserId = testUser.id;
    });

    it('should update record by ID', async () => {
      // Arrange
      const updateData = {
        nombre_completo: 'Updated Name',
        partido: 'UPDATED_PARTY'
      };

      // Act
      const result = await baseRepo.update(testUserId, updateData);

      // Assert
      expect(result.changes).toBe(1);

      // Verify update
      const updatedUser = await baseRepo.findById(testUserId);
      expect(updatedUser.nombre_completo).toBe(updateData.nombre_completo);
      expect(updatedUser.partido).toBe(updateData.partido);
    });

    it('should handle non-existent ID', async () => {
      // Act
      const result = await baseRepo.update(99999, { nombre_completo: 'Does Not Exist' });

      // Assert
      expect(result.changes).toBe(0);
    });

    it('should handle empty update data', async () => {
      // Act & Assert
      await expect(baseRepo.update(testUserId, {})).rejects.toThrow();
    });

    it('should not update primary key or readonly fields', async () => {
      // Act
      const result = await baseRepo.update(testUserId, { 
        id: 99999, // Should not update ID
        created_at: '2020-01-01T00:00:00.000Z', // Should not update timestamp
        nombre_completo: 'Updated Name'
      });

      // Assert
      const updatedUser = await baseRepo.findById(testUserId);
      expect(updatedUser.id).toBe(testUserId); // ID unchanged
      expect(updatedUser.nombre_completo).toBe('Updated Name'); // Other field updated
    });
  });

  describe('delete', () => {
    let testUserId;

    beforeEach(async () => {
      // Create a test user for deletion
      const testUser = await baseRepo.create({
        username: 'test.for.delete',
        password: 'password',
        role: 'diputado',
        nombre_completo: 'Test For Delete'
      });
      testUserId = testUser.id;
    });

    it('should delete record by ID', async () => {
      // Act
      const result = await baseRepo.delete(testUserId);

      // Assert
      expect(result.changes).toBe(1);

      // Verify deletion
      const deletedUser = await baseRepo.findById(testUserId);
      expect(deletedUser).toBeUndefined();
    });

    it('should handle non-existent ID', async () => {
      // Act
      const result = await baseRepo.delete(99999);

      // Assert
      expect(result.changes).toBe(0);
    });

    it('should handle cascade deletions', async () => {
      // This would test foreign key cascade behavior
      // Implementation depends on database setup and foreign key constraints
    });
  });

  describe('count', () => {
    it('should count all records', async () => {
      // Act
      const count = await baseRepo.count();

      // Assert
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should count with conditions', async () => {
      // Act
      const diputadoCount = await baseRepo.count('WHERE role = ?', ['diputado']);

      // Assert
      expect(typeof diputadoCount).toBe('number');
      expect(diputadoCount).toBeGreaterThan(0);
    });

    it('should return 0 for no matches', async () => {
      // Act
      const count = await baseRepo.count('WHERE role = ?', ['non_existent_role']);

      // Assert
      expect(count).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true for existing record', async () => {
      // Arrange
      const existingUser = await baseRepo.query('SELECT * FROM usuarios LIMIT 1', [], 'get');

      // Act
      const exists = await baseRepo.exists(existingUser.id);

      // Assert
      expect(exists).toBe(true);
    });

    it('should return false for non-existent record', async () => {
      // Act
      const exists = await baseRepo.exists(99999);

      // Assert
      expect(exists).toBe(false);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle database connection errors', async () => {
      // Arrange - Create repo with invalid database
      const invalidRepo = new BaseRepository(null, 'test_table');

      // Act & Assert
      await expect(invalidRepo.findAll()).rejects.toThrow();
    });

    it('should validate required constructor parameters', () => {
      // Act & Assert
      expect(() => new BaseRepository()).toThrow();
      expect(() => new BaseRepository(db)).toThrow();
      expect(() => new BaseRepository(null, 'table')).toThrow();
    });

    it('should handle SQL injection attempts safely', async () => {
      // Arrange - Malicious input
      const maliciousInput = "'; DROP TABLE usuarios; --";

      // Act & Assert - Should not execute the malicious SQL
      const result = await baseRepo.query('SELECT * FROM usuarios WHERE username = ?', [maliciousInput], 'get');
      expect(result).toBeUndefined(); // Should not find anything, but table should still exist

      // Verify table still exists
      const tableExists = await baseRepo.count();
      expect(tableExists).toBeGreaterThan(0);
    });
  });

  describe('Transaction support', () => {
    it('should handle basic transaction-like operations', async () => {
      // This is a conceptual test - actual transaction support would need
      // to be implemented in the BaseRepository or a transaction wrapper

      // Arrange
      const userData1 = {
        username: 'test.transaction.1',
        password: 'password',
        role: 'diputado',
        nombre_completo: 'Test Transaction 1'
      };

      const userData2 = {
        username: 'test.transaction.2',
        password: 'password',
        role: 'diputado',
        nombre_completo: 'Test Transaction 2'
      };

      // Act - Simulate transaction-like behavior
      try {
        const user1 = await baseRepo.create(userData1);
        const user2 = await baseRepo.create(userData2);

        expect(user1.id).toBeDefined();
        expect(user2.id).toBeDefined();
      } catch (error) {
        // In a real transaction, we would rollback here
        throw error;
      }
    });
  });
});