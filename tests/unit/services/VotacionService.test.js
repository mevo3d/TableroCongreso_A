/**
 * VotacionService Unit Tests
 * Tests business logic for voting operations
 */

const VotacionService = require('../../../src/services/VotacionService');
const VotacionRepository = require('../../../src/repositories/VotacionRepository');
const { getTestDatabase, cleanTestDatabase } = require('../../setup/setupTestDatabase');

// Mock the repository
jest.mock('../../../src/repositories/VotacionRepository');

describe('VotacionService', () => {
  let votacionService;
  let mockDb;
  let mockIo;
  let mockVotacionRepo;

  beforeEach(() => {
    // Setup mocks
    mockDb = getTestDatabase();
    mockIo = {
      emit: jest.fn()
    };
    
    // Create mock repository instance
    mockVotacionRepo = {
      castVote: jest.fn(),
      getVotingResults: jest.fn(),
      getUserVotingStats: jest.fn(),
      getNonVoters: jest.fn(),
      removeVote: jest.fn()
    };
    
    // Mock the repository constructor
    VotacionRepository.mockImplementation(() => mockVotacionRepo);
    
    // Create service instance
    votacionService = new VotacionService(mockDb, mockIo);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanTestDatabase();
  });

  describe('castVote', () => {
    const mockInitiativeId = 1;
    const mockUserId = 5; // Test diputado
    const mockVote = 'favor';

    beforeEach(() => {
      // Setup common mocks for voting
      votacionService._getUser = jest.fn();
      votacionService._getInitiative = jest.fn();
      votacionService._updateInitiativeVoteCounts = jest.fn();
      votacionService._notifyVoteUpdate = jest.fn();
    });

    it('should successfully cast a vote when all validations pass', async () => {
      // Arrange
      const mockUser = { id: mockUserId, role: 'diputado', activo: 1 };
      const mockInitiative = { id: mockInitiativeId, activa: 1, cerrada: 0 };
      const mockVoteResult = { id: 1, voto: mockVote, usuario_id: mockUserId };
      const mockVotingResults = {
        counts: { favor: 1, contra: 0, abstencion: 0, total: 1 },
        total_eligible: 6,
        participation_rate: 16.67
      };

      votacionService._getUser.mockResolvedValue(mockUser);
      votacionService._getInitiative.mockResolvedValue(mockInitiative);
      mockVotacionRepo.castVote.mockResolvedValue(mockVoteResult);
      mockVotacionRepo.getVotingResults.mockResolvedValue(mockVotingResults);

      // Act
      const result = await votacionService.castVote(mockInitiativeId, mockUserId, mockVote);

      // Assert
      expect(votacionService._getUser).toHaveBeenCalledWith(mockUserId);
      expect(votacionService._getInitiative).toHaveBeenCalledWith(mockInitiativeId);
      expect(mockVotacionRepo.castVote).toHaveBeenCalledWith(mockInitiativeId, mockUserId, mockVote);
      expect(votacionService._updateInitiativeVoteCounts).toHaveBeenCalledWith(mockInitiativeId, mockVotingResults.counts);
      expect(votacionService._notifyVoteUpdate).toHaveBeenCalledWith(mockInitiativeId, mockVotingResults, mockVoteResult);
      
      expect(result).toEqual({
        vote: mockVoteResult,
        results: mockVotingResults
      });
    });

    it('should reject vote when user is not a diputado', async () => {
      // Arrange
      const mockUser = { id: mockUserId, role: 'operador', activo: 1 };
      votacionService._getUser.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(votacionService.castVote(mockInitiativeId, mockUserId, mockVote))
        .rejects.toThrow('Error casting vote: Solo los diputados pueden votar');
      
      expect(mockVotacionRepo.castVote).not.toHaveBeenCalled();
    });

    it('should reject vote when user is inactive', async () => {
      // Arrange
      const mockUser = { id: mockUserId, role: 'diputado', activo: 0 };
      votacionService._getUser.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(votacionService.castVote(mockInitiativeId, mockUserId, mockVote))
        .rejects.toThrow('Error casting vote: Usuario inactivo');
    });

    it('should reject vote when user does not exist', async () => {
      // Arrange
      votacionService._getUser.mockResolvedValue(null);

      // Act & Assert
      await expect(votacionService.castVote(mockInitiativeId, mockUserId, mockVote))
        .rejects.toThrow('Error casting vote: Usuario no encontrado');
    });

    it('should reject vote when initiative is not active', async () => {
      // Arrange
      const mockUser = { id: mockUserId, role: 'diputado', activo: 1 };
      const mockInitiative = { id: mockInitiativeId, activa: 0, cerrada: 0 };
      
      votacionService._getUser.mockResolvedValue(mockUser);
      votacionService._getInitiative.mockResolvedValue(mockInitiative);

      // Act & Assert
      await expect(votacionService.castVote(mockInitiativeId, mockUserId, mockVote))
        .rejects.toThrow('Error casting vote: La iniciativa no está activa para votación');
    });

    it('should reject vote when initiative is closed', async () => {
      // Arrange
      const mockUser = { id: mockUserId, role: 'diputado', activo: 1 };
      const mockInitiative = { id: mockInitiativeId, activa: 1, cerrada: 1 };
      
      votacionService._getUser.mockResolvedValue(mockUser);
      votacionService._getInitiative.mockResolvedValue(mockInitiative);

      // Act & Assert
      await expect(votacionService.castVote(mockInitiativeId, mockUserId, mockVote))
        .rejects.toThrow('Error casting vote: La iniciativa ya está cerrada');
    });

    it('should handle different vote types correctly', async () => {
      // Arrange
      const mockUser = { id: mockUserId, role: 'diputado', activo: 1 };
      const mockInitiative = { id: mockInitiativeId, activa: 1, cerrada: 0 };
      const mockVotingResults = {
        counts: { favor: 0, contra: 1, abstencion: 0, total: 1 },
        total_eligible: 6,
        participation_rate: 16.67
      };

      votacionService._getUser.mockResolvedValue(mockUser);
      votacionService._getInitiative.mockResolvedValue(mockInitiative);
      mockVotacionRepo.getVotingResults.mockResolvedValue(mockVotingResults);

      const voteTypes = ['favor', 'contra', 'abstencion'];
      
      for (const voteType of voteTypes) {
        const mockVoteResult = { id: 1, voto: voteType, usuario_id: mockUserId };
        mockVotacionRepo.castVote.mockResolvedValue(mockVoteResult);
        
        // Act
        const result = await votacionService.castVote(mockInitiativeId, mockUserId, voteType);
        
        // Assert
        expect(result.vote.voto).toBe(voteType);
        expect(mockVotacionRepo.castVote).toHaveBeenCalledWith(mockInitiativeId, mockUserId, voteType);
      }
    });
  });

  describe('getVotingResults', () => {
    it('should return voting results with analysis', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockResults = {
        counts: { favor: 4, contra: 1, abstencion: 1, total: 6 },
        total_eligible: 6,
        participation_rate: 100,
        votes: []
      };

      mockVotacionRepo.getVotingResults.mockResolvedValue(mockResults);

      // Act
      const result = await votacionService.getVotingResults(mockInitiativeId);

      // Assert
      expect(mockVotacionRepo.getVotingResults).toHaveBeenCalledWith(mockInitiativeId);
      expect(result).toHaveProperty('analysis');
      expect(result.analysis).toMatchObject({
        participation_level: 'alta',
        consensus_level: expect.any(String),
        abstention_rate: expect.any(String),
        turnout_sufficient: true
      });
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockError = new Error('Database connection error');
      
      mockVotacionRepo.getVotingResults.mockRejectedValue(mockError);

      // Act & Assert
      await expect(votacionService.getVotingResults(mockInitiativeId))
        .rejects.toThrow('Error getting voting results: Database connection error');
    });
  });

  describe('openInitiative', () => {
    beforeEach(() => {
      votacionService._validateUserPermission = jest.fn();
      votacionService._getInitiative = jest.fn();
      votacionService._updateInitiative = jest.fn();
      votacionService._closeOtherActiveInitiatives = jest.fn();
      votacionService._logInitiativeEvent = jest.fn();
    });

    it('should successfully open an initiative with proper permissions', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 2; // operador
      const mockInitiative = { 
        id: mockInitiativeId, 
        activa: 0, 
        cerrada: 0, 
        sesion_id: 1,
        titulo: 'Test Initiative'
      };
      const mockUpdatedInitiative = { ...mockInitiative, activa: 1 };

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._getInitiative
        .mockResolvedValueOnce(mockInitiative)
        .mockResolvedValueOnce(mockUpdatedInitiative);
      votacionService._updateInitiative.mockResolvedValue();
      votacionService._closeOtherActiveInitiatives.mockResolvedValue();
      votacionService._logInitiativeEvent.mockResolvedValue();

      // Act
      const result = await votacionService.openInitiative(mockInitiativeId, mockUserId);

      // Assert
      expect(votacionService._validateUserPermission).toHaveBeenCalledWith(mockUserId, ['operador', 'superadmin']);
      expect(votacionService._closeOtherActiveInitiatives).toHaveBeenCalledWith(1, mockInitiativeId);
      expect(votacionService._updateInitiative).toHaveBeenCalledWith(mockInitiativeId, { activa: 1, cerrada: 0 });
      expect(votacionService._logInitiativeEvent).toHaveBeenCalledWith(
        mockInitiativeId, 
        'iniciativa_abierta', 
        'Iniciativa abierta para votación', 
        mockUserId
      );
      expect(mockIo.emit).toHaveBeenCalledWith('initiative-opened', expect.objectContaining({
        initiative: mockUpdatedInitiative,
        timestamp: expect.any(String)
      }));
      expect(result).toEqual(mockUpdatedInitiative);
    });

    it('should reject opening already active initiative', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 2;
      const mockInitiative = { id: mockInitiativeId, activa: 1, cerrada: 0 };

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._getInitiative.mockResolvedValue(mockInitiative);

      // Act & Assert
      await expect(votacionService.openInitiative(mockInitiativeId, mockUserId))
        .rejects.toThrow('Error opening initiative: La iniciativa ya está activa');
    });

    it('should reject opening closed initiative', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 2;
      const mockInitiative = { id: mockInitiativeId, activa: 0, cerrada: 1 };

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._getInitiative.mockResolvedValue(mockInitiative);

      // Act & Assert
      await expect(votacionService.openInitiative(mockInitiativeId, mockUserId))
        .rejects.toThrow('Error opening initiative: La iniciativa ya está cerrada');
    });
  });

  describe('closeInitiative', () => {
    beforeEach(() => {
      votacionService._validateUserPermission = jest.fn();
      votacionService._getInitiative = jest.fn();
      votacionService._updateInitiative = jest.fn();
      votacionService._logInitiativeEvent = jest.fn();
      votacionService._calculateFinalResult = jest.fn();
    });

    it('should successfully close initiative and calculate results', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 2;
      const mockInitiative = { 
        id: mockInitiativeId, 
        activa: 1, 
        cerrada: 0,
        tipo_mayoria: 'simple'
      };
      const mockVotingResults = {
        counts: { favor: 3, contra: 1, abstencion: 1, total: 5 }
      };
      const mockFinalResult = 'aprobada';
      const mockUpdatedInitiative = { 
        ...mockInitiative, 
        activa: 0, 
        cerrada: 1, 
        resultado: mockFinalResult 
      };

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._getInitiative
        .mockResolvedValueOnce(mockInitiative)
        .mockResolvedValueOnce(mockUpdatedInitiative);
      mockVotacionRepo.getVotingResults.mockResolvedValue(mockVotingResults);
      votacionService._calculateFinalResult.mockReturnValue(mockFinalResult);
      votacionService._updateInitiative.mockResolvedValue();
      votacionService._logInitiativeEvent.mockResolvedValue();

      // Act
      const result = await votacionService.closeInitiative(mockInitiativeId, mockUserId);

      // Assert
      expect(votacionService._calculateFinalResult).toHaveBeenCalledWith(mockInitiative, mockVotingResults);
      expect(votacionService._updateInitiative).toHaveBeenCalledWith(mockInitiativeId, {
        activa: 0,
        cerrada: 1,
        resultado: mockFinalResult,
        votos_favor: 3,
        votos_contra: 1,
        votos_abstencion: 1
      });
      expect(mockIo.emit).toHaveBeenCalledWith('initiative-closed', expect.objectContaining({
        initiative: mockUpdatedInitiative,
        results: mockVotingResults,
        final_result: mockFinalResult
      }));
      expect(result).toMatchObject({
        initiative: mockUpdatedInitiative,
        results: mockVotingResults,
        final_result: mockFinalResult
      });
    });

    it('should reject closing already closed initiative', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 2;
      const mockInitiative = { id: mockInitiativeId, activa: 0, cerrada: 1 };

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._getInitiative.mockResolvedValue(mockInitiative);

      // Act & Assert
      await expect(votacionService.closeInitiative(mockInitiativeId, mockUserId))
        .rejects.toThrow('Error closing initiative: La iniciativa ya está cerrada');
    });
  });

  describe('_calculateFinalResult', () => {
    it('should return "aprobada" for simple majority when favor votes exceed half', () => {
      // Arrange
      const initiative = { tipo_mayoria: 'simple' };
      const votingResults = {
        counts: { favor: 3, contra: 1, abstencion: 1, total: 5 },
        total_eligible: 6
      };

      // Act
      const result = votacionService._calculateFinalResult(initiative, votingResults);

      // Assert
      expect(result).toBe('aprobada');
    });

    it('should return "rechazada" when contra votes exceed favor', () => {
      // Arrange
      const initiative = { tipo_mayoria: 'simple' };
      const votingResults = {
        counts: { favor: 1, contra: 3, abstencion: 1, total: 5 },
        total_eligible: 6
      };

      // Act
      const result = votacionService._calculateFinalResult(initiative, votingResults);

      // Assert
      expect(result).toBe('rechazada');
    });

    it('should return "empate" when favor and contra are equal', () => {
      // Arrange
      const initiative = { tipo_mayoria: 'simple' };
      const votingResults = {
        counts: { favor: 2, contra: 2, abstencion: 1, total: 5 },
        total_eligible: 6
      };

      // Act
      const result = votacionService._calculateFinalResult(initiative, votingResults);

      // Assert
      expect(result).toBe('empate');
    });

    it('should return "sin_votos" when no votes are cast', () => {
      // Arrange
      const initiative = { tipo_mayoria: 'simple' };
      const votingResults = {
        counts: { favor: 0, contra: 0, abstencion: 0, total: 0 },
        total_eligible: 6
      };

      // Act
      const result = votacionService._calculateFinalResult(initiative, votingResults);

      // Assert
      expect(result).toBe('sin_votos');
    });

    it('should handle qualified majority correctly', () => {
      // Arrange - Need 2/3 of 6 eligible = 4 votes
      const initiative = { tipo_mayoria: 'calificada' };
      const votingResults = {
        counts: { favor: 4, contra: 1, abstencion: 1, total: 6 },
        total_eligible: 6
      };

      // Act
      const result = votacionService._calculateFinalResult(initiative, votingResults);

      // Assert
      expect(result).toBe('aprobada');
    });

    it('should reject qualified majority when not enough favor votes', () => {
      // Arrange - Need 2/3 of 6 eligible = 4 votes, only have 3
      const initiative = { tipo_mayoria: 'calificada' };
      const votingResults = {
        counts: { favor: 3, contra: 1, abstencion: 2, total: 6 },
        total_eligible: 6
      };

      // Act
      const result = votacionService._calculateFinalResult(initiative, votingResults);

      // Assert
      expect(result).toBe('empate'); // Not enough for qualified majority
    });
  });

  describe('removeVote', () => {
    beforeEach(() => {
      votacionService._validateUserPermission = jest.fn();
      votacionService._validateInitiativeActive = jest.fn();
      votacionService._updateInitiativeVoteCounts = jest.fn();
      votacionService._logInitiativeEvent = jest.fn();
      votacionService._notifyVoteUpdate = jest.fn();
    });

    it('should successfully remove vote with admin permissions', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 5;
      const mockAdminId = 1;
      const mockVotingResults = {
        counts: { favor: 2, contra: 1, abstencion: 0, total: 3 }
      };

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._validateInitiativeActive.mockResolvedValue();
      mockVotacionRepo.removeVote.mockResolvedValue(true);
      mockVotacionRepo.getVotingResults.mockResolvedValue(mockVotingResults);
      votacionService._updateInitiativeVoteCounts.mockResolvedValue();
      votacionService._logInitiativeEvent.mockResolvedValue();

      // Act
      const result = await votacionService.removeVote(mockInitiativeId, mockUserId, mockAdminId);

      // Assert
      expect(votacionService._validateUserPermission).toHaveBeenCalledWith(mockAdminId, ['superadmin']);
      expect(mockVotacionRepo.removeVote).toHaveBeenCalledWith(mockInitiativeId, mockUserId);
      expect(votacionService._updateInitiativeVoteCounts).toHaveBeenCalledWith(mockInitiativeId, mockVotingResults.counts);
      expect(votacionService._logInitiativeEvent).toHaveBeenCalledWith(
        mockInitiativeId, 
        'voto_eliminado', 
        'Voto eliminado por administrador', 
        mockAdminId
      );
      expect(result).toEqual(mockVotingResults);
    });

    it('should reject vote removal when vote does not exist', async () => {
      // Arrange
      const mockInitiativeId = 1;
      const mockUserId = 5;
      const mockAdminId = 1;

      votacionService._validateUserPermission.mockResolvedValue();
      votacionService._validateInitiativeActive.mockResolvedValue();
      mockVotacionRepo.removeVote.mockResolvedValue(false);

      // Act & Assert
      await expect(votacionService.removeVote(mockInitiativeId, mockUserId, mockAdminId))
        .rejects.toThrow('Error removing vote: No se encontró el voto para eliminar');
    });
  });

  describe('_analyzeVotingResults', () => {
    it('should correctly analyze high participation and consensus', () => {
      // Arrange
      const results = {
        counts: { favor: 5, contra: 1, abstencion: 0, total: 6 },
        total_eligible: 6,
        participation_rate: 100
      };

      // Act
      const analysis = votacionService._analyzeVotingResults(results);

      // Assert
      expect(analysis).toMatchObject({
        participation_level: 'alta',
        consensus_level: 'alto',
        abstention_rate: '0.0',
        turnout_sufficient: true
      });
    });

    it('should correctly analyze low participation and consensus', () => {
      // Arrange
      const results = {
        counts: { favor: 1, contra: 1, abstencion: 1, total: 3 },
        total_eligible: 6,
        participation_rate: 50
      };

      // Act
      const analysis = votacionService._analyzeVotingResults(results);

      // Assert
      expect(analysis).toMatchObject({
        participation_level: 'baja',
        consensus_level: 'bajo',
        abstention_rate: '33.3',
        turnout_sufficient: true
      });
    });
  });
});