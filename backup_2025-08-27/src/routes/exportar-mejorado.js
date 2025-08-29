const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, Header, Footer, PageNumber, ImageRun, BorderStyle } = require('docx');
const path = require('path');
const fs = require('fs');

// Función auxiliar para calcular duración
function calcularDuracion(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin) return 'No disponible';
    
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    const diff = fin - inicio;
    
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
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
            diputados: []
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
                            resolve(datos);
                        });
                    });
                });
            });
        });
    });
}

// Exportar a Excel mejorado
router.get('/excel/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    try {
        const datos = await obtenerDatosSesion(db, sesionId);
        const workbook = new ExcelJS.Workbook();
        
        // Propiedades del documento
        workbook.creator = 'Congreso del Estado de Morelos';
        workbook.lastModifiedBy = 'Sistema de Votación Legislativa';
        workbook.created = new Date();
        workbook.modified = new Date();
        
        // Hoja 1: Resumen de Sesión con diseño mejorado
        const resumenSheet = workbook.addWorksheet('Resumen de Sesión');
        
        // Configurar anchos de columna
        resumenSheet.columns = [
            { width: 5 },
            { width: 35 },
            { width: 55 },
            { width: 5 }
        ];
        
        // Agregar título con logo (simulado con texto estilizado)
        resumenSheet.mergeCells('B2:C2');
        const titleRow = resumenSheet.getRow(2);
        titleRow.getCell(2).value = 'CONGRESO DEL ESTADO DE MORELOS';
        titleRow.getCell(2).font = { name: 'Arial', size: 18, bold: true, color: { argb: '002060' } };
        titleRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        
        resumenSheet.mergeCells('B3:C3');
        const subtitleRow = resumenSheet.getRow(3);
        subtitleRow.getCell(2).value = 'LVI LEGISLATURA';
        subtitleRow.getCell(2).font = { name: 'Arial', size: 14, color: { argb: '002060' } };
        subtitleRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        
        resumenSheet.mergeCells('B5:C5');
        const docTitleRow = resumenSheet.getRow(5);
        docTitleRow.getCell(2).value = 'ACTA DE SESIÓN LEGISLATIVA';
        docTitleRow.getCell(2).font = { name: 'Arial', size: 16, bold: true };
        docTitleRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        docTitleRow.getCell(2).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E7E6E6' }
        };
        docTitleRow.height = 25;
        
        // Línea divisoria
        resumenSheet.getRow(7);
        
        // Información de la sesión con formato mejorado
        const duracion = calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura);
        
        const infoData = [
            ['INFORMACIÓN GENERAL DE LA SESIÓN', ''],
            ['Código de Sesión:', datos.sesion.codigo_sesion],
            ['Tipo de Sesión:', datos.sesion.nombre],
            ['Fecha:', new Date(datos.sesion.fecha).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
            ['Hora de Inicio:', datos.sesion.fecha_inicio ? new Date(datos.sesion.fecha_inicio).toLocaleTimeString('es-MX') : 'No iniciada'],
            ['Hora de Clausura:', datos.sesion.fecha_clausura ? new Date(datos.sesion.fecha_clausura).toLocaleTimeString('es-MX') : 'No clausurada'],
            ['Duración Total:', duracion],
            ['', ''],
            ['AUTORIDADES DE LA SESIÓN', ''],
            ['Presidente de la Mesa Directiva:', datos.sesion.iniciada_por_nombre || 'Por designar'],
            ['Secretario(a):', datos.sesion.clausurada_por_nombre || 'Por designar'],
            ['', ''],
            ['ESTADÍSTICAS DE LA SESIÓN', ''],
            ['Total de Iniciativas Presentadas:', datos.iniciativas.length],
            ['Quórum Requerido:', datos.sesion.quorum_minimo || 11],
            ['Diputados Presentes:', datos.asistencia.filter(a => a.presente === 1).length],
            ['Diputados Ausentes:', datos.diputados.length - datos.asistencia.filter(a => a.presente === 1).length]
        ];
        
        let currentRow = 9;
        infoData.forEach((row, index) => {
            const excelRow = resumenSheet.getRow(currentRow + index);
            excelRow.getCell(2).value = row[0];
            excelRow.getCell(3).value = row[1];
            
            // Estilos para encabezados de sección
            if (row[0].includes('INFORMACIÓN') || row[0].includes('AUTORIDADES') || row[0].includes('ESTADÍSTICAS')) {
                resumenSheet.mergeCells(`B${currentRow + index}:C${currentRow + index}`);
                excelRow.getCell(2).font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFF' } };
                excelRow.getCell(2).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: '4472C4' }
                };
                excelRow.getCell(2).alignment = { horizontal: 'center' };
            } else if (row[0] !== '') {
                excelRow.getCell(2).font = { name: 'Arial', size: 11, bold: true };
                excelRow.getCell(3).font = { name: 'Arial', size: 11 };
            }
        });
        
        // Hoja 2: Asistencia mejorada
        const asistenciaSheet = workbook.addWorksheet('Control de Asistencia');
        
        // Título de la hoja
        asistenciaSheet.mergeCells('A1:E1');
        asistenciaSheet.getRow(1).getCell(1).value = 'CONTROL DE ASISTENCIA';
        asistenciaSheet.getRow(1).getCell(1).font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
        asistenciaSheet.getRow(1).getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '70AD47' }
        };
        asistenciaSheet.getRow(1).getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        asistenciaSheet.getRow(1).height = 30;
        
        // Resumen de asistencia
        const totalPresentes = datos.asistencia.filter(a => a.presente === 1).length;
        const totalAusentes = datos.diputados.length - totalPresentes;
        const hayQuorum = totalPresentes >= (datos.sesion.quorum_minimo || 11);
        
        asistenciaSheet.getRow(3).getCell(1).value = 'RESUMEN:';
        asistenciaSheet.getRow(3).getCell(1).font = { bold: true };
        asistenciaSheet.getRow(3).getCell(2).value = `Presentes: ${totalPresentes}`;
        asistenciaSheet.getRow(3).getCell(3).value = `Ausentes: ${totalAusentes}`;
        asistenciaSheet.getRow(3).getCell(4).value = `Quórum: ${hayQuorum ? 'SÍ' : 'NO'}`;
        asistenciaSheet.getRow(3).getCell(4).font = { bold: true, color: { argb: hayQuorum ? '008000' : 'FF0000' } };
        
        // Encabezados de tabla
        asistenciaSheet.columns = [
            { header: 'No.', key: 'no', width: 8 },
            { header: 'Nombre del Diputado', key: 'nombre', width: 40 },
            { header: 'Grupo Parlamentario', key: 'partido', width: 20 },
            { header: 'Asistencia', key: 'asistencia', width: 15 },
            { header: 'Hora de Registro', key: 'hora', width: 20 }
        ];
        
        // Agregar datos con formato alternado
        datos.diputados.forEach((diputado, index) => {
            const asistencia = datos.asistencia.find(a => a.diputado_id === diputado.id);
            const row = asistenciaSheet.addRow({
                no: index + 1,
                nombre: diputado.nombre_completo,
                partido: diputado.partido,
                asistencia: asistencia ? (asistencia.presente ? 'PRESENTE' : 'AUSENTE') : 'SIN REGISTRO',
                hora: asistencia && asistencia.presente ? new Date(asistencia.hora_registro).toLocaleTimeString('es-MX') : '-'
            });
            
            // Alternar colores de fila
            if (index % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F2F2F2' }
                };
            }
            
            // Color para estado de asistencia
            if (asistencia && asistencia.presente) {
                row.getCell('asistencia').font = { color: { argb: '008000' } };
            } else {
                row.getCell('asistencia').font = { color: { argb: 'FF0000' } };
            }
        });
        
        // Estilo de encabezados
        asistenciaSheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFF' } };
        asistenciaSheet.getRow(5).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '70AD47' }
        };
        
        // Hoja 3: Resultados de Votación mejorados
        const votacionSheet = workbook.addWorksheet('Resultados de Votación');
        
        // Título
        votacionSheet.mergeCells('A1:I1');
        votacionSheet.getRow(1).getCell(1).value = 'RESULTADOS DE VOTACIÓN';
        votacionSheet.getRow(1).getCell(1).font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
        votacionSheet.getRow(1).getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C65911' }
        };
        votacionSheet.getRow(1).getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        votacionSheet.getRow(1).height = 30;
        
        // Configurar columnas
        votacionSheet.columns = [
            { header: 'No.', key: 'numero', width: 8 },
            { header: 'Tipo de Iniciativa', key: 'tipo', width: 20 },
            { header: 'Título/Descripción', key: 'titulo', width: 50 },
            { header: 'Presentador', key: 'presentador', width: 30 },
            { header: 'A Favor', key: 'favor', width: 12 },
            { header: 'En Contra', key: 'contra', width: 12 },
            { header: 'Abstención', key: 'abstencion', width: 12 },
            { header: 'Total', key: 'total', width: 10 },
            { header: 'Resultado', key: 'resultado', width: 15 }
        ];
        
        // Agregar datos de votación con formato
        datos.iniciativas.forEach((iniciativa, index) => {
            const total = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
            const aprobada = iniciativa.votos_favor > (total / 2);
            
            const row = votacionSheet.addRow({
                numero: iniciativa.numero,
                tipo: iniciativa.tipo_iniciativa || 'Dictamen',
                titulo: iniciativa.titulo || iniciativa.descripcion,
                presentador: iniciativa.presentador || 'Comisión',
                favor: iniciativa.votos_favor,
                contra: iniciativa.votos_contra,
                abstencion: iniciativa.votos_abstencion,
                total: total,
                resultado: aprobada ? 'APROBADA' : 'RECHAZADA'
            });
            
            // Alternar colores
            if (index % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F2F2F2' }
                };
            }
            
            // Color del resultado
            row.getCell('resultado').font = { 
                bold: true, 
                color: { argb: aprobada ? '008000' : 'FF0000' } 
            };
            
            // Resaltar votaciones unánimes
            if (iniciativa.votos_contra === 0 && iniciativa.votos_abstencion === 0) {
                row.getCell('resultado').fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'E8F5E9' }
                };
            }
        });
        
        // Estilo de encabezados
        votacionSheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFF' } };
        votacionSheet.getRow(3).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C65911' }
        };
        
        // Agregar pie de página con fecha de generación
        const footerRow = votacionSheet.lastRow.number + 3;
        votacionSheet.getRow(footerRow).getCell(1).value = `Documento generado el ${new Date().toLocaleString('es-MX')}`;
        votacionSheet.getRow(footerRow).getCell(1).font = { italic: true, size: 9 };
        
        // Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `Acta_Sesion_${datos.sesion.codigo_sesion}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        
    } catch (error) {
        console.error('Error generando Excel:', error);
        res.status(500).json({ error: 'Error generando archivo Excel' });
    }
});

// Exportar a PDF mejorado
router.get('/pdf/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    try {
        const datos = await obtenerDatosSesion(db, sesionId);
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'LETTER',
            info: {
                Title: `Acta de Sesión ${datos.sesion.codigo_sesion}`,
                Author: 'Congreso del Estado de Morelos',
                Subject: 'Acta de Sesión Legislativa',
                Keywords: 'sesión, votación, legislatura'
            }
        });
        
        const filename = `Acta_Sesion_${datos.sesion.codigo_sesion}_${new Date().toISOString().split('T')[0]}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        doc.pipe(res);
        
        // Función helper para agregar línea divisoria
        const addDivider = () => {
            doc.moveTo(50, doc.y)
               .lineTo(doc.page.width - 50, doc.y)
               .stroke('#CCCCCC');
            doc.moveDown(0.5);
        };
        
        // Encabezado con logo (simulado con texto)
        doc.fontSize(10).fillColor('#666666').text('LVI LEGISLATURA', 50, 50, { align: 'right' });
        
        // Escudo y título principal
        doc.fontSize(24).fillColor('#002060').text('CONGRESO DEL ESTADO', { align: 'center' });
        doc.fontSize(20).text('DE MORELOS', { align: 'center' });
        doc.moveDown();
        
        addDivider();
        
        // Título del documento
        doc.fontSize(18).fillColor('#000000').text('ACTA DE SESIÓN LEGISLATIVA', { align: 'center' });
        doc.moveDown(2);
        
        // Información general de la sesión
        doc.fontSize(14).fillColor('#002060').text('I. INFORMACIÓN GENERAL', { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(11).fillColor('#000000');
        const fechaCompleta = new Date(datos.sesion.fecha).toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        doc.font('Helvetica-Bold').text('Código de Sesión: ', { continued: true })
           .font('Helvetica').text(datos.sesion.codigo_sesion);
        doc.font('Helvetica-Bold').text('Tipo de Sesión: ', { continued: true })
           .font('Helvetica').text(datos.sesion.nombre);
        doc.font('Helvetica-Bold').text('Fecha: ', { continued: true })
           .font('Helvetica').text(fechaCompleta);
        doc.font('Helvetica-Bold').text('Hora de Apertura: ', { continued: true })
           .font('Helvetica').text(datos.sesion.fecha_inicio ? new Date(datos.sesion.fecha_inicio).toLocaleTimeString('es-MX') : 'Por iniciar');
        doc.font('Helvetica-Bold').text('Hora de Clausura: ', { continued: true })
           .font('Helvetica').text(datos.sesion.fecha_clausura ? new Date(datos.sesion.fecha_clausura).toLocaleTimeString('es-MX') : 'En curso');
        doc.font('Helvetica-Bold').text('Duración Total: ', { continued: true })
           .font('Helvetica').text(calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura));
        
        doc.moveDown();
        
        // Mesa Directiva
        doc.fontSize(14).fillColor('#002060').text('II. MESA DIRECTIVA', { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(11).fillColor('#000000');
        doc.font('Helvetica-Bold').text('Presidente: ', { continued: true })
           .font('Helvetica').text(datos.sesion.iniciada_por_nombre || 'Por designar');
        doc.font('Helvetica-Bold').text('Secretario(a): ', { continued: true })
           .font('Helvetica').text(datos.sesion.clausurada_por_nombre || 'Por designar');
        
        doc.moveDown();
        
        // Control de Asistencia
        doc.fontSize(14).fillColor('#002060').text('III. CONTROL DE ASISTENCIA', { underline: true });
        doc.moveDown(0.5);
        
        const totalPresentes = datos.asistencia.filter(a => a.presente === 1).length;
        const totalAusentes = datos.diputados.length - totalPresentes;
        const hayQuorum = totalPresentes >= (datos.sesion.quorum_minimo || 11);
        
        doc.fontSize(11).fillColor('#000000');
        
        // Cuadro de resumen de asistencia
        doc.rect(doc.x, doc.y, 200, 60).stroke();
        doc.text('', doc.x + 10, doc.y + 10);
        doc.font('Helvetica-Bold').text('Total de Diputados: ', { continued: true })
           .font('Helvetica').text(datos.diputados.length.toString());
        doc.font('Helvetica-Bold').text('Presentes: ', { continued: true })
           .font('Helvetica').fillColor('#008000').text(totalPresentes.toString());
        doc.fillColor('#000000');
        doc.font('Helvetica-Bold').text('Ausentes: ', { continued: true })
           .font('Helvetica').fillColor('#FF0000').text(totalAusentes.toString());
        doc.fillColor('#000000');
        doc.font('Helvetica-Bold').text('Declaración de Quórum: ', { continued: true })
           .font('Helvetica').fillColor(hayQuorum ? '#008000' : '#FF0000')
           .text(hayQuorum ? 'EXISTE QUÓRUM LEGAL' : 'NO HAY QUÓRUM');
        
        doc.fillColor('#000000');
        doc.moveDown(2);
        
        // Nueva página para resultados de votación
        doc.addPage();
        
        // Resultados de votación
        doc.fontSize(14).fillColor('#002060').text('IV. ORDEN DEL DÍA Y VOTACIONES', { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(10).fillColor('#000000');
        
        // Tabla de votaciones
        datos.iniciativas.forEach((iniciativa, index) => {
            // Nueva página cada 3 iniciativas para mejor legibilidad
            if (index > 0 && index % 3 === 0) {
                doc.addPage();
            }
            
            const total = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
            const aprobada = iniciativa.votos_favor > (total / 2);
            const porcentajeFavor = total > 0 ? ((iniciativa.votos_favor / total) * 100).toFixed(1) : 0;
            
            // Cuadro para cada iniciativa
            doc.fontSize(11).font('Helvetica-Bold')
               .fillColor('#002060')
               .text(`${iniciativa.numero}. ${iniciativa.tipo_iniciativa || 'DICTAMEN'}`, { underline: false });
            
            doc.fontSize(10).font('Helvetica').fillColor('#000000');
            doc.text(`Título: ${iniciativa.titulo || iniciativa.descripcion}`, { indent: 20 });
            doc.text(`Presentado por: ${iniciativa.presentador || 'Comisión correspondiente'}`, { indent: 20 });
            
            // Cuadro de votación
            const startY = doc.y + 5;
            doc.rect(70, startY, 400, 40).stroke();
            
            doc.text('', 80, startY + 10);
            doc.font('Helvetica').text(`A FAVOR: ${iniciativa.votos_favor}`, 80, startY + 10);
            doc.text(`EN CONTRA: ${iniciativa.votos_contra}`, 200, startY + 10);
            doc.text(`ABSTENCIÓN: ${iniciativa.votos_abstencion}`, 320, startY + 10);
            
            doc.font('Helvetica-Bold').fontSize(11);
            doc.fillColor(aprobada ? '#008000' : '#FF0000');
            doc.text(`RESULTADO: ${aprobada ? 'APROBADA' : 'RECHAZADA'} (${porcentajeFavor}% a favor)`, 80, startY + 25);
            
            doc.fillColor('#000000').font('Helvetica').fontSize(10);
            doc.moveDown(3);
        });
        
        // Página de firmas
        doc.addPage();
        
        doc.fontSize(14).fillColor('#002060').text('V. CIERRE Y FIRMAS', { underline: true });
        doc.moveDown(2);
        
        doc.fontSize(10).fillColor('#000000');
        doc.text('En cumplimiento de lo dispuesto por la normatividad aplicable, se levanta la presente acta para constancia de los acuerdos tomados en esta sesión.', { align: 'justify' });
        doc.moveDown(4);
        
        // Espacios para firmas
        const firmaY = doc.y;
        
        // Firma del Presidente
        doc.text('_'.repeat(40), 100, firmaY);
        doc.font('Helvetica-Bold').text('PRESIDENTE DE LA MESA DIRECTIVA', 100, firmaY + 15, { width: 200, align: 'center' });
        doc.font('Helvetica').text(datos.sesion.iniciada_por_nombre || 'Por designar', 100, firmaY + 30, { width: 200, align: 'center' });
        
        // Firma del Secretario
        doc.text('_'.repeat(40), 350, firmaY);
        doc.font('Helvetica-Bold').text('SECRETARIO(A)', 350, firmaY + 15, { width: 200, align: 'center' });
        doc.font('Helvetica').text(datos.sesion.clausurada_por_nombre || 'Por designar', 350, firmaY + 30, { width: 200, align: 'center' });
        
        // Pie de página
        doc.fontSize(8).fillColor('#666666');
        doc.text(`Documento generado el ${new Date().toLocaleString('es-MX')}`, 50, doc.page.height - 50, {
            align: 'center',
            width: doc.page.width - 100
        });
        doc.text('Sistema de Votación Electrónica - Congreso del Estado de Morelos', 50, doc.page.height - 35, {
            align: 'center',
            width: doc.page.width - 100
        });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        res.status(500).json({ error: 'Error generando archivo PDF' });
    }
});

// Exportar a Word mejorado
router.get('/word/:sesionId', async (req, res) => {
    const { sesionId } = req.params;
    const db = req.db;
    
    try {
        const datos = await obtenerDatosSesion(db, sesionId);
        
        // Preparar datos
        const fechaCompleta = new Date(datos.sesion.fecha).toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const totalPresentes = datos.asistencia.filter(a => a.presente === 1).length;
        const totalAusentes = datos.diputados.length - totalPresentes;
        const hayQuorum = totalPresentes >= (datos.sesion.quorum_minimo || 11);
        
        // Crear documento
        const doc = new Document({
            creator: "Sistema de Votación Legislativa",
            title: `Acta de Sesión ${datos.sesion.codigo_sesion}`,
            description: "Acta oficial de sesión legislativa",
            styles: {
                default: {
                    heading1: {
                        run: {
                            size: 32,
                            bold: true,
                            color: "002060"
                        },
                        paragraph: {
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 200 }
                        }
                    },
                    heading2: {
                        run: {
                            size: 28,
                            bold: true,
                            color: "002060"
                        },
                        paragraph: {
                            alignment: AlignmentType.LEFT,
                            spacing: { before: 240, after: 120 }
                        }
                    },
                    heading3: {
                        run: {
                            size: 24,
                            bold: true,
                            color: "1F4788"
                        },
                        paragraph: {
                            spacing: { before: 240, after: 120 }
                        }
                    }
                }
            },
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440,
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "CONGRESO DEL ESTADO DE MORELOS",
                                        bold: true,
                                        size: 20
                                    })
                                ],
                                alignment: AlignmentType.CENTER
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "LVI LEGISLATURA",
                                        size: 16
                                    })
                                ],
                                alignment: AlignmentType.CENTER
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "Página ",
                                        size: 16
                                    }),
                                    new TextRun({
                                        children: [PageNumber.CURRENT],
                                        size: 16
                                    }),
                                    new TextRun({
                                        text: " de ",
                                        size: 16
                                    }),
                                    new TextRun({
                                        children: [PageNumber.TOTAL_PAGES],
                                        size: 16
                                    })
                                ],
                                alignment: AlignmentType.CENTER
                            })
                        ]
                    })
                },
                children: [
                    // Título principal
                    new Paragraph({
                        text: "ACTA DE SESIÓN LEGISLATIVA",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),
                    
                    // Sección I: Información General
                    new Paragraph({
                        text: "I. INFORMACIÓN GENERAL",
                        heading: HeadingLevel.HEADING_2
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Código de Sesión: ", bold: true, size: 24 }),
                            new TextRun({ text: datos.sesion.codigo_sesion, size: 24 })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Tipo de Sesión: ", bold: true, size: 24 }),
                            new TextRun({ text: datos.sesion.nombre, size: 24 })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Fecha: ", bold: true, size: 24 }),
                            new TextRun({ text: fechaCompleta, size: 24 })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Hora de Apertura: ", bold: true, size: 24 }),
                            new TextRun({ 
                                text: datos.sesion.fecha_inicio ? 
                                    new Date(datos.sesion.fecha_inicio).toLocaleTimeString('es-MX') : 
                                    'Por iniciar',
                                size: 24 
                            })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Hora de Clausura: ", bold: true, size: 24 }),
                            new TextRun({ 
                                text: datos.sesion.fecha_clausura ? 
                                    new Date(datos.sesion.fecha_clausura).toLocaleTimeString('es-MX') : 
                                    'En curso',
                                size: 24 
                            })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Duración Total: ", bold: true, size: 24 }),
                            new TextRun({ 
                                text: calcularDuracion(datos.sesion.fecha_inicio, datos.sesion.fecha_clausura),
                                size: 24 
                            })
                        ],
                        spacing: { after: 400 }
                    }),
                    
                    // Sección II: Mesa Directiva
                    new Paragraph({
                        text: "II. MESA DIRECTIVA",
                        heading: HeadingLevel.HEADING_2
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Presidente de la Mesa Directiva: ", bold: true, size: 24 }),
                            new TextRun({ text: datos.sesion.iniciada_por_nombre || 'Por designar', size: 24 })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Secretario(a): ", bold: true, size: 24 }),
                            new TextRun({ text: datos.sesion.clausurada_por_nombre || 'Por designar', size: 24 })
                        ],
                        spacing: { after: 400 }
                    }),
                    
                    // Sección III: Control de Asistencia
                    new Paragraph({
                        text: "III. CONTROL DE ASISTENCIA",
                        heading: HeadingLevel.HEADING_2
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Total de Diputados: ", bold: true, size: 24 }),
                            new TextRun({ text: datos.diputados.length.toString(), size: 24 })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Diputados Presentes: ", bold: true, size: 24 }),
                            new TextRun({ text: totalPresentes.toString(), size: 24, color: "008000" })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Diputados Ausentes: ", bold: true, size: 24 }),
                            new TextRun({ text: totalAusentes.toString(), size: 24, color: "FF0000" })
                        ],
                        spacing: { after: 120 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Declaración de Quórum: ", bold: true, size: 24 }),
                            new TextRun({ 
                                text: hayQuorum ? "EXISTE QUÓRUM LEGAL" : "NO HAY QUÓRUM",
                                size: 24,
                                bold: true,
                                color: hayQuorum ? "008000" : "FF0000"
                            })
                        ],
                        spacing: { after: 400 }
                    }),
                    
                    // Sección IV: Orden del Día y Votaciones
                    new Paragraph({
                        text: "IV. ORDEN DEL DÍA Y VOTACIONES",
                        heading: HeadingLevel.HEADING_2,
                        pageBreakBefore: true
                    }),
                    
                    // Tabla de votaciones
                    new Table({
                        width: {
                            size: 100,
                            type: WidthType.PERCENTAGE
                        },
                        rows: [
                            new TableRow({
                                tableHeader: true,
                                children: [
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "No.", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 8, type: WidthType.PERCENTAGE }
                                    }),
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "Tipo", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 15, type: WidthType.PERCENTAGE }
                                    }),
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "Título/Descripción", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 35, type: WidthType.PERCENTAGE }
                                    }),
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "A Favor", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 10, type: WidthType.PERCENTAGE }
                                    }),
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "En Contra", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 10, type: WidthType.PERCENTAGE }
                                    }),
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "Abstención", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 10, type: WidthType.PERCENTAGE }
                                    }),
                                    new TableCell({
                                        children: [new Paragraph({ 
                                            text: "Resultado", 
                                            alignment: AlignmentType.CENTER,
                                            style: "tableHeader"
                                        })],
                                        shading: { fill: "4472C4" },
                                        width: { size: 12, type: WidthType.PERCENTAGE }
                                    })
                                ]
                            }),
                            ...datos.iniciativas.map((iniciativa, index) => {
                                const total = iniciativa.votos_favor + iniciativa.votos_contra + iniciativa.votos_abstencion;
                                const aprobada = iniciativa.votos_favor > (total / 2);
                                
                                return new TableRow({
                                    children: [
                                        new TableCell({
                                            children: [new Paragraph({ 
                                                text: iniciativa.numero.toString(),
                                                alignment: AlignmentType.CENTER
                                            })],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        }),
                                        new TableCell({
                                            children: [new Paragraph({ 
                                                text: iniciativa.tipo_iniciativa || "Dictamen",
                                                alignment: AlignmentType.CENTER
                                            })],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        }),
                                        new TableCell({
                                            children: [new Paragraph(iniciativa.titulo || iniciativa.descripcion || "")],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        }),
                                        new TableCell({
                                            children: [new Paragraph({ 
                                                text: iniciativa.votos_favor.toString(),
                                                alignment: AlignmentType.CENTER
                                            })],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        }),
                                        new TableCell({
                                            children: [new Paragraph({ 
                                                text: iniciativa.votos_contra.toString(),
                                                alignment: AlignmentType.CENTER
                                            })],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        }),
                                        new TableCell({
                                            children: [new Paragraph({ 
                                                text: iniciativa.votos_abstencion.toString(),
                                                alignment: AlignmentType.CENTER
                                            })],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        }),
                                        new TableCell({
                                            children: [new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: aprobada ? "APROBADA" : "RECHAZADA",
                                                        bold: true,
                                                        color: aprobada ? "008000" : "FF0000"
                                                    })
                                                ],
                                                alignment: AlignmentType.CENTER
                                            })],
                                            shading: index % 2 === 0 ? { fill: "F2F2F2" } : undefined
                                        })
                                    ]
                                });
                            })
                        ]
                    }),
                    
                    // Sección V: Cierre y Firmas
                    new Paragraph({
                        text: "V. CIERRE Y FIRMAS",
                        heading: HeadingLevel.HEADING_2,
                        pageBreakBefore: true
                    }),
                    
                    new Paragraph({
                        text: "En cumplimiento de lo dispuesto por la normatividad aplicable, se levanta la presente acta para constancia de los acuerdos tomados en esta sesión.",
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 800 }
                    }),
                    
                    // Espacios para firmas
                    new Paragraph({
                        children: [
                            new TextRun({ text: "_".repeat(50), size: 24 })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 1000 }
                    }),
                    
                    new Paragraph({
                        text: "PRESIDENTE DE LA MESA DIRECTIVA",
                        alignment: AlignmentType.CENTER,
                        bold: true
                    }),
                    
                    new Paragraph({
                        text: datos.sesion.iniciada_por_nombre || "Por designar",
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 800 }
                    }),
                    
                    new Paragraph({
                        children: [
                            new TextRun({ text: "_".repeat(50), size: 24 })
                        ],
                        alignment: AlignmentType.CENTER
                    }),
                    
                    new Paragraph({
                        text: "SECRETARIO(A)",
                        alignment: AlignmentType.CENTER,
                        bold: true
                    }),
                    
                    new Paragraph({
                        text: datos.sesion.clausurada_por_nombre || "Por designar",
                        alignment: AlignmentType.CENTER
                    }),
                    
                    // Nota al pie
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `Documento generado el ${new Date().toLocaleString('es-MX')}`,
                                size: 16,
                                italics: true,
                                color: "666666"
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 1000 }
                    })
                ]
            }]
        });
        
        // Generar archivo
        const buffer = await Packer.toBuffer(doc);
        const filename = `Acta_Sesion_${datos.sesion.codigo_sesion}_${new Date().toISOString().split('T')[0]}.docx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        
    } catch (error) {
        console.error('Error generando Word:', error);
        res.status(500).json({ error: 'Error generando archivo Word' });
    }
});

module.exports = router;