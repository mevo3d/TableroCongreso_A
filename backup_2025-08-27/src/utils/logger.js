const EventEmitter = require('events');

class Logger extends EventEmitter {
    constructor() {
        super();
        this.logs = [];
        this.maxLogs = 1000;
        this.interceptConsole();
    }

    interceptConsole() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;

        console.log = (...args) => {
            this.addLog('log', args);
            originalLog.apply(console, args);
        };

        console.error = (...args) => {
            this.addLog('error', args);
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            this.addLog('warn', args);
            originalWarn.apply(console, args);
        };

        console.info = (...args) => {
            this.addLog('info', args);
            originalInfo.apply(console, args);
        };

        console.debug = (...args) => {
            this.addLog('debug', args);
            originalDebug.apply(console, args);
        };
    }

    addLog(type, args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        const logEntry = {
            timestamp,
            type,
            message,
            id: Date.now() + Math.random()
        };

        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.emit('newLog', logEntry);
    }

    getLogs(limit = 100) {
        return this.logs.slice(-limit);
    }

    clearLogs() {
        this.logs = [];
        this.emit('logsCleared');
    }
}

module.exports = new Logger();