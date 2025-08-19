/**
 * Voting API Integration Tests
 * Tests the complete voting workflow through API endpoints
 */

const request = require('supertest');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const ioClient = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { setupTestDatabase, cleanTestDatabase } = require('../../setup/setupTestDatabase');

describe('Voting API Integration Tests', () => {
  let app;
  let server;
  let io;
  let clientSocket;
  let diputadoToken;
  let operadorToken;

  beforeAll(async () => {
    await setupTestDatabase();
    
    // Create Express app with WebSocket support
    app = express();
    server = http.createServer(app);
    io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    app.use(express.json());

    // Add database and io to request context
    app.use((req, res, next) => {
      const sqlite3 = require('sqlite3');
      req.db = new sqlite3.Database('./tests/data/test_votacion.db');
      req.io = io;
      next();
    });

    // Add auth middleware
    app.use('/api/diputado', require('../../../src/middleware/auth'));
    app.use('/api/operador', require('../../../src/middleware/auth'));

    // Add routes
    app.use('/api/auth', require('../../../src/routes/auth'));
    app.use('/api/diputado', require('../../../src/routes/diputado'));
    app.use('/api/operador', require('../../../src/routes/operador'));

    // Error handler
    app.use((error, req, res, next) => {
      res.status(500).json({ error: error.message });
    });

    // Start server
    await new Promise((resolve) => {
      server.listen(0, resolve);
    });

    const port = server.address().port;

    // Setup WebSocket client
    clientSocket = ioClient(`http://localhost:${port}`);
    
    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    // Get authentication tokens
    const diputadoResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'test.diputado1',
        password: '123456'
      });
    diputadoToken = diputadoResponse.body.token;

    const operadorResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'test.operador',
        password: '123456'
      });
    operadorToken = operadorResponse.body.token;
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('Initiative Management', () => {
    it('should open initiative for voting (operador)', async () => {
      const response = await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 1,
        activa: 1,
        cerrada: 0
      });
    });

    it('should reject opening initiative without proper role', async () => {
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .expect(403);
    });

    it('should close initiative and calculate results', async () => {
      // First open the initiative
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`);

      // Cast some votes
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        });

      // Close initiative
      const response = await request(app)
        .post('/api/operador/initiatives/1/close')
        .set('Authorization', `Bearer ${operadorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        initiative: expect.objectContaining({
          id: 1,
          activa: 0,
          cerrada: 1,
          resultado: expect.any(String)
        }),
        results: expect.objectContaining({
          counts: expect.objectContaining({
            favor: expect.any(Number),
            contra: expect.any(Number),
            abstencion: expect.any(Number),
            total: expect.any(Number)
          })
        })
      });
    });
  });

  describe('Voting Process', () => {
    beforeEach(async () => {
      // Open initiative for voting
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`);
    });

    it('should allow diputado to cast vote', async () => {
      const voteData = {
        iniciativa_id: 1,
        voto: 'favor'
      };

      const response = await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        vote: expect.objectContaining({
          voto: 'favor',
          iniciativa_id: 1
        }),
        results: expect.objectContaining({
          counts: expect.objectContaining({
            favor: 1,
            total: 1
          })
        })
      });
    });

    it('should allow diputado to change vote', async () => {
      // First vote
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        });

      // Change vote
      const response = await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'contra'
        })
        .expect(200);

      expect(response.body.vote.voto).toBe('contra');
      expect(response.body.results.counts.favor).toBe(0);
      expect(response.body.results.counts.contra).toBe(1);
    });

    it('should reject vote from non-diputado user', async () => {
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${operadorToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        })
        .expect(403);
    });

    it('should reject vote on inactive initiative', async () => {
      // Close the initiative first
      await request(app)
        .post('/api/operador/initiatives/1/close')
        .set('Authorization', `Bearer ${operadorToken}`);

      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        })
        .expect(400);
    });

    it('should validate vote type', async () => {
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'invalid_vote'
        })
        .expect(400);
    });

    it('should handle all valid vote types', async () => {
      const validVotes = ['favor', 'contra', 'abstencion'];
      
      for (const voteType of validVotes) {
        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${diputadoToken}`)
          .send({
            iniciativa_id: 1,
            voto: voteType
          })
          .expect(200);

        expect(response.body.vote.voto).toBe(voteType);
      }
    });
  });

  describe('Vote Results and Statistics', () => {
    beforeEach(async () => {
      // Setup votes for testing
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`);

      // Get multiple diputado tokens
      const diputadoUsernames = ['test.diputado1', 'test.diputado2', 'test.diputado3'];
      const diputadoTokens = [];

      for (const username of diputadoUsernames) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ username, password: '123456' });
        diputadoTokens.push(response.body.token);
      }

      // Cast different votes
      const votes = ['favor', 'favor', 'contra'];
      for (let i = 0; i < diputadoTokens.length; i++) {
        await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${diputadoTokens[i]}`)
          .send({
            iniciativa_id: 1,
            voto: votes[i]
          });
      }
    });

    it('should get accurate voting results', async () => {
      const response = await request(app)
        .get('/api/operador/initiatives/1/results')
        .set('Authorization', `Bearer ${operadorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        counts: {
          favor: 2,
          contra: 1,
          abstencion: 0,
          total: 3
        },
        participation_rate: expect.any(Number),
        total_eligible: expect.any(Number),
        votes: expect.arrayContaining([
          expect.objectContaining({
            voto: expect.stringMatching(/^(favor|contra|abstencion)$/),
            nombre_completo: expect.any(String)
          })
        ])
      });
    });

    it('should get list of non-voters', async () => {
      const response = await request(app)
        .get('/api/operador/initiatives/1/non-voters')
        .set('Authorization', `Bearer ${operadorToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      response.body.forEach(diputado => {
        expect(diputado).toMatchObject({
          id: expect.any(Number),
          nombre_completo: expect.any(String),
          partido: expect.any(String)
        });
      });
    });
  });

  describe('WebSocket Real-time Updates', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`);
    });

    it('should emit vote-update event when vote is cast', (done) => {
      clientSocket.once('vote-update', (data) => {
        expect(data).toMatchObject({
          iniciativa_id: 1,
          results: expect.objectContaining({
            counts: expect.objectContaining({
              favor: 1,
              total: 1
            })
          }),
          vote: expect.objectContaining({
            voto: 'favor'
          }),
          timestamp: expect.any(String)
        });
        done();
      });

      // Cast vote to trigger event
      request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        })
        .end(() => {
          // Vote request completed
        });
    });

    it('should emit initiative-opened event', (done) => {
      clientSocket.once('initiative-opened', (data) => {
        expect(data).toMatchObject({
          initiative: expect.objectContaining({
            id: 2,
            activa: 1
          }),
          timestamp: expect.any(String)
        });
        done();
      });

      // Open second initiative
      request(app)
        .post('/api/operador/initiatives/2/open')
        .set('Authorization', `Bearer ${operadorToken}`)
        .end(() => {
          // Request completed
        });
    });

    it('should emit initiative-closed event', (done) => {
      clientSocket.once('initiative-closed', (data) => {
        expect(data).toMatchObject({
          initiative: expect.objectContaining({
            id: 1,
            activa: 0,
            cerrada: 1
          }),
          results: expect.any(Object),
          final_result: expect.any(String),
          timestamp: expect.any(String)
        });
        done();
      });

      // Close initiative
      request(app)
        .post('/api/operador/initiatives/1/close')
        .set('Authorization', `Bearer ${operadorToken}`)
        .end(() => {
          // Request completed
        });
    });
  });

  describe('Majority Type Calculations', () => {
    it('should handle simple majority correctly', async () => {
      // Open initiative with simple majority
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`);

      // Get multiple tokens for voting
      const diputadoUsernames = ['test.diputado1', 'test.diputado2', 'test.diputado3'];
      const diputadoTokens = [];

      for (const username of diputadoUsernames) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ username, password: '123456' });
        diputadoTokens.push(response.body.token);
      }

      // Vote: 2 favor, 1 contra (simple majority achieved)
      const votes = ['favor', 'favor', 'contra'];
      for (let i = 0; i < votes.length; i++) {
        await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${diputadoTokens[i]}`)
          .send({
            iniciativa_id: 1,
            voto: votes[i]
          });
      }

      // Close and check result
      const response = await request(app)
        .post('/api/operador/initiatives/1/close')
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(response.body.final_result).toBe('aprobada');
    });

    it('should handle qualified majority correctly', async () => {
      // Open initiative with qualified majority (initiative 2)
      await request(app)
        .post('/api/operador/initiatives/2/open')
        .set('Authorization', `Bearer ${operadorToken}`);

      // Get multiple tokens for voting
      const diputadoUsernames = ['test.diputado1', 'test.diputado2', 'test.diputado3', 'test.diputado4'];
      const diputadoTokens = [];

      for (const username of diputadoUsernames) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ username, password: '123456' });
        diputadoTokens.push(response.body.token);
      }

      // Vote: 3 favor, 1 contra (not enough for 2/3 qualified majority)
      const votes = ['favor', 'favor', 'favor', 'contra'];
      for (let i = 0; i < votes.length; i++) {
        await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${diputadoTokens[i]}`)
          .send({
            iniciativa_id: 2,
            voto: votes[i]
          });
      }

      // Close and check result
      const response = await request(app)
        .post('/api/operador/initiatives/2/close')
        .set('Authorization', `Bearer ${operadorToken}`);

      // Should depend on total eligible voters for qualified majority
      expect(['aprobada', 'empate']).toContain(response.body.final_result);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid initiative ID', async () => {
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          iniciativa_id: 99999,
          voto: 'favor'
        })
        .expect(400);
    });

    it('should handle malformed request body', async () => {
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${diputadoToken}`)
        .send({
          invalid_field: 'test'
        })
        .expect(400);
    });

    it('should handle missing authorization header', async () => {
      await request(app)
        .post('/api/diputado/vote')
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        })
        .expect(401);
    });

    it('should handle invalid JWT token', async () => {
      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        })
        .expect(401);
    });

    it('should handle expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { id: 1, username: 'test', role: 'diputado' },
        process.env.JWT_SECRET || 'test-secret-key-12345',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      await request(app)
        .post('/api/diputado/vote')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          iniciativa_id: 1,
          voto: 'favor'
        })
        .expect(401);
    });
  });

  describe('Concurrent Voting Scenarios', () => {
    it('should handle multiple simultaneous votes correctly', async () => {
      await request(app)
        .post('/api/operador/initiatives/1/open')
        .set('Authorization', `Bearer ${operadorToken}`);

      // Get multiple diputado tokens
      const diputadoUsernames = ['test.diputado1', 'test.diputado2', 'test.diputado3'];
      const diputadoTokens = [];

      for (const username of diputadoUsernames) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ username, password: '123456' });
        diputadoTokens.push(response.body.token);
      }

      // Cast votes simultaneously
      const votePromises = diputadoTokens.map((token, index) =>
        request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${token}`)
          .send({
            iniciativa_id: 1,
            voto: index % 2 === 0 ? 'favor' : 'contra'
          })
      );

      const responses = await Promise.all(votePromises);
      
      // All votes should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify final results
      const resultsResponse = await request(app)
        .get('/api/operador/initiatives/1/results')
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(resultsResponse.body.counts.total).toBe(3);
    });
  });
});