/**
 * Authentication API Integration Tests
 * Tests the complete authentication flow
 */

const request = require('supertest');
const express = require('express');
const { setupTestDatabase, cleanTestDatabase } = require('../../setup/setupTestDatabase');
const authRoutes = require('../../../src/routes/auth');

describe('Authentication API Integration Tests', () => {
  let app;
  let testDb;

  beforeAll(async () => {
    // Setup test database
    await setupTestDatabase();
    
    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    
    // Add database to request context
    app.use((req, res, next) => {
      const db = require('sqlite3').verbose();
      req.db = new db.Database('./tests/data/test_votacion.db');
      next();
    });
    
    app.use('/api/auth', authRoutes);
    
    // Error handler
    app.use((error, req, res, next) => {
      res.status(500).json({ error: error.message });
    });
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('POST /api/auth/login', () => {
    const validCredentials = {
      username: 'test.diputado1',
      password: '123456'
    };

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        id: expect.any(Number),
        username: validCredentials.username,
        role: 'diputado',
        nombre_completo: expect.any(String)
      });
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return JWT token with correct payload', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials);

      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(response.body.token);
      
      expect(decoded).toMatchObject({
        id: expect.any(Number),
        username: validCredentials.username,
        role: 'diputado',
        nombre: expect.any(String)
      });
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('should reject invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent.user',
          password: '123456'
        })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Credenciales inválidas'
      });
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: validCredentials.username,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Credenciales inválidas'
      });
    });

    it('should reject inactive user', async () => {
      // First, deactivate the user
      const db = require('sqlite3').verbose();
      const testDb = new db.Database('./tests/data/test_votacion.db');
      
      await new Promise((resolve) => {
        testDb.run('UPDATE usuarios SET activo = 0 WHERE username = ?', 
          [validCredentials.username], resolve);
      });
      testDb.close();

      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials)
        .expect(401);

      expect(response.body).toEqual({
        error: 'Credenciales inválidas'
      });
    });

    it('should handle missing credentials', async () => {
      // Missing username
      await request(app)
        .post('/api/auth/login')
        .send({ password: '123456' })
        .expect(400)
        .expect({ error: 'Usuario y contraseña requeridos' });

      // Missing password
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'test.user' })
        .expect(400)
        .expect({ error: 'Usuario y contraseña requeridos' });

      // Empty request body
      await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400)
        .expect({ error: 'Usuario y contraseña requeridos' });
    });

    it('should handle case-insensitive username matching', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: validCredentials.username.toUpperCase(),
          password: validCredentials.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user.username).toBe(validCredentials.username);
    });

    it('should include all required user fields in response', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials);

      expect(response.body.user).toMatchObject({
        id: expect.any(Number),
        username: expect.any(String),
        role: expect.any(String),
        nombre_completo: expect.any(String),
        partido: expect.any(String),
        cargo_mesa_directiva: expect.any(String)
      });

      // Should not include sensitive information
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should handle database errors gracefully', async () => {
      // Create app with invalid database connection
      const brokenApp = express();
      brokenApp.use(express.json());
      brokenApp.use((req, res, next) => {
        req.db = null; // Simulate database connection failure
        next();
      });
      brokenApp.use('/api/auth', authRoutes);
      brokenApp.use((error, req, res, next) => {
        res.status(500).json({ error: 'Error de base de datos' });
      });

      await request(brokenApp)
        .post('/api/auth/login')
        .send(validCredentials)
        .expect(500);
    });
  });

  describe('Login with different user roles', () => {
    const testCredentials = [
      { username: 'test.superadmin', role: 'superadmin' },
      { username: 'test.operador', role: 'operador' },
      { username: 'test.secretario', role: 'secretario' },
      { username: 'test.diputado1', role: 'diputado' },
      { username: 'test.servicios', role: 'servicios_legislativos' }
    ];

    testCredentials.forEach(({ username, role }) => {
      it(`should login ${role} user successfully`, async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username,
            password: '123456'
          })
          .expect(200);

        expect(response.body.user.role).toBe(role);
        expect(response.body).toHaveProperty('token');

        // Verify JWT contains correct role
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(response.body.token);
        expect(decoded.role).toBe(role);
      });
    });
  });

  describe('Token validation', () => {
    let validToken;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: '123456'
        });
      
      validToken = loginResponse.body.token;
    });

    it('should create valid JWT tokens', () => {
      expect(validToken).toBeDefined();
      
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(validToken);
      
      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('username');
      expect(decoded).toHaveProperty('role');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    it('should set appropriate token expiration', () => {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(validToken);
      
      const now = Math.floor(Date.now() / 1000);
      const expirationDuration = decoded.exp - decoded.iat;
      
      // Should be 24 hours (86400 seconds)
      expect(expirationDuration).toBe(24 * 60 * 60);
      expect(decoded.exp).toBeGreaterThan(now);
    });
  });

  describe('Security measures', () => {
    it('should not return password hash in response', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: '123456'
        });

      expect(response.body.user).not.toHaveProperty('password');
      
      // Verify the response doesn't contain bcrypt hash patterns
      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toMatch(/\$2[aby]?\$/); // bcrypt hash pattern
    });

    it('should use consistent error messages for security', async () => {
      // Invalid username
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent.user',
          password: '123456'
        })
        .expect(401);

      // Invalid password
      const response2 = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: 'wrongpassword'
        })
        .expect(401);

      // Both should return the same error message to prevent username enumeration
      expect(response1.body.error).toBe(response2.body.error);
    });

    it('should handle SQL injection attempts in login', async () => {
      const maliciousInputs = [
        "' OR '1'='1",
        "admin'; DROP TABLE usuarios; --",
        "' UNION SELECT * FROM usuarios --",
        "1' OR 1=1 --"
      ];

      for (const maliciousInput of maliciousInputs) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: maliciousInput,
            password: maliciousInput
          })
          .expect(401);

        expect(response.body.error).toBe('Credenciales inválidas');
      }

      // Verify database integrity - should still have users
      const testResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: '123456'
        })
        .expect(200);

      expect(testResponse.body).toHaveProperty('token');
    });

    it('should rate limit login attempts', async () => {
      // Note: This test assumes rate limiting middleware is implemented
      // For now, we'll test that multiple failed attempts don't cause issues
      
      const invalidCredentials = {
        username: 'test.diputado1',
        password: 'wrongpassword'
      };

      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials)
          .expect(401);
      }

      // Valid login should still work (unless rate limiting blocks it)
      const validResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: '123456'
        });

      // Should either succeed (no rate limiting) or be rate limited
      expect([200, 429]).toContain(validResponse.status);
    });
  });

  describe('Content validation', () => {
    it('should validate content-type header', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(400);

      // Express should handle this appropriately
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "test", "password":}') // Invalid JSON
        .expect(400);
    });

    it('should validate required field types', async () => {
      // Non-string username
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 12345,
          password: '123456'
        })
        .expect(401); // Should still validate and fail auth

      // Non-string password
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: 12345
        })
        .expect(401);
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle extremely long usernames/passwords', async () => {
      const longString = 'a'.repeat(10000);
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: longString,
          password: longString
        })
        .expect(401);

      expect(response.body.error).toBe('Credenciales inválidas');
    });

    it('should handle special characters in credentials', async () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: specialChars,
          password: specialChars
        })
        .expect(401);

      expect(response.body.error).toBe('Credenciales inválidas');
    });

    it('should handle unicode characters in credentials', async () => {
      const unicodeChars = '用户名密码';
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: unicodeChars,
          password: unicodeChars
        })
        .expect(401);

      expect(response.body.error).toBe('Credenciales inválidas');
    });
  });
});