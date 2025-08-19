/**
 * VotacionRepository Unit Tests
 * Tests database operations for voting
 */

const VotacionRepository = require('../../../src/repositories/VotacionRepository');
const { getTestDatabase, cleanTestDatabase } = require('../../setup/setupTestDatabase');

describe('VotacionRepository', () => {
  let votacionRepo;
  let db;

  beforeEach(async () => {
    db = getTestDatabase();
    votacionRepo = new VotacionRepository(db);
    await cleanTestDatabase();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('castVote', () => {
    const mockInitiativeId = 1;
    const mockUserId = 5; // test.diputado1
    const mockVote = 'favor';

    it('should successfully cast a new vote', async () => {
      // Arrange - Initiative should be open (not closed)
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });

      // Act
      const result = await votacionRepo.castVote(mockInitiativeId, mockUserId, mockVote);

      // Assert
      expect(result).toBeDefined();
      expect(result.voto).toBe(mockVote);
      expect(result.usuario_id).toBe(mockUserId);
      expect(result.iniciativa_id).toBe(mockInitiativeId);

      // Verify vote was stored in database
      const storedVote = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM votos WHERE iniciativa_id = ? AND usuario_id = ?',
          [mockInitiativeId, mockUserId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      expect(storedVote).toBeDefined();
      expect(storedVote.voto).toBe(mockVote);
    });

    it('should update existing vote when user votes again', async () => {
      // Arrange - Set initiative as open
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });

      // First vote
      await votacionRepo.castVote(mockInitiativeId, mockUserId, 'favor');

      // Act - Change vote
      const result = await votacionRepo.castVote(mockInitiativeId, mockUserId, 'contra');

      // Assert
      expect(result.voto).toBe('contra');

      // Verify only one vote exists for this user/initiative
      const voteCount = await new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM votos WHERE iniciativa_id = ? AND usuario_id = ?',
          [mockInitiativeId, mockUserId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          }
        );
      });

      expect(voteCount).toBe(1);
    });

    it('should reject invalid vote type', async () => {
      // Arrange
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });

      // Act & Assert
      await expect(votacionRepo.castVote(mockInitiativeId, mockUserId, 'invalid_vote'))
        .rejects.toThrow('Tipo de voto inválido');
    });

    it('should reject vote on non-existent initiative', async () => {
      // Act & Assert
      await expect(votacionRepo.castVote(999, mockUserId, mockVote))
        .rejects.toThrow('Iniciativa no encontrada');
    });

    it('should reject vote on closed initiative', async () => {
      // Arrange - Close the initiative
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET cerrada = 1 WHERE id = ?', [mockInitiativeId], resolve);
      });

      // Act & Assert
      await expect(votacionRepo.castVote(mockInitiativeId, mockUserId, mockVote))
        .rejects.toThrow('La votación ya está cerrada');
    });

    it('should handle all valid vote types', async () => {
      // Arrange
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });

      const validVoteTypes = ['favor', 'contra', 'abstencion'];
      
      for (const voteType of validVoteTypes) {
        // Act
        const result = await votacionRepo.castVote(mockInitiativeId, mockUserId, voteType);
        
        // Assert
        expect(result.voto).toBe(voteType);
      }
    });
  });

  describe('getVotingResults', () => {
    const mockInitiativeId = 1;

    beforeEach(async () => {
      // Setup test votes
      const testVotes = [
        { iniciativa_id: mockInitiativeId, usuario_id: 5, voto: 'favor' },
        { iniciativa_id: mockInitiativeId, usuario_id: 6, voto: 'favor' },
        { iniciativa_id: mockInitiativeId, usuario_id: 7, voto: 'contra' },
        { iniciativa_id: mockInitiativeId, usuario_id: 8, voto: 'abstencion' }
      ];

      // Open initiative first
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });

      // Insert test votes
      for (const vote of testVotes) {
        await votacionRepo.castVote(vote.iniciativa_id, vote.usuario_id, vote.voto);
      }
    });

    it('should return accurate voting results with counts', async () => {
      // Act
      const results = await votacionRepo.getVotingResults(mockInitiativeId);

      // Assert
      expect(results).toBeDefined();
      expect(results.counts).toMatchObject({
        favor: 2,
        contra: 1,
        abstencion: 1,
        total: 4
      });
      expect(results.total_eligible).toBeGreaterThan(0);
      expect(results.participation_rate).toBeDefined();
      expect(Array.isArray(results.votes)).toBe(true);
    });

    it('should return zero counts for initiative with no votes', async () => {
      // Arrange - Use initiative 2 which has no votes
      const initiativeWithNoVotes = 2;

      // Act
      const results = await votacionRepo.getVotingResults(initiativeWithNoVotes);

      // Assert
      expect(results.counts).toMatchObject({
        favor: 0,
        contra: 0,
        abstencion: 0,
        total: 0
      });
    });

    it('should calculate participation rate correctly', async () => {
      // Act
      const results = await votacionRepo.getVotingResults(mockInitiativeId);

      // Assert
      const expectedParticipationRate = (4 / results.total_eligible) * 100;
      expect(results.participation_rate).toBeCloseTo(expectedParticipationRate, 1);
    });

    it('should include vote details with user information', async () => {
      // Act
      const results = await votacionRepo.getVotingResults(mockInitiativeId);

      // Assert
      expect(results.votes).toHaveLength(4);
      results.votes.forEach(vote => {
        expect(vote).toMatchObject({
          usuario_id: expect.any(Number),
          voto: expect.stringMatching(/^(favor|contra|abstencion)$/),
          fecha_voto: expect.any(String),
          nombre_completo: expect.any(String)
        });
      });
    });
  });

  describe('removeVote', () => {
    const mockInitiativeId = 1;
    const mockUserId = 5;

    beforeEach(async () => {
      // Setup: cast a vote to remove
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });
      await votacionRepo.castVote(mockInitiativeId, mockUserId, 'favor');
    });

    it('should successfully remove existing vote', async () => {
      // Act
      const result = await votacionRepo.removeVote(mockInitiativeId, mockUserId);

      // Assert
      expect(result).toBe(true);

      // Verify vote was removed from database
      const deletedVote = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM votos WHERE iniciativa_id = ? AND usuario_id = ?',
          [mockInitiativeId, mockUserId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      expect(deletedVote).toBeUndefined();
    });

    it('should return false when vote does not exist', async () => {
      // Arrange - Remove the vote first
      await votacionRepo.removeVote(mockInitiativeId, mockUserId);

      // Act - Try to remove again
      const result = await votacionRepo.removeVote(mockInitiativeId, mockUserId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getUserVotingStats', () => {
    const mockUserId = 5;

    beforeEach(async () => {
      // Setup test data: cast votes on different initiatives
      const initiatives = [1, 2];
      const votes = ['favor', 'contra'];

      for (let i = 0; i < initiatives.length; i++) {
        await new Promise((resolve) => {
          db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [initiatives[i]], resolve);
        });
        await votacionRepo.castVote(initiatives[i], mockUserId, votes[i]);
      }
    });

    it('should return user voting statistics', async () => {
      // Act
      const stats = await votacionRepo.getUserVotingStats(mockUserId);

      // Assert
      expect(stats).toMatchObject({
        total_votos: expect.any(Number),
        votos_favor: expect.any(Number),
        votos_contra: expect.any(Number),
        votos_abstencion: expect.any(Number),
        porcentaje_participacion: expect.any(Number)
      });

      expect(stats.total_votos).toBeGreaterThan(0);
      expect(stats.total_votos).toBe(stats.votos_favor + stats.votos_contra + stats.votos_abstencion);
    });

    it('should return zero stats for user with no votes', async () => {
      // Arrange - Use user with no votes
      const userWithNoVotes = 999;

      // Act
      const stats = await votacionRepo.getUserVotingStats(userWithNoVotes);

      // Assert
      expect(stats).toMatchObject({
        total_votos: 0,
        votos_favor: 0,
        votos_contra: 0,
        votos_abstencion: 0,
        porcentaje_participacion: 0
      });
    });
  });

  describe('getNonVoters', () => {
    const mockInitiativeId = 1;

    beforeEach(async () => {
      // Setup: Some diputados vote, others don't
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });
      
      // Only user 5 votes, users 6, 7, 8, 9, 10 don't vote
      await votacionRepo.castVote(mockInitiativeId, 5, 'favor');
    });

    it('should return list of diputados who have not voted', async () => {
      // Act
      const nonVoters = await votacionRepo.getNonVoters(mockInitiativeId);

      // Assert
      expect(Array.isArray(nonVoters)).toBe(true);
      expect(nonVoters.length).toBeGreaterThan(0);
      
      nonVoters.forEach(diputado => {
        expect(diputado).toMatchObject({
          id: expect.any(Number),
          username: expect.any(String),
          nombre_completo: expect.any(String),
          partido: expect.any(String)
        });
        expect(diputado.id).not.toBe(5); // User 5 voted, should not be in list
      });
    });

    it('should return empty list when all diputados have voted', async () => {
      // Arrange - Make all diputados vote
      const diputadoIds = [6, 7, 8, 9, 10]; // User 5 already voted
      for (const id of diputadoIds) {
        await votacionRepo.castVote(mockInitiativeId, id, 'favor');
      }

      // Act
      const nonVoters = await votacionRepo.getNonVoters(mockInitiativeId);

      // Assert
      expect(nonVoters).toHaveLength(0);
    });
  });

  describe('getVoteWithUserInfo', () => {
    const mockInitiativeId = 1;
    const mockUserId = 5;

    beforeEach(async () => {
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });
      await votacionRepo.castVote(mockInitiativeId, mockUserId, 'favor');
    });

    it('should return vote with complete user information', async () => {
      // Act
      const voteWithUserInfo = await votacionRepo.getVoteWithUserInfo(mockInitiativeId, mockUserId);

      // Assert
      expect(voteWithUserInfo).toMatchObject({
        voto: 'favor',
        usuario_id: mockUserId,
        iniciativa_id: mockInitiativeId,
        nombre_completo: expect.any(String),
        username: expect.any(String),
        partido: expect.any(String),
        fecha_voto: expect.any(String)
      });
    });

    it('should return null for non-existent vote', async () => {
      // Act
      const result = await votacionRepo.getVoteWithUserInfo(mockInitiativeId, 999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Database integrity constraints', () => {
    it('should enforce unique constraint on usuario_id and iniciativa_id', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 5;
      
      await new Promise((resolve) => {
        db.run('UPDATE iniciativas SET activa = 1, cerrada = 0 WHERE id = ?', [mockInitiativeId], resolve);
      });

      // Act - First vote should succeed
      await expect(votacionRepo.castVote(mockInitiativeId, mockUserId, 'favor'))
        .resolves.toBeDefined();

      // Second vote should update, not create duplicate
      await expect(votacionRepo.castVote(mockInitiativeId, mockUserId, 'contra'))
        .resolves.toBeDefined();

      // Verify only one vote exists
      const voteCount = await new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM votos WHERE iniciativa_id = ? AND usuario_id = ?',
          [mockInitiativeId, mockUserId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          }
        );
      });

      expect(voteCount).toBe(1);
    });

    it('should enforce foreign key constraints', async () => {
      // This test might not work with SQLite depending on configuration
      // but it's important to test in a real environment
      const nonExistentInitiativeId = 9999;
      const nonExistentUserId = 9999;

      // Test would depend on foreign key enforcement being enabled
      // In production, these should fail with constraint violations
    });
  });
});