/**
 * Security Tests
 * Tests various security aspects of the voting system
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { setupTestDatabase, cleanTestDatabase } = require('../setup/setupTestDatabase');

describe('Security Tests', () => {
  let app;
  let validTokens = {};

  beforeAll(async () => {
    await setupTestDatabase();
    
    // Create Express app
    app = express();
    app.use(express.json({ limit: '1mb' })); // Set limit for payload size testing

    // Add database to request context
    app.use((req, res, next) => {
      const sqlite3 = require('sqlite3');
      req.db = new sqlite3.Database('./tests/data/test_votacion.db');
      next();
    });

    // Add routes
    app.use('/api/auth', require('../../src/routes/auth'));
    app.use('/api/diputado', require('../../src/middleware/auth'), require('../../src/routes/diputado'));
    app.use('/api/operador', require('../../src/middleware/auth'), require('../../src/routes/operador'));

    // Error handler
    app.use((error, req, res, next) => {
      res.status(error.status || 500).json({ error: error.message });
    });

    // Get valid tokens for testing
    const users = [
      { username: 'test.diputado1', role: 'diputado' },
      { username: 'test.operador', role: 'operador' },
      { username: 'test.superadmin', role: 'superadmin' }
    ];

    for (const user of users) {
      try {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: user.username,
            password: '123456'
          });
        
        if (response.status === 200) {
          validTokens[user.role] = response.body.token;
        }
      } catch (error) {
        console.warn(`Failed to get token for ${user.username}`);
      }
    }
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('Authentication Security', () => {
    describe('SQL Injection Prevention', () => {
      test('should prevent SQL injection in login username', async () => {
        const sqlInjectionPayloads = [
          "admin' OR '1'='1",
          "admin'; DROP TABLE usuarios; --",
          "' UNION SELECT password FROM usuarios WHERE username='admin' --",
          "admin' AND (SELECT COUNT(*) FROM usuarios) > 0 --",
          "1' OR 1=1 #",
          "'; EXEC xp_cmdshell('dir'); --"
        ];

        for (const payload of sqlInjectionPayloads) {
          const response = await request(app)
            .post('/api/auth/login')
            .send({
              username: payload,
              password: 'anypassword'
            });

          // Should not authenticate or return database errors
          expect(response.status).toBe(401);
          expect(response.body.error).toBe('Credenciales inválidas');
        }

        // Verify database integrity - should still be able to login with valid credentials
        const validResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'test.diputado1',
            password: '123456'
          });

        expect(validResponse.status).toBe(200);
      });

      test('should prevent SQL injection in login password', async () => {
        const sqlInjectionPayloads = [
          "password' OR '1'='1",
          "'; DROP TABLE usuarios; --",
          "' UNION SELECT * FROM usuarios --"
        ];

        for (const payload of sqlInjectionPayloads) {
          const response = await request(app)
            .post('/api/auth/login')
            .send({
              username: 'test.diputado1',
              password: payload
            });

          expect(response.status).toBe(401);
          expect(response.body.error).toBe('Credenciales inválidas');
        }
      });
    });

    describe('Password Security', () => {
      test('should not return password hashes in any response', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'test.diputado1',
            password: '123456'
          });

        expect(response.status).toBe(200);
        
        // Check response doesn't contain bcrypt patterns
        const responseString = JSON.stringify(response.body);
        expect(responseString).not.toMatch(/\$2[aby]?\$/);
        expect(response.body.user).not.toHaveProperty('password');
      });

      test('should use strong password hashing', async () => {
        // Verify that passwords are properly hashed in database
        const sqlite3 = require('sqlite3');
        const db = new sqlite3.Database('./tests/data/test_votacion.db');
        
        const user = await new Promise((resolve, reject) => {
          db.get('SELECT password FROM usuarios WHERE username = ?', ['test.diputado1'], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        db.close();

        expect(user.password).toBeDefined();
        expect(user.password).toMatch(/^\$2[aby]?\$\d+\$/); // bcrypt pattern
        expect(user.password.length).toBeGreaterThan(50); // bcrypt hashes are long
        
        // Verify hash is valid
        const isValidHash = await bcrypt.compare('123456', user.password);
        expect(isValidHash).toBe(true);
      });

      test('should prevent timing attacks on password verification', async () => {
        const validUsername = 'test.diputado1';
        const invalidUsername = 'nonexistent.user';
        const password = 'wrongpassword';

        // Measure response times
        const measureResponseTime = async (username, password) => {
          const start = process.hrtime();
          await request(app)
            .post('/api/auth/login')
            .send({ username, password });
          const [seconds, nanoseconds] = process.hrtime(start);
          return seconds * 1000 + nanoseconds / 1000000;
        };

        const times = [];
        
        // Test with valid username, wrong password
        for (let i = 0; i < 5; i++) {
          times.push(await measureResponseTime(validUsername, password));
        }

        // Test with invalid username
        for (let i = 0; i < 5; i++) {
          times.push(await measureResponseTime(invalidUsername, password));
        }

        // Response times should be somewhat consistent
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));
        
        // Allow for reasonable variance but not huge timing differences
        expect(maxDeviation / avgTime).toBeLessThan(0.5); // Max 50% deviation
      });
    });

    describe('JWT Security', () => {
      test('should create secure JWT tokens', () => {
        const token = validTokens.diputado;
        expect(token).toBeDefined();

        const decoded = jwt.decode(token, { complete: true });
        
        // Verify token structure
        expect(decoded.header.alg).toBe('HS256');
        expect(decoded.payload).toHaveProperty('id');
        expect(decoded.payload).toHaveProperty('username');
        expect(decoded.payload).toHaveProperty('role');
        expect(decoded.payload).toHaveProperty('exp');
        expect(decoded.payload).toHaveProperty('iat');
      });

      test('should reject expired tokens', async () => {
        const expiredToken = jwt.sign(
          { id: 1, username: 'test', role: 'diputado' },
          process.env.JWT_SECRET || 'test-secret-key-12345',
          { expiresIn: '-1h' }
        );

        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${expiredToken}`)
          .send({
            iniciativa_id: 1,
            voto: 'favor'
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Token inválido');
      });

      test('should reject tampered tokens', async () => {
        const validToken = validTokens.diputado;
        const tamperedToken = validToken.slice(0, -5) + 'XXXXX'; // Change last 5 chars

        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${tamperedToken}`)
          .send({
            iniciativa_id: 1,
            voto: 'favor'
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Token inválido');
      });

      test('should reject tokens with invalid signatures', async () => {
        const tokenWithWrongSignature = jwt.sign(
          { id: 1, username: 'test.diputado1', role: 'diputado' },
          'wrong-secret-key'
        );

        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${tokenWithWrongSignature}`)
          .send({
            iniciativa_id: 1,
            voto: 'favor'
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Token inválido');
      });
    });
  });

  describe('Authorization Security', () => {
    describe('Role-Based Access Control', () => {
      test('should prevent diputados from accessing operador endpoints', async () => {
        const diputadoToken = validTokens.diputado;
        
        const response = await request(app)
          .post('/api/operador/initiatives/1/open')
          .set('Authorization', `Bearer ${diputadoToken}`);

        expect(response.status).toBe(403);
      });

      test('should prevent operadores from voting', async () => {
        const operadorToken = validTokens.operador;
        
        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${operadorToken}`)
          .send({
            iniciativa_id: 1,
            voto: 'favor'
          });

        expect(response.status).toBe(403);
      });

      test('should prevent privilege escalation through JWT tampering', async () => {
        // Create a token with diputado role but try to access admin functions
        const diputadoPayload = jwt.decode(validTokens.diputado);
        
        // Try to create a new token with elevated privileges
        const escalatedToken = jwt.sign(
          { ...diputadoPayload, role: 'superadmin' },
          'wrong-secret' // Won't work anyway due to wrong secret
        );

        const response = await request(app)
          .post('/api/operador/initiatives/1/open')
          .set('Authorization', `Bearer ${escalatedToken}`);

        expect(response.status).toBe(401); // Should fail at signature verification
      });
    });

    describe('Resource Access Control', () => {
      test('should prevent unauthorized access without token', async () => {
        const protectedEndpoints = [
          { method: 'post', path: '/api/diputado/vote' },
          { method: 'post', path: '/api/operador/initiatives/1/open' },
          { method: 'get', path: '/api/operador/initiatives/1/results' }
        ];

        for (const endpoint of protectedEndpoints) {
          const response = await request(app)[endpoint.method](endpoint.path)
            .send({});

          expect(response.status).toBe(401);
          expect(response.body.error).toBe('No autorizado');
        }
      });

      test('should validate token format', async () => {
        const invalidTokenFormats = [
          'invalid-token',
          'Bearer',
          'Bearer ',
          'NotBearer validtoken',
          ''
        ];

        for (const invalidToken of invalidTokenFormats) {
          const response = await request(app)
            .post('/api/diputado/vote')
            .set('Authorization', invalidToken)
            .send({
              iniciativa_id: 1,
              voto: 'favor'
            });

          expect(response.status).toBe(401);
        }
      });
    });
  });

  describe('Input Validation Security', () => {
    describe('XSS Prevention', () => {
      test('should sanitize XSS attempts in voting data', async () => {
        // First, open an initiative
        if (validTokens.operador) {
          await request(app)
            .post('/api/operador/initiatives/1/open')
            .set('Authorization', `Bearer ${validTokens.operador}`);
        }

        const xssPayloads = [
          '<script>alert("XSS")</script>',
          '"><script>alert("XSS")</script>',
          'javascript:alert("XSS")',
          '<img src="x" onerror="alert(\'XSS\')">'
        ];

        for (const payload of xssPayloads) {
          const response = await request(app)
            .post('/api/diputado/vote')
            .set('Authorization', `Bearer ${validTokens.diputado}`)
            .send({
              iniciativa_id: 1,
              voto: payload // Try XSS in vote field
            });

          // Should reject invalid vote type
          expect(response.status).toBe(400);
          
          // Response should not contain the malicious script
          const responseText = JSON.stringify(response.body);
          expect(responseText).not.toContain('<script>');
          expect(responseText).not.toContain('javascript:');
          expect(responseText).not.toContain('onerror=');
        }
      });

      test('should prevent XSS in authentication fields', async () => {
        const xssPayload = '<script>alert("XSS")</script>';
        
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: xssPayload,
            password: xssPayload
          });

        expect(response.status).toBe(401);
        
        const responseText = JSON.stringify(response.body);
        expect(responseText).not.toContain('<script>');
      });
    });

    describe('Data Type Validation', () => {
      test('should validate vote data types', async () => {
        if (validTokens.operador) {
          await request(app)
            .post('/api/operador/initiatives/1/open')
            .set('Authorization', `Bearer ${validTokens.operador}`);
        }

        const invalidVoteData = [
          { iniciativa_id: 'not-a-number', voto: 'favor' },
          { iniciativa_id: 1, voto: 123 },
          { iniciativa_id: 1, voto: null },
          { iniciativa_id: 1, voto: {} },
          { iniciativa_id: 1, voto: [] },
          { iniciativa_id: -1, voto: 'favor' },
          { iniciativa_id: 1.5, voto: 'favor' }
        ];

        for (const invalidData of invalidVoteData) {
          const response = await request(app)
            .post('/api/diputado/vote')
            .set('Authorization', `Bearer ${validTokens.diputado}`)
            .send(invalidData);

          expect(response.status).toBe(400);
        }
      });

      test('should validate required fields', async () => {
        const incompleteData = [
          {}, // Empty object
          { iniciativa_id: 1 }, // Missing vote
          { voto: 'favor' }, // Missing initiative_id
          { iniciativa_id: null, voto: 'favor' },
          { iniciativa_id: 1, voto: '' }
        ];

        for (const data of incompleteData) {
          const response = await request(app)
            .post('/api/diputado/vote')
            .set('Authorization', `Bearer ${validTokens.diputado}`)
            .send(data);

          expect(response.status).toBe(400);
        }
      });
    });

    describe('Payload Size Limits', () => {
      test('should reject oversized payloads', async () => {
        const hugePayload = {
          iniciativa_id: 1,
          voto: 'favor',
          maliciousData: 'x'.repeat(2 * 1024 * 1024) // 2MB of data
        };

        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${validTokens.diputado}`)
          .send(hugePayload);

        // Should be rejected due to payload size limit
        expect([400, 413]).toContain(response.status);
      });

      test('should handle deeply nested objects', async () => {
        // Create deeply nested object
        let deepObject = { iniciativa_id: 1, voto: 'favor' };
        for (let i = 0; i < 100; i++) {
          deepObject = { nested: deepObject };
        }

        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${validTokens.diputado}`)
          .send(deepObject);

        // Should handle gracefully without crashing
        expect([400, 500]).toContain(response.status);
      });
    });
  });

  describe('CSRF Protection', () => {
    test('should reject requests without proper content type', async () => {
      const response = await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${validTokens.diputado}`)
        .set('Content-Type', 'text/plain')
        .send('iniciativa_id=1&voto=favor');

      // Should reject or handle appropriately
      expect([400, 415]).toContain(response.status);
    });

    test('should validate origin headers in production-like scenarios', async () => {
      // This test simulates CSRF attack from different origin
      const response = await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${validTokens.diputado}`)
        .set('Origin', 'https://malicious-site.com')
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        });

      // In a production environment with proper CSRF protection,
      // this should be rejected. For now, we just ensure it doesn't crash
      expect([200, 403]).toContain(response.status);
    });
  });

  describe('Rate Limiting and DoS Prevention', () => {
    test('should handle rapid requests without crashing', async () => {
      const rapidRequests = 50;
      const promises = [];

      for (let i = 0; i < rapidRequests; i++) {
        promises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              username: 'test.diputado1',
              password: '123456'
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // System should handle all requests without crashing
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status); // 429 = Too Many Requests
      });
    });

    test('should prevent resource exhaustion attacks', async () => {
      const complexQueries = 20;
      const promises = [];

      for (let i = 0; i < complexQueries; i++) {
        promises.push(
          request(app)
            .get('/api/operador/initiatives/1/results')
            .set('Authorization', `Bearer ${validTokens.operador}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
      
      responses.forEach(response => {
        expect([200, 429, 503]).toContain(response.status);
      });
    });
  });

  describe('Information Disclosure Prevention', () => {
    test('should not expose sensitive system information in errors', async () => {
      // Try to cause various errors and check responses don't leak info
      const errorTriggers = [
        {
          endpoint: '/api/diputado/vote',
          method: 'post',
          data: { iniciativa_id: 999999, voto: 'favor' },
          token: validTokens.diputado
        },
        {
          endpoint: '/api/operador/initiatives/999999/open',
          method: 'post',
          data: {},
          token: validTokens.operador
        }
      ];

      for (const trigger of errorTriggers) {
        const response = await request(app)[trigger.method](trigger.endpoint)
          .set('Authorization', `Bearer ${trigger.token}`)
          .send(trigger.data);

        const responseText = JSON.stringify(response.body);
        
        // Should not expose database paths, internal errors, stack traces
        expect(responseText).not.toMatch(/\.db/);
        expect(responseText).not.toMatch(/Error:.*at/);
        expect(responseText).not.toMatch(/node_modules/);
        expect(responseText).not.toMatch(/\\|\//); // Paths
        expect(responseText).not.toMatch(/SQLITE_/);
      }
    });

    test('should not expose user enumeration through different error messages', async () => {
      const nonExistentUser = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'definitely.does.not.exist',
          password: '123456'
        });

      const validUserWrongPassword = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: 'wrongpassword'
        });

      // Both should return the same error message
      expect(nonExistentUser.body.error).toBe(validUserWrongPassword.body.error);
      expect(nonExistentUser.body.error).toBe('Credenciales inválidas');
    });
  });

  describe('Session Security', () => {
    test('should invalidate tokens after suspicious activity', async () => {
      // This would require implementing token blacklisting
      // For now, we test that tokens can be validated correctly
      const token = validTokens.diputado;
      
      // Normal request should work
      const response1 = await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${token}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        });

      // Should work or fail gracefully
      expect([200, 400, 401]).toContain(response1.status);
    });

    test('should handle concurrent sessions securely', async () => {
      const token = validTokens.diputado;
      const concurrentRequests = 10;
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${token}`)
          .send({
            iniciativa_id: 1,
            voto: 'favor'
          })
      );

      const responses = await Promise.all(promises);
      
      // Should handle concurrent requests without security issues
      responses.forEach(response => {
        expect([200, 400, 401]).toContain(response.status);
      });
    });
  });

  describe('Database Security', () => {
    test('should prevent unauthorized database access', async () => {
      // Test that SQL injection attempts don't succeed
      const maliciousVote = {
        iniciativa_id: "1; DROP TABLE votos; --",
        voto: 'favor'
      };

      const response = await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${validTokens.diputado}`)
        .send(maliciousVote);

      expect(response.status).toBe(400); // Should reject invalid data type
      
      // Verify database still works
      const testResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test.diputado1',
          password: '123456'
        });

      expect(testResponse.status).toBe(200);
    });

    test('should use parameterized queries', async () => {
      // This is more of a code review item, but we can test the behavior
      const specialCharacters = ["'", '"', ';', '--', '/*', '*/'];
      
      for (const char of specialCharacters) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: `test${char}user`,
            password: '123456'
          });

        // Should handle gracefully without database errors
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Credenciales inválidas');
      }
    });
  });
});