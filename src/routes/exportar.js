const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = require('docx');
const path = require('path');
const fs = require('fs');

// Función auxiliar para calcular duración
function calcularDuracion(fechaInicio, fechaFin, tiempoPausadoMinutos = 0) {
    if (!fechaInicio || !fechaFin) return 'No disponible';
    
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    const diffMs = fin - inicio;
    
    // Restar tiempo pausado (convertir minutos a milisegundos)
    const diffAjustado = diffMs - (tiempoPausadoMinutos * 60 * 1000);
    
    const horas = Math.floor(diffAjustado / (1000 * 60 * 60));
    const minutos = Math.floor((diffAjustado % (1000 * 60 * 60)) / (1000 * 60));
    
    if (horas > 0) {
        return `${horas} hora${horas > 1 ? 's' : ''} ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    }
    return `${minutos} minuto${minutos !== 1 ? 's' : ''}`;
}

// Función para obtener todos los datos de la sesión
async function obtenerDatosSesion(db, sesionId) {
    return new Promise((resolve, reject) => {
        const datos = {
            sesion: null,
            iniciativas: [],
            votos: [],
            asistencia: [],
            diputados: [],
            pausas: []
        };

        // Obtener información de la sesión
        db.get(`
            SELECT s.*, 
                   u1.nombre_completo as iniciada_por_nombre,
                   u2.nombre_completo as clausurada_por_nombre
            FROM sesiones s
            LEFT JOIN usuarios u1 ON s.iniciada_por = u1.id
            LEFT JOIN usuarios u2 ON s.clausurada_por = u2.id
            WHERE s.id = ?
        `, [sesionId], (err, sesion) => {
            if (err) return reject(err);
            if (!sesion) return reject(new Error('Sesión no encontrada'));
            
            datos.sesion = sesion;
            
            // Obtener iniciativas y sus votos
            db.all(`
                SELECT i.*, 
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'favor') as votos_favor,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'contra') as votos_contra,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'abstencion') as votos_abstencion
                FROM iniciativas i
                WHERE i.sesion_id = ?
                ORDER BY i.numero
            `, [sesionId], (err, iniciativas) => {
                if (err) return reject(err);
                
                datos.iniciativas = iniciativas;
                
                // Obtener detalle de votos
                db.all(`
                    SELECT v.*, u.nombre_completo, u.partido, i.numero as numero_iniciativa, i.titulo
                    FROM votos v
                    JOIN usuarios u ON v.diputado_id = u.id
                    JOIN iniciativas i ON v.iniciativa_id = i.id
                    WHERE i.sesion_id = ?
                    ORDER BY i.numero, u.nombre_completo
                `, [sesionId], (err, votos) => {
                    if (err) return reject(err);
                    
                    datos.votos = votos;
                    
                    // Obtener asistencia
                    db.all(`
                        SELECT ad.*, u.nombre_completo, u.partido
                        FROM asistencia_diputados ad
                        JOIN usuarios u ON ad.diputado_id = u.id
                        JOIN pase_lista pl ON ad.pase_lista_id = pl.id
                        WHERE pl.sesion_id = ?
                        ORDER BY u.nombre_completo
                    `, [sesionId], (err, asistencia) => {
                        if (err) return reject(err);
                        
                        datos.asistencia = asistencia;
                        
                        // Obtener lista de diputados
                        db.all(`
                            SELECT * FROM usuarios 
                            WHERE role = 'diputado' 
                            ORDER BY nombre_completo
                        `, (err, diputados) => {
                            if (err) return reject(err);
                            
                            datos.diputados = diputados;
                            
                            // Obtener historial de pausas
                            db.all(`
                                SELECT ps.*, 
                                       u1.nombre_completo as pausada_por_nombre,
                                       u2.nombre_completo as reanudada_por_nombre
                                FROM pausas_sesion ps
                                LEFT JOIN usuarios u1 ON ps.pausada_por = u1.id
                                LEFT JOIN usuarios u2 ON ps.reanudada_por = u2.id
                                WHERE ps.sesion_id = ?
                                ORDER BY ps.fecha_pausa
                            `, [sesionId], (err, pausas) => {
                                if (err) {
                                    console.error('Error obteniendo pausas:', err);
                                    datos.pausas = [];
                                } else {
                                    datos.pausas = pausas || [];
                                }
                                resolve(datos);
                            });
                        });
                    });
                });
            });
        });
    });
}

// Exportar a Excel
router.get('/excel/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    try {
        const datos = await obtenerDatosSesion(db, sesionId);
        const workbook = new ExcelJS.Workbook();
        
        // Hoja 1: Resumen de Sesión
        const resumenSheet = workbook.addWorksheet('Resumen de Sesión');
        resumenSheet.columns = [
            { header: 'Campo', key: 'campo', width: 30 },
            { header: 'Valor', key: 'valor', width: 50 }
        ];
        
        // Calcular tiempo total pausado
        const tiempoPausadoMinutos = datos.pausas.reduce((total, pausa) => {
            return total + (pausa.duracion_minutos || 0);
        }, 0);
        
        const duracionTotal = calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura, 0);
        const duracionEfectiva = calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura, tiempoPausadoMinutos);
        
        resumenSheet.addRows([
            { campo: 'Código de Sesión', valor: datos.sesion.codigo_sesion },
            { campo: 'Nombre', valor: datos.sesion.nombre },
            { campo: 'Fecha', valor: new Date(datos.sesion.fecha).toLocaleDateString('es-MX') },
            { campo: 'Hora de Inicio', valor: datos.sesion.fecha_inicio ? new Date(datos.sesion.fecha_inicio).toLocaleTimeString('es-MX') : 'No iniciada' },
            { campo: 'Hora de Clausura', valor: datos.sesion.fecha_clausura ? new Date(datos.sesion.fecha_clausura).toLocaleTimeString('es-MX') : 'No clausurada' },
            { campo: 'Duración Total', valor: duracionTotal },
            { campo: 'Tiempo en Pausas', valor: tiempoPausadoMinutos > 0 ? `${tiempoPausadoMinutos} minutos` : 'Sin pausas' },
            { campo: 'Duración Efectiva', valor: duracionEfectiva },
            { campo: 'Número de Pausas', valor: datos.pausas.length },
            { campo: 'Iniciada por', valor: datos.sesion.iniciada_por_nombre || 'No especificado' },
            { campo: 'Clausurada por', valor: datos.sesion.clausurada_por_nombre || 'No clausurada' },
            { campo: 'Total de Iniciativas', valor: datos.iniciativas.length },
            { campo: 'Quórum Mínimo', valor: datos.sesion.quorum_minimo || 11 }
        ]);
        
        // Aplicar estilos al encabezado
        resumenSheet.getRow(1).font = { bold: true };
        resumenSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' }
        };
        
        // Hoja 2: Asistencia
        const asistenciaSheet = workbook.addWorksheet('Asistencia');
        asistenciaSheet.columns = [
            { header: 'Diputado', key: 'nombre', width: 35 },
            { header: 'Partido', key: 'partido', width: 15 },
            { header: 'Asistencia', key: 'asistencia', width: 15 },
            { header: 'Hora Registro', key: 'hora', width: 20 }
        ];
        
        const totalPresentes = datos.asistencia.filter(a => a.presente === 1).length;
        const totalAusentes = datos.diputados.length - totalPresentes;
        
        // Agregar resumen de asistencia
        asistenciaSheet.addRow({ nombre: 'RESUMEN DE ASISTENCIA', partido: '', asistencia: '', hora: '' });
        asistenciaSheet.addRow({ nombre: 'Total Presentes', partido: totalPresentes, asistencia: '', hora: '' });
        asistenciaSheet.addRow({ nombre: 'Total Ausentes', partido: totalAusentes, asistencia: '', hora: '' });
        asistenciaSheet.addRow({ nombre: '', partido: '', asistencia: '', hora: '' });
        
        // Agregar detalle de asistencia
        datos.diputados.forEach(diputado => {
            const asistencia = datos.asistencia.find(a => a.diputado_id === diputado.id);
            asistenciaSheet.addRow({
                nombre: diputado.nombre_completo,
                partido: diputado.partido,
                asistencia: asistencia ? (asistencia.presente ? 'PRESENTE' : 'AUSENTE') : 'SIN REGISTRO',
                hora: asistencia ? new Date(asistencia.hora_registro).toLocaleTimeString('es-MX') : ''
            });
        });
        
        asistenciaSheet.getRow(1).font = { bold: true };
        asistenciaSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '70AD47' }
        };
        
        // Hoja 3: Resultados de Votación
        const votacionSheet = workbook.addWorksheet('Resultados de Votación');
        votacionSheet.columns = [
            { header: 'No.', key: 'numero', width: 8 },
            { header: 'Iniciativa', key: 'titulo', width: 50 },
            { header: 'Presentador', key: 'presentador', width: 30 },
            { header: 'A Favor', key: 'favor', width: 12 },
            { header: 'En Contra', key: 'contra', width: 12 },
            { header: 'Abstención', key: 'abstencion', width: 12 },
            { header: 'Total', key: 'total', width: 12 },
            { header: 'Resultado', key: 'resultado', width: 15 }
        ];
        
        datos.iniciativas.forEach(iniciativa => {
            const total = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
            const aprobada = iniciativa.votos_favor > (total / 2);
            
            votacionSheet.addRow({
                numero: iniciativa.numero,
                titulo: iniciativa.titulo || iniciativa.descripcion,
                presentador: iniciativa.presentador,
                favor: iniciativa.votos_favor,
                contra: iniciativa.votos_contra,
                abstencion: iniciativa.votos_abstencion,
                total: total,
                resultado: aprobada ? 'APROBADA' : 'RECHAZADA'
            });
        });
        
        votacionSheet.getRow(1).font = { bold: true };
        votacionSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC000' }
        };
        
        // Hoja 4: Historial de Pausas
        if (datos.pausas && datos.pausas.length > 0) {
            const pausasSheet = workbook.addWorksheet('Historial de Pausas');
            pausasSheet.columns = [
                { header: 'No.', key: 'numero', width: 8 },
                { header: 'Fecha/Hora Pausa', key: 'fecha_pausa', width: 25 },
                { header: 'Fecha/Hora Reanudación', key: 'fecha_reanudacion', width: 25 },
                { header: 'Duración (min)', key: 'duracion', width: 15 },
                { header: 'Pausada por', key: 'pausada_por', width: 30 },
                { header: 'Reanudada por', key: 'reanudada_por', width: 30 },
                { header: 'Motivo', key: 'motivo', width: 40 }
            ];
            
            datos.pausas.forEach((pausa, index) => {
                pausasSheet.addRow({
                    numero: index + 1,
                    fecha_pausa: pausa.fecha_pausa ? new Date(pausa.fecha_pausa).toLocaleString('es-MX') : '',
                    fecha_reanudacion: pausa.fecha_reanudacion ? new Date(pausa.fecha_reanudacion).toLocaleString('es-MX') : 'En pausa',
                    duracion: pausa.duracion_minutos || 'En curso',
                    pausada_por: pausa.pausada_por_nombre || 'Sistema',
                    reanudada_por: pausa.reanudada_por_nombre || '-',
                    motivo: pausa.motivo || 'No especificado'
                });
            });
            
            // Aplicar estilos
            pausasSheet.getRow(1).font = { bold: true };
            pausasSheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD966' }
            };
        }
        
        // Hoja 5: Detalle de Votos
        const detalleSheet = workbook.addWorksheet('Detalle de Votos');
        detalleSheet.columns = [
            { header: 'Iniciativa', key: 'iniciativa', width: 10 },
            { header: 'Título', key: 'titulo', width: 40 },
            { header: 'Diputado', key: 'diputado', width: 35 },
            { header: 'Partido', key: 'partido', width: 15 },
            { header: 'Voto', key: 'voto', width: 15 },
            { header: 'Hora', key: 'hora', width: 20 }
        ];
        
        datos.votos.forEach(voto => {
            detalleSheet.addRow({
                iniciativa: voto.numero_iniciativa,
                titulo: voto.titulo,
                diputado: voto.nombre_completo,
                partido: voto.partido,
                voto: voto.voto.toUpperCase(),
                hora: new Date(voto.fecha_voto).toLocaleTimeString('es-MX')
            });
        });
        
        detalleSheet.getRow(1).font = { bold: true };
        detalleSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0000' }
        };
        
        // Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `sesion_${datos.sesion.codigo_sesion}_${Date.now()}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        
    } catch (error) {
        console.error('Error generando Excel:', error);
        res.status(500).json({ error: 'Error generando archivo Excel' });
    }
});

// Exportar a PDF
router.get('/pdf/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    try {
        const datos = await obtenerDatosSesion(db, sesionId);
        const doc = new PDFDocument({ margin: 50 });
        const filename = `sesion_${datos.sesion.codigo_sesion}_${Date.now()}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        doc.pipe(res);
        
        // Título principal
        doc.fontSize(20).text('CONGRESO DEL ESTADO DE MORELOS', { align: 'center' });
        doc.fontSize(16).text('REPORTE DE SESIÓN LEGISLATIVA', { align: 'center' });
        doc.moveDown();
        
        // Información de la sesión
        doc.fontSize(14).text('INFORMACIÓN GENERAL', { underline: true });
        doc.fontSize(12);
        doc.text(`Código de Sesión: ${datos.sesion.codigo_sesion}`);
        doc.text(`Nombre: ${datos.sesion.nombre}`);
        doc.text(`Fecha: ${new Date(datos.sesion.fecha).toLocaleDateString('es-MX')}`);
        doc.text(`Hora de Inicio: ${datos.sesion.fecha_inicio ? new Date(datos.sesion.fecha_inicio).toLocaleTimeString('es-MX') : 'No iniciada'}`);
        doc.text(`Hora de Clausura: ${datos.sesion.fecha_clausura ? new Date(datos.sesion.fecha_clausura).toLocaleTimeString('es-MX') : 'No clausurada'}`);
        doc.text(`Duración: ${calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura)}`);
        doc.moveDown();
        
        // Asistencia
        doc.fontSize(14).text('ASISTENCIA', { underline: true });
        doc.fontSize(12);
        const totalPresentes = datos.asistencia.filter(a => a.presente === 1).length;
        const totalAusentes = datos.diputados.length - totalPresentes;
        doc.text(`Total Presentes: ${totalPresentes}`);
        doc.text(`Total Ausentes: ${totalAusentes}`);
        doc.text(`Quórum: ${totalPresentes >= (datos.sesion.quorum_minimo || 11) ? 'SÍ' : 'NO'}`);
        doc.moveDown();
        
        // Resultados de votación
        doc.addPage();
        doc.fontSize(14).text('RESULTADOS DE VOTACIÓN', { underline: true });
        doc.fontSize(10);
        
        datos.iniciativas.forEach((iniciativa, index) => {
            if (index > 0 && index % 3 === 0) doc.addPage();
            
            const total = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
            const aprobada = iniciativa.votos_favor > (total / 2);
            
            doc.fontSize(12).text(`Iniciativa #${iniciativa.numero}`, { underline: true });
            doc.fontSize(10);
            doc.text(`Título: ${iniciativa.titulo || iniciativa.descripcion}`);
            doc.text(`Presentador: ${iniciativa.presentador}`);
            doc.text(`A Favor: ${iniciativa.votos_favor}`);
            doc.text(`En Contra: ${iniciativa.votos_contra}`);
            doc.text(`Abstención: ${iniciativa.votos_abstencion}`);
            doc.text(`Resultado: ${aprobada ? 'APROBADA' : 'RECHAZADA'}`, { 
                underline: true,
                color: aprobada ? 'green' : 'red'
            });
            doc.moveDown();
        });
        
        // Pie de página
        doc.fontSize(8);
        doc.text(`Generado el ${new Date().toLocaleString('es-MX')}`, 50, doc.page.height - 50, {
            align: 'center'
        });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        res.status(500).json({ error: 'Error generando archivo PDF' });
    }
});

// Exportar a Word
router.get('/word/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    try {
        const datos = await obtenerDatosSesion(db, sesionId);
        
        // Crear documento
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    // Título
                    new Paragraph({
                        text: "CONGRESO DEL ESTADO DE MORELOS",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER
                    }),
                    new Paragraph({
                        text: "REPORTE DE SESIÓN LEGISLATIVA",
                        heading: HeadingLevel.HEADING_2,
                        alignment: AlignmentType.CENTER
                    }),
                    new Paragraph({ text: "" }),
                    
                    // Información general
                    new Paragraph({
                        text: "INFORMACIÓN GENERAL",
                        heading: HeadingLevel.HEADING_3
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Código de Sesión: ", bold: true }),
                            new TextRun(datos.sesion.codigo_sesion)
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Nombre: ", bold: true }),
                            new TextRun(datos.sesion.nombre)
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Fecha: ", bold: true }),
                            new TextRun(new Date(datos.sesion.fecha).toLocaleDateString('es-MX'))
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Duración: ", bold: true }),
                            new TextRun(calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura))
                        ]
                    }),
                    new Paragraph({ text: "" }),
                    
                    // Asistencia
                    new Paragraph({
                        text: "RESUMEN DE ASISTENCIA",
                        heading: HeadingLevel.HEADING_3
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Total Presentes: ", bold: true }),
                            new TextRun(datos.asistencia.filter(a => a.presente === 1).length.toString())
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Total Ausentes: ", bold: true }),
                            new TextRun((datos.diputados.length - datos.asistencia.filter(a => a.presente === 1).length).toString())
                        ]
                    }),
                    new Paragraph({ text: "" }),
                    
                    // Resultados de votación
                    new Paragraph({
                        text: "RESULTADOS DE VOTACIÓN",
                        heading: HeadingLevel.HEADING_3
                    })
                ]
            }]
        });
        
        // Agregar tabla de votaciones
        const tableRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: "No.", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Iniciativa", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "A Favor", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "En Contra", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Abstención", bold: true })] }),
                    new TableCell({ children: [new Paragraph({ text: "Resultado", bold: true })] })
                ]
            })
        ];
        
        datos.iniciativas.forEach(iniciativa => {
            const total = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
            const aprobada = iniciativa.votos_favor > (total / 2);
            
            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph(iniciativa.numero.toString())] }),
                        new TableCell({ children: [new Paragraph(iniciativa.titulo || iniciativa.descripcion || '')] }),
                        new TableCell({ children: [new Paragraph(iniciativa.votos_favor.toString())] }),
                        new TableCell({ children: [new Paragraph(iniciativa.votos_contra.toString())] }),
                        new TableCell({ children: [new Paragraph(iniciativa.votos_abstencion.toString())] }),
                        new TableCell({ children: [new Paragraph(aprobada ? "APROBADA" : "RECHAZADA")] })
                    ]
                })
            );
        });
        
        const table = new Table({
            rows: tableRows,
            width: {
                size: 100,
                type: WidthType.PERCENTAGE
            }
        });
        
        doc.addSection({
            children: [table]
        });
        
        // Generar archivo
        const buffer = await Packer.toBuffer(doc);
        const filename = `sesion_${datos.sesion.codigo_sesion}_${Date.now()}.docx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        
    } catch (error) {
        console.error('Error generando Word:', error);
        res.status(500).json({ error: 'Error generando archivo Word' });
    }
});

module.exports = router;