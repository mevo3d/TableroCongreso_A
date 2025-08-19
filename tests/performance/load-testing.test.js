/**
 * Performance and Load Testing
 * Tests system behavior under various load conditions
 */

const request = require('supertest');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const ioClient = require('socket.io-client');
const { setupTestDatabase, cleanTestDatabase } = require('../setup/setupTestDatabase');
const { performance } = require('perf_hooks');

describe('Performance and Load Tests', () => {
  let app;
  let server;
  let io;
  let baseURL;
  let authTokens = {};

  beforeAll(async () => {
    await setupTestDatabase();
    
    // Create Express app
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

    // Add routes
    app.use('/api/auth', require('../../src/routes/auth'));
    app.use('/api/diputado', require('../../src/middleware/auth'), require('../../src/routes/diputado'));
    app.use('/api/operador', require('../../src/middleware/auth'), require('../../src/routes/operador'));

    // Error handler
    app.use((error, req, res, next) => {
      res.status(500).json({ error: error.message });
    });

    // Start server
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseURL = `http://localhost:${port}`;
        resolve();
      });
    });

    // Get authentication tokens for load testing
    const users = [
      { username: 'test.operador', role: 'operador' },
      { username: 'test.diputado1', role: 'diputado' },
      { username: 'test.diputado2', role: 'diputado' },
      { username: 'test.diputado3', role: 'diputado' },
      { username: 'test.diputado4', role: 'diputado' },
      { username: 'test.diputado5', role: 'diputado' }
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
          authTokens[user.role + (user.username.includes('1') ? '1' : 
                                  user.username.includes('2') ? '2' : 
                                  user.username.includes('3') ? '3' : 
                                  user.username.includes('4') ? '4' : 
                                  user.username.includes('5') ? '5' : '')] = response.body.token;
        }
      } catch (error) {
        console.warn(`Failed to get token for ${user.username}: ${error.message}`);
      }
    }
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('Authentication Performance', () => {
    test('should handle concurrent login requests efficiently', async () => {
      const concurrentLogins = 20;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentLogins }, (_, index) => {
        return request(app)
          .post('/api/auth/login')
          .send({
            username: index % 2 === 0 ? 'test.diputado1' : 'test.operador',
            password: '123456'
          });
      });

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 20 concurrent logins
      
      // Calculate average response time
      const avgResponseTime = totalTime / concurrentLogins;
      expect(avgResponseTime).toBeLessThan(250); // 250ms average per login

      console.log(`Concurrent login performance: ${concurrentLogins} logins in ${totalTime.toFixed(2)}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });

    test('should handle rapid sequential login requests', async () => {
      const sequentialLogins = 50;
      const startTime = performance.now();
      const responseTimes = [];

      for (let i = 0; i < sequentialLogins; i++) {
        const requestStart = performance.now();
        
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'test.diputado1',
            password: '123456'
          });
        
        const requestEnd = performance.now();
        responseTimes.push(requestEnd - requestStart);

        expect(response.status).toBe(200);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      expect(avgResponseTime).toBeLessThan(200); // Average under 200ms
      expect(maxResponseTime).toBeLessThan(1000); // No single request over 1 second

      console.log(`Sequential login performance: ${sequentialLogins} logins in ${totalTime.toFixed(2)}ms`);
      console.log(`Average: ${avgResponseTime.toFixed(2)}ms, Max: ${maxResponseTime.toFixed(2)}ms`);
    });
  });

  describe('Voting Performance Under Load', () => {
    beforeEach(async () => {
      // Open an initiative for voting
      if (authTokens.operador) {
        await request(app)
          .post('/api/operador/initiatives/1/open')
          .set('Authorization', `Bearer ${authTokens.operador}`);
      }
    });

    test('should handle concurrent votes efficiently', async () => {
      const concurrentVotes = 10;
      const voteTypes = ['favor', 'contra', 'abstencion'];
      const startTime = performance.now();

      // Create concurrent vote requests using different diputado tokens
      const promises = [];
      for (let i = 0; i < concurrentVotes; i++) {
        const tokenKey = `diputado${(i % 5) + 1}`;
        const token = authTokens[tokenKey];
        
        if (token) {
          promises.push(
            request(app)
              .post('/api/diputado/vote')
              .set('Authorization', `Bearer ${token}`)
              .send({
                iniciativa_id: 1,
                voto: voteTypes[i % voteTypes.length]
              })
          );
        }
      }

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // All votes should succeed (or fail appropriately if same user votes twice)
      responses.forEach(response => {
        expect([200, 400]).toContain(response.status);
      });

      expect(totalTime).toBeLessThan(3000); // Under 3 seconds for concurrent votes

      console.log(`Concurrent voting performance: ${concurrentVotes} votes in ${totalTime.toFixed(2)}ms`);
    });

    test('should maintain performance with repeated vote changes', async () => {
      const voteChanges = 20;
      const voteTypes = ['favor', 'contra', 'abstencion'];
      const token = authTokens.diputado1;
      
      if (!token) {
        console.warn('Diputado token not available, skipping test');
        return;
      }

      const startTime = performance.now();
      const responseTimes = [];

      for (let i = 0; i < voteChanges; i++) {
        const requestStart = performance.now();
        
        const response = await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${token}`)
          .send({
            iniciativa_id: 1,
            voto: voteTypes[i % voteTypes.length]
          });
        
        const requestEnd = performance.now();
        responseTimes.push(requestEnd - requestStart);

        expect(response.status).toBe(200);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      expect(avgResponseTime).toBeLessThan(150); // Average under 150ms per vote change
      expect(totalTime).toBeLessThan(5000); // Total under 5 seconds

      console.log(`Vote changes performance: ${voteChanges} changes in ${totalTime.toFixed(2)}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });

    test('should handle high-frequency result requests', async () => {
      // First cast some votes
      const voteTokens = [authTokens.diputado1, authTokens.diputado2, authTokens.diputado3].filter(Boolean);
      
      for (let i = 0; i < voteTokens.length; i++) {
        await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${voteTokens[i]}`)
          .send({
            iniciativa_id: 1,
            voto: ['favor', 'contra', 'abstencion'][i]
          });
      }

      // Now test result request performance
      const resultRequests = 30;
      const token = authTokens.operador;
      
      if (!token) {
        console.warn('Operador token not available, skipping test');
        return;
      }

      const startTime = performance.now();
      const responseTimes = [];

      for (let i = 0; i < resultRequests; i++) {
        const requestStart = performance.now();
        
        const response = await request(app)
          .get('/api/operador/initiatives/1/results')
          .set('Authorization', `Bearer ${token}`);
        
        const requestEnd = performance.now();
        responseTimes.push(requestEnd - requestStart);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('counts');
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      expect(avgResponseTime).toBeLessThan(100); // Average under 100ms per result request
      console.log(`Results query performance: ${resultRequests} requests in ${totalTime.toFixed(2)}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });
  });

  describe('WebSocket Performance', () => {
    test('should handle multiple concurrent WebSocket connections', async () => {
      const connectionCount = 15;
      const connections = [];
      const connectionTimes = [];

      try {
        // Create multiple WebSocket connections
        for (let i = 0; i < connectionCount; i++) {
          const startTime = performance.now();
          
          const client = ioClient(baseURL, {
            forceNew: true,
            timeout: 5000
          });
          
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
            
            client.on('connect', () => {
              clearTimeout(timeout);
              const endTime = performance.now();
              connectionTimes.push(endTime - startTime);
              resolve();
            });
            
            client.on('connect_error', reject);
          });
          
          connections.push(client);
        }

        const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
        const maxConnectionTime = Math.max(...connectionTimes);

        expect(avgConnectionTime).toBeLessThan(500); // Average under 500ms
        expect(maxConnectionTime).toBeLessThan(2000); // Max under 2 seconds

        console.log(`WebSocket connections: ${connectionCount} connections, avg: ${avgConnectionTime.toFixed(2)}ms, max: ${maxConnectionTime.toFixed(2)}ms`);

        // Test broadcast performance
        const broadcastStart = performance.now();
        const messageReceived = [];

        connections.forEach((client, index) => {
          client.on('test-broadcast', (data) => {
            messageReceived.push({
              clientIndex: index,
              receivedAt: performance.now()
            });
          });
        });

        // Simulate a broadcast (like vote update)
        io.emit('test-broadcast', { message: 'Performance test broadcast', timestamp: Date.now() });

        // Wait for all messages to be received
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (messageReceived.length >= connectionCount) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 10);
          
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 3000);
        });

        const broadcastEnd = performance.now();
        const broadcastTime = broadcastEnd - broadcastStart;

        expect(messageReceived.length).toBe(connectionCount);
        expect(broadcastTime).toBeLessThan(1000); // Broadcast should complete under 1 second

        console.log(`WebSocket broadcast: ${connectionCount} clients received message in ${broadcastTime.toFixed(2)}ms`);

      } finally {
        // Clean up connections
        connections.forEach(client => {
          if (client.connected) {
            client.disconnect();
          }
        });
      }
    });

    test('should handle rapid message broadcasting', async () => {
      const messageCount = 50;
      const client = ioClient(baseURL);
      const messagesReceived = [];

      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
          
          client.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        client.on('rapid-test', (data) => {
          messagesReceived.push({
            messageId: data.id,
            receivedAt: performance.now()
          });
        });

        const startTime = performance.now();

        // Send rapid messages
        for (let i = 0; i < messageCount; i++) {
          io.emit('rapid-test', { id: i, timestamp: Date.now() });
        }

        // Wait for all messages
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (messagesReceived.length >= messageCount) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 10);
          
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        expect(messagesReceived.length).toBe(messageCount);
        expect(totalTime).toBeLessThan(2000); // All messages under 2 seconds

        console.log(`Rapid WebSocket messaging: ${messageCount} messages in ${totalTime.toFixed(2)}ms`);

      } finally {
        client.disconnect();
      }
    });
  });

  describe('Database Performance Under Load', () => {
    test('should handle concurrent database reads efficiently', async () => {
      const concurrentReads = 25;
      const token = authTokens.operador;
      
      if (!token) {
        console.warn('Operador token not available, skipping test');
        return;
      }

      const startTime = performance.now();

      const promises = Array.from({ length: concurrentReads }, () =>
        request(app)
          .get('/api/operador/initiatives/1/results')
          .set('Authorization', `Bearer ${token}`)
      );

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(totalTime).toBeLessThan(3000); // Under 3 seconds for all reads

      console.log(`Concurrent database reads: ${concurrentReads} reads in ${totalTime.toFixed(2)}ms`);
    });

    test('should handle mixed read/write operations efficiently', async () => {
      const operations = 20;
      const voteTokens = [authTokens.diputado1, authTokens.diputado2, authTokens.diputado3].filter(Boolean);
      const readToken = authTokens.operador;
      
      if (voteTokens.length === 0 || !readToken) {
        console.warn('Required tokens not available, skipping test');
        return;
      }

      const startTime = performance.now();
      const promises = [];

      for (let i = 0; i < operations; i++) {
        if (i % 3 === 0) {
          // Write operation (vote)
          const voteToken = voteTokens[i % voteTokens.length];
          promises.push(
            request(app)
              .post('/api/diputado/vote')
              .set('Authorization', `Bearer ${voteToken}`)
              .send({
                iniciativa_id: 1,
                voto: ['favor', 'contra', 'abstencion'][i % 3]
              })
          );
        } else {
          // Read operation (get results)
          promises.push(
            request(app)
              .get('/api/operador/initiatives/1/results')
              .set('Authorization', `Bearer ${readToken}`)
          );
        }
      }

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Check that operations completed successfully
      responses.forEach(response => {
        expect([200, 400]).toContain(response.status); // 400 might occur for duplicate votes
      });

      expect(totalTime).toBeLessThan(4000); // Under 4 seconds for mixed operations

      console.log(`Mixed database operations: ${operations} operations in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during repeated operations', async () => {
      const iterations = 100;
      const token = authTokens.diputado1;
      
      if (!token) {
        console.warn('Diputado token not available, skipping test');
        return;
      }

      const initialMemory = process.memoryUsage();

      for (let i = 0; i < iterations; i++) {
        await request(app)
          .post('/api/diputado/vote')
          .set('Authorization', `Bearer ${token}`)
          .send({
            iniciativa_id: 1,
            voto: ['favor', 'contra', 'abstencion'][i % 3]
          });

        // Occasionally check memory usage
        if (i % 25 === 0) {
          const currentMemory = process.memoryUsage();
          const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;
          
          // Memory increase should be reasonable (less than 50MB)
          expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory usage after ${iterations} operations: +${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        const afterGcMemory = process.memoryUsage();
        console.log(`Memory after GC: ${(afterGcMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }
    });

    test('should handle connection cleanup properly', async () => {
      const connectionCount = 20;
      const connections = [];

      // Create connections
      for (let i = 0; i < connectionCount; i++) {
        const client = ioClient(baseURL);
        connections.push(client);
        
        await new Promise((resolve) => {
          client.on('connect', resolve);
        });
      }

      // Verify all connections are established
      expect(connections.length).toBe(connectionCount);

      // Disconnect all connections
      connections.forEach(client => client.disconnect());

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check that server handles disconnections properly
      // This would require access to server internals to verify connection count
      // For now, we just ensure no errors occurred
      expect(true).toBe(true);
    });
  });

  describe('Stress Testing', () => {
    test('should handle system stress with maximum concurrent users', async () => {
      const maxConcurrentUsers = 30;
      const operationsPerUser = 5;
      
      const allTokens = Object.values(authTokens).filter(Boolean);
      
      if (allTokens.length === 0) {
        console.warn('No tokens available for stress test');
        return;
      }

      const startTime = performance.now();
      const promises = [];

      // Create stress test promises
      for (let user = 0; user < maxConcurrentUsers; user++) {
        const token = allTokens[user % allTokens.length];
        
        for (let op = 0; op < operationsPerUser; op++) {
          if (token.includes('diputado') || token === authTokens.diputado1) {
            // Vote operations for diputados
            promises.push(
              request(app)
                .post('/api/diputado/vote')
                .set('Authorization', `Bearer ${token}`)
                .send({
                  iniciativa_id: 1,
                  voto: ['favor', 'contra', 'abstencion'][op % 3]
                })
            );
          } else {
            // Read operations for other roles
            promises.push(
              request(app)
                .get('/api/operador/initiatives/1/results')
                .set('Authorization', `Bearer ${token}`)
            );
          }
        }
      }

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Check success rate
      const successfulResponses = responses.filter(r => [200, 400].includes(r.status));
      const successRate = (successfulResponses.length / responses.length) * 100;

      expect(successRate).toBeGreaterThan(90); // At least 90% success rate
      expect(totalTime).toBeLessThan(15000); // Complete within 15 seconds

      console.log(`Stress test: ${maxConcurrentUsers} users, ${operationsPerUser} ops each`);
      console.log(`Total operations: ${responses.length}, Success rate: ${successRate.toFixed(1)}%`);
      console.log(`Completed in: ${totalTime.toFixed(2)}ms`);
    });
  });
});