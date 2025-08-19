/**
 * SesionService Unit Tests
 * Tests business logic for session management
 */

const SesionService = require('../../../src/services/SesionService');
const SesionRepository = require('../../../src/repositories/SesionRepository');
const { getTestDatabase, cleanTestDatabase } = require('../../setup/setupTestDatabase');

// Mock the repository
jest.mock('../../../src/repositories/SesionRepository');

describe('SesionService', () => {
  let sesionService;
  let mockDb;
  let mockIo;
  let mockSesionRepo;

  beforeEach(() => {
    // Setup mocks
    mockDb = getTestDatabase();
    mockIo = {
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() }))
    };
    
    // Create mock repository instance
    mockSesionRepo = {
      createSession: jest.fn(),
      createInitiative: jest.fn(),
      getSession: jest.fn(),
      getActiveSessions: jest.fn(),
      updateSession: jest.fn(),
      getSessionInitiatives: jest.fn(),
      logSessionEvent: jest.fn(),
      getAllSessions: jest.fn()
    };
    
    // Mock the repository constructor
    SesionRepository.mockImplementation(() => mockSesionRepo);
    
    // Create service instance
    sesionService = new SesionService(mockDb, mockIo);
    
    // Mock private methods
    sesionService._executeInTransaction = jest.fn((callback) => callback());
    sesionService._validateUserPermission = jest.fn();
    sesionService._determineSessionState = jest.fn();
    sesionService._generateSessionCode = jest.fn();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanTestDatabase();
  });

  describe('createSessionFromDocument', () => {
    const mockUserId = 2; // operador
    const mockSessionData = {
      nombreSesion: 'Sesión Ordinaria Test',
      tipoSesion: 'ordinaria',
      fechaProgramada: '2025-08-10T10:00:00.000Z',
      ejecutarInmediato: false,
      notas: 'Sesión creada desde documento'
    };
    const mockIniciativas = [
      {
        titulo: 'Iniciativa de Prueba 1',
        descripcion: 'Primera iniciativa para testing',
        tipo_mayoria: 'simple',
        presentador: 'Test Diputado',
        partido_presentador: 'MORENA'
      },
      {
        titulo: 'Iniciativa de Prueba 2', 
        descripcion: 'Segunda iniciativa para testing',
        tipo_mayoria: 'calificada',
        presentador: 'Test Diputado 2',
        partido_presentador: 'PAN'
      }
    ];

    it('should successfully create session with initiatives', async () => {
      // Arrange
      const mockSession = { id: 1, codigo_sesion: 'SES-2025-08-10-1000' };
      const mockCreatedInitiatives = [
        { id: 1, numero: 1, titulo: 'Iniciativa de Prueba 1' },
        { id: 2, numero: 2, titulo: 'Iniciativa de Prueba 2' }
      ];

      sesionService._determineSessionState.mockReturnValue('preparada');
      mockSesionRepo.createSession.mockResolvedValue(mockSession);
      mockSesionRepo.createInitiative.mockResolvedValueOnce(mockCreatedInitiatives[0]);
      mockSesionRepo.createInitiative.mockResolvedValueOnce(mockCreatedInitiatives[1]);

      // Act
      const result = await sesionService.createSessionFromDocument(
        mockSessionData, 
        mockIniciativas, 
        mockUserId
      );

      // Assert
      expect(sesionService._executeInTransaction).toHaveBeenCalled();
      expect(mockSesionRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: mockSessionData.nombreSesion,
          tipo_sesion: mockSessionData.tipoSesion,
          fecha_programada: mockSessionData.fechaProgramada,
          ejecutar_inmediato: 0,
          notas: mockSessionData.notas,
          iniciada_por: mockUserId
        })
      );
      
      expect(mockSesionRepo.createInitiative).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        sesion: mockSession,
        iniciativas: mockCreatedInitiatives,
        resumen: expect.objectContaining({
          total_iniciativas: 2,
          tipos_mayoria: expect.objectContaining({
            simple: 1,
            calificada: 1
          })
        })
      });
    });

    it('should handle empty initiatives list', async () => {
      // Arrange
      const mockSession = { id: 1, codigo_sesion: 'SES-2025-08-10-1000' };
      
      sesionService._determineSessionState.mockReturnValue('preparada');
      mockSesionRepo.createSession.mockResolvedValue(mockSession);

      // Act
      const result = await sesionService.createSessionFromDocument(
        mockSessionData, 
        [], 
        mockUserId
      );

      // Assert
      expect(mockSesionRepo.createInitiative).not.toHaveBeenCalled();
      expect(result.iniciativas).toEqual([]);
      expect(result.resumen.total_iniciativas).toBe(0);
    });

    it('should use default values when session data is minimal', async () => {
      // Arrange
      const minimalSessionData = {};
      const mockSession = { id: 1, codigo_sesion: 'SES-2025-08-10-1000' };
      
      sesionService._determineSessionState.mockReturnValue('preparada');
      mockSesionRepo.createSession.mockResolvedValue(mockSession);

      // Act
      const result = await sesionService.createSessionFromDocument(
        minimalSessionData, 
        [], 
        mockUserId
      );

      // Assert
      expect(mockSesionRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo_sesion: 'ordinaria',
          fecha_programada: null,
          ejecutar_inmediato: 0,
          notas: ''
        })
      );
    });

    it('should handle transaction errors', async () => {
      // Arrange
      const mockError = new Error('Database transaction failed');
      sesionService._executeInTransaction.mockRejectedValue(mockError);

      // Act & Assert
      await expect(
        sesionService.createSessionFromDocument(mockSessionData, mockIniciativas, mockUserId)
      ).rejects.toThrow('Error creating session from document: Database transaction failed');
    });
  });

  describe('startSession', () => {
    const mockSessionId = 1;
    const mockUserId = 2;

    beforeEach(() => {
      sesionService._closeOtherActiveSessions = jest.fn();
      sesionService._notifySessionStateChange = jest.fn();
    });

    it('should successfully start a prepared session', async () => {
      // Arrange
      const mockSession = { 
        id: mockSessionId, 
        estado: 'preparada', 
        activa: 0,
        codigo_sesion: 'SES-2025-08-10-1000'
      };
      const mockUpdatedSession = { ...mockSession, estado: 'activa', activa: 1 };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);
      mockSesionRepo.updateSession.mockResolvedValue(mockUpdatedSession);
      sesionService._closeOtherActiveSessions.mockResolvedValue();
      mockSesionRepo.logSessionEvent.mockResolvedValue();

      // Act
      const result = await sesionService.startSession(mockSessionId, mockUserId);

      // Assert
      expect(sesionService._validateUserPermission).toHaveBeenCalledWith(mockUserId, ['operador', 'superadmin']);
      expect(sesionService._closeOtherActiveSessions).toHaveBeenCalled();
      expect(mockSesionRepo.updateSession).toHaveBeenCalledWith(mockSessionId, {
        estado: 'activa',
        activa: 1,
        fecha: expect.any(String)
      });
      expect(mockSesionRepo.logSessionEvent).toHaveBeenCalledWith(
        mockSessionId,
        'sesion_iniciada',
        'Sesión iniciada por operador',
        mockUserId
      );
      expect(sesionService._notifySessionStateChange).toHaveBeenCalledWith(mockUpdatedSession, 'started');
      expect(result).toEqual(mockUpdatedSession);
    });

    it('should reject starting already active session', async () => {
      // Arrange
      const mockSession = { 
        id: mockSessionId, 
        estado: 'activa', 
        activa: 1 
      };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);

      // Act & Assert
      await expect(sesionService.startSession(mockSessionId, mockUserId))
        .rejects.toThrow('Error starting session: La sesión ya está activa');
    });

    it('should reject starting closed session', async () => {
      // Arrange
      const mockSession = { 
        id: mockSessionId, 
        estado: 'cerrada' 
      };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);

      // Act & Assert
      await expect(sesionService.startSession(mockSessionId, mockUserId))
        .rejects.toThrow('Error starting session: No se puede iniciar una sesión cerrada');
    });

    it('should reject starting non-existent session', async () => {
      // Arrange
      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(null);

      // Act & Assert
      await expect(sesionService.startSession(mockSessionId, mockUserId))
        .rejects.toThrow('Error starting session: Sesión no encontrada');
    });

    it('should reject unauthorized user', async () => {
      // Arrange
      const mockError = new Error('Permisos insuficientes');
      sesionService._validateUserPermission.mockRejectedValue(mockError);

      // Act & Assert
      await expect(sesionService.startSession(mockSessionId, mockUserId))
        .rejects.toThrow('Error starting session: Permisos insuficientes');
    });
  });

  describe('closeSession', () => {
    const mockSessionId = 1;
    const mockUserId = 2;

    beforeEach(() => {
      sesionService._generateSessionSummary = jest.fn();
      sesionService._notifySessionStateChange = jest.fn();
    });

    it('should successfully close active session', async () => {
      // Arrange
      const mockSession = { 
        id: mockSessionId, 
        estado: 'activa', 
        activa: 1,
        codigo_sesion: 'SES-2025-08-10-1000'
      };
      const mockClosedSession = { 
        ...mockSession, 
        estado: 'cerrada', 
        activa: 0,
        fecha_clausura: '2025-08-10T12:00:00.000Z'
      };
      const mockSummary = {
        total_iniciativas: 2,
        iniciativas_votadas: 1,
        tiempo_sesion: '2 horas'
      };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);
      mockSesionRepo.updateSession.mockResolvedValue(mockClosedSession);
      sesionService._generateSessionSummary.mockResolvedValue(mockSummary);
      mockSesionRepo.logSessionEvent.mockResolvedValue();

      // Act
      const result = await sesionService.closeSession(mockSessionId, mockUserId);

      // Assert
      expect(mockSesionRepo.updateSession).toHaveBeenCalledWith(mockSessionId, {
        estado: 'cerrada',
        activa: 0,
        fecha_clausura: expect.any(String),
        clausurada_por: mockUserId
      });
      expect(sesionService._generateSessionSummary).toHaveBeenCalledWith(mockSessionId);
      expect(mockSesionRepo.logSessionEvent).toHaveBeenCalledWith(
        mockSessionId,
        'sesion_cerrada',
        'Sesión clausurada por operador',
        mockUserId
      );
      expect(sesionService._notifySessionStateChange).toHaveBeenCalledWith(mockClosedSession, 'closed');
      expect(result).toMatchObject({
        sesion: mockClosedSession,
        resumen: mockSummary
      });
    });

    it('should reject closing already closed session', async () => {
      // Arrange
      const mockSession = { 
        id: mockSessionId, 
        estado: 'cerrada' 
      };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);

      // Act & Assert
      await expect(sesionService.closeSession(mockSessionId, mockUserId))
        .rejects.toThrow('Error closing session: La sesión ya está cerrada');
    });
  });

  describe('getSessionDetails', () => {
    it('should return complete session details with initiatives', async () => {
      // Arrange
      const mockSessionId = 1;
      const mockSession = {
        id: mockSessionId,
        codigo_sesion: 'SES-2025-08-10-1000',
        nombre: 'Sesión de Prueba',
        estado: 'activa'
      };
      const mockInitiatives = [
        { id: 1, titulo: 'Iniciativa 1', activa: 1 },
        { id: 2, titulo: 'Iniciativa 2', activa: 0 }
      ];

      mockSesionRepo.getSession.mockResolvedValue(mockSession);
      mockSesionRepo.getSessionInitiatives.mockResolvedValue(mockInitiatives);

      // Act
      const result = await sesionService.getSessionDetails(mockSessionId);

      // Assert
      expect(mockSesionRepo.getSession).toHaveBeenCalledWith(mockSessionId);
      expect(mockSesionRepo.getSessionInitiatives).toHaveBeenCalledWith(mockSessionId);
      expect(result).toEqual({
        sesion: mockSession,
        iniciativas: mockInitiatives
      });
    });

    it('should handle non-existent session', async () => {
      // Arrange
      const mockSessionId = 999;
      mockSesionRepo.getSession.mockResolvedValue(null);

      // Act & Assert
      await expect(sesionService.getSessionDetails(mockSessionId))
        .rejects.toThrow('Error getting session details: Sesión no encontrada');
    });
  });

  describe('_determineSessionState', () => {
    it('should return "activa" when ejecutar_inmediato is true', () => {
      // Arrange
      const sessionData = { ejecutarInmediato: true };

      // Act
      const result = sesionService._determineSessionState(sessionData);

      // Assert
      expect(result).toBe('activa');
    });

    it('should return "programada" when fecha_programada is future', () => {
      // Arrange
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const sessionData = { 
        ejecutarInmediato: false,
        fechaProgramada: futureDate.toISOString()
      };

      // Act
      const result = sesionService._determineSessionState(sessionData);

      // Assert
      expect(result).toBe('programada');
    });

    it('should return "preparada" for default case', () => {
      // Arrange
      const sessionData = { ejecutarInmediato: false };

      // Act
      const result = sesionService._determineSessionState(sessionData);

      // Assert
      expect(result).toBe('preparada');
    });
  });

  describe('_generateSessionCode', () => {
    it('should generate unique session code with date and time', () => {
      // Arrange
      const mockDate = new Date('2025-08-10T10:30:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      // Act
      const result = sesionService._generateSessionCode();

      // Assert
      expect(result).toMatch(/^SES-2025-08-10-\d{4}$/);
      
      // Cleanup
      global.Date.mockRestore();
    });
  });

  describe('_generateSessionSummary', () => {
    it('should generate comprehensive session summary', async () => {
      // Arrange
      const mockSessionId = 1;
      const mockInitiatives = [
        { id: 1, cerrada: 1, resultado: 'aprobada', votos_favor: 3 },
        { id: 2, cerrada: 1, resultado: 'rechazada', votos_contra: 2 },
        { id: 3, cerrada: 0, resultado: null }
      ];

      mockSesionRepo.getSessionInitiatives.mockResolvedValue(mockInitiatives);

      // Act
      const result = await sesionService._generateSessionSummary(mockSessionId);

      // Assert
      expect(result).toMatchObject({
        total_iniciativas: 3,
        iniciativas_votadas: 2,
        iniciativas_pendientes: 1,
        resultados: {
          aprobadas: 1,
          rechazadas: 1,
          pendientes: 1
        },
        estadisticas_votacion: expect.any(Object)
      });
    });
  });

  describe('pauseSession', () => {
    it('should successfully pause active session', async () => {
      // Arrange
      const mockSessionId = 1;
      const mockUserId = 2;
      const mockSession = { id: mockSessionId, estado: 'activa' };
      const mockPausedSession = { ...mockSession, estado: 'pausada' };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);
      mockSesionRepo.updateSession.mockResolvedValue(mockPausedSession);
      mockSesionRepo.logSessionEvent.mockResolvedValue();
      sesionService._notifySessionStateChange = jest.fn();

      // Act
      const result = await sesionService.pauseSession(mockSessionId, mockUserId);

      // Assert
      expect(mockSesionRepo.updateSession).toHaveBeenCalledWith(mockSessionId, {
        estado: 'pausada'
      });
      expect(mockSesionRepo.logSessionEvent).toHaveBeenCalledWith(
        mockSessionId,
        'sesion_pausada',
        'Sesión pausada por operador',
        mockUserId
      );
      expect(result).toEqual(mockPausedSession);
    });
  });

  describe('resumeSession', () => {
    it('should successfully resume paused session', async () => {
      // Arrange
      const mockSessionId = 1;
      const mockUserId = 2;
      const mockSession = { id: mockSessionId, estado: 'pausada' };
      const mockResumedSession = { ...mockSession, estado: 'activa' };

      sesionService._validateUserPermission.mockResolvedValue();
      mockSesionRepo.getSession.mockResolvedValue(mockSession);
      mockSesionRepo.updateSession.mockResolvedValue(mockResumedSession);
      mockSesionRepo.logSessionEvent.mockResolvedValue();
      sesionService._notifySessionStateChange = jest.fn();

      // Act
      const result = await sesionService.resumeSession(mockSessionId, mockUserId);

      // Assert
      expect(mockSesionRepo.updateSession).toHaveBeenCalledWith(mockSessionId, {
        estado: 'activa'
      });
      expect(result).toEqual(mockResumedSession);
    });
  });
});